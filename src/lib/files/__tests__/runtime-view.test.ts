import { describe, expect, it } from "vitest";
import {
  MAX_VIEW_BYTES,
  buildRuntimeTree,
  isRuntimePath,
  packageJsonHasDeps,
  viewText,
} from "../runtime-view";

describe("isRuntimePath", () => {
  it("matches node_modules and what is inside it", () => {
    expect(isRuntimePath("node_modules")).toBe(true);
    expect(isRuntimePath("node_modules/a/index.js")).toBe(true);
  });
  it("does not match look-alike names", () => {
    expect(isRuntimePath("src/node_modules")).toBe(false);
    expect(isRuntimePath("node_modules2/a.js")).toBe(false);
    expect(isRuntimePath("index.js")).toBe(false);
  });
});

describe("buildRuntimeTree", () => {
  it("is empty when node_modules does not exist", () => {
    expect(buildRuntimeTree({}, {})).toEqual([]);
  });
  it("builds a read-only root with listed children", () => {
    const tree = buildRuntimeTree(
      { node_modules: [{ name: "is-odd", isDir: true }, { name: ".package-lock.json", isDir: false }] },
      {}
    );
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: "node_modules", path: "node_modules", type: "directory", readOnly: true });
    expect(tree[0].children?.map((c) => [c.path, c.type, c.readOnly])).toEqual([
      ["node_modules/is-odd", "directory", true],
      ["node_modules/.package-lock.json", "file", true],
    ]);
  });
  it("leaves an unlisted folder empty and fills a listed one", () => {
    const tree = buildRuntimeTree(
      {
        node_modules: [{ name: "a", isDir: true }, { name: "b", isDir: true }],
        "node_modules/a": [{ name: "index.js", isDir: false }],
      },
      { "node_modules/a/index.js": "x" }
    );
    const [a, b] = tree[0].children!;
    expect(a.children).toEqual([
      { name: "index.js", path: "node_modules/a/index.js", type: "file", readOnly: true, content: "x" },
    ]);
    expect(b.children).toEqual([]);
  });
  it("gives a file empty content before it is read", () => {
    const tree = buildRuntimeTree({ node_modules: [{ name: "f.js", isDir: false }] }, {});
    expect(tree[0].children![0].content).toBe("");
  });
});

describe("viewText", () => {
  it("returns normal text unchanged", () => {
    expect(viewText("hello")).toBe("hello");
  });
  it("explains a file that is missing, binary or too big", () => {
    expect(viewText(null)).toContain("could not be read");
    expect(viewText("a\u0000b")).toContain("Binary");
    expect(viewText("x".repeat(MAX_VIEW_BYTES + 1))).toContain("larger than 1 MB");
  });
});

describe("packageJsonHasDeps", () => {
  it("is true for dependencies, devDependencies and optionalDependencies", () => {
    expect(packageJsonHasDeps('{"dependencies":{"a":"1"}}')).toBe(true);
    expect(packageJsonHasDeps('{"devDependencies":{"a":"1"}}')).toBe(true);
    expect(packageJsonHasDeps('{"optionalDependencies":{"a":"1"}}')).toBe(true);
  });
  it("is false for empty lists, no lists, bad JSON and no text", () => {
    expect(packageJsonHasDeps('{"dependencies":{}}')).toBe(false);
    expect(packageJsonHasDeps('{"name":"x"}')).toBe(false);
    expect(packageJsonHasDeps("{ not json")).toBe(false);
    expect(packageJsonHasDeps(undefined)).toBe(false);
    expect(packageJsonHasDeps('{"dependencies":"a"}')).toBe(false);
  });
});
