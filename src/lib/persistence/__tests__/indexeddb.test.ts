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

  it("saves files and meta together and clears both", async () => {
    const store = new IndexedDBStore();
    await store.save("u4", "p", tree, 123);
    expect(await store.loadWithMeta("u4", "p")).toEqual({ files: tree, updatedAt: 123 });
    await store.clear("u4", "p");
    expect(await store.loadWithMeta("u4", "p")).toBeNull();
  });

  it("treats a bad stored shape as nothing saved", async () => {
    const store = new IndexedDBStore();
    await store.save("u5", "p", [{ nope: 1 }] as unknown as FileNode[]);
    expect(await store.load("u5", "p")).toBeNull();
  });

  it("keeps users and projects separate", async () => {
    const store = new IndexedDBStore();
    await store.save("u2", "a", tree);
    expect(await store.load("u2", "b")).toBeNull();
    expect(await store.load("u3", "a")).toBeNull();
  });
});

describe("IndexedDBStore projects of a user", () => {
  it("lists the projects of one user with their times, and not those of another user", async () => {
    const store = new IndexedDBStore();
    await store.save("lu1", "alpha", tree, 100);
    await store.save("lu1", "beta", tree, 200);
    await store.save("lu2", "other", tree, 300);
    const list = await store.list("lu1");
    expect(list.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "alpha", updatedAt: 100 },
      { name: "beta", updatedAt: 200 },
    ]);
    expect(await store.list("lu-nobody")).toEqual([]);
  });

  it("clears all projects of one user and keeps the others", async () => {
    const store = new IndexedDBStore();
    await store.save("cu1", "a", tree, 1);
    await store.save("cu1", "b", tree, 2);
    await store.save("cu2", "keep", tree, 3);
    await store.clearAll("cu1");
    expect(await store.list("cu1")).toEqual([]);
    expect(await store.load("cu1", "a")).toBeNull();
    expect(await store.load("cu2", "keep")).toEqual(tree);
  });
});
