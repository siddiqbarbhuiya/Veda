import type { AdminClient } from "./admin";
import type { AgentLimits } from "./limits";
import { tally, type RunTally } from "./tail";
import { sandboxIdOf, type SandboxProvider } from "./sandbox";

const DAY_MS = 24 * 60 * 60 * 1000;
// A run row still "running" this long after its limit is treated as ended (the function that tracked it died).
const STALE_GRACE_MS = 120_000;

/** Active runs and sandbox minutes in the last 24 hours for one student. */
export async function loadUsage(
  admin: AdminClient,
  userId: string,
  limits: AgentLimits,
  now: number = Date.now()
): Promise<{ activeRuns: number; minutesToday: number }> {
  const { data, error } = await admin
    .from("agent_runs")
    .select("status, sandbox_seconds, created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(now - DAY_MS).toISOString());
  if (error) throw error;
  let activeRuns = 0;
  let seconds = 0;
  for (const r of data ?? []) {
    if (r.status === "running") {
      const age = now - new Date(r.created_at).getTime();
      if (age < limits.runMaxSeconds * 1000 + STALE_GRACE_MS) {
        activeRuns++;
        seconds += age / 1000;
      } else {
        seconds += limits.runMaxSeconds;
      }
    } else {
      seconds += r.sandbox_seconds;
    }
  }
  return { activeRuns, minutesToday: seconds / 60 };
}

export async function startRunRow(
  admin: AdminClient,
  row: { runKey: string; userId: string; project: string; provider: string; model: string }
): Promise<void> {
  const { error } = await admin.from("agent_runs").insert({
    run_key: row.runKey,
    user_id: row.userId,
    project: row.project,
    provider: row.provider,
    model: row.model,
    status: "running",
  });
  if (error) throw error;
}

/** Record the end of a run. Only the first call changes the row, so two connected tabs cannot count the run twice. */
export async function finishRunRow(admin: AdminClient, runKey: string, t: RunTally, now: number = Date.now()): Promise<void> {
  const { data: row, error: readError } = await admin
    .from("agent_runs")
    .select("created_at, status")
    .eq("run_key", runKey)
    .maybeSingle();
  if (readError || !row || row.status !== "running") return;
  const seconds = Math.max(1, Math.round((now - new Date(row.created_at).getTime()) / 1000));
  const { error } = await admin
    .from("agent_runs")
    .update({
      status: t.failed ? "error" : "done",
      sandbox_seconds: seconds,
      input_tokens: t.input_tokens,
      output_tokens: t.output_tokens,
    })
    .eq("run_key", runKey)
    .eq("status", "running");
  if (error) console.error("agent_runs finish failed", error);
}

/**
 * Close the runs of a student that ended while nobody was watching (the browser tab was closed mid-run).
 * A run counts as "running" in the database until some connection sees its "done" event, so without this
 * a student who closed the tab would be told "still working" until the run row expires.
 * A run whose sandbox is gone is closed as an error. Returns how many rows were closed.
 */
export async function reconcileRuns(
  admin: AdminClient,
  sandboxes: SandboxProvider,
  userId: string,
  now: number = Date.now()
): Promise<number> {
  const { data, error } = await admin
    .from("agent_runs")
    .select("run_key")
    .eq("user_id", userId)
    .eq("status", "running")
    .gte("created_at", new Date(now - DAY_MS).toISOString())
    .limit(5);
  if (error || !data) return 0;
  let closed = 0;
  for (const { run_key } of data) {
    const sandboxId = sandboxIdOf(run_key);
    const handle = sandboxId ? await sandboxes.connect(sandboxId).catch(() => null) : null;
    const t: RunTally = { input_tokens: 0, output_tokens: 0, failed: false };
    if (!handle) {
      t.failed = true; // the sandbox is gone, so the run cannot go on
    } else {
      let events;
      try {
        events = await handle.readEvents(run_key, 0);
      } catch {
        continue;
      }
      if (!events.some((e) => e.type === "done")) continue; // still running
      for (const e of events) tally(t, e);
    }
    await finishRunRow(admin, run_key, t, now);
    closed++;
  }
  return closed;
}
