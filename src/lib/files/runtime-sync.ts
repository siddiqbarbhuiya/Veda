import type { FileNode } from "@/lib/persistence/indexeddb";

/**
 * Two-way sync between the editor tree and a runtime file system (WebContainer, Pyodide).
 * All maps use the key rules of `flattenTree`: no leading slash, and a folder key ends with "/".
 */

export type Incoming = { upsert: Array<[string, string]>; remove: string[] };

/** Largest text file that is copied from a runtime into the editor. */
export const MAX_FILE_BYTES = 512 * 1024;
/** Most bytes that one scan of a runtime may copy. The cloud copy of a project is limited to 5 MB. */
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;
/** Most entries (files and folders) that one scan may copy. */
export const MAX_SCAN_ENTRIES = 2000;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".npm",
  ".cache",
  ".next",
  ".turbo",
  ".parcel-cache",
  "dist",
  "build",
  "__pycache__",
]);

/** True for generated or tool paths that must never move between a runtime and the editor. */
export function shouldIgnore(key: string): boolean {
  return key.split("/").some((segment) => IGNORED_DIRS.has(segment));
}

/** True for text that is small enough to keep in the editor. A binary file has a NUL character. */
export function acceptRuntimeFile(content: string): boolean {
  if (content.includes("\u0000")) return false;
  return new TextEncoder().encode(content).length <= MAX_FILE_BYTES;
}

/**
 * What the runtime changed since the last sync (`synced`), minus the parts that the user
 * also changed in the editor. The editor wins a clash: its text is written back to the runtime.
 */
export function computeIncoming(
  synced: Map<string, string>,
  runtime: Map<string, string>,
  editor: Map<string, string>
): Incoming {
  const upsert: Array<[string, string]> = [];
  for (const [key, value] of runtime) {
    if (shouldIgnore(key)) continue;
    if (synced.has(key) && synced.get(key) === value) continue;
    const editorChanged = editor.has(key) && editor.get(key) !== (synced.get(key) ?? editor.get(key));
    if (editorChanged) continue;
    if (editor.has(key) && editor.get(key) === value) continue;
    upsert.push([key, value]);
  }
  upsert.sort((a, b) => a[0].split("/").length - b[0].split("/").length);

  const remove: string[] = [];
  for (const [key, value] of synced) {
    if (shouldIgnore(key) || runtime.has(key)) continue;
    if (!editor.has(key)) continue;
    if (editor.get(key) !== value) continue;
    remove.push(key);
  }
  remove.sort((a, b) => b.length - a.length);
  return { upsert, remove };
}

/** A runtime file system seen through relative keys (no leading slash). The root folder is "". */
export type FsAdapter = {
  list(dir: string): Promise<Array<{ name: string; isDir: boolean }>> | Array<{ name: string; isDir: boolean }>;
  read(path: string): Promise<string> | string;
};

export type ScanResult = {
  entries: Map<string, string>;
  /** Files that exist but were not copied (binary or too big). They are not deleted when they are missing from `entries`. */
  skipped: Set<string>;
  /** False when a limit stopped the scan. Then no file may be treated as deleted. */
  complete: boolean;
};

/** Read a runtime file system into the key format of `flattenTree`. Ignored paths and the limits are applied here. */
export async function scanFs(fs: FsAdapter): Promise<ScanResult> {
  const entries = new Map<string, string>();
  const skipped = new Set<string>();
  let complete = true;
  let bytes = 0;
  const walk = async (dir: string): Promise<void> => {
    const prefix = dir ? `${dir}/` : "";
    for (const ent of await fs.list(dir)) {
      if (!complete) return;
      const key = prefix + ent.name;
      if (shouldIgnore(ent.isDir ? `${key}/` : key)) continue;
      if (entries.size >= MAX_SCAN_ENTRIES) {
        complete = false;
        return;
      }
      if (ent.isDir) {
        entries.set(`${key}/`, "");
        await walk(key);
        continue;
      }
      let text: string;
      try {
        text = await fs.read(key);
      } catch {
        skipped.add(key);
        continue;
      }
      if (!acceptRuntimeFile(text)) {
        skipped.add(key);
        continue;
      }
      bytes += text.length;
      if (bytes > MAX_SCAN_BYTES) {
        complete = false;
        return;
      }
      entries.set(key, text);
    }
  };
  await walk("");
  return { entries, skipped, complete };
}

/** The changes to bring into the editor after a scan. A skipped file counts as unchanged. An incomplete scan deletes nothing. */
export function incomingFromScan(synced: Map<string, string>, scan: ScanResult, editor: Map<string, string>): Incoming {
  const runtime = new Map(scan.entries);
  for (const key of scan.skipped) {
    if (synced.has(key)) runtime.set(key, synced.get(key)!);
  }
  const ops = computeIncoming(synced, runtime, editor);
  if (!scan.complete) ops.remove = [];
  return ops;
}

/** The new `synced` map after the incoming changes are applied to the editor. */
export function applyIncomingToMap(synced: Map<string, string>, ops: Incoming): Map<string, string> {
  const next = new Map(synced);
  for (const key of ops.remove) next.delete(key);
  for (const [key, value] of ops.upsert) next.set(key, value);
  return next;
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function ensureDir(list: FileNode[], path: string): FileNode {
  const existing = list.find((n) => n.path === path && n.type === "directory");
  if (existing) return existing;
  const node: FileNode = { name: nameOf(path), path, type: "directory", children: [] };
  list.push(node);
  return node;
}

/** The parent folder list for a key, created when it is missing. */
function childrenOf(root: FileNode[], path: string): FileNode[] {
  const parts = path.split("/").slice(0, -1);
  let list = root;
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const dir = ensureDir(list, acc);
    dir.children ??= [];
    list = dir.children;
  }
  return list;
}

function cloneTree(nodes: FileNode[]): FileNode[] {
  return nodes.map((n) => (n.children ? { ...n, children: cloneTree(n.children) } : n));
}

function removePath(list: FileNode[], path: string): FileNode[] {
  return list
    .filter((n) => n.path !== path)
    .map((n) => (n.children ? { ...n, children: removePath(n.children, path) } : n));
}

/** Apply the incoming changes to the editor tree. Untouched nodes keep their identity. */
export function applyIncomingToTree(tree: FileNode[], ops: Incoming): FileNode[] {
  if (ops.upsert.length === 0 && ops.remove.length === 0) return tree;
  let next = tree;
  for (const key of ops.remove) {
    next = removePath(next, key.replace(/\/$/, ""));
  }
  next = cloneTree(next);
  for (const [key, value] of ops.upsert) {
    const isDir = key.endsWith("/");
    const path = isDir ? key.slice(0, -1) : key;
    const list = childrenOf(next, path);
    if (isDir) {
      ensureDir(list, path);
      continue;
    }
    const at = list.findIndex((n) => n.path === path && n.type === "file");
    if (at >= 0) list[at] = { ...list[at], content: value };
    else list.push({ name: nameOf(path), path, type: "file", content: value });
  }
  return next;
}
