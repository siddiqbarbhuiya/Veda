import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { checkCircuitBreaker } from "@/lib/circuit-breaker";
import { estimateHoldPaise, deductHold, settleHold } from "@/lib/billing/hold";
import { calculateCostPaise } from "@/lib/billing/cost";
import { decrypt } from "@/lib/crypto/encryption";
import { getProviderAdapter } from "@/lib/ai-providers";
import type { ChatMessage, TokenUsage } from "@/lib/ai-providers";
import type { Database } from "@/types/database";

// Node.js runtime on purpose: decrypt() uses node:crypto, which the edge runtime lacks.
export const runtime = "nodejs";

const PROVIDERS = ["openai", "gemini", "anthropic"] as const;
type Provider = (typeof PROVIDERS)[number];

// Service role client bypasses RLS. Used only after auth succeeds.
function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function isChatMessage(m: unknown): m is ChatMessage {
  if (typeof m !== "object" || m === null) return false;
  const msg = m as Record<string, unknown>;
  return (
    (msg.role === "user" || msg.role === "assistant" || msg.role === "system") &&
    typeof msg.content === "string"
  );
}

// Settle failures must not crash the stream. Log for manual reconciliation.
async function safeSettle(userId: string, holdPaise: number, costPaise: number) {
  try {
    await settleHold(userId, holdPaise, costPaise);
  } catch (err) {
    console.error("RECONCILE: settleHold failed", { userId, holdPaise, costPaise, err });
  }
}

export async function POST(request: Request): Promise<Response> {
  // 1. Auth
  const authClient = await createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return json({ error: "Not authenticated" }, 401);
  const userId = user.id;

  // 2. Validate body, provider and model
  let body: { provider?: unknown; model?: unknown; messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { provider, model, messages } = body;
  if (
    typeof provider !== "string" ||
    !PROVIDERS.includes(provider as Provider) ||
    typeof model !== "string" ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !messages.every(isChatMessage)
  ) {
    return json({ error: "Invalid provider, model or messages" }, 400);
  }

  const admin = createServiceRoleClient();
  const { data: rate, error: rateError } = await admin
    .from("rate_config")
    .select("input_paise_per_1k_tokens, output_paise_per_1k_tokens")
    .eq("provider", provider)
    .eq("model", model)
    .eq("is_active", true)
    .maybeSingle();
  if (rateError) return json({ error: "Failed to load rates" }, 500);
  if (!rate) return json({ error: "Model not supported" }, 400);

  // 3. Circuit breaker. Fail closed: a DB error blocks the request.
  let breaker;
  try {
    breaker = await checkCircuitBreaker(userId);
  } catch (err) {
    console.error("circuit breaker failed", err);
    return json({ error: "Service temporarily unavailable" }, 503);
  }
  if (!breaker.allowed) {
    return json({ error: "Too many requests" }, 429, {
      "Retry-After": String(breaker.retryAfterSeconds ?? 60),
    });
  }

  // 4. Estimate hold (input tokens = characters / 4)
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const holdPaise = estimateHoldPaise(Math.ceil(chars / 4), rate);

  // 5. Deduct hold
  let deduction;
  try {
    deduction = await deductHold(userId, holdPaise);
  } catch (err) {
    console.error("deductHold failed", err);
    return json({ error: "Billing temporarily unavailable" }, 503);
  }
  if (!deduction.success) return json({ error: "Insufficient balance" }, 402);

  // 6-7. Fetch key, decrypt, open provider stream. Refund the hold on any failure.
  let generator: AsyncGenerator<{ chunk: string; done: boolean; usage?: TokenUsage }>;
  try {
    const { data: keyRow, error: keyError } = await admin
      .from("api_keys")
      .select("encrypted_key, iv, auth_tag")
      .eq("user_id", userId)
      .eq("provider", provider as Provider)
      .maybeSingle();
    if (keyError || !keyRow) {
      await safeSettle(userId, holdPaise, 0);
      return json({ error: `No API key saved for ${provider}` }, 400);
    }
    const apiKey = decrypt(keyRow.encrypted_key, keyRow.iv, keyRow.auth_tag);
    generator = getProviderAdapter(provider as Provider).streamChat(apiKey, model, messages);
  } catch (err) {
    console.error("key fetch or adapter setup failed", err);
    await safeSettle(userId, holdPaise, 0);
    return json({ error: "Failed to start AI request" }, 500);
  }

  // 8-10. Stream SSE, settle at the end, refund the full hold on stream error
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      let settled = false;
      try {
        for await (const part of generator) {
          if (part.done) {
            // No usage reported: charge the full hold (no refund) to avoid free usage.
            const usage = part.usage;
            const cost = usage
              ? calculateCostPaise(usage.input_tokens, usage.output_tokens, rate)
              : holdPaise;
            settled = true;
            await safeSettle(userId, holdPaise, cost);
            send({ chunk: part.chunk, done: true, usage, cost_paise: cost });
          } else {
            send({ chunk: part.chunk, done: false });
          }
        }
        if (!settled) {
          // Stream ended without a done event: charge the hold.
          settled = true;
          await safeSettle(userId, holdPaise, holdPaise);
        }
      } catch (err) {
        console.error("stream failed", err);
        if (!settled) {
          settled = true;
          await safeSettle(userId, holdPaise, 0);
        }
        try {
          send({ chunk: "", done: true, error: "Stream failed" });
        } catch {
          // Client already closed the stream.
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
