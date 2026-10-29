// @vitest-environment node
import { describe, it, expect } from "vitest";
import { diffSnapshot, isSafeRelPath, snapshotFiles, SnapshotTooLargeError, MAX_SNAPSHOT_BYTES } from "../snapshot";
import type { FileNode } from "@/lib/persistence/indexeddb";

const file = (path: string, content: string): FileNode => ({ name: path.split("/").pop()!, path, type: "file", content });
const dir = (path: string, children: FileNode[]): FileNode => ({ name: path, path, type: "directory", children });

describe("isSafeRelPath", () => {
  it("accepts normal relative paths", () => {
    for (const p of ["a.js", "src/app/page.tsx", ".env.example", "a b/c.txt"]) expect(isSafeRelPath(p)).toBe(true);
  });
  it("rejects parent segments, absolute paths, drives, backslashes, empty and NUL", () => {
    for (const p of ["../x", "a/../../b", "/etc/passwd", "C:/x", "a\\b", "", "a//b", "./a", "a\0b", "a/./b"]) {
      expect(isSafeRelPath(p), p).toBe(false);
    }
  });
});

describe("snapshotFiles", () => {
  it("flattens the tree and skips node_modules and .git", () => {
    const { files } = snapshotFiles([
      file("index.js", "1"),
      dir("src", [file("src/a.js", "2")]),
      dir("node_modules", [file("node_modules/x/index.js", "3")]),
      dir(".git", [file(".git/config", "4")]),
    ]);
    expect(Object.keys(files).sort()).toEqual(["index.js", "src/a.js"]);
  });
  it("throws over 5 MB", () => {
    const big = "x".repeat(MAX_SNAPSHOT_BYTES + 1);
    expect(() => snapshotFiles([file("big.txt", big)])).toThrow(SnapshotTooLargeError);
  });
  it("counts bytes, not characters", () => {
    const { bytes } = snapshotFiles([file("a.txt", "नमस्ते")]);
    expect(bytes).toBeGreaterThan("नमस्ते".length);
  });
});

describe("diffSnapshot", () => {
  it("returns create, update and delete, sorted by path", () => {
    const before = { "a.js": "1", "b.js": "2", "c.js": "3" };
    const after = { "a.js": "1", "b.js": "22", "d.js": "4" };
    expect(diffSnapshot(before, after)).toEqual([
      { path: "b.js", op: "update", content: "22" },
      { path: "c.js", op: "delete" },
      { path: "d.js", op: "create", content: "4" },
    ]);
  });
  it("returns [] when nothing changed", () => {
    expect(diffSnapshot({ a: "1" }, { a: "1" })).toEqual([]);
  });
});
