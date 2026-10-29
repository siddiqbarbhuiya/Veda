"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IndexedDBStore, type FileNode } from "@/lib/persistence/indexeddb";
import { CloudStore } from "@/lib/persistence/cloud-store";
import { clearBackup, newestSnapshot, readBackup, writeBackup } from "@/lib/persistence/backup";
import { chooseSource, describeSync, type Snapshot } from "@/lib/persistence/sync";
import { sanitizeTree, validateName } from "@/lib/files/validate-name";
import { applyIncomingToTree, type Incoming } from "@/lib/files/runtime-sync";
import {
  RUNTIME_DIR,
  attachRuntime,
  buildRuntimeTree,
  isRuntimePath,
  projectDirs,
  runtimeRootOf,
  viewText,
  type RuntimeEntry,
} from "@/lib/files/runtime-view";
import { peekWebContainer } from "@/hooks/use-webcontainer";
import { createBrowserClient } from "@/lib/supabase/client";

export type { FileNode };

export const DEFAULT_PROJECT_NAME = "default";
const AUTOSAVE_MS = 5000;
const CLOUD_SAVE_MS = 15000;
const CLOUD_RETRY_MS = 60000;

export type SyncState = {
  /** "off" = the cloud copy could not be read, so nothing is uploaded until a later read works. */
  status: "idle" | "syncing" | "synced" | "error" | "off";
  lastSyncedAt: number | null;
  /** Raw error text. Show `message` to the user. */
  error: string | null;
  /** Plain words for the status, for example "Offline". */
  message: string;
  /** True when another tab saved a newer copy. Autosave is stopped until the page is reloaded. */
  conflict: boolean;
};

export function defaultFiles(): FileNode[] {
  return [
    { name: "index.js", path: "index.js", type: "file", content: "console.log('Hello, Veda!');\n" },
    {
      name: "README.md",
      path: "README.md",
      type: "file",
      content: "# Welcome to Veda\n\nEdit index.js and start building.\n",
    },
  ];
}

function mapTree(nodes: FileNode[], fn: (n: FileNode) => FileNode | null): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    const r = fn(n);
    if (!r) continue;
    out.push(r.children ? { ...r, children: mapTree(r.children, fn) } : r);
  }
  return out;
}

export function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const f = findNode(n.children, path);
      if (f) return f;
    }
  }
  return null;
}

function firstFile(nodes: FileNode[]): FileNode | null {
  for (const n of nodes) {
    if (n.type === "file") return n;
    const f = n.children ? firstFile(n.children) : null;
    if (f) return f;
  }
  return null;
}

function insertNode(nodes: FileNode[], node: FileNode): FileNode[] {
  const idx = node.path.lastIndexOf("/");
  if (idx === -1) return [...nodes, node];
  const parentPath = node.path.slice(0, idx);
  // Create any missing parent directories automatically.
  if (!findNode(nodes, parentPath)) {
    const pIdx = parentPath.lastIndexOf("/");
    const dir: FileNode = {
      name: parentPath.slice(pIdx + 1),
      path: parentPath,
      type: "directory",
      children: [],
    };
    return insertNode(insertNode(nodes, dir), node);
  }
  const add = (list: FileNode[]): FileNode[] =>
    list.map((n) =>
      n.path === parentPath && n.type === "directory"
        ? { ...n, children: [...(n.children ?? []), node] }
        : n.children
          ? { ...n, children: add(n.children) }
          : n
    );
  return add(nodes);
}

/** Change the content of one file. Only the nodes on the way to it are copied. */
function setContentAt(nodes: FileNode[], path: string, content: string): FileNode[] {
  let changed = false;
  const next = nodes.map((n) => {
    if (n.path === path && n.type === "file") {
      if (n.content === content) return n;
      changed = true;
      return { ...n, content };
    }
    if (n.children && path.startsWith(n.path + "/")) {
      const kids = setContentAt(n.children, path, content);
      if (kids !== n.children) {
        changed = true;
        return { ...n, children: kids };
      }
    }
    return n;
  });
  return changed ? next : nodes;
}

/** Move `p` from under `oldPath` to under `newPath`. A path outside `oldPath` is returned unchanged. */
export function remapPath(p: string, oldPath: string, newPath: string): string {
  if (p === oldPath) return newPath;
  if (p.startsWith(oldPath + "/")) return newPath + p.slice(oldPath.length);
  return p;
}

