import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

// Service role client bypasses RLS. circuit_breaker_log has no client policies.
function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

/** Result of a circuit breaker check. */
export type CircuitBreakerResult = {
  /** Whether the request may proceed. */
  allowed: boolean;
  /** Seconds until the window resets. Null when allowed. */
  retryAfterSeconds: number | null;
};

// Records one request for the user, then checks the rolling 60s window.
// Blocked requests are also recorded, so repeated attempts keep the user blocked.
/**
 * Records a request and checks the rolling 60-second window.
 * Returns `allowed: false` with `retryAfterSeconds` when the user exceeds 10 requests.
 * @param userId - ID of the user making the request.
 * @returns The `CircuitBreakerResult` for this request.
 * @throws {Error} On any database error (fail-closed design).
 */
export async function checkCircuitBreaker(userId: string): Promise<CircuitBreakerResult> {
  const supabase = createServiceRoleClient();

  const { error: insertError } = await supabase
    .from("circuit_breaker_log")
    .insert({ user_id: userId });
  if (insertError) {
    throw new Error(insertError.message);
  }

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error: countError } = await supabase
    .from("circuit_breaker_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("requested_at", windowStart);
  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) <= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: true, retryAfterSeconds: null };
  }

  const { data: oldest, error: oldestError } = await supabase
    .from("circuit_breaker_log")
    .select("requested_at")
    .eq("user_id", userId)
    .gt("requested_at", windowStart)
    .order("requested_at", { ascending: true })
    .limit(1);
  if (oldestError) {
    throw new Error(oldestError.message);
  }

  const oldestMs = new Date(oldest?.[0]?.requested_at ?? Date.now()).getTime();
  const retryAfterMs = oldestMs + WINDOW_MS - Date.now();
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

  return { allowed: false, retryAfterSeconds };
}
