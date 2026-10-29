import type { FileNode } from "@/lib/persistence/indexeddb";

export type RunKind = "node" | "python";

/** Which runtime can run a file. Returns null when the file type cannot be run. */
export function runtimeForFile(name: string): RunKind | null {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "node";
  if (ext === "py") return "python";
  return null;
}

/** A path that node reads as a file, not as an option (for example "-p.js"). */
export function nodePath(path: string): string {
  return `./${path.replace(/^\/+/, "")}`;
}

/** Flatten a tree. Directory keys end with "/" and have an empty value. */
export function flattenTree(nodes: FileNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: FileNode[]) => {
    for (const n of list) {
      const p = n.path.replace(/^\/+/, "");
      if (n.type === "directory") {
        out.set(`${p}/`, "");
        walk(n.children ?? []);
      } else {
        out.set(p, n.content ?? "");
      }
    }
  };
  walk(nodes);
  return out;
}

export type SyncDiff = { write: Array<[string, string]>; remove: string[] };

/** Entries that changed or are new (`write`) and entries that are gone (`remove`, deepest first). */
export function diffSync(prev: Map<string, string>, next: Map<string, string>): SyncDiff {
  const write: Array<[string, string]> = [];
  for (const [k, v] of next) {
    if (prev.get(k) !== v) write.push([k, v]);
  }
  // Directories first, shorter paths first, so parents exist before children.
  write.sort((a, b) => a[0].split("/").length - b[0].split("/").length);
  const remove: string[] = [];
  for (const k of prev.keys()) {
    if (!next.has(k)) remove.push(k);
  }
  remove.sort((a, b) => b.length - a.length);
  return { write, remove };
}

/** Remove Pyodide-internal frames from a Python traceback. */
export function trimPyTraceback(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^\s+File "/.test(line)) {
      skipping = /\/pyodide\/|_pyodide|\/lib\/python[\d.]*\/(?:site-packages\/)?pyodide|\/_pyodide\//.test(line);
      if (!skipping) out.push(line);
    } else if (/^\s{4,}/.test(line) && skipping) {
      // Source line of a skipped frame.
    } else {
      skipping = false;
      out.push(line);
    }
  }
  return out.join("\n").trimEnd();
}
