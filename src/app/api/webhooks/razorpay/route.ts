import { NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { creditBalance } from "@/lib/billing/hold";
import { creditForAmount } from "@/lib/razorpay/client";
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
  notes?: { user_id?: string } | unknown[];
};

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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Ignore events that are not captured payments.
  if (event.event !== "payment.captured") {
    return NextResponse.json({ received: true });
  }

  const payment = event.payload?.payment?.entity;
  const paymentId = payment?.id;
  const userId = Array.isArray(payment?.notes) ? undefined : payment?.notes?.user_id;
  const credit = typeof payment?.amount === "number" ? creditForAmount(payment.amount) : null;
  if (!paymentId || !userId || credit === null) {
    return NextResponse.json({ error: "Invalid payment payload" }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  // Insert first: the UNIQUE razorpay_payment_id is the gate. Only the winner credits.
  const { data: row, error: insertError } = await admin
    .from("transactions")
    .insert({
      user_id: userId,
      type: "topup",
      amount_paise: credit,
      balance_after_paise: 0, // placeholder, updated after the credit
      description: "Wallet top-up",
      metadata: { order_id: payment?.order_id ?? null, paid_paise: payment?.amount ?? null },
      razorpay_payment_id: paymentId,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  let newBalance: number;
  try {
    ({ newBalance } = await creditBalance(userId, credit));
  } catch {
    // Credit failed: remove the row so a Razorpay retry can succeed.
    await admin.from("transactions").delete().eq("id", row.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  // The credit is done. A failure here only leaves the placeholder balance_after_paise.
  await admin.from("transactions").update({ balance_after_paise: newBalance }).eq("id", row.id);

  return NextResponse.json({ received: true });
}
