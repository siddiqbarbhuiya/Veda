import { createAdminClient, loadProviderKey } from "@/lib/agent/admin";
import { isAgentProvider, type AgentProvider } from "@/lib/agent/env";
import { upstreamFor } from "@/lib/agent/upstream";
import { verifyAgentToken } from "@/lib/agent/token";
import { isFallbackStatus, orderEntries } from "@/lib/combos";

// Node.js runtime: the token check and the key decryption use node:crypto.
export const runtime = "nodejs";
// One model call can stream for a long time.
export const maxDuration = 300;

const MAX_BODY_BYTES = 8_000_000;

// Round robin position. It lives in this server process only: a restart starts again at the first model.
let roundRobin = 0;

// Claude Code sends the Anthropic Messages format, so errors go back in the Anthropic error shape.
function anthropicError(status: number, type: string, message: string) {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearer(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth) return auth.replace(/^Bearer\s+/i, "").trim();
  return (request.headers.get("x-api-key") ?? "").trim();
}

/**
 * LLM proxy for Claude Code in the sandbox. The sandbox holds only a short-lived signed token.
 * This route checks the token, adds the student's real key, and sends the request to OpenRouter or Anthropic.
 * With a combo, a limit (429) or a server error (5xx) before the first byte moves on to the next model.
 */
export async function POST(request: Request): Promise<Response> {
  const secretHex = process.env.ENCRYPTION_SECRET;
  const payload = secretHex ? verifyAgentToken(bearer(request), secretHex) : null;
  if (!payload) return anthropicError(401, "authentication_error", "The Claude Code session token is missing or has expired.");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return anthropicError(413, "request_too_large", "The request is too large.");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return anthropicError(400, "invalid_request_error", "Invalid JSON body.");
  }

  const entries = orderEntries(
    { id: payload.runId, name: "run", strategy: payload.strategy, entries: payload.combo },
    roundRobin++
  ).filter((e) => isAgentProvider(e.provider));

  const admin = createAdminClient();
  let last: Response | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const provider = entry.provider as AgentProvider;
    let key: string | null;
    try {
      key = await loadProviderKey(admin, payload.userId, provider);
    } catch (err) {
      console.error("agent proxy: key lookup failed", err);
      return anthropicError(500, "api_error", "Could not read the saved key.");
    }
    if (key === null) {
      last ??= anthropicError(400, "invalid_request_error", `No API key saved for ${provider}.`);
      continue;
    }

    const extra: Record<string, string> = {
      "anthropic-version": request.headers.get("anthropic-version") ?? "2023-06-01",
    };
    const beta = request.headers.get("anthropic-beta");
    if (beta) extra["anthropic-beta"] = beta;
    const target = upstreamFor(provider, key, extra);
    if (!target) {
      last ??= anthropicError(400, "invalid_request_error", `The saved ${provider} settings are not valid. Save them again.`);
      continue;
    }

    let upstream: Response;
    try {
      await target.guard?.();
      upstream = await fetch(target.url, {
        method: "POST",
        headers: target.headers,
        // The model comes from the combo entry, not from what Claude Code asked for.
        body: JSON.stringify({ ...body, model: entry.model }),
        signal: request.signal,
        // A redirect is never followed: it would be the way to a private address.
        redirect: "manual",
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return new Response(null, { status: 499 });
      last = anthropicError(502, "api_error", "The model provider could not be reached.");
      if (i < entries.length - 1) continue;
      return last;
    }

    if (upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    if (isFallbackStatus(upstream.status) && i < entries.length - 1) {
      console.warn("agent proxy: moving to the next model", { from: entry.model, status: upstream.status });
      await upstream.body?.cancel();
      continue;
    }
    // Send the provider's own error back, without any key text (the key is never in a response body).
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  return last ?? anthropicError(400, "invalid_request_error", "No usable model in this session.");
}
