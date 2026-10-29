import { describe, it, expect, vi } from "vitest";
import { applyChanges, flattenFiles } from "../apply-changes";
import { diffStats, lineDiff, withContext } from "../diff";
import { buildTimeline, changesOf, openPermissions } from "../timeline";
import type { AgentEvent, FileChange } from "../events";

function store() {
  return { createFile: vi.fn(), updateFileContent: vi.fn(), deleteFile: vi.fn() };
}

describe("applyChanges", () => {
  const changes: FileChange[] = [
    { path: "a.js", op: "update", content: "A2" },
    { path: "new.js", op: "create", content: "N" },
    { path: "gone.js", op: "delete" },
  ];
  const base = { "a.js": "A", "gone.js": "G" };

  it("applies only the accepted paths", () => {
    const s = store();
    const r = applyChanges(changes, new Set(["a.js", "new.js"]), s, { base, current: base });
    expect(r.applied).toEqual(["a.js", "new.js"]);
    expect(r.skipped).toEqual(["gone.js"]);
    expect(s.updateFileContent).toHaveBeenCalledWith("a.js", "A2");
    expect(s.createFile).toHaveBeenCalledWith("new.js", "file", "N");
    expect(s.deleteFile).not.toHaveBeenCalled();
  });

  it("deletes an accepted delete", () => {
    const s = store();
    applyChanges(changes, new Set(["gone.js"]), s, { base, current: base });
    expect(s.deleteFile).toHaveBeenCalledWith("gone.js");
  });

  it("never writes an unsafe path, even when accepted", () => {
    const s = store();
    const bad: FileChange[] = ["../x", "/etc/passwd", "C:/x", "a/../../b", "a\\b"].map((path) => ({ path, op: "create", content: "x" }));
    const r = applyChanges(bad, new Set(bad.map((c) => c.path)), s, { base: {}, current: {} });
    expect(r.applied).toEqual([]);
    expect(r.skipped).toHaveLength(5);
    expect(s.createFile).not.toHaveBeenCalled();
    expect(s.updateFileContent).not.toHaveBeenCalled();
  });

  it("reports a conflict when the student edited the file after the run started", () => {
    const s = store();
    const r = applyChanges(changes, new Set(["a.js"]), s, { base, current: { ...base, "a.js": "student edit" } });
    expect(r.conflicts).toEqual(["a.js"]);
    expect(s.updateFileContent).not.toHaveBeenCalled();
  });

  it("writes a conflicting file when it is in the overwrite set", () => {
    const s = store();
    const r = applyChanges(changes, new Set(["a.js"]), s, {
      base,
      current: { ...base, "a.js": "student edit" },
      overwrite: new Set(["a.js"]),
    });
    expect(r.applied).toEqual(["a.js"]);
    expect(s.updateFileContent).toHaveBeenCalledWith("a.js", "A2");
  });

  it("updates instead of creating when the new file now exists with other content", () => {
    const s = store();
    // base had no new.js, but the student created one: that is a conflict, then an overwrite updates it.
    const r = applyChanges(changes, new Set(["new.js"]), s, {
      base,
      current: { ...base, "new.js": "mine" },
      overwrite: new Set(["new.js"]),
    });
    expect(r.applied).toEqual(["new.js"]);
    expect(s.updateFileContent).toHaveBeenCalledWith("new.js", "N");
    expect(s.createFile).not.toHaveBeenCalled();
  });

  it("skips a create or update without content", () => {
    const s = store();
    const r = applyChanges([{ path: "x.js", op: "create" }], new Set(["x.js"]), s, { base: {}, current: {} });
    expect(r.skipped).toEqual(["x.js"]);
  });
});

describe("flattenFiles", () => {
  it("flattens nested folders", () => {
    expect(
      flattenFiles([
        { name: "a", path: "a.js", type: "file", content: "1" },
        { name: "src", path: "src", type: "directory", children: [{ name: "b", path: "src/b.js", type: "file", content: "2" }] },
      ])
    ).toEqual({ "a.js": "1", "src/b.js": "2" });
  });
});

describe("lineDiff", () => {
  it("marks added, removed and unchanged lines", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc\nd");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });
  it("treats an empty side as no lines", () => {
    expect(lineDiff("", "x\ny")).toEqual([
      { kind: "add", text: "x" },
      { kind: "add", text: "y" },
    ]);
    expect(lineDiff("x", "")).toEqual([{ kind: "del", text: "x" }]);
  });
  it("does not hang on a very large file", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    expect(lineDiff(big, big + "\nmore").length).toBeGreaterThan(0);
  });
  it("folds long unchanged stretches", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "CHANGED");
    const out = withContext(lineDiff(before, after), 2);
    expect(out.some((l) => l.text === "…")).toBe(true);
    expect(out.filter((l) => l.kind !== "same")).toHaveLength(2);
    expect(out.length).toBeLessThan(12);
  });
});

describe("timeline", () => {
  const ev = (e: object, seq: number) => ({ seq, ...e }) as AgentEvent;
  const events = [
    ev({ type: "status", state: "running" }, 0),
    ev({ type: "text", text: "Plan" }, 1),
    ev({ type: "tool_use", id: "t1", name: "Write", summary: "a.js" }, 2),
    ev({ type: "permission", id: "p1", tool: "Bash", summary: "ls" }, 3),
  ];

  it("merges a tool result into its tool call and hides status, usage and done", () => {
    const items = buildTimeline([
      ...events,
      ev({ type: "tool_result", id: "t1", ok: true, output: "ok" }, 4),
      ev({ type: "usage", input_tokens: 1, output_tokens: 1 }, 5),
      ev({ type: "done" }, 6),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["text", "tool", "permission"]);
    expect(items[1]).toMatchObject({ kind: "tool", result: { ok: true, output: "ok" } });
  });

  it("a permission waits until a tool result or the end arrives", () => {
    expect([...openPermissions(events)]).toEqual(["p1"]);
    expect([...openPermissions([...events, ev({ type: "tool_result", id: "t1", ok: true, output: "" }, 4)])]).toEqual([]);
    expect([...openPermissions([...events, ev({ type: "done" }, 4)])]).toEqual([]);
  });

  it("returns the last changes event", () => {
    const a: FileChange[] = [{ path: "a", op: "create", content: "1" }];
    const b: FileChange[] = [{ path: "b", op: "create", content: "2" }];
    expect(changesOf([ev({ type: "changes", changes: a }, 0), ev({ type: "changes", changes: b }, 1)])).toEqual(b);
    expect(changesOf([])).toEqual([]);
  });
});
