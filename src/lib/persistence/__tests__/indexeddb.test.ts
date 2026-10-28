import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { IndexedDBStore, type FileNode } from "../indexeddb";

const tree: FileNode[] = [
  { name: "index.js", path: "index.js", type: "file", content: "console.log(1);" },
  {
    name: "src",
    path: "src",
    type: "directory",
    children: [{ name: "a.ts", path: "src/a.ts", type: "file", content: "x" }],
  },
];

describe("IndexedDBStore", () => {
  it("returns null when nothing is saved", async () => {
    const store = new IndexedDBStore();
    expect(await store.load("u-empty", "p")).toBeNull();
  });

  it("saves and loads the same tree", async () => {
    const store = new IndexedDBStore();
    await store.save("u1", "proj", tree);
    expect(await store.load("u1", "proj")).toEqual(tree);
  });

  it("keeps users and projects separate", async () => {
    const store = new IndexedDBStore();
    await store.save("u2", "a", tree);
    expect(await store.load("u2", "b")).toBeNull();
    expect(await store.load("u3", "a")).toBeNull();
  });
});
