"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IndexedDBStore, type FileNode } from "@/lib/persistence/indexeddb";
import { CloudStore } from "@/lib/persistence/cloud-store";
import { chooseSource, type Snapshot } from "@/lib/persistence/sync";
import { createBrowserClient } from "@/lib/supabase/client";

export type { FileNode };

export const DEFAULT_PROJECT_NAME = "default";
const AUTOSAVE_MS = 5000;
const CLOUD_SAVE_MS = 15000;

export type SyncState = {
  /** "off" = the cloud copy could not be read, so nothing is uploaded this session. */
  status: "idle" | "syncing" | "synced" | "error" | "off";
  lastSyncedAt: number | null;
  error: string | null;
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

export function useFileSystemState(userId: string | null, projectName: string = DEFAULT_PROJECT_NAME) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: "idle", lastSyncedAt: null, error: null });
  const store = useMemo(() => new IndexedDBStore(), []);
  const cloudRef = useRef<CloudStore | null>(null);
  const cloudReady = useRef(false);
  const lastPushed = useRef("");
  const pushing = useRef(false);
  const lastEditAt = useRef(0);
  const dirty = useRef(false);
  const filesRef = useRef<FileNode[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    cloudReady.current = false;
    (async () => {
      let remote: Snapshot | null = null;
      let remoteError: string | null = null;
      try {
        cloudRef.current = new CloudStore(createBrowserClient() as unknown as ConstructorParameters<typeof CloudStore>[0]);
        remote = await cloudRef.current.load(userId, projectName);
      } catch (err) {
        remoteError = err instanceof Error ? err.message : "Cloud sync is not available.";
      }
      const saved = await store.loadWithMeta(userId, projectName);
      if (cancelled) return;

      const local: Snapshot | null = saved ? { files: saved.files, updatedAt: saved.updatedAt } : null;
      // A failed cloud read must never lead to an upload: the cloud copy could be newer.
      const choice = remoteError ? { source: local ? ("local" as const) : ("default" as const), push: false } : chooseSource(local, remote);
      const initial =
        choice.source === "cloud" ? remote!.files : choice.source === "local" ? local!.files : defaultFiles();
      lastEditAt.current =
        choice.source === "cloud" ? remote!.updatedAt : choice.source === "local" ? local!.updatedAt || Date.now() : 0;
      lastPushed.current = choice.push ? "" : JSON.stringify(initial);
      cloudReady.current = remoteError === null;
      setSync(
        remoteError
          ? { status: "off", lastSyncedAt: null, error: remoteError }
          : { status: choice.push ? "idle" : "synced", lastSyncedAt: choice.push ? null : Date.now(), error: null },
      );

      setFiles(initial);
      const first = initial.find((n) => n.type === "file");
      setActivePath(first ? first.path : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, projectName, store]);

  const saveAll = useCallback(async () => {
    if (!userId || !loaded) return;
    dirty.current = false;
    await store.save(userId, projectName, filesRef.current, lastEditAt.current || Date.now());
  }, [userId, projectName, store, loaded]);

  const pushCloud = useCallback(async () => {
    const cloud = cloudRef.current;
    // Never upload untouched default files: they would look newer than real work on another device.
    if (!userId || !loaded || !cloud || !cloudReady.current || lastEditAt.current === 0) return;
    if (pushing.current) return;
    pushing.current = true;
    try {
      for (let round = 0; round < 3; round++) {
        const snapshot = filesRef.current;
        const json = JSON.stringify(snapshot);
        if (json === lastPushed.current) break;
        setSync((s) => ({ ...s, status: "syncing", error: null }));
        const result = await cloud.save(userId, projectName, snapshot, lastEditAt.current);
        if (!result.ok) {
          setSync((s) => ({ ...s, status: "error", error: result.error }));
          return;
        }
        lastPushed.current = json;
        setSync({ status: "synced", lastSyncedAt: Date.now(), error: null });
      }
    } finally {
      pushing.current = false;
    }
  }, [userId, projectName, loaded]);

  // Debounced auto-save: runs 5 seconds after the last change.
  useEffect(() => {
    if (!loaded) return;
    dirty.current = true;
    const t = setTimeout(() => {
      void saveAll();
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [files, loaded, saveAll]);

  // Cloud copy: 15 seconds after the last change, and at once when the tab is hidden or the page loads with a newer local copy.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void pushCloud();
    }, CLOUD_SAVE_MS);
    return () => clearTimeout(t);
  }, [files, loaded, pushCloud]);

  useEffect(() => {
    if (loaded && lastPushed.current === "") void pushCloud();
  }, [loaded, pushCloud]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current) void saveAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        void pushCloud();
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveAll, pushCloud]);

  const openFile = useCallback((path: string) => setActivePath(path), []);

  const createFile = useCallback((path: string, type: "file" | "directory" = "file", content = "") => {
    const name = path.split("/").pop() ?? path;
    const node: FileNode =
      type === "file" ? { name, path, type, content } : { name, path, type, children: [] };
    lastEditAt.current = Date.now();
    setFiles((prev) => (findNode(prev, path) ? prev : insertNode(prev, node)));
    if (type === "file") setActivePath(path);
  }, []);

  const deleteFile = useCallback((path: string) => {
    lastEditAt.current = Date.now();
    setFiles((prev) => mapTree(prev, (n) => (n.path === path ? null : n)));
    setActivePath((cur) => (cur && (cur === path || cur.startsWith(path + "/")) ? null : cur));
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    lastEditAt.current = Date.now();
    setFiles((prev) => mapTree(prev, (n) => (n.path === path ? { ...n, content } : n)));
  }, []);

  const activeFile = activePath ? findNode(files, activePath) : null;

  return {
    files,
    activeFile,
    openFile,
    createFile,
    deleteFile,
    updateFileContent,
    saveAll,
    loaded,
    sync,
    syncNow: pushCloud,
  };
}

export type FileSystemApi = ReturnType<typeof useFileSystemState>;

export const FileSystemContext = createContext<FileSystemApi | null>(null);

export function useFileSystem(): FileSystemApi {
  const ctx = useContext(FileSystemContext);
  if (!ctx) throw new Error("useFileSystem must be used inside FileSystemProvider");
  return ctx;
}
