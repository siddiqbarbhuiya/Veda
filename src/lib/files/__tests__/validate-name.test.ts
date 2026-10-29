import { describe, it, expect } from "vitest";
import { validateName, validateNewPath, sanitizeTree } from "../validate-name";
import { extOf } from "../ext";
import type { FileNode } from "@/lib/persistence/indexeddb";

describe("validateName", () => {
  it.each(["", "   ", ".", "..", "a/b", "a\\b", "a\u0000b", "a\nb", " a", "a ", "a.", "x".repeat(256)])(
    "rejects %j",
    (n) => {
      expect(validateName(n).ok).toBe(false);
    },
  );

  it("accepts normal names and dotfiles", () => {
    expect(validateName("index.js")).toEqual({ ok: true, value: "index.js" });
    expect(validateName(".env").ok).toBe(true);
    expect(validateName("x".repeat(255)).ok).toBe(true);
  });

  it("rejects case-insensitive duplicates", () => {
    const r = validateName("app.js", ["App.js"]);
    expect(r.ok).toBe(false);
  });
});

const tree: FileNode[] = [
  { name: "src", path: "src", type: "directory", children: [{ name: "a.js", path: "src/a.js", type: "file", content: "" }] },
  { name: "README.md", path: "README.md", type: "file", content: "" },
];

describe("validateNewPath", () => {
  it("builds the path in the base folder", () => {
    expect(validateNewPath(tree, "src/", "b.js")).toEqual({ ok: true, value: "src/b.js" });
  });
  it("splits a/b.txt and checks each part", () => {
    expect(validateNewPath(tree, "", "lib/x/b.txt")).toEqual({ ok: true, value: "lib/x/b.txt" });
    expect(validateNewPath(tree, "", "../b.txt").ok).toBe(false);
    expect(validateNewPath(tree, "", "a//b").ok).toBe(false);
    expect(validateNewPath(tree, "", "a/").ok).toBe(false);
    expect(validateNewPath(tree, "", "/a").ok).toBe(false);
  });
  it("reuses an existing folder and rejects a file as a folder", () => {
    expect(validateNewPath(tree, "", "SRC/c.js")).toEqual({ ok: true, value: "src/c.js" });
    expect(validateNewPath(tree, "", "README.md/c.js").ok).toBe(false);
  });
  it("rejects duplicates", () => {
    expect(validateNewPath(tree, "src/", "A.JS").ok).toBe(false);
  });
});

describe("sanitizeTree", () => {
  it("renames bad names and rebuilds paths", () => {
    const bad = [
      { name: "..", path: "..", type: "file", content: "x" },
      { name: "", path: "", type: "file", content: "y" },
      { name: "a/b.js", path: "a/b.js", type: "file", content: "z" },
      { name: "d", path: "d", type: "directory", children: [{ name: "..", path: "d/..", type: "file", content: "k" }] },
    ];
    const out = sanitizeTree(bad);
    expect(out.map((n) => n.name)).toEqual(["untitled", "untitled (2)", "a_b.js", "d"]);
    expect(out.map((n) => n.path)).toEqual(["untitled", "untitled (2)", "a_b.js", "d"]);
    expect(out[0].content).toBe("x");
    expect(out[3].children?.[0].path).toBe("d/untitled");
  });
  it("keeps a valid tree unchanged", () => {
    expect(sanitizeTree(tree)).toEqual(tree);
  });
  it("is safe on garbage", () => {
    expect(sanitizeTree(null)).toEqual([]);
    expect(sanitizeTree([1, null, { type: "x" }])).toEqual([]);
  });
});

describe("extOf", () => {
  it("returns an empty string without a dot after position 0", () => {
    expect(extOf("json")).toBe("");
    expect(extOf(".env")).toBe("");
    expect(extOf("a.")).toBe("");
    expect(extOf("A.PY")).toBe("py");
    expect(extOf("a.b.ts")).toBe("ts");
  });
});
