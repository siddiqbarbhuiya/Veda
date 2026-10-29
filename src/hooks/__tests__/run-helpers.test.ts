import { describe, it, expect } from "vitest";
import { runtimeForFile, nodePath, flattenTree, diffSync, trimPyTraceback } from "../run-helpers";

describe("runtimeForFile", () => {
  it("maps extensions", () => {
    expect(runtimeForFile("a.js")).toBe("node");
    expect(runtimeForFile("src/a.MJS")).toBe("node");
    expect(runtimeForFile("a.cjs")).toBe("node");
    expect(runtimeForFile("a.py")).toBe("python");
    expect(runtimeForFile("a.ts")).toBeNull();
    expect(runtimeForFile("README.md")).toBeNull();
    expect(runtimeForFile("py")).toBeNull();
    expect(runtimeForFile(".js")).toBeNull();
  });
  it("prefixes node paths", () => {
    expect(nodePath("-p.js")).toBe("./-p.js");
    expect(nodePath("/a/b.js")).toBe("./a/b.js");
  });
});

describe("diffSync", () => {
  const tree = [
    { name: "a.js", path: "a.js", type: "file" as const, content: "1" },
    { name: "d", path: "d", type: "directory" as const, children: [{ name: "b.js", path: "d/b.js", type: "file" as const, content: "2" }] },
  ];
  it("flattens", () => {
    expect([...flattenTree(tree).keys()]).toEqual(["a.js", "d/", "d/b.js"]);
  });
  it("writes everything on first sync", () => {
    const d = diffSync(new Map(), flattenTree(tree));
    expect(d.write.map((w) => w[0])).toEqual(["a.js", "d/", "d/b.js"]);
    expect(d.remove).toEqual([]);
  });
  it("writes changes and removes deleted files, deepest first", () => {
    const prev = flattenTree(tree);
    const next = new Map(prev);
    next.set("a.js", "changed");
    next.delete("d/b.js");
    next.delete("d/");
    const d = diffSync(prev, next);
    expect(d.write).toEqual([["a.js", "changed"]]);
    expect(d.remove).toEqual(["d/b.js", "d/"]);
  });
  it("ignores untracked files", () => {
    const prev = flattenTree(tree);
    expect(diffSync(prev, new Map(prev))).toEqual({ write: [], remove: [] });
  });
});

describe("trimPyTraceback", () => {
  it("drops Pyodide frames", () => {
    const tb = [
      "Traceback (most recent call last):",
      '  File "/lib/python313.zip/_pyodide/_base.py", line 574, in eval_code_async',
      "    await CodeRunner(",
      '  File "<exec>", line 1, in <module>',
      "ZeroDivisionError: division by zero",
    ].join("\n");
    expect(trimPyTraceback(tb)).toBe(
      ["Traceback (most recent call last):", '  File "<exec>", line 1, in <module>', "ZeroDivisionError: division by zero"].join("\n")
    );
  });
});
