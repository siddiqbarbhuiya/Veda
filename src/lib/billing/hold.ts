import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import type { RateConfig } from "./cost";

const MIN_HOLD_PAISE = 10;
const MAX_HOLD_PAISE = 500;
const MAX_ATTEMPTS = 5;

// Service role client bypasses RLS. Use only after the caller checks auth.
function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export type BalanceChange = { success: boolean; newBalance: number };

export function estimateHoldPaise(inputTokens: number, rate: RateConfig): number {
  const raw = Math.ceil((inputTokens * rate.output_paise_per_1k_tokens * 3) / 1000);
  return Math.min(MAX_HOLD_PAISE, Math.max(MIN_HOLD_PAISE, raw));
}

// Compare-and-set update on profiles.balance_paise.
// The UPDATE applies only when the balance still equals the value that was read.
// If another request changed the balance first, the UPDATE matches 0 rows and the loop retries.
// When mustStayNonNegative is true, the UPDATE also requires balance_paise >= -delta.
async function changeBalance(
  userId: string,
  delta: number,
  mustStayNonNegative: boolean
): Promise<BalanceChange> {
  const supabase = createServiceRoleClient();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: profile, error: readError } = await supabase
      .from("profiles")
      .select("balance_paise")
      .eq("id", userId)
      .single();
    if (readError || !profile) {
      throw new Error(`Failed to read balance: ${readError?.message ?? "no profile"}`);
    }

    const current = profile.balance_paise;
    const next = current + delta;
    if (mustStayNonNegative && next < 0) {
      return { success: false, newBalance: 0 };
    }

    let update = supabase
      .from("profiles")
      .update({ balance_paise: next })
      .eq("id", userId)
      .eq("balance_paise", current);
    if (mustStayNonNegative) {
      update = update.gte("balance_paise", -delta);
    }
    const { data: rows, error: updateError } = await update.select("balance_paise");
    if (updateError) {
      throw new Error(`Failed to update balance: ${updateError.message}`);
    }
    if (rows && rows.length > 0) {
      return { success: true, newBalance: rows[0].balance_paise };
    }
  }

  throw new Error("Balance update conflicted too many times");
}

// Deducts the pre-auth hold. Returns success false when the balance is too low.
export async function deductHold(userId: string, holdPaise: number): Promise<BalanceChange> {
  return changeBalance(userId, -holdPaise, true);
}

// Refunds the hold minus the actual cost and records an ai_usage transaction.
// If the actual cost is above the hold, the extra amount is charged.
export async function settleHold(
  userId: string,
  holdPaise: number,
  actualCostPaise: number
): Promise<void> {
  const refund = holdPaise - actualCostPaise;
  const { newBalance } = await changeBalance(userId, refund, false);

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    type: "ai_usage",
    amount_paise: -actualCostPaise,
    balance_after_paise: newBalance,
    description: "AI usage",
  });
  if (error) {
    throw new Error(`Failed to record transaction: ${error.message}`);
  }
}
