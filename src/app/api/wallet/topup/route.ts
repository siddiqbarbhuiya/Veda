import { NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { creditBalance } from "@/lib/billing/hold";
import { createRazorpayOrder, creditForAmount } from "@/lib/razorpay/client";
import type { Database } from "@/types/database";

function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount_paise?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const amount = body?.amount_paise;
  const credit = typeof amount === "number" ? creditForAmount(amount) : null;
  if (typeof amount !== "number" || credit === null) {
    return NextResponse.json(
      { error: "amount_paise must be one of: 2900, 4900, 9900" },
      { status: 400 }
    );
  }

  try {
    const order = await createRazorpayOrder(amount, { user_id: user.id });

    if (process.env.PAYMENT_MODE === "simulator") {
      const { newBalance } = await creditBalance(user.id, credit);
      const admin = createServiceRoleClient();
      const { error } = await admin.from("transactions").insert({
        user_id: user.id,
        type: "topup",
        amount_paise: credit,
        balance_after_paise: newBalance,
        description: "Wallet top-up (simulator)",
        metadata: { order_id: order.id, paid_paise: amount },
      });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ order_id: order.id });
  } catch {
    return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
  }
}
