import type { FileNode } from "@/lib/persistence/indexeddb";

export type PackageCheck = { ok: true; value: string } | { ok: false; reason: string };

const NAME = "(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*";
const VERSION = "[A-Za-z0-9^~<>=*][A-Za-z0-9._^~<>=*|-]*";
const SPEC = new RegExp(`^${NAME}(?:@${VERSION})?$`);

/** Check an npm package name, with an optional version or tag (for example `lodash@4`). URLs, paths and options are refused. */
export function validatePackageSpec(input: string): PackageCheck {
  const value = input.trim();
  if (!value) return { ok: false, reason: "Enter a package name." };
  if (value.length > 214) return { ok: false, reason: "The package name is too long." };
  if (/\s/.test(value)) return { ok: false, reason: "Enter one package at a time, without spaces." };
  if (value.startsWith("-")) return { ok: false, reason: "A package name cannot start with a dash." };
  if (/[:/\\]/.test(value.replace(/^@[^/]+\//, ""))) return { ok: false, reason: "Use a package name from the npm registry, not a path or a URL." };
  if (!SPEC.test(value)) return { ok: false, reason: "This is not a valid npm package name. Use lowercase letters, digits, dots, dashes and underscores." };
  return { ok: true, value };
}

/** Folders that hold a `package.json`: "" for the project root, then top-level folders. */
export function packageFolders(files: FileNode[]): string[] {
  const out: string[] = [];
  if (files.some((n) => n.type === "file" && n.path === "package.json")) out.push("");
  for (const n of files) {
    if (n.type === "directory" && (n.children ?? []).some((c) => c.type === "file" && c.name === "package.json")) {
      out.push(n.path);
    }
  }
  return out;
}

export type Command = { cmd: string; args: string[] };

/** The commands that add a package. A folder with no `package.json` gets `npm init -y` first. */
export function installCommands(spec: string, opts: { dev: boolean; hasPackageJson: boolean }): Command[] {
  const list: Command[] = [];
  if (!opts.hasPackageJson) list.push({ cmd: "npm", args: ["init", "-y"] });
  list.push({ cmd: "npm", args: ["install", ...(opts.dev ? ["--save-dev"] : []), spec] });
  return list;
}
