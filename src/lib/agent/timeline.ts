import type { AgentEvent, FileChange } from "./events";

/** What the timeline shows for one turn. Tool results are merged into their tool call. */
export type TimelineItem =
  | { kind: "text"; seq: number; text: string }
  | { kind: "thinking"; seq: number; text: string }
  | { kind: "tool"; seq: number; id: string; name: string; summary: string; result?: { ok: boolean; output: string } }
  | { kind: "permission"; seq: number; id: string; tool: string; summary: string }
  | { kind: "error"; seq: number; code: string; message: string };

/** Turn the events of one run into timeline items. `status`, `usage`, `changes` and `done` are not items. */
export function buildTimeline(events: AgentEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const tools = new Map<string, Extract<TimelineItem, { kind: "tool" }>>();
  for (const e of events) {
    switch (e.type) {
      case "text":
        items.push({ kind: "text", seq: e.seq, text: e.text });
        break;
      case "thinking":
        items.push({ kind: "thinking", seq: e.seq, text: e.text });
        break;
      case "tool_use": {
        const item = { kind: "tool" as const, seq: e.seq, id: e.id, name: e.name, summary: e.summary };
        tools.set(e.id, item);
        items.push(item);
        break;
      }
      case "tool_result": {
        const tool = tools.get(e.id);
        if (tool) tool.result = { ok: e.ok, output: e.output };
        break;
      }
      case "permission":
        items.push({ kind: "permission", seq: e.seq, id: e.id, tool: e.tool, summary: e.summary });
        break;
      case "error":
        items.push({ kind: "error", seq: e.seq, code: e.code, message: e.message });
        break;
      default:
        break;
    }
  }
  return items;
}

/** The file changes of a run (the last `changes` event), or []. */
export function changesOf(events: AgentEvent[]): FileChange[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "changes") return e.changes;
  }
  return [];
}

/** True when the run has said "done". */
export const isRunDone = (events: AgentEvent[]) => events.some((e) => e.type === "done");

/**
 * Permission requests that wait for an answer. The runner stops while it waits, so the next tool result
 * (or the end of the run) means the request was answered.
 */
export function openPermissions(events: AgentEvent[]): Set<string> {
  const open = new Set<string>();
  for (const e of events) {
    if (e.type === "permission") open.add(e.id);
    else if (e.type === "tool_result" || e.type === "done") open.clear();
  }
  return open;
}
