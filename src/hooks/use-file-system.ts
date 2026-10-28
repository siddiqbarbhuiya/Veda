"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IndexedDBStore, type FileNode } from "@/lib/persistence/indexeddb";

export type { FileNode };

export const DEFAULT_PROJECT_NAME = "default";
const AUTOSAVE_MS = 5000;

export function defaultFiles(): FileNode[] {
  return [
    { name: "index.js", path: "index.js", type: "file", content: "console.log('Hello, IndicSandbox!');\n" },
    {
      name: "README.md",
      path: "README.md",
      type: "file",
      content: "# Welcome to IndicSandbox\n\nEdit index.js and start building.\n",
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
  const parent = node.path.slice(0, idx);
  return nodes.map((n) =>
    n.path === parent && n.type === "directory"
      ? { ...n, children: [...(n.children ?? []), node] }
      : n.children
        ? { ...n, children: insertNode(n.children, node) }
        : n
  );
}

export function useFileSystemState(userId: string | null, projectName: string = DEFAULT_PROJECT_NAME) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const store = useMemo(() => new IndexedDBStore(), []);
  const dirty = useRef(false);
  const filesRef = useRef<FileNode[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    store.load(userId, projectName).then((saved) => {
      if (cancelled) return;
      const initial = saved && saved.length > 0 ? saved : defaultFiles();
      setFiles(initial);
      const first = initial.find((n) => n.type === "file");
      setActivePath(first ? first.path : null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, projectName, store]);

  const saveAll = useCallback(async () => {
    if (!userId || !loaded) return;
    dirty.current = false;
    await store.save(userId, projectName, filesRef.current);
  }, [userId, projectName, store, loaded]);

  // Debounced auto-save: runs 5 seconds after the last change.
  useEffect(() => {
    if (!loaded) return;
    dirty.current = true;
    const t = setTimeout(() => {
      void saveAll();
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [files, loaded, saveAll]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current) void saveAll();
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [saveAll]);

  const openFile = useCallback((path: string) => setActivePath(path), []);

  const createFile = useCallback((path: string, type: "file" | "directory" = "file", content = "") => {
    const name = path.split("/").pop() ?? path;
    const node: FileNode =
      type === "file" ? { name, path, type, content } : { name, path, type, children: [] };
    setFiles((prev) => (findNode(prev, path) ? prev : insertNode(prev, node)));
    if (type === "file") setActivePath(path);
  }, []);

  const deleteFile = useCallback((path: string) => {
    setFiles((prev) => mapTree(prev, (n) => (n.path === path ? null : n)));
    setActivePath((cur) => (cur && (cur === path || cur.startsWith(path + "/")) ? null : cur));
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) => mapTree(prev, (n) => (n.path === path ? { ...n, content } : n)));
  }, []);

  const activeFile = activePath ? findNode(files, activePath) : null;

  return { files, activeFile, openFile, createFile, deleteFile, updateFileContent, saveAll, loaded };
}

export type FileSystemApi = ReturnType<typeof useFileSystemState>;

export const FileSystemContext = createContext<FileSystemApi | null>(null);

export function useFileSystem(): FileSystemApi {
  const ctx = useContext(FileSystemContext);
  if (!ctx) throw new Error("useFileSystem must be used inside FileSystemProvider");
  return ctx;
}
