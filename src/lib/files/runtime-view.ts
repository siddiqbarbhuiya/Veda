import type { FileNode } from "@/lib/persistence/indexeddb";

/**
 * A read-only view of runtime folders that are not part of the project (for now: node_modules).
 * These nodes are never saved to IndexedDB or the cloud.
 */

export const RUNTIME_ROOT = "node_modules";

/** Largest file that the read-only view shows. */
export const MAX_VIEW_BYTES = 1024 * 1024;

export type RuntimeEntry = { name: string; isDir: boolean };

export function isRuntimePath(path: string): boolean {
  return path === RUNTIME_ROOT || path.startsWith(`${RUNTIME_ROOT}/`);
}

/**
 * Build the read-only tree. `dirs` maps a folder path to its listed entries.
 * The tree has a root node only when `dirs` has the key `node_modules`.
 * A folder that is not listed yet has no children.
 */
export function buildRuntimeTree(dirs: Record<string, RuntimeEntry[]>, text: Record<string, string>): FileNode[] {
  if (!(RUNTIME_ROOT in dirs)) return [];
  const dirNode = (path: string): FileNode => ({
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    type: "directory",
    readOnly: true,
    children: (dirs[path] ?? []).map((e) => {
      const child = `${path}/${e.name}`;
      return e.isDir
        ? dirNode(child)
        : ({ name: e.name, path: child, type: "file", readOnly: true, content: text[child] ?? "" } as FileNode);
    }),
  });
  return [dirNode(RUNTIME_ROOT)];
}

/** The text to show for a runtime file. `null` means the file could not be read. */
export function viewText(content: string | null): string {
  if (content === null) return "// This file could not be read.\n";
  if (content.includes("\u0000")) return "// Binary file. It is not shown.\n";
  if (new TextEncoder().encode(content).length > MAX_VIEW_BYTES) return "// This file is larger than 1 MB. It is not shown.\n";
  return content;
}

/** True when a `package.json` text lists at least one dependency. Bad JSON gives false. */
export function packageJsonHasDeps(text: string | undefined): boolean {
  if (!text) return false;
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>;
    return ["dependencies", "devDependencies", "optionalDependencies"].some((k) => {
      const v = pkg[k];
      return !!v && typeof v === "object" && Object.keys(v as object).length > 0;
    });
  } catch {
    return false;
  }
}
