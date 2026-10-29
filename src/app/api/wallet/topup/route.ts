import { NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { creditBalance } from "@/lib/billing/hold";
import { createRazorpayOrder } from "@/lib/razorpay/client";
import { allowedAmountsText, creditForAmount } from "@/lib/razorpay/packs";
import type { Database } from "@/types/database";

function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

function paymentMode(): "simulator" | "live" {
  return process.env.PAYMENT_MODE === "simulator" ? "simulator" : "live";
}

// The client reads the mode before it creates an order, so it can check live prerequisites first.
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ mode: paymentMode() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simulator = paymentMode() === "simulator";
  if (simulator && process.env.NODE_ENV === "production") {
    console.error("topup: PAYMENT_MODE=simulator is set in production. Request refused.");
    return NextResponse.json({ error: "Simulator mode is disabled in production" }, { status: 500 });
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
      { error: `amount_paise must be one of: ${allowedAmountsText()}` },
      { status: 400 }
    );
  }

  let order: { id: string };
  try {
    const receipt = `${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    order = await createRazorpayOrder(amount, { user_id: user.id }, receipt);
  } catch (err) {
    console.error("topup: order creation failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
  }

  if (simulator) {
    let newBalance: number;
    try {
      ({ newBalance } = await creditBalance(user.id, credit));
    } catch (err) {
      console.error("topup: simulator credit failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.from("transactions").insert({
      user_id: user.id,
      type: "topup",
      amount_paise: credit,
      balance_after_paise: newBalance,
      description: "Wallet top-up (simulator)",
      metadata: { order_id: order.id, paid_paise: amount },
    });
    if (error) {
      // Undo the credit so the balance and the ledger agree and a retry cannot double-credit.
      console.error(`topup: simulator ledger insert failed for order ${order.id}:`, error.message);
      try {
        await creditBalance(user.id, -credit);
      } catch (rollbackError) {
        console.error(
          `topup: CRITICAL simulator rollback failed for order ${order.id} (user ${user.id}, ${credit} paise):`,
          rollbackError instanceof Error ? rollbackError.message : rollbackError
        );
      }
      return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ order_id: order.id });
}
