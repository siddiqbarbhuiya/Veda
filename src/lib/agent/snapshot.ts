import type { FileNode } from "@/lib/persistence/indexeddb";
import type { FileChange } from "./events";

/** Same cap as the cloud copy of a project. */
export const MAX_SNAPSHOT_BYTES = 5_000_000;
const MAX_PATH_CHARS = 300;

export class SnapshotTooLargeError extends Error {
  constructor(public bytes: number) {
    super(`The project is ${(bytes / 1_000_000).toFixed(1)} MB. Claude Code can use up to 5 MB.`);
    this.name = "SnapshotTooLargeError";
  }
}

/**
 * True for a relative path that stays inside the project.
 * Rejects empty paths, absolute paths, drive letters, backslashes, NUL, and any "." or ".." segment.
 */
export function isSafeRelPath(p: string): boolean {
  if (typeof p !== "string" || p.length === 0 || p.length > MAX_PATH_CHARS) return false;
  if (p.includes("\0") || p.includes("\\") || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

const SKIPPED_DIRS = new Set(["node_modules", ".git"]);

const skipped = (path: string) => path.split("/").some((seg) => SKIPPED_DIRS.has(seg));

/** Flatten the file tree to `{ path: content }`. `node_modules` and `.git` are left out. Throws over 5 MB. */
export function snapshotFiles(tree: FileNode[]): { files: Record<string, string>; bytes: number } {
  const files: Record<string, string> = {};
  let bytes = 0;
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (skipped(n.path)) continue;
      if (n.type === "directory") {
        if (n.children) walk(n.children);
        continue;
      }
      if (!isSafeRelPath(n.path)) continue;
      const content = n.content ?? "";
      bytes += Buffer.byteLength(content, "utf8") + n.path.length;
      if (bytes > MAX_SNAPSHOT_BYTES) throw new SnapshotTooLargeError(bytes);
      files[n.path] = content;
    }
  };
  walk(tree);
  return { files, bytes };
}

/** Changes that turn `before` into `after`, sorted by path. */
export function diffSnapshot(before: Record<string, string>, after: Record<string, string>): FileChange[] {
  const out: FileChange[] = [];
  for (const [path, content] of Object.entries(after)) {
    if (!(path in before)) out.push({ path, op: "create", content });
    else if (before[path] !== content) out.push({ path, op: "update", content });
  }
  for (const path of Object.keys(before)) {
    if (!(path in after)) out.push({ path, op: "delete" });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
