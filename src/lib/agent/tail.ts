import type { AgentEvent } from "./events";
import type { SandboxHandle } from "./sandbox";

export type TailOptions = {
  /** Stop reading when this aborts (the browser left). The run itself keeps going. */
  signal?: AbortSignal;
  /** Stop reading at this time (ms since epoch), so the function ends before the host kills it. The client reconnects. */
  deadlineAt: number;
  /** Give up on a run that never says "done" after this time (ms since epoch). */
  lostAt: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Yield the events of one run, in order, from `from`, until the run says "done".
 *
 * - Ends without "done" when the deadline or the signal comes first. Reconnect with `from` = last seq + 1.
 * - A run that never ends is closed with an error and a "done" event that are not stored in the sandbox.
 */
export async function* tailRun(
  handle: SandboxHandle,
  runId: string,
  from: number,
  opts: TailOptions
): AsyncGenerator<AgentEvent> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const pollMs = opts.pollMs ?? 500;
  let next = from;
  while (!opts.signal?.aborted && now() < opts.deadlineAt) {
    const events = await handle.readEvents(runId, next);
    for (const e of events) {
      yield e;
      next = e.seq + 1;
      if (e.type === "done") return;
    }
    if (events.length === 0 && now() >= opts.lostAt) {
      yield { seq: next, type: "error", code: "run_lost", message: "Claude Code stopped without finishing." };
      yield { seq: next + 1, type: "done" };
      return;
    }
    await sleep(pollMs);
  }
}

/** Tokens and the final state, collected while the events pass by. */
export type RunTally = { input_tokens: number; output_tokens: number; failed: boolean };

export function tally(into: RunTally, e: AgentEvent): void {
  if (e.type === "usage") {
    into.input_tokens += e.input_tokens;
    into.output_tokens += e.output_tokens;
  } else if (e.type === "error") {
    into.failed = true;
  }
}
