import { describe, expect, it } from "vitest";
import type { FileNode } from "@/lib/persistence/indexeddb";
import { installCommands, packageFolders, validatePackageSpec } from "../packages";

describe("validatePackageSpec", () => {
  it("accepts plain, scoped and versioned names", () => {
    for (const ok of ["lodash", "is-odd", "@types/node", "react-dom@18", "lodash@4.17.21", "left-pad@^1.3.0", "pkg@latest", "a.b_c"]) {
      expect(validatePackageSpec(ok), ok).toEqual({ ok: true, value: ok });
    }
  });
  it("trims the input", () => {
    expect(validatePackageSpec("  lodash ")).toEqual({ ok: true, value: "lodash" });
  });
  it("refuses empty input", () => {
    expect(validatePackageSpec("   ").ok).toBe(false);
  });
  it("refuses options, urls, paths, git specs and several packages", () => {
    for (const bad of [
      "--global",
      "-g",
      "https://evil.example/x.tgz",
      "git+https://github.com/a/b.git",
      "github:user/repo",
      "../local",
      "./local",
      "/abs/path",
      "a b",
      "lodash; rm -rf /",
      "Upper",
      "@scope",
      "name@",
    ]) {
      expect(validatePackageSpec(bad).ok, bad).toBe(false);
    }
  });
  it("refuses a name over 214 characters", () => {
    expect(validatePackageSpec("a".repeat(215)).ok).toBe(false);
  });
});

const file = (path: string): FileNode => ({ name: path.split("/").pop()!, path, type: "file", content: "" });
const dir = (path: string, children: FileNode[]): FileNode => ({ name: path, path, type: "directory", children });

describe("packageFolders", () => {
  it("lists the root and top-level folders that hold a package.json", () => {
    const tree = [file("package.json"), dir("app", [file("app/package.json")]), dir("docs", [file("docs/a.md")])];
    expect(packageFolders(tree)).toEqual(["", "app"]);
  });
  it("is empty when no package.json exists", () => {
    expect(packageFolders([file("index.js")])).toEqual([]);
  });
});

describe("installCommands", () => {
  it("installs a package when package.json exists", () => {
    expect(installCommands("lodash", { dev: false, hasPackageJson: true })).toEqual([{ cmd: "npm", args: ["install", "lodash"] }]);
  });
  it("adds --save-dev for a dev package", () => {
    expect(installCommands("vitest", { dev: true, hasPackageJson: true })[0].args).toEqual(["install", "--save-dev", "vitest"]);
  });
  it("runs npm init first when package.json is missing", () => {
    const list = installCommands("lodash", { dev: false, hasPackageJson: false });
    expect(list.map((c) => c.args[0])).toEqual(["init", "install"]);
  });
});
