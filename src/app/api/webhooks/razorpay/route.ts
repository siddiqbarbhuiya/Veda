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

  // Idempotency: razorpay_payment_id is UNIQUE on transactions.
  const { data: existing } = await admin
    .from("transactions")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const { newBalance } = await creditBalance(userId, credit);
    const { error } = await admin.from("transactions").insert({
      user_id: userId,
      type: "topup",
      amount_paise: credit,
      balance_after_paise: newBalance,
      description: "Wallet top-up",
      metadata: { order_id: payment?.order_id ?? null, paid_paise: payment?.amount ?? null },
      razorpay_payment_id: paymentId,
    });
    if (error) throw new Error(error.message);
  } catch {
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
