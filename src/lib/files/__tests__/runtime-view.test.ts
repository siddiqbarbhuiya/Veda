import { describe, expect, it } from "vitest";
import type { FileNode } from "@/lib/persistence/indexeddb";
import {
  MAX_VIEW_BYTES,
  attachRuntime,
  buildRuntimeTree,
  isRuntimePath,
  packageJsonHasDeps,
  projectDirs,
  runtimeRootOf,
  viewText,
} from "../runtime-view";

describe("isRuntimePath", () => {
  it("matches node_modules and what is inside it, at any depth", () => {
    expect(isRuntimePath("node_modules")).toBe(true);
    expect(isRuntimePath("node_modules/a/index.js")).toBe(true);
    expect(isRuntimePath("app/node_modules")).toBe(true);
    expect(isRuntimePath("app/node_modules/a/b.js")).toBe(true);
  });
  it("does not match look-alike names", () => {
    expect(isRuntimePath("node_modules2/a.js")).toBe(false);
    expect(isRuntimePath("my_node_modules")).toBe(false);
    expect(isRuntimePath("index.js")).toBe(false);
  });
});

describe("runtimeRootOf", () => {
  it("gives the node_modules path of a folder", () => {
    expect(runtimeRootOf("")).toBe("node_modules");
    expect(runtimeRootOf("app")).toBe("app/node_modules");
  });
});

describe("buildRuntimeTree", () => {
  it("is empty when no node_modules is listed", () => {
    expect(buildRuntimeTree({}, {})).toEqual([]);
    expect(buildRuntimeTree({ app: [] }, {})).toEqual([]);
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
  it("builds one root for every project folder that has node_modules", () => {
    const tree = buildRuntimeTree({ node_modules: [], "app/node_modules": [], "api/node_modules": [] }, {});
    expect(tree.map((n) => n.path)).toEqual(["api/node_modules", "app/node_modules", "node_modules"]);
  });
  it("does not make a root of a node_modules inside another node_modules", () => {
    const tree = buildRuntimeTree({ node_modules: [{ name: "a", isDir: true }], "node_modules/a/node_modules": [] }, {});
    expect(tree.map((n) => n.path)).toEqual(["node_modules"]);
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

const file = (path: string): FileNode => ({ name: path.split("/").pop()!, path, type: "file", content: "" });
const dir = (path: string, children: FileNode[] = []): FileNode => ({ name: path.split("/").pop()!, path, type: "directory", children });

describe("attachRuntime", () => {
  it("returns the same tree when there are no roots", () => {
    const files = [file("a.js")];
    expect(attachRuntime(files, [])).toBe(files);
  });
  it("adds a root node_modules at the end of the top level", () => {
    const roots = buildRuntimeTree({ node_modules: [] }, {});
    const out = attachRuntime([file("a.js")], roots);
    expect(out.map((n) => n.path)).toEqual(["a.js", "node_modules"]);
  });
  it("puts a project folder's node_modules inside that folder", () => {
    const roots = buildRuntimeTree({ "app/node_modules": [] }, {});
    const out = attachRuntime([dir("app", [file("app/package.json")]), dir("other")], roots);
    expect(out[0].children?.map((n) => n.path)).toEqual(["app/package.json", "app/node_modules"]);
    expect(out[1].children).toEqual([]);
  });
  it("skips a root when the user made a node_modules in the same folder", () => {
    const roots = buildRuntimeTree({ "app/node_modules": [] }, {});
    const out = attachRuntime([dir("app", [dir("app/node_modules")])], roots);
    expect(out[0].children).toHaveLength(1);
    expect(out[0].children![0].readOnly).toBeUndefined();
  });
  it("skips a root whose folder does not exist in the project", () => {
    const roots = buildRuntimeTree({ "gone/node_modules": [] }, {});
    expect(attachRuntime([dir("app")], roots).map((n) => n.path)).toEqual(["app"]);
  });
});

describe("projectDirs", () => {
  it("lists folders in tree order up to the depth, without read-only or node_modules folders", () => {
    const tree = [
      dir("a", [dir("a/b", [dir("a/b/c")]), dir("a/node_modules")]),
      { ...dir("ro"), readOnly: true },
      dir("z"),
    ];
    expect(projectDirs(tree, 2)).toEqual(["a", "a/b", "z"]);
    expect(projectDirs(tree, 1)).toEqual(["a", "z"]);
    expect(projectDirs(tree, 3)).toEqual(["a", "a/b", "a/b/c", "z"]);
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