/** Rename a file or folder in place. The children of a folder get new paths. The order does not change. */
export function renameTree(nodes: FileNode[], oldPath: string, newPath: string): FileNode[] {
  return nodes.map((n) => {
    const hit = n.path === oldPath || n.path.startsWith(oldPath + "/");
    if (!hit) return n.children ? { ...n, children: renameTree(n.children, oldPath, newPath) } : n;
    const name = n.path === oldPath ? newPath.slice(newPath.lastIndexOf("/") + 1) : n.name;
    const base = { ...n, path: remapPath(n.path, oldPath, newPath), name };
    return n.children ? { ...base, children: renameTree(n.children, oldPath, newPath) } : base;
  });
}

type Nav = { tabs: string[]; active: string | null };

/** Remove the tabs that match `gone`. If the active tab goes, the next tab (or else the previous) becomes active. */
export function removeFromNav(nav: Nav, gone: (p: string) => boolean): Nav {
  const tabs = nav.tabs.filter((p) => !gone(p));
  if (nav.active === null || !gone(nav.active)) {
    return tabs.length === nav.tabs.length ? nav : { tabs, active: nav.active };
  }
  const at = nav.tabs.indexOf(nav.active);
  const keptBefore = nav.tabs.slice(0, Math.max(at, 0)).filter((p) => !gone(p)).length;
  return { tabs, active: tabs[Math.min(keptBefore, tabs.length - 1)] ?? null };
}

type CloudRead = { remote: Snapshot | null; error: string | null };

async function readCloud(ref: { current: CloudStore | null }, userId: string, project: string): Promise<CloudRead> {
  try {
    ref.current ??= new CloudStore(createBrowserClient() as unknown as ConstructorParameters<typeof CloudStore>[0]);
    const remote = await ref.current.load(userId, project);
    return { remote: remote ? { files: sanitizeTree(remote.files), updatedAt: remote.updatedAt } : null, error: null };
  } catch (err) {
    return { remote: null, error: err instanceof Error ? err.message : "Cloud sync is not available." };
  }
}

