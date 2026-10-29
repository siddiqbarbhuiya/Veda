import type { FileNode } from "@/lib/persistence/indexeddb";
import type { FileChange } from "./events";
import { isSafeRelPath } from "./snapshot";

/** The parts of the file store that applying a change needs. */
export type FileStoreActions = {
  createFile: (path: string, type?: "file" | "directory", content?: string) => void;
  updateFileContent: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
};

export type ApplyResult = {
  /** Paths that were written or deleted. */
  applied: string[];
  /** Paths that were not accepted, were unsafe, or had no content. */
  skipped: string[];
  /** Paths that the student changed after the run started. They need an explicit overwrite. */
  conflicts: string[];
};

/** Flatten a file tree to `{ path: content }`. Folders are left out. */
export function flattenFiles(tree: FileNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === "directory") walk(n.children ?? []);
      else out[n.path] = n.content ?? "";
    }
  };
  walk(tree);
  return out;
}

/**
 * Apply the accepted changes to the file store.
 *
 * - `base` is the project as it was when the run started. `current` is the project now.
 * - A path that the student edited since the run started is a conflict and is not written,
 *   unless it is in `overwrite`.
 * - A path with `..`, an absolute path or a drive letter is never written.
 */
export function applyChanges(
  changes: FileChange[],
  accepted: ReadonlySet<string>,
  store: FileStoreActions,
  ctx: { base: Record<string, string>; current: Record<string, string>; overwrite?: ReadonlySet<string> }
): ApplyResult {
  const result: ApplyResult = { applied: [], skipped: [], conflicts: [] };
  for (const change of changes) {
    if (!accepted.has(change.path) || !isSafeRelPath(change.path)) {
      result.skipped.push(change.path);
      continue;
    }
    const now = ctx.current[change.path];
    const before = ctx.base[change.path];
    if (now !== before && !ctx.overwrite?.has(change.path)) {
      result.conflicts.push(change.path);
      continue;
    }
    if (change.op === "delete") {
      if (now !== undefined) store.deleteFile(change.path);
      result.applied.push(change.path);
      continue;
    }
    if (typeof change.content !== "string") {
      result.skipped.push(change.path);
      continue;
    }
    // createFile does nothing when the path exists, so an existing file is updated instead.
    if (now !== undefined) store.updateFileContent(change.path, change.content);
    else store.createFile(change.path, "file", change.content);
    result.applied.push(change.path);
  }
  return result;
}
