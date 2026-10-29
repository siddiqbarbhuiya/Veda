import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { checkCircuitBreaker } from "@/lib/circuit-breaker";
import { estimateHoldPaise, deductHold, settleHold } from "@/lib/billing/hold";
import { calculateCostPaise } from "@/lib/billing/cost";
import { estimateTokens, estimateMessagesTokens } from "@/lib/billing/tokens";
import { decrypt } from "@/lib/crypto/encryption";
import { getProviderAdapter } from "@/lib/ai-providers";
import type { ChatMessage, StreamChunk } from "@/lib/ai-providers";
import { fetchOpenRouterModels, rateForModel } from "@/lib/openrouter/models";
import { isFallbackStatus, parseEntries, type ComboEntry } from "@/lib/combos";
import type { Database } from "@/types/database";

// Node.js runtime on purpose: decrypt() uses node:crypto, which the edge runtime lacks.
export const runtime = "nodejs";
// A long stream must end before the host kills the function (a killed function cannot settle).
export const maxDuration = 60;

const PROVIDERS = ["openai", "gemini", "anthropic", "openrouter"] as const;
type Provider = (typeof PROVIDERS)[number];
const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
};

const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 200_000;
const MAX_BODY_CHARS = 1_000_000;
const MAX_FALLBACKS = 4;
const DEFAULT_RETRY_AFTER_SECONDS = 30;

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

type ClassifiedError = {
  status: number;
  code: "provider_auth" | "provider_rate_limit" | "provider_error";
  error: string;
  retryAfter?: number;
};

// Remove anything that looks like a key and keep the message short.
function sanitizeMessage(message: string, apiKey: string): string {
  let m = message;
  if (apiKey) m = m.split(apiKey).join("[redacted]");
  m = m.replace(/\b(?:sk|AIza|key)[-_A-Za-z0-9*.]{6,}/g, "[redacted]").replace(/\s+/g, " ").trim();
  if (m.length > 200) m = `${m.slice(0, 197)}...`;
  return m || "The provider returned an error.";
}

// Map a provider failure to an HTTP status, a stable code and a safe message.
function classifyProviderError(err: unknown, provider: Provider, apiKey: string): ClassifiedError {
  const label = PROVIDER_LABEL[provider];
  const e = err as { status?: unknown; retryAfter?: unknown; message?: unknown };
  const status = typeof e?.status === "number" ? e.status : 0;
  const message = typeof e?.message === "string" ? e.message : "";
  const looksLikeBadKey = /api key not valid|invalid api key|incorrect api key|invalid x-api-key/i.test(message);
  if (status === 401 || status === 403 || (status === 400 && looksLikeBadKey)) {
    return {
      status: 502,
      code: "provider_auth",
      error: `Your ${label} key was rejected. Check the key in your dashboard.`,
    };
  }
  if (status === 429) {
    const retryAfter =
      typeof e.retryAfter === "number" && e.retryAfter > 0 ? Math.ceil(e.retryAfter) : DEFAULT_RETRY_AFTER_SECONDS;
    return {
      status: 429,
      code: "provider_rate_limit",
      error: `${label} is limiting requests on your key. Wait, then try again. Check your plan and quota if it continues.`,
      retryAfter,
    };
  }
  return { status: 502, code: "provider_error", error: sanitizeMessage(message, apiKey) };
}

const isAbort = (err: unknown) =>
  (err as { name?: string } | null)?.name === "AbortError" || (err as { code?: string } | null)?.code === "ABORT_ERR";

type Rate = { input_paise_per_1k_tokens: number; output_paise_per_1k_tokens: number };
type Admin = ReturnType<typeof createServiceRoleClient>;
type Target = { provider: Provider; model: string; rate: Rate; apiKey: string };

// Rate for one model. OpenRouter models are priced from the OpenRouter catalogue, the others from rate_config.
// `failed` means the lookup itself broke. `rate` null means the model is not supported.
async function loadRate(
  admin: Admin,
  provider: Provider,
  model: string
): Promise<{ rate: Rate | null; failed: boolean }> {
  if (provider === "openrouter") {
    try {
      const found = (await fetchOpenRouterModels()).find((m) => m.id === model);
      return { rate: found ? rateForModel(found) : null, failed: false };
    } catch {
      return { rate: null, failed: true };
    }
  }
  const { data, error } = await admin
    .from("rate_config")
    .select("input_paise_per_1k_tokens, output_paise_per_1k_tokens")
    .eq("provider", provider)
    .eq("model", model)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { rate: null, failed: true };
  return { rate: data ?? null, failed: false };
}

