import type { FileNode } from "@/lib/persistence/indexeddb";

export const MAX_NAME_LENGTH = 255;

export type NameResult = { ok: true; value: string } | { ok: false; reason: string };

const BAD_CHARS = /[\\/\u0000-\u001f]/;

/** Check one file or folder name. `siblings` are the other names in the same folder. */
export function validateName(name: string, siblings: readonly string[] = []): NameResult {
  if (name.trim() === "") return { ok: false, reason: "Type a name, or press Esc to cancel." };
  if (name === "." || name === "..") return { ok: false, reason: `"${name}" is not a valid name.` };
  if (BAD_CHARS.test(name)) return { ok: false, reason: "A name cannot contain / or \\ or control characters." };
  if (name !== name.trim()) return { ok: false, reason: "A name cannot start or end with a space." };
  if (name.endsWith(".")) return { ok: false, reason: "A name cannot end with a dot." };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: `A name can have at most ${MAX_NAME_LENGTH} characters.` };
  const lower = name.toLowerCase();
  if (siblings.some((s) => s.toLowerCase() === lower)) return { ok: false, reason: `"${name}" already exists here.` };
  return { ok: true, value: name };
}

function childrenOf(files: FileNode[], dirPath: string): FileNode[] | null {
  if (!dirPath) return files;
  const walk = (nodes: FileNode[]): FileNode[] | null => {
    for (const n of nodes) {
      if (n.type !== "directory") continue;
      if (n.path === dirPath) return n.children ?? [];
      const f = n.children ? walk(n.children) : null;
      if (f) return f;
    }
    return null;
  };
  return walk(files);
}

/**
 * Check a name typed in "new file". `baseDir` is "" or ends with "/". A path such as "a/b.txt" is split
 * and each segment is checked. Existing folders are matched without regard to case.
 */
export function validateNewPath(files: FileNode[], baseDir: string, input: string): NameResult {
  const segments = input.split("/");
  if (segments.length === 1) {
    const sibs = (childrenOf(files, baseDir.replace(/\/$/, "")) ?? []).map((n) => n.name);
    const r = validateName(input, sibs);
    return r.ok ? { ok: true, value: baseDir + r.value } : r;
  }
  let dir = baseDir.replace(/\/$/, "");
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const siblings = childrenOf(files, dir) ?? [];
    const last = i === segments.length - 1;
    if (seg === "") return { ok: false, reason: "A path cannot have an empty part." };
    if (last) {
      const r = validateName(seg, siblings.map((n) => n.name));
      if (!r.ok) return r;
      return { ok: true, value: (dir ? dir + "/" : "") + r.value };
    }
    const existing = siblings.find((n) => n.name.toLowerCase() === seg.toLowerCase());
    if (existing) {
      if (existing.type !== "directory") return { ok: false, reason: `"${existing.name}" is a file, not a folder.` };
      dir = existing.path;
      continue;
    }
    const r = validateName(seg, []);
    if (!r.ok) return r;
    dir = (dir ? dir + "/" : "") + r.value;
  }
  return { ok: false, reason: "Invalid path." };
}

function fixName(raw: unknown): string {
    let n = (typeof raw === "string" ? raw : "").replace(/[\\/\u0000-\u001f]/g, "_").trim();
  n = n.replace(/[. ]+$/, "");
  if (n.length > MAX_NAME_LENGTH) n = n.slice(0, MAX_NAME_LENGTH);
  return n === "" ? "untitled" : n;
}

/**
 * Repair a saved tree. Nodes with a bad name ("..", "", slashes) are renamed, not dropped, so no content is lost.
 * Paths are rebuilt from the names. Malformed nodes are removed. Safe on any input.
 */
export function sanitizeTree(nodes: unknown, parentPath = ""): FileNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: FileNode[] = [];
  const used = new Set<string>();
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Partial<FileNode>;
    if (n.type !== "file" && n.type !== "directory") continue;
    let name = fixName(n.name);
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let i = 2;
      while (used.has(`${stem} (${i})${ext}`.toLowerCase())) i++;
      name = `${stem} (${i})${ext}`;
    }
    used.add(name.toLowerCase());
    const path = parentPath ? `${parentPath}/${name}` : name;
    if (n.type === "file") out.push({ name, path, type: "file", content: typeof n.content === "string" ? n.content : "" });
    else out.push({ name, path, type: "directory", children: sanitizeTree(n.children, path) });
  }
  return out;
}
