import { signAgentToken } from "@/lib/agent/token";
import { createAdminClient, loadProviderKey } from "@/lib/agent/admin";
import { AGENT_PROVIDERS, buildRunnerEnv, isAgentProvider } from "@/lib/agent/env";
import { agentLimitsFromEnv, checkAgentLimits } from "@/lib/agent/limits";
import { finishRunRow, loadUsage, reconcileRuns, startRunRow } from "@/lib/agent/runs";
import { currentUserId, json, ownedHandle, sseResponse } from "@/lib/agent/route-auth";
import { newRunId, projectSlug, type SandboxHandle } from "@/lib/agent/sandbox";
import { getSandboxProvider } from "@/lib/agent/provider";
import { SnapshotTooLargeError, snapshotFiles } from "@/lib/agent/snapshot";
import { tailRun, tally, type RunTally } from "@/lib/agent/tail";
import { parseEntries, type ComboEntry } from "@/lib/combos";
import { DEFAULT_AGENT_MODE, isAgentMode } from "@/lib/agent/modes";
import type { FileNode } from "@/lib/persistence/indexeddb";

// Node.js runtime: signing the token and decrypting keys use node:crypto.
export const runtime = "nodejs";
// One connection tails the run for up to this long. The run itself goes on in the sandbox.
export const maxDuration = 300;

const MAX_BODY_CHARS = 8_000_000;
// Attached files are added to the prompt text, so the limit is larger than for a typed message.
const MAX_PROMPT_CHARS = 130_000;
const MAX_FALLBACKS = 4;
// End the stream this long before the host would kill the function, so the client can reconnect cleanly.
const DEADLINE_MARGIN_MS = 15_000;

function isFileTree(v: unknown): v is FileNode[] {
  return Array.isArray(v);
}

async function finalize(handle: SandboxHandle, runId: string): Promise<void> {
  const t: RunTally = { input_tokens: 0, output_tokens: 0, failed: false };
  try {
    for (const e of await handle.readEvents(runId, 0)) tally(t, e);
  } catch (err) {
    console.error("agent finalize: could not read events", err);
  }
  await finishRunRow(createAdminClient(), runId, t);
}

function streamEvents(
  handle: SandboxHandle,
  runId: string,
  from: number,
  signal: AbortSignal,
  limits: ReturnType<typeof agentLimitsFromEnv>,
  extraHeaders: Record<string, string> = {}
): Response {
  const started = Date.now();
  const gen = tailRun(handle, runId, from, {
    signal,
    deadlineAt: started + maxDuration * 1000 - DEADLINE_MARGIN_MS,
    lostAt: started + (limits.runMaxSeconds + 60) * 1000,
  });
  let sawDone = false;
  async function* watch() {
    for await (const e of gen) {
      if (e.type === "done") sawDone = true;
      yield e;
    }
  }
  return sseResponse(watch(), { "X-Agent-Run": runId, ...extraHeaders }, async () => {
    if (sawDone) await finalize(handle, runId);
  });
}

