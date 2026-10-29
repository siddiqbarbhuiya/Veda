import { describe, expect, it } from "vitest";
import type { FileNode } from "@/lib/persistence/indexeddb";
import {
  MAX_FILE_BYTES,
  acceptRuntimeFile,
  applyIncomingToMap,
  applyIncomingToTree,
  computeIncoming,
  shouldIgnore,
} from "../runtime-sync";

const m = (o: Record<string, string>) => new Map(Object.entries(o));

describe("shouldIgnore", () => {
  it("ignores generated and tool folders at any depth", () => {
    expect(shouldIgnore("node_modules/x/index.js")).toBe(true);
    expect(shouldIgnore("node_modules/")).toBe(true);
    expect(shouldIgnore("a/node_modules/b.js")).toBe(true);
    expect(shouldIgnore(".git/config")).toBe(true);
    expect(shouldIgnore(".npm/_cacache/x")).toBe(true);
    expect(shouldIgnore("dist/app.js")).toBe(true);
    expect(shouldIgnore(".next/server/a.js")).toBe(true);
  });
  it("keeps normal files, dotfiles and look-alike names", () => {
    expect(shouldIgnore("src/index.js")).toBe(false);
    expect(shouldIgnore(".env")).toBe(false);
    expect(shouldIgnore(".gitignore")).toBe(false);
    expect(shouldIgnore("my_node_modules/a.js")).toBe(false);
    expect(shouldIgnore("distance.js")).toBe(false);
  });
});

describe("acceptRuntimeFile", () => {
  it("accepts small text", () => {
    expect(acceptRuntimeFile("hello\n")).toBe(true);
    expect(acceptRuntimeFile("")).toBe(true);
    expect(acceptRuntimeFile("नमस्ते")).toBe(true);
  });
  it("rejects binary content and big files", () => {
    expect(acceptRuntimeFile("a\u0000b")).toBe(false);
    expect(acceptRuntimeFile("x".repeat(MAX_FILE_BYTES + 1))).toBe(false);
  });
});

describe("computeIncoming", () => {
  it("adds a folder that the terminal created", () => {
    const synced = m({ "index.js": "a" });
    const runtime = m({ "index.js": "a", "src/": "" });
    const editor = m({ "index.js": "a" });
    expect(computeIncoming(synced, runtime, editor)).toEqual({ upsert: [["src/", ""]], remove: [] });
  });
  it("adds a file and its parent folders", () => {
    const synced = m({});
    const runtime = m({ "a/": "", "a/b/": "", "a/b/c.txt": "hi" });
    const ops = computeIncoming(synced, runtime, m({}));
    expect(ops.upsert.map(([k]) => k)).toEqual(["a/", "a/b/", "a/b/c.txt"]);
  });
  it("takes a changed file from the terminal when the editor did not change it", () => {
    const ops = computeIncoming(m({ "f.txt": "old" }), m({ "f.txt": "new" }), m({ "f.txt": "old" }));
    expect(ops.upsert).toEqual([["f.txt", "new"]]);
  });
  it("keeps the editor text when both sides changed the same file", () => {
    const ops = computeIncoming(m({ "f.txt": "old" }), m({ "f.txt": "term" }), m({ "f.txt": "editor" }));
    expect(ops).toEqual({ upsert: [], remove: [] });
  });
  it("removes what the terminal deleted, deepest first", () => {
    const synced = m({ "a/": "", "a/x.txt": "1", "keep.txt": "k" });
    const runtime = m({ "keep.txt": "k" });
    const ops = computeIncoming(synced, runtime, synced);
    expect(ops.remove).toEqual(["a/x.txt", "a/"]);
  });
  it("does not delete a file that the user edited in the editor", () => {
    const synced = m({ "x.txt": "1" });
    const ops = computeIncoming(synced, m({}), m({ "x.txt": "edited" }));
    expect(ops.remove).toEqual([]);
  });
  it("does not delete a file that the editor already removed", () => {
    const synced = m({ "x.txt": "1" });
    expect(computeIncoming(synced, m({}), m({}))).toEqual({ upsert: [], remove: [] });
  });
  it("ignores node_modules and other ignored paths in both directions", () => {
    const synced = m({ "node_modules/a.js": "1" });
    const runtime = m({ "node_modules/b.js": "2", ".git/HEAD": "x" });
    expect(computeIncoming(synced, runtime, m({}))).toEqual({ upsert: [], remove: [] });
  });
  it("returns no ops when nothing changed", () => {
    const s = m({ "a.js": "1", "d/": "" });
    expect(computeIncoming(s, new Map(s), new Map(s))).toEqual({ upsert: [], remove: [] });
  });
});

describe("applyIncomingToMap", () => {
  it("sets the synced value for upserts and drops removed keys", () => {
    const next = applyIncomingToMap(m({ "a.txt": "1", "b.txt": "2" }), {
      upsert: [["c.txt", "3"]],
      remove: ["a.txt"],
    });
    expect([...next.entries()]).toEqual([
      ["b.txt", "2"],
      ["c.txt", "3"],
    ]);
  });
});

const file = (path: string, content = ""): FileNode => ({ name: path.split("/").pop()!, path, type: "file", content });
const dir = (path: string, children: FileNode[] = []): FileNode => ({
  name: path.split("/").pop()!,
  path,
  type: "directory",
  children,
});