export function useFileSystemState(userId: string | null, projectName: string = DEFAULT_PROJECT_NAME) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [nav, setNav] = useState<Nav>({ tabs: [], active: null });
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: "idle", lastSyncedAt: null, error: null, message: "", conflict: false });
  const store = useMemo(() => new IndexedDBStore(), []);
  const cloudRef = useRef<CloudStore | null>(null);
  const cloudReady = useRef(false);
  const lastPushed = useRef("");
  const pushPromise = useRef<Promise<boolean> | null>(null);
  const retrying = useRef(false);
  const lastEditAt = useRef(0);
  const dirty = useRef(false);
  const loadedRef = useRef(false);
  const noSave = useRef(false);
  const conflictRef = useRef(false);
  const [tabIdValue] = useState(() => Math.random().toString(36).slice(2));
  const tabId = useRef(tabIdValue);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const filesRef = useRef<FileNode[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Read-only view of node_modules from the runtime. It is never saved.
  const [runtimeDirs, setRuntimeDirs] = useState<Record<string, RuntimeEntry[]>>({});
  const [runtimeText, setRuntimeText] = useState<Record<string, string>>({});
  const runtimeDirsRef = useRef(runtimeDirs);
  useEffect(() => {
    runtimeDirsRef.current = runtimeDirs;
  }, [runtimeDirs]);
  // The project tree with the read-only node_modules folders inside their parent folders.
  const treeFiles = useMemo(
    () => attachRuntime(files, buildRuntimeTree(runtimeDirs, runtimeText)),
    [files, runtimeDirs, runtimeText]
  );

  const setStatus = useCallback((status: SyncState["status"], error: string | null, syncedAt?: number | null) => {
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    setSync((s) => ({
      status,
      error,
      message: describeSync(status, error, online),
      lastSyncedAt: syncedAt === undefined ? s.lastSyncedAt : syncedAt,
      conflict: s.conflict,
    }));
  }, []);

  const edited = useCallback(() => {
    lastEditAt.current = Date.now();
    dirty.current = true;
  }, []);

  // Load: choose the newest copy. Nothing is uploaded when the cloud read failed.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    cloudReady.current = false;
    loadedRef.current = false;
    noSave.current = false;
    store.warm();
    (async () => {
      const { remote, error: remoteError } = await readCloud(cloudRef, userId, projectName);
      const fromDisk = await store.loadWithMeta(userId, projectName);
      if (cancelled) return;
      // A backup in localStorage is newer than IndexedDB when the page closed before IndexedDB finished writing.
      const backup = readBackup(userId, projectName);
      const saved = newestSnapshot(fromDisk, backup);
      const usedBackup = backup !== null && saved === backup;
      if (backup && !usedBackup) clearBackup(userId, projectName);

      const rawLocal = saved?.files ?? null;
      const cleanLocal = rawLocal ? sanitizeTree(rawLocal) : null;
      const local: Snapshot | null = cleanLocal && saved ? { files: cleanLocal, updatedAt: saved.updatedAt } : null;
      // A failed cloud read must never lead to an upload: the cloud copy could be newer.
      const choice = remoteError
        ? { source: local ? ("local" as const) : ("default" as const), push: false }
        : chooseSource(local, remote);
      const initial = choice.source === "cloud" ? remote!.files : choice.source === "local" ? local!.files : defaultFiles();
      const repaired =
        !remoteError && choice.source === "local" && rawLocal !== null && JSON.stringify(rawLocal) !== JSON.stringify(cleanLocal);
      lastEditAt.current =
        choice.source === "cloud"
          ? remote!.updatedAt
          : choice.source === "local"
            ? local!.updatedAt || (choice.push || repaired ? Date.now() : 0)
            : 0;
      if (repaired) lastEditAt.current = Date.now();
      dirty.current = repaired || usedBackup;
      lastPushed.current = choice.push || repaired ? "" : JSON.stringify(initial);
      cloudReady.current = remoteError === null;
      if (remoteError) setStatus("off", remoteError, null);
      else if (choice.push || repaired) setStatus("idle", null, null);
      else setStatus("synced", null, Date.now());

      setFiles(initial);
      filesRef.current = initial;
      const first = firstFile(initial);
      setNav({ tabs: first ? [first.path] : [], active: first ? first.path : null });
      loadedRef.current = true;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, projectName, store, setStatus]);

  const saveAll = useCallback(async () => {
    // Never write untouched default files, and never write after sign-out or in a stale tab.
    if (!userId || !loadedRef.current || noSave.current || conflictRef.current) return;
    if (lastEditAt.current === 0) return;
    dirty.current = false;
    const at = lastEditAt.current;
    await store.save(userId, projectName, filesRef.current, at);
    // IndexedDB has these edits now, so the backup is not needed. A newer edit keeps its own backup.
    if (lastEditAt.current === at) clearBackup(userId, projectName);
    channelRef.current?.postMessage({ tabId: tabId.current, updatedAt: at });
  }, [userId, projectName, store]);

  const pushCloud = useCallback(async (): Promise<boolean> => {
    if (!userId || !loadedRef.current || noSave.current) return true;
    // Never upload untouched default files: they would look newer than real work on another device.
    if (lastEditAt.current === 0) return true;
    if (conflictRef.current) return false;
    const cloud = cloudRef.current;
    if (!cloud || !cloudReady.current) return false;
    while (pushPromise.current) await pushPromise.current;
    const run = (async () => {
      for (let round = 0; round < 3; round++) {
        const snapshot = filesRef.current;
        const json = JSON.stringify(snapshot);
        if (json === lastPushed.current) return true;
        setStatus("syncing", null);
        const result = await cloud.save(userId, projectName, snapshot, lastEditAt.current);
        if (!result.ok) {
          setStatus("error", result.error);
          return false;
        }
        lastPushed.current = json;
        setStatus("synced", null, Date.now());
      }
      return true;
    })();
    pushPromise.current = run;
    try {
      return await run;
    } finally {
      pushPromise.current = null;
    }
  }, [userId, projectName, setStatus]);

  /** Read the cloud again after a failed read, then pick the newest copy again. */
  const retryCloud = useCallback(async () => {
    if (!userId || !loadedRef.current || retrying.current || cloudReady.current) return;
    retrying.current = true;
    try {
      const { remote, error } = await readCloud(cloudRef, userId, projectName);
      if (error) {
        setStatus("off", error);
        return;
      }
      cloudReady.current = true;
      const local: Snapshot | null =
        lastEditAt.current > 0 ? { files: filesRef.current, updatedAt: lastEditAt.current } : null;
      const choice = chooseSource(local, remote);
      if (choice.source === "cloud") {
        const next = remote!.files;
        lastEditAt.current = remote!.updatedAt;
        lastPushed.current = JSON.stringify(next);
        filesRef.current = next;
        setFiles(next);
        setNav((n) => {
          const kept = removeFromNav(n, (p) => !findNode(next, p));
          if (kept.active) return kept;
          const f = firstFile(next);
          return { tabs: f ? [f.path, ...kept.tabs.filter((p) => p !== f.path)] : kept.tabs, active: f ? f.path : null };
        });
        dirty.current = false;
        void store.save(userId, projectName, next, remote!.updatedAt);
        setStatus("synced", null, Date.now());
      } else if (choice.source === "local" && choice.push) {
        lastPushed.current = "";
        await pushCloud();
      } else {
        lastPushed.current = JSON.stringify(filesRef.current);
        setStatus("synced", null, Date.now());
      }
    } finally {
      retrying.current = false;
    }
  }, [userId, projectName, store, setStatus, pushCloud]);

  // While the cloud is unreachable: try again when the browser is back online and every 60 seconds.
  useEffect(() => {
    if (!loaded || sync.status !== "off") return;
    const again = () => void retryCloud();
    const id = setInterval(again, CLOUD_RETRY_MS);
    window.addEventListener("online", again);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", again);
    };
  }, [loaded, sync.status, retryCloud]);

  // Debounced auto-save: runs 5 seconds after the last change.
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    const t = setTimeout(() => {
      void saveAll();
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [files, loaded, saveAll]);

  // Cloud copy: 15 seconds after the last change.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void pushCloud();
    }, CLOUD_SAVE_MS);
    return () => clearTimeout(t);
  }, [files, loaded, pushCloud]);

  // A local copy that is newer than the cloud is uploaded at once.
  useEffect(() => {
    if (loaded && lastPushed.current === "") void pushCloud();
  }, [loaded, pushCloud]);

  // Another tab of the same project: a newer foreign save stops autosave here.
  useEffect(() => {
    if (!userId || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`veda-fs:${userId}:${projectName}`);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      const d = e.data as { tabId?: string; updatedAt?: number } | null;
      if (!d || d.tabId === tabId.current || typeof d.updatedAt !== "number") return;
      if (d.updatedAt > lastEditAt.current && !conflictRef.current) {
        conflictRef.current = true;
        setSync((s) => ({ ...s, conflict: true }));
      }
    };
    return () => {
      ch.close();
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [userId, projectName]);

  // Flush when the page is hidden or closed. The IndexedDB write starts in the same tick.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      // The page may close before the IndexedDB write ends. The backup write is synchronous.
      if (userId && loadedRef.current && !noSave.current && !conflictRef.current && lastEditAt.current > 0) {
        writeBackup(userId, projectName, filesRef.current, lastEditAt.current);
      }
      void saveAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        void pushCloud();
      }
    };
    const onHide = () => {
      flush();
      void pushCloud();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, projectName, saveAll, pushCloud]);

  // Flush on unmount.
  const latest = useRef({ saveAll, pushCloud });
  useEffect(() => {
    latest.current = { saveAll, pushCloud };
  }, [saveAll, pushCloud]);
  useEffect(
    () => () => {
      if (dirty.current) void latest.current.saveAll();
      void latest.current.pushCloud();
    },
    [],
  );

  const flushNow = useCallback(async (): Promise<{ cloudOk: boolean }> => {
    if (!userId || !loadedRef.current || noSave.current) return { cloudOk: true };
    if (conflictRef.current) return { cloudOk: false };
    await saveAll();
    return { cloudOk: await pushCloud() };
  }, [userId, saveAll, pushCloud]);

  const clearLocal = useCallback(async () => {
    if (!userId) return;
    noSave.current = true; // stops the flush on unmount from writing the project back
    dirty.current = false;
    await store.clear(userId, projectName);
  }, [userId, projectName, store]);

  const syncNow = useCallback(async () => {
    if (!cloudReady.current) await retryCloud();
    return pushCloud();
  }, [retryCloud, pushCloud]);

  const listRuntime = useCallback(async (dir: string): Promise<RuntimeEntry[] | null> => {
    const wc = await peekWebContainer();
    if (!wc) return null;
    try {
      const list = await wc.fs.readdir(`/${dir}`, { withFileTypes: true });
      return list.map((ent) => ({ name: ent.name, isDir: ent.isDirectory() }));
    } catch {
      return null;
    }
  }, []);

  const loadRuntimeText = useCallback(async (path: string) => {
    const wc = await peekWebContainer();
    let text: string | null = null;
    try {
      text = wc ? await wc.fs.readFile(`/${path}`, "utf-8") : null;
    } catch {
      text = null;
    }
    setRuntimeText((prev) => ({ ...prev, [path]: viewText(text) }));
  }, []);

  /** List one node_modules folder when the user opens it. */
  const loadRuntimeDir = useCallback(async (path: string) => {
    const list = await listRuntime(path);
    if (list) setRuntimeDirs((prev) => ({ ...prev, [path]: list }));
  }, [listRuntime]);

  /** Read node_modules again: the root, every folder that is already listed, and the open files. */
  const refreshRuntime = useCallback(async () => {
    const rootList = await listRuntime("");
    if (rootList === null) return;
    // node_modules can be in the project root or in a project folder up to two levels deep.
    const folders = ["", ...projectDirs(filesRef.current, 2)];
    const found: string[] = [];
    for (const f of folders) {
      const list = f === "" ? rootList : await listRuntime(f);
      if (list?.some((e) => e.isDir && e.name === RUNTIME_DIR)) found.push(runtimeRootOf(f));
    }
    const inFound = (k: string) => found.some((r) => k === r || k.startsWith(`${r}/`));
    setNav((n) => removeFromNav(n, (p) => isRuntimePath(p) && !inFound(p)));
    setRuntimeText((prev) => {
      const keep = Object.fromEntries(Object.entries(prev).filter(([k]) => inFound(k)));
      return Object.keys(keep).length === Object.keys(prev).length ? prev : keep;
    });
    const listed = Object.keys(runtimeDirsRef.current).filter((k) => inFound(k) && !found.includes(k));
    const next: Record<string, RuntimeEntry[]> = {};
    for (const k of [...found, ...listed].slice(0, 100)) {
      const list = await listRuntime(k);
      if (list) next[k] = list;
    }
    setRuntimeDirs((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [listRuntime]);

  const openFile = useCallback((path: string) => {
    setNav((n) => ({ tabs: n.tabs.includes(path) ? n.tabs : [...n.tabs, path], active: path }));
    if (isRuntimePath(path)) void loadRuntimeText(path);
  }, [loadRuntimeText]);

  const closeTab = useCallback((path: string) => {
    setNav((n) => removeFromNav(n, (p) => p === path));
  }, []);

  const createFile = useCallback((path: string, type: "file" | "directory" = "file", content = "") => {
    const segments = path.split("/");
    if (segments.some((s) => !validateName(s).ok)) return;
    const name = segments[segments.length - 1];
    const node: FileNode =
      type === "file" ? { name, path, type, content } : { name, path, type, children: [] };
    edited();
    setFiles((prev) => (findNode(prev, path) ? prev : insertNode(prev, node)));
    if (type === "file") openFile(path);
  }, [openFile, edited]);

  const deleteFile = useCallback((path: string) => {
    edited();
    setFiles((prev) => mapTree(prev, (n) => (n.path === path ? null : n)));
    setNav((n) => removeFromNav(n, (p) => p === path || p.startsWith(path + "/")));
  }, [edited]);

  /** Rename a file or folder (children, tabs and the active file follow). Tabs do not switch or move. */
  const renameNode = useCallback((oldPath: string, newPath: string) => {
    if (oldPath === newPath) return;
    const name = newPath.slice(newPath.lastIndexOf("/") + 1);
    if (!validateName(name).ok || findNode(filesRef.current, newPath)) return;
    edited();
    setFiles((prev) => renameTree(prev, oldPath, newPath));
    setNav((n) => ({
      tabs: n.tabs.map((p) => remapPath(p, oldPath, newPath)),
      active: n.active === null ? null : remapPath(n.active, oldPath, newPath),
    }));
  }, [edited]);

  const updateFileContent = useCallback((path: string, content: string) => {
    edited();
    setFiles((prev) => setContentAt(prev, path, content));
  }, [edited]);

  /** Apply what a runtime (the terminal or a script) changed. Tabs of removed files close. */
  const applyRuntimeChanges = useCallback((ops: Incoming) => {
    if (ops.upsert.length === 0 && ops.remove.length === 0) return;
    edited();
    setFiles((prev) => applyIncomingToTree(prev, ops));
    const removedDirs = ops.remove.filter((k) => k.endsWith("/")).map((k) => k.slice(0, -1));
    const removedFiles = new Set(ops.remove.filter((k) => !k.endsWith("/")));
    setNav((n) =>
      removeFromNav(n, (p) => removedFiles.has(p) || removedDirs.some((d) => p === d || p.startsWith(d + "/")))
    );
  }, [edited]);

  const activePath = nav.active;
  const activeFile = activePath ? (findNode(treeFiles, activePath)) : null;

  return {
    files,
    activeFile,
    activePath,
    openTabs: nav.tabs,
    openFile,
    closeTab,
    createFile,
    deleteFile,
    renameNode,
    updateFileContent,
    applyRuntimeChanges,
    treeFiles,
    loadRuntimeDir,
    refreshRuntime,
    saveAll,
    flushNow,
    clearLocal,
    loaded,
    sync,
    syncNow,
  };
}

export type FileSystemApi = ReturnType<typeof useFileSystemState>;

export const FileSystemContext = createContext<FileSystemApi | null>(null);

export function useFileSystem(): FileSystemApi {
  const ctx = useContext(FileSystemContext);
  if (!ctx) throw new Error("useFileSystem must be used inside FileSystemProvider");
  return ctx;
}
