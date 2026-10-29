import { describe, it, expect } from "vitest";
import { remapPath, removeFromNav, renameTree, type FileNode } from "../use-file-system";

const f = (path: string): FileNode => ({ name: path.split("/").pop()!, path, type: "file", content: "" });
const tree: FileNode[] = [
  { name: "src", path: "src", type: "directory", children: [f("src/a.js"), f("src/b.js")] },
  f("README.md"),
];

describe("renameTree", () => {
  it("renames a folder and remaps its children without reordering", () => {
    const out = renameTree(tree, "src", "lib");
    expect(out[0].name).toBe("lib");
    expect(out[0].path).toBe("lib");
    expect(out[0].children?.map((c) => c.path)).toEqual(["lib/a.js", "lib/b.js"]);
    expect(out[1].path).toBe("README.md");
  });
  it("renames one file", () => {
    const out = renameTree(tree, "src/a.js", "src/c.js");
    expect(out[0].children?.map((c) => c.name)).toEqual(["c.js", "b.js"]);
  });
});

describe("remapPath", () => {
  it("only remaps paths under the old path", () => {
    expect(remapPath("src/a.js", "src", "lib")).toBe("lib/a.js");
    expect(remapPath("src2/a.js", "src", "lib")).toBe("src2/a.js");
  });
});

describe("removeFromNav", () => {
  it("activates the right neighbour, then the left, then null", () => {
    const nav = { tabs: ["a", "b", "c"], active: "b" };
    expect(removeFromNav(nav, (p) => p === "b")).toEqual({ tabs: ["a", "c"], active: "c" });
    expect(removeFromNav({ tabs: ["a", "b"], active: "b" }, (p) => p === "b")).toEqual({ tabs: ["a"], active: "a" });
    expect(removeFromNav({ tabs: ["a"], active: "a" }, () => true)).toEqual({ tabs: [], active: null });
  });
  it("keeps the active tab when another closes", () => {
    expect(removeFromNav({ tabs: ["a", "b"], active: "a" }, (p) => p === "b")).toEqual({ tabs: ["a"], active: "a" });
  });
});