describe("applyIncomingToTree", () => {
  it("returns the same array when there are no ops", () => {
    const tree = [file("a.js", "1")];
    expect(applyIncomingToTree(tree, { upsert: [], remove: [] })).toBe(tree);
  });
  it("shows a new empty folder", () => {
    const next = applyIncomingToTree([file("a.js", "1")], { upsert: [["src/", ""]], remove: [] });
    expect(next).toEqual([file("a.js", "1"), dir("src")]);
  });
  it("puts a file inside a nested folder and makes the parents", () => {
    const next = applyIncomingToTree([], { upsert: [["a/b/c.txt", "hi"]], remove: [] });
    expect(next).toEqual([dir("a", [dir("a/b", [file("a/b/c.txt", "hi")])])]);
  });
  it("updates content and keeps other nodes", () => {
    const keep = file("keep.js", "k");
    const next = applyIncomingToTree([file("f.txt", "old"), keep], { upsert: [["f.txt", "new"]], remove: [] });
    expect(next).toEqual([file("f.txt", "new"), keep]);
    expect(next[1]).toBe(keep);
  });
  it("removes a folder and everything in it", () => {
    const tree = [dir("a", [file("a/x.txt", "1")]), file("b.txt", "2")];
    const next = applyIncomingToTree(tree, { upsert: [], remove: ["a/x.txt", "a/"] });
    expect(next).toEqual([file("b.txt", "2")]);
  });
  it("keeps an empty folder in a nested folder", () => {
    const next = applyIncomingToTree([dir("a")], { upsert: [["a/b/", ""]], remove: [] });
    expect(next).toEqual([dir("a", [dir("a/b")])]);
  });
});

import { incomingFromScan, scanFs, MAX_SCAN_ENTRIES, type FsAdapter } from "../runtime-sync";

/** A fake runtime. A key ending in "/" is a folder. */
function fakeFs(files: Record<string, string>): FsAdapter {
  const keys = Object.keys(files);
  return {
    list(dir) {
      const prefix = dir ? `${dir}/` : "";
      const seen = new Map<string, boolean>();
      for (const k of keys) {
        if (!k.startsWith(prefix) || k === prefix) continue;
        const rest = k.slice(prefix.length);
        const first = rest.split("/")[0];
        seen.set(first, rest.includes("/"));
      }
      return [...seen].map(([name, isDir]) => ({ name, isDir }));
    },
    read(path) {
      if (!(path in files)) throw new Error("ENOENT");
      return files[path];
    },
  };
}

describe("scanFs", () => {
  it("reads files and folders with folder keys ending in a slash", async () => {
    const scan = await scanFs(fakeFs({ "a/b.txt": "1", "c.txt": "2" }));
    expect([...scan.entries]).toEqual([
      ["a/", ""],
      ["a/b.txt", "1"],
      ["c.txt", "2"],
    ]);
    expect(scan.complete).toBe(true);
  });
  it("does not enter ignored folders", async () => {
    const scan = await scanFs(fakeFs({ "node_modules/x/i.js": "1", ".git/HEAD": "x", "ok.js": "2" }));
    expect([...scan.entries.keys()]).toEqual(["ok.js"]);
  });
  it("lists a binary or big file as skipped, not as copied", async () => {
    const scan = await scanFs(fakeFs({ "img.bin": "a\u0000b", "big.txt": "x".repeat(MAX_FILE_BYTES + 1), "t.txt": "ok" }));
    expect([...scan.entries.keys()]).toEqual(["t.txt"]);
    expect([...scan.skipped].sort()).toEqual(["big.txt", "img.bin"]);
  });
  it("marks the scan incomplete when there are too many entries", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_SCAN_ENTRIES + 5; i++) many[`f${i}.txt`] = "x";
    const scan = await scanFs(fakeFs(many));
    expect(scan.complete).toBe(false);
    expect(scan.entries.size).toBe(MAX_SCAN_ENTRIES);
  });
  it("treats a file that cannot be read as skipped", async () => {
    const fs = fakeFs({ "a.txt": "1" });
    const bad: FsAdapter = { list: fs.list, read: () => { throw new Error("EIO"); } };
    const scan = await scanFs(bad);
    expect([...scan.skipped]).toEqual(["a.txt"]);
  });
});

describe("incomingFromScan", () => {
  it("does not delete a skipped file that the editor still has", () => {
    const synced = m({ "img.txt": "old" });
    const scan = { entries: new Map<string, string>(), skipped: new Set(["img.txt"]), complete: true };
    expect(incomingFromScan(synced, scan, synced)).toEqual({ upsert: [], remove: [] });
  });
  it("deletes nothing when the scan is incomplete", () => {
    const synced = m({ "a.txt": "1", "b.txt": "2" });
    const scan = { entries: m({ "a.txt": "1", "new.txt": "n" }), skipped: new Set<string>(), complete: false };
    const ops = incomingFromScan(synced, scan, synced);
    expect(ops.remove).toEqual([]);
    expect(ops.upsert).toEqual([["new.txt", "n"]]);
  });
  it("deletes a file that is really gone after a complete scan", () => {
    const synced = m({ "a.txt": "1" });
    const scan = { entries: new Map<string, string>(), skipped: new Set<string>(), complete: true };
    expect(incomingFromScan(synced, scan, synced).remove).toEqual(["a.txt"]);
  });
});
