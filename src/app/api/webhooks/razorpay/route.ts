import { NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { creditBalance } from "@/lib/billing/hold";
import { fetchRazorpayOrder } from "@/lib/razorpay/client";
import { creditForAmount } from "@/lib/razorpay/packs";
import { verifyWebhookSignature } from "@/lib/razorpay/verify";
import type { Database } from "@/types/database";

function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

type PaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ok = () => NextResponse.json({ received: true });
// Unrecoverable payload: 200 stops Razorpay retries. The reason is logged with the payment id.
function dropped(paymentId: string | undefined, reason: string) {
  console.error(`razorpay webhook: ignored payment ${paymentId ?? "(no id)"}: ${reason}`);
  return NextResponse.json({ received: true, ignored: true });
}
const retryable = () => NextResponse.json({ error: "Processing failed" }, { status: 500 });

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!secret || !verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: PaymentEntity } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return dropped(undefined, "body is not valid JSON");
  }

  // Ignore events that are not captured payments.
  if (event.event !== "payment.captured") {
    return ok();
  }

  const payment = event.payload?.payment?.entity;
  const paymentId = typeof payment?.id === "string" ? payment.id : undefined;
  const orderId = typeof payment?.order_id === "string" ? payment.order_id : undefined;
  if (!paymentId || !orderId || typeof payment?.amount !== "number") {
    return dropped(paymentId, "payment has no id, order_id or amount");
  }

  // Identity comes from the ORDER that our server created, never from client-controlled payment notes.
  let order;
  try {
    order = await fetchRazorpayOrder(orderId);
  } catch (err) {
    console.error(
      `razorpay webhook: order lookup failed for payment ${paymentId}, will retry:`,
      err instanceof Error ? err.message : err
    );
    return retryable();
  }
  if (!order) return dropped(paymentId, `no matching order ${orderId}`);

  if (order.currency !== "INR" || payment.currency !== "INR") {
    return dropped(paymentId, "currency is not INR");
  }
  if (payment.amount !== order.amount) {
    return dropped(paymentId, `payment amount ${payment.amount} differs from order amount ${order.amount}`);
  }
  const credit = creditForAmount(order.amount);
  if (credit === null) return dropped(paymentId, `amount ${order.amount} is not a pack`);

  const notes = order.notes;
  const userId =
    notes && !Array.isArray(notes) && typeof notes.user_id === "string" ? notes.user_id : undefined;
  if (!userId || !UUID_PATTERN.test(userId)) {
    return dropped(paymentId, "order has no valid user_id in its notes");
  }

  const admin = createServiceRoleClient();

  // Fast path for Razorpay retries: the payment is already in the ledger.
  const { data: existing, error: lookupError } = await admin
    .from("transactions")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();
  if (lookupError) {
    console.error(`razorpay webhook: ledger lookup failed for payment ${paymentId}:`, lookupError.message);
    return retryable();
  }
  if (existing) return ok();

  // Credit first, then write the ledger row with the real balance.
  let newBalance: number;
  try {
    ({ newBalance } = await creditBalance(userId, credit));
  } catch (err) {
    // The balance update is compare-and-set, so a throw means nothing was credited. Safe to retry.
    console.error(
      `razorpay webhook: credit failed for payment ${paymentId}, will retry:`,
      err instanceof Error ? err.message : err
    );
    return retryable();
  }

  const { error: insertError } = await admin.from("transactions").insert({
    user_id: userId,
    type: "topup",
    amount_paise: credit,
    balance_after_paise: newBalance,
    description: "Wallet top-up",
    metadata: { order_id: orderId, paid_paise: payment.amount },
    razorpay_payment_id: paymentId,
  });
  if (!insertError) return ok();

  // The ledger row was not written. Undo the credit so a retry cannot double-credit.
  const isDuplicate = insertError.code === "23505";
  try {
    await creditBalance(userId, -credit);
  } catch (err) {
    console.error(
      `razorpay webhook: CRITICAL rollback failed for payment ${paymentId} (user ${userId}, credit ${credit} paise). ` +
        `Balance holds an unrecorded credit. Fix by hand. Cause: ${insertError.message}. Rollback error:`,
      err instanceof Error ? err.message : err
    );
    // Return 200: a retry would credit again.
    return NextResponse.json({ received: true, needs_reconciliation: true });
  }

  if (isDuplicate) {
    // Another request recorded this payment first and credited once. Our extra credit is undone.
    console.error(`razorpay webhook: duplicate payment ${paymentId} raced, extra credit rolled back`);
    return ok();
  }
  console.error(
    `razorpay webhook: ledger insert failed for payment ${paymentId}, credit rolled back, will retry:`,
    insertError.message
  );
  return retryable();
}
