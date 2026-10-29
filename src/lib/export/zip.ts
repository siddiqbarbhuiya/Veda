import { zip as zipAsync, zipSync, type Zippable } from "fflate";
import type { FileNode } from "@/lib/persistence/indexeddb";

/** One archive entry. `path` uses "/" and has no leading slash. A path that ends with "/" is a folder. */
export type ZipEntry = { path: string; data: Uint8Array };

export type FsDirent = { name: string; isDirectory(): boolean; isFile(): boolean };

/** The part of the WebContainer file system API that the export needs. */
export type FsLike = {
  readdir(path: string, options: { withFileTypes: true }): Promise<FsDirent[]>;
  readFile(path: string): Promise<Uint8Array>;
};

const EMPTY = new Uint8Array(0);
const encoder = new TextEncoder();

/** Normalise an archive path. Returns null for a path that would escape the archive root. */
export function safePath(path: string): string | null {
  const isDir = path.endsWith("/");
  const parts = path.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.includes("..")) return null;
  return parts.join("/") + (isDir ? "/" : "");
}

/** Convert the editor file tree (text files only) to archive entries. */
export function flattenFileNodes(nodes: FileNode[]): ZipEntry[] {
  const out: ZipEntry[] = [];
  const walk = (list: FileNode[], prefix: string) => {
    for (const node of list) {
      const path = safePath(prefix + node.name);
      if (!path) continue;
      if (node.type === "directory") {
        out.push({ path: path + "/", data: EMPTY });
        walk(node.children ?? [], path + "/");
      } else {
        out.push({ path, data: encoder.encode(node.content ?? "") });
      }
    }
  };
  walk(nodes, "");
  return out;
}

/** Read every file below `root`. A folder whose name is in `excludes` is skipped at any depth. */
export async function collectFsEntries(
  fs: FsLike,
  options: {
    root?: string;
    excludes?: string[];
    onProgress?: (filesRead: number) => void;
    signal?: AbortSignal;
    concurrency?: number;
  } = {},
): Promise<ZipEntry[]> {
  const { root = ".", excludes = [], onProgress, signal, concurrency = 32 } = options;
  const skip = new Set(excludes);
  const entries: ZipEntry[] = [];
  const toRead: { fsPath: string; path: string }[] = [];

  const walk = async (dir: string, prefix: string) => {
    signal?.throwIfAborted();
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const item of list) {
      if (skip.has(item.name)) continue;
      const fsPath = dir === "." ? item.name : `${dir}/${item.name}`;
      const path = safePath(prefix + item.name);
      if (!path) continue;
      if (item.isDirectory()) {
        entries.push({ path: path + "/", data: EMPTY });
        await walk(fsPath, path + "/");
      } else if (item.isFile()) {
        toRead.push({ fsPath, path });
      }
    }
  };
  await walk(root, "");

  let done = 0;
  for (let i = 0; i < toRead.length; i += concurrency) {
    signal?.throwIfAborted();
    await Promise.all(
      toRead.slice(i, i + concurrency).map(async ({ fsPath, path }) => {
        entries.push({ path, data: await fs.readFile(fsPath) });
        onProgress?.(++done);
      }),
    );
  }
  return entries;
}

/** Combine two entry lists. When both have a path, the overlay entry wins. */
export function mergeEntries(base: ZipEntry[], overlay: ZipEntry[]): ZipEntry[] {
  const map = new Map<string, ZipEntry>();
  for (const e of base) map.set(e.path, e);
  for (const e of overlay) map.set(e.path, e);
  return [...map.values()];
}

export function totalBytes(entries: ZipEntry[]): number {
  return entries.reduce((sum, e) => sum + e.data.byteLength, 0);
}

export function countFiles(entries: ZipEntry[]): number {
  return entries.filter((e) => !e.path.endsWith("/")).length;
}

function toZippable(entries: ZipEntry[], rootName: string): Zippable {
  const root = safePath(rootName) ?? "project";
  const files: Zippable = {};
  for (const e of entries) {
    const path = safePath(e.path);
    if (!path) continue;
    files[`${root}/${path}`] = e.data;
  }
  return files;
}

/** Build a zip with all entries inside one top-level folder. Uses a worker when it can, else the main thread. */
export function createZip(entries: ZipEntry[], rootName: string): Promise<Uint8Array> {
  const files = toZippable(entries, rootName);
  return new Promise((resolve, reject) => {
    try {
      zipAsync(files, { level: 6 }, (err, data) => {
        if (!err) return resolve(data);
        try {
          resolve(zipSync(files, { level: 6 }));
        } catch (syncErr) {
          reject(syncErr);
        }
      });
    } catch {
      try {
        resolve(zipSync(files, { level: 6 }));
      } catch (syncErr) {
        reject(syncErr);
      }
    }
  });
}

export function exportFileName(projectName: string, now: Date = new Date()): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `veda-${slug}-${stamp}.zip`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
