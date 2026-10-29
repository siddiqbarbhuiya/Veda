import { describe, it, expect } from "vitest";
import { eventsFrom, isTerminal, parseEventLines, type AgentEvent } from "../events";

const line = (e: object) => JSON.stringify(e);

describe("parseEventLines", () => {
  it("reads one event per line and skips a partial last line", () => {
    const text = [line({ seq: 0, type: "text", text: "a" }), line({ seq: 1, type: "done" }), '{"seq":2,"ty'].join("\n");
    expect(parseEventLines(text).map((e) => e.seq)).toEqual([0, 1]);
  });
  it("skips lines that are not events", () => {
    expect(parseEventLines('{"x":1}\nnot json\n\n')).toEqual([]);
  });
});

describe("eventsFrom", () => {
  const evs = [0, 1, 2, 3].map((seq) => ({ seq, type: "text", text: String(seq) }) as AgentEvent);
  it("returns events from the given seq with no duplicate and no gap", () => {
    const first = eventsFrom([...evs, evs[2]], 0);
    expect(first.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    const next = eventsFrom(evs, 2);
    expect(next.map((e) => e.seq)).toEqual([2, 3]);
  });
});

describe("isTerminal", () => {
  it("is true for done, error and final status", () => {
    expect(isTerminal({ seq: 0, type: "done" })).toBe(true);
    expect(isTerminal({ seq: 0, type: "error", code: "x", message: "m" })).toBe(true);
    expect(isTerminal({ seq: 0, type: "status", state: "error" })).toBe(true);
    expect(isTerminal({ seq: 0, type: "status", state: "running" })).toBe(false);
    expect(isTerminal({ seq: 0, type: "text", text: "a" })).toBe(false);
  });
});