// Decrypted key for one provider, or null when the student has not saved one. Throws on a database or decrypt error.
async function loadKey(admin: Admin, userId: string, provider: Provider): Promise<string | null> {
  const { data: keyRow, error: keyError } = await admin
    .from("api_keys")
    .select("encrypted_key, iv, auth_tag")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (keyError) throw keyError;
  if (!keyRow) return null;
  return decrypt(keyRow.encrypted_key, keyRow.iv, keyRow.auth_tag);
}

// Take entries from the front of `pending` until one has a rate and a key. Entries that cannot run are skipped.
async function nextEntry(admin: Admin, userId: string, pending: ComboEntry[]): Promise<Target | null> {
  while (pending.length > 0) {
    const e = pending.shift()!;
    const provider = e.provider as Provider;
    try {
      const { rate } = await loadRate(admin, provider, e.model);
      if (!rate) continue;
      const apiKey = await loadKey(admin, userId, provider);
      if (apiKey === null) continue;
      return { provider, model: e.model, rate, apiKey };
    } catch (err) {
      console.error("combo: entry skipped", { provider, model: e.model, err });
    }
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Auth
  const authClient = await createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return json({ error: "Not authenticated", code: "unauthenticated" }, 401);
  const userId = user.id;

  // 2. Validate body, provider, model and size
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Invalid request body", code: "invalid_request" }, 400);
  }
  if (raw.length > MAX_BODY_CHARS) {
    return json({ error: "Message too long", code: "payload_too_large" }, 413);
  }
  let body: { provider?: unknown; model?: unknown; messages?: unknown; fallbacks?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_request" }, 400);
  }
  const { provider, model, messages } = body;
  const fallbackEntries = parseEntries(body.fallbacks, MAX_FALLBACKS);
  if (
    typeof provider !== "string" ||
    !PROVIDERS.includes(provider as Provider) ||
    typeof model !== "string" ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !messages.every(isChatMessage) ||
    fallbackEntries === null ||
    !fallbackEntries.every((e) => PROVIDERS.includes(e.provider as Provider))
  ) {
    return json({ error: "Invalid provider, model or messages", code: "invalid_request" }, 400);
  }
  if (messages.length > MAX_MESSAGES) {
    return json({ error: `Too many messages (maximum ${MAX_MESSAGES})`, code: "too_many_messages" }, 413);
  }
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return json({ error: "Message too long", code: "payload_too_large" }, 413);
  }
  if (messages.some((m) => m.content.trim() === "")) {
    return json({ error: "Messages cannot be empty", code: "empty_content" }, 400);
  }
  if (messages.find((m) => m.role !== "system")?.role !== "user") {
    return json({ error: "The conversation must start with a user message", code: "invalid_request" }, 400);
  }

  const admin = createServiceRoleClient();
  const primaryRate = await loadRate(admin, provider as Provider, model);
  if (primaryRate.failed) return json({ error: "Failed to load rates", code: "server_error" }, 500);
  if (!primaryRate.rate) return json({ error: "Model not supported", code: "model_unsupported" }, 400);
  const rate = primaryRate.rate;

  // 3. API key. Checked BEFORE the hold, so a missing key never touches the balance or the ledger.
  let apiKey: string;
  try {
    const key = await loadKey(admin, userId, provider as Provider);
    if (key === null) {
      return json(
        { error: `No API key saved for ${PROVIDER_LABEL[provider as Provider]}`, code: "no_api_key" },
        400
      );
    }
    apiKey = key;
  } catch (err) {
    console.error("key fetch or decrypt failed", err);
    return json({ error: "Failed to start AI request", code: "server_error" }, 500);
  }

  // 4. Circuit breaker. Fail closed: a DB error blocks the request.
  let breaker;
  try {
    breaker = await checkCircuitBreaker(userId);
  } catch (err) {
    console.error("circuit breaker failed", err);
    return json({ error: "Service temporarily unavailable", code: "service_unavailable" }, 503);
  }
  if (!breaker.allowed) {
    const retryAfter = breaker.retryAfterSeconds ?? 60;
    return json({ error: "Too many requests", code: "rate_limited", retry_after: retryAfter }, 429, {
      "Retry-After": String(retryAfter),
    });
  }

  // 5. Estimate and deduct the hold (script-aware token estimate)
  const inputTokensEstimate = estimateMessagesTokens(messages);
  const holdPaise = estimateHoldPaise(inputTokensEstimate, rate);
  let deduction;
  try {
    deduction = await deductHold(userId, holdPaise);
  } catch (err) {
    console.error("deductHold failed", err);
    return json({ error: "Billing temporarily unavailable", code: "billing_unavailable" }, 503);
  }
  if (!deduction.success) return json({ error: "Insufficient balance", code: "insufficient_balance" }, 402);

  // Settle exactly once. Every exit path below goes through settle().
  let settled = false;
  const settle = async (costPaise: number) => {
    if (settled) return;
    settled = true;
    await safeSettle(userId, holdPaise, costPaise);
  };

  // 6. Open the provider stream. The upstream controller stops the provider call
  // when the client leaves (request.signal) or the response stream is cancelled.
  const upstream = new AbortController();
  const onClientAbort = () => upstream.abort();
  if (request.signal.aborted) upstream.abort();
  else request.signal.addEventListener("abort", onClientAbort, { once: true });

  // The active entry starts as the model the student chose. A combo may move it to a later entry
  // while no text has been produced yet. After the first chunk the entry never changes.
  let active: Target = { provider: provider as Provider, model, rate, apiKey };
  const pending: ComboEntry[] = [...(fallbackEntries ?? [])];

  let generator: AsyncGenerator<StreamChunk>;
  let first: IteratorResult<StreamChunk>;
  for (;;) {
    try {
      generator = getProviderAdapter(active.provider).streamChat(
        active.apiKey,
        active.model,
        messages,
        upstream.signal
      );
      // Prime the generator: the provider fetch runs on the first next(). A provider
      // failure (bad key, 429, quota) can still become a proper JSON error here.
      first = await generator.next();
      break;
    } catch (err) {
      const raw = (err as { status?: unknown })?.status;
      const status = typeof raw === "number" ? raw : 0;
      if (!isAbort(err) && !request.signal.aborted && isFallbackStatus(status) && pending.length > 0) {
        const next = await nextEntry(admin, userId, pending);
        if (next) {
          console.warn("combo: moving to the next model", { from: active.model, to: next.model, status });
          active = next;
          continue;
        }
      }
      request.signal.removeEventListener("abort", onClientAbort);
      await settle(0);
      if (isAbort(err) || request.signal.aborted) return new Response(null, { status: 499 });
      console.error("provider request failed", err);
      const c = classifyProviderError(err, active.provider, active.apiKey);
      return json(
        {
          error: c.error,
          code: c.code,
          ...(c.retryAfter !== undefined ? { retry_after: c.retryAfter } : {}),
        },
        c.status,
        c.retryAfter !== undefined ? { "Retry-After": String(c.retryAfter) } : undefined
      );
    }
  }

  // 7. Stream SSE. Settle once at the end (finally), also for abort and failure.
  const encoder = new TextEncoder();
  let output = "";
  // Cost from estimated tokens: input estimate plus output estimate (at least 1 token), capped at the hold.
  const estimatedCost = () =>
    Math.min(
      holdPaise,
      calculateCostPaise(inputTokensEstimate, Math.max(1, estimateTokens(output)), active.rate)
    );
  // Charge for text that was produced; refund fully when nothing was produced.
  const partialCost = () => (output.length > 0 ? estimatedCost() : 0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let clientGone = false;
      const send = (payload: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client closed the stream. Stop the provider call but keep reading until it ends.
          clientGone = true;
          upstream.abort();
        }
      };

      const handle = async (part: StreamChunk) => {
        if (part.done) {
          // Missing or 0/0 usage means unknown: charge the estimate, never 0.
          const u = part.usage;
          const known = u && (u.input_tokens > 0 || u.output_tokens > 0);
          const cost = known ? calculateCostPaise(u.input_tokens, u.output_tokens, active.rate) : estimatedCost();
          await settle(cost);
          send({
            chunk: part.chunk,
            done: true,
            ...(known ? { usage: u } : {}),
            cost_paise: Math.min(cost, holdPaise),
            ...(part.finish_reason ? { finish_reason: part.finish_reason } : {}),
          });
        } else {
          output += part.chunk;
          send({ chunk: part.chunk, done: false });
        }
      };

      try {
        if (!first.done) await handle(first.value);
        while (!first.done) {
          const next = await generator.next();
          if (next.done) break;
          await handle(next.value);
        }
      } catch (err) {
        if (isAbort(err) || request.signal.aborted || clientGone) {
          // Client pressed Stop or left: charge for what was streamed.
          await settle(partialCost());
        } else {
          console.error("stream failed", err);
          const cost = partialCost();
          await settle(cost);
          const c = classifyProviderError(err, active.provider, active.apiKey);
          send({
            chunk: "",
            done: true,
            error: c.error,
            code: c.code,
            ...(c.retryAfter !== undefined ? { retry_after: c.retryAfter } : {}),
            cost_paise: cost,
          });
        }
      } finally {
        request.signal.removeEventListener("abort", onClientAbort);
        // Stream ended without a done event, or the code above threw: still settle.
        await settle(partialCost());
        try {
          await generator.return(undefined);
        } catch {
          // Generator already finished.
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      // Client disconnected: stop the provider call. start() settles in its finally.
      upstream.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
