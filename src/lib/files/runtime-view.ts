import type { FileNode } from "@/lib/persistence/indexeddb";

/**
 * A read-only view of runtime folders that are not part of the project (node_modules, in the project root
 * or in a project folder such as `vite-react/node_modules`). These nodes are never saved to IndexedDB or the cloud.
 */

export const RUNTIME_DIR = "node_modules";

/** Largest file that the read-only view shows. */
export const MAX_VIEW_BYTES = 1024 * 1024;

export type RuntimeEntry = { name: string; isDir: boolean };

/** True for `node_modules` and everything inside a `node_modules` folder, at any depth. */
export function isRuntimePath(path: string): boolean {
  return path.split("/").includes(RUNTIME_DIR);
}

/** The path of the node_modules folder in `folder` ("" is the project root). */
export function runtimeRootOf(folder: string): string {
  return folder ? `${folder}/${RUNTIME_DIR}` : RUNTIME_DIR;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/**
 * Build the read-only nodes. `dirs` maps a folder path to its listed entries.
 * There is one node for every key that ends in `node_modules` and is not inside another node_modules.
 * A folder that is not listed yet has no children.
 */
export function buildRuntimeTree(dirs: Record<string, RuntimeEntry[]>, text: Record<string, string>): FileNode[] {
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
  return Object.keys(dirs)
    .filter((k) => k.split("/").pop() === RUNTIME_DIR && !isRuntimePath(parentOf(k)))
    .sort()
    .map(dirNode);
}

/**
 * Put each read-only node into the project tree, inside its parent folder.
 * A node_modules folder that the user made in the project hides the read-only one.
 */
export function attachRuntime(files: FileNode[], roots: FileNode[]): FileNode[] {
  if (roots.length === 0) return files;
  const byParent = new Map<string, FileNode[]>();
  for (const r of roots) {
    const parent = parentOf(r.path);
    byParent.set(parent, [...(byParent.get(parent) ?? []), r]);
  }
  const visit = (nodes: FileNode[], folder: string): FileNode[] => {
    const own = nodes.some((n) => n.name === RUNTIME_DIR) ? [] : (byParent.get(folder) ?? []);
    const mapped = nodes.map((n) =>
      n.type === "directory" && byParent.size > 0 ? { ...n, children: visit(n.children ?? [], n.path) } : n
    );
    return [...mapped, ...own];
  };
  return visit(files, "");
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
