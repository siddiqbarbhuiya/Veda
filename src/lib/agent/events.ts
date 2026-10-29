/** One file change that Claude Code made in the sandbox. Content is absent for a delete. */
export type FileChange = { path: string; op: "create" | "update" | "delete"; content?: string };

/**
 * One event of a Claude Code run. `seq` counts from 0 inside one run and never repeats,
 * so a client that reconnects with `from=<last seq + 1>` gets no duplicate and no gap.
 */
export type AgentEvent = { seq: number } & (
  | { type: "status"; state: "starting" | "running" | "done" | "error" }
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; summary: string }
  | { type: "tool_result"; id: string; ok: boolean; output: string }
  | { type: "permission"; id: string; tool: string; summary: string }
  | { type: "changes"; changes: FileChange[] }
  | { type: "usage"; input_tokens: number; output_tokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "done" }
);

/** True when no more events follow in this run. */
export function isTerminal(e: AgentEvent): boolean {
  return e.type === "done" || e.type === "error" || (e.type === "status" && (e.state === "done" || e.state === "error"));
}

/** Read a newline-delimited JSON log. A broken or partial last line is skipped. */
export function parseEventLines(text: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as AgentEvent;
      if (e && typeof e.seq === "number" && typeof e.type === "string") out.push(e);
    } catch {
      /* the runner may be in the middle of a write */
    }
  }
  return out;
}

/** Events with `seq >= from`, in order, without duplicates. */
export function eventsFrom(events: AgentEvent[], from: number): AgentEvent[] {
  const seen = new Set<number>();
  const out: AgentEvent[] = [];
  for (const e of events) {
    if (e.seq < from || seen.has(e.seq)) continue;
    seen.add(e.seq);
    out.push(e);
  }
  return out.sort((a, b) => a.seq - b.seq);
}