/** Start a Claude Code run and stream its events. */
export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Not authenticated", code: "unauthenticated" }, 401);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Invalid request body", code: "invalid_request" }, 400);
  }
  if (raw.length > MAX_BODY_CHARS) return json({ error: "The project is too large.", code: "payload_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_request" }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const project = typeof body.project === "string" ? body.project.trim() : "";
  const model = body.model as { provider?: unknown; model?: unknown } | undefined;
  const fallbacks = parseEntries(body.fallbacks, MAX_FALLBACKS);
  if (
    !prompt ||
    prompt.length > MAX_PROMPT_CHARS ||
    !project ||
    project.length > 100 ||
    !isFileTree(body.files) ||
    !model ||
    !isAgentProvider(model.provider) ||
    typeof model.model !== "string" ||
    !model.model ||
    model.model.length > 200 ||
    fallbacks === null ||
    !fallbacks.every((e) => isAgentProvider(e.provider))
  ) {
    return json({ error: "Invalid request", code: "invalid_request" }, 400);
  }
  const first: ComboEntry = { provider: model.provider, model: model.model };
  const strategy = body.strategy === "round_robin" ? "round_robin" : "priority";
  const agentMode = isAgentMode(body.mode) ? body.mode : DEFAULT_AGENT_MODE;

  let snapshot;
  try {
    snapshot = snapshotFiles(body.files);
  } catch (err) {
    if (err instanceof SnapshotTooLargeError) return json({ error: err.message, code: "payload_too_large" }, 413);
    throw err;
  }

  const sandboxes = getSandboxProvider();
  if (!sandboxes) {
    return json({ error: "Claude Code is not set up on this server yet.", code: "agent_unavailable" }, 503);
  }
  const mode = process.env.AGENT_KEY_MODE === "direct" ? "direct" : "proxy";
  const publicUrl = process.env.AGENT_PUBLIC_URL;
  const secretHex = process.env.ENCRYPTION_SECRET;
  if (mode === "proxy" && (!publicUrl || !secretHex)) {
    return json({ error: "Claude Code is not set up on this server yet.", code: "agent_unavailable" }, 503);
  }

  const admin = createAdminClient();
  const limits = agentLimitsFromEnv();

  try {
    let usage = await loadUsage(admin, userId, limits);
    // A run whose tab was closed is still "running" in the database. Close finished ones before saying "busy".
    if (usage.activeRuns > 0 && (await reconcileRuns(admin, sandboxes, userId)) > 0) {
      usage = await loadUsage(admin, userId, limits);
    }
    const verdict = checkAgentLimits(usage, limits);
    if (!verdict.ok) return json({ error: verdict.message, code: verdict.code }, verdict.code === "busy" ? 409 : 429);
  } catch (err) {
    console.error("agent usage lookup failed", err);
    return json({ error: "Service temporarily unavailable", code: "service_unavailable" }, 503);
  }

  // The key must exist before a sandbox starts, so a missing key never costs sandbox time.
  let firstKey: string | null;
  try {
    firstKey = await loadProviderKey(admin, userId, first.provider);
  } catch (err) {
    console.error("agent key lookup failed", err);
    return json({ error: "Failed to start Claude Code", code: "server_error" }, 500);
  }
  if (firstKey === null) {
    const label = AGENT_PROVIDERS.includes(first.provider as never) ? first.provider : "this provider";
    return json({ error: `No API key saved for ${label}`, code: "no_api_key" }, 400);
  }

  let handle: SandboxHandle;
  try {
    handle = await sandboxes.acquire(userId);
  } catch (err) {
    console.error("sandbox start failed", err);
    return json({ error: "Could not start the sandbox. Try again in a moment.", code: "sandbox_unavailable" }, 502);
  }

  const runId = newRunId(handle.id);
  try {
    await startRunRow(admin, { runKey: runId, userId, project, provider: first.provider, model: first.model });
  } catch (err) {
    console.error("agent run row failed", err);
    return json({ error: "Service temporarily unavailable", code: "service_unavailable" }, 503);
  }

  const secret =
    mode === "proxy"
      ? signAgentToken({ userId, runId, combo: [first, ...fallbacks], strategy }, secretHex!)
      : firstKey;
  const env = buildRunnerEnv({ mode, provider: first.provider as "anthropic" | "openrouter", model: first.model, secret, publicUrl });
  if (mode === "direct") console.warn("AGENT_KEY_MODE=direct: the agent can read the API key. Use this for local work only.");

  try {
    await handle.startRun(
      {
        runId,
        project: projectSlug(project),
        prompt,
        model: first.model,
        newConversation: body.newConversation === true,
        files: snapshot.files,
        maxTurns: limits.maxTurns,
        maxSeconds: limits.runMaxSeconds,
        mode: agentMode,
      },
      env
    );
  } catch (err) {
    console.error("agent start failed", err);
    await finishRunRow(admin, runId, { input_tokens: 0, output_tokens: 0, failed: true });
    return json({ error: "Could not start Claude Code. Try again in a moment.", code: "sandbox_unavailable" }, 502);
  }

  return streamEvents(handle, runId, 0, request.signal, limits);
}

/** Reconnect to a run: `?run=<id>&from=<seq>`. */
export async function GET(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Not authenticated", code: "unauthenticated" }, 401);
  const url = new URL(request.url);
  const runId = url.searchParams.get("run");
  const from = Number(url.searchParams.get("from") ?? 0);
  const handle = await ownedHandle(runId, userId);
  if (!handle || !runId) return json({ error: "Run not found", code: "not_found" }, 404);
  return streamEvents(handle, runId, Number.isInteger(from) && from >= 0 ? from : 0, request.signal, agentLimitsFromEnv());
}
