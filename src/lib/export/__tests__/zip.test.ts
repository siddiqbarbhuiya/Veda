import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  collectFsEntries,
  countFiles,
  createZip,
  exportFileName,
  flattenFileNodes,
  formatBytes,
  mergeEntries,
  safePath,
  type FsLike,
} from "../zip";
import type { FileNode } from "@/lib/persistence/indexeddb";

const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function fakeFs(tree: Record<string, string | null>): FsLike {
  // A value of null means a directory.
  const children = (dir: string) => {
    const prefix = dir === "." ? "" : dir + "/";
    const names = new Set<string>();
    for (const p of Object.keys(tree)) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (rest) names.add(rest.split("/")[0]);
    }
    return [...names].map((name) => {
      const full = prefix + name;
      const isDir = tree[full] === null;
      return { name, isDirectory: () => isDir, isFile: () => !isDir };
    });
  };
  return {
    readdir: async (dir) => children(dir),
    readFile: async (path) => text(tree[path] ?? ""),
  };
}

describe("safePath", () => {
  it("removes leading slashes and dot segments", () => {
    expect(safePath("/a/./b.txt")).toBe("a/b.txt");
  });
  it("keeps the folder marker", () => {
    expect(safePath("a/b/")).toBe("a/b/");
  });
  it("rejects a path that escapes the root", () => {
    expect(safePath("../x")).toBeNull();
    expect(safePath("a/../../x")).toBeNull();
    expect(safePath("")).toBeNull();
  });
});

describe("flattenFileNodes", () => {
  const tree: FileNode[] = [
    { name: "index.js", path: "/index.js", type: "file", content: "console.log(1)" },
    {
      name: "src",
      path: "/src",
      type: "directory",
      children: [{ name: "a.py", path: "/src/a.py", type: "file", content: "print('hi')" }],
    },
    { name: "empty", path: "/empty", type: "directory", children: [] },
  ];

  it("keeps files, folders and empty folders", () => {
    const paths = flattenFileNodes(tree).map((e) => e.path);
    expect(paths).toEqual(["index.js", "src/", "src/a.py", "empty/"]);
  });
  it("encodes content as UTF-8, including Indic text", () => {
    const [entry] = flattenFileNodes([{ name: "h.txt", path: "/h.txt", type: "file", content: "नमस्ते" }]);
    expect(decode(entry.data)).toBe("नमस्ते");
  });
});

describe("collectFsEntries", () => {
  const fs = fakeFs({
    "index.js": "a",
    src: null,
    "src/util.js": "b",
    node_modules: null,
    "node_modules/pkg": null,
    "node_modules/pkg/index.js": "c",
  });

  it("skips excluded folders at any depth", async () => {
    const entries = await collectFsEntries(fs, { excludes: ["node_modules"] });
    expect(entries.map((e) => e.path).sort()).toEqual(["index.js", "src/", "src/util.js"]);
  });
  it("includes packages when nothing is excluded", async () => {
    const entries = await collectFsEntries(fs);
    expect(entries.map((e) => e.path)).toContain("node_modules/pkg/index.js");
  });
  it("reports progress for every file read", async () => {
    const seen: number[] = [];
    await collectFsEntries(fs, { onProgress: (n) => seen.push(n) });
    expect(seen.at(-1)).toBe(3);
  });
  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collectFsEntries(fs, { signal: controller.signal })).rejects.toBeDefined();
  });
});

describe("mergeEntries", () => {
  it("lets the overlay win for the same path", () => {
    const merged = mergeEntries(
      [{ path: "a.txt", data: text("old") }, { path: "b.txt", data: text("keep") }],
      [{ path: "a.txt", data: text("new") }],
    );
    const byPath = Object.fromEntries(merged.map((e) => [e.path, decode(e.data)]));
    expect(byPath).toEqual({ "a.txt": "new", "b.txt": "keep" });
  });
});

describe("createZip", () => {
  it("puts everything in one root folder and round-trips content", async () => {
    const entries = [
      { path: "index.js", data: text("console.log(1)") },
      { path: "src/", data: new Uint8Array(0) },
      { path: "src/a.py", data: text("print('hi')") },
    ];
    const bytes = await createZip(entries, "My Project");
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(["My Project/index.js", "My Project/src/a.py", "My Project/src/"].sort());
    expect(decode(files["My Project/index.js"])).toBe("console.log(1)");
    expect(decode(files["My Project/src/a.py"])).toBe("print('hi')");
  });
  it("drops an entry that would escape the root", async () => {
    const bytes = await createZip([{ path: "../evil.txt", data: text("x") }, { path: "ok.txt", data: text("y") }], "p");
    expect(Object.keys(unzipSync(bytes))).toEqual(["p/ok.txt"]);
  });
});

describe("helpers", () => {
  it("counts files only", () => {
    expect(countFiles([{ path: "a/", data: new Uint8Array(0) }, { path: "a/b", data: text("x") }])).toBe(1);
  });
  it("makes a safe file name", () => {
    expect(exportFileName("My Project!", new Date(2026, 9, 29, 14, 5))).toBe("veda-my-project-20261029-1405.zip");
    expect(exportFileName("***", new Date(2026, 0, 2, 3, 4))).toBe("veda-project-20260102-0304.zip");
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("createZip file validity", () => {
  it("starts with the ZIP signature and keeps Indic names, empty folders and a project name with spaces", async () => {
    const enc = new TextEncoder();
    const bytes = await createZip(
      [
        { path: "src/", data: new Uint8Array(0) },
        { path: "empty/", data: new Uint8Array(0) },
        { path: "src/नमस्ते.py", data: enc.encode("print('hi')") },
        { path: "README.md", data: enc.encode("# Hello") },
      ],
      "My Project"
    );
    // "PK" 0x03 0x04: the first local file header of every ZIP file.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      ["My Project/README.md", "My Project/empty/", "My Project/src/", "My Project/src/नमस्ते.py"].sort()
    );
    expect(new TextDecoder().decode(files["My Project/src/नमस्ते.py"])).toBe("print('hi')");
  });
});
