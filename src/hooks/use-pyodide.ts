"use client";

import { useMemo } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FileNode } from "@/lib/persistence/indexeddb";
import { flattenTree, trimPyTraceback } from "./run-helpers";
import { applyIncomingToMap, incomingFromScan, scanFs, type FsAdapter, type Incoming } from "@/lib/files/runtime-sync";

// Pinned to the version in node_modules/pyodide/package.json. Pyodide is NOT bundled:
// Turbopack cannot bundle its Node-only dynamic code, so a script tag loads it from the CDN.
export const PYODIDE_VERSION = "314.0.7";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const HOME = "/home/pyodide";

export const PYODIDE_DOWNLOAD_ERROR = "Could not download Python from the CDN. Check your connection.";

type PyProxyLike = { get(key: string): unknown; set(key: string, value: unknown): void; destroy?: () => void };
type StdOptions = { write: (buf: Uint8Array) => number };
type PyodideLike = {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string, options?: { globals?: PyProxyLike }) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<void>;
  loadPackage: (names: string | string[]) => Promise<unknown>;
  setStdout: (o: StdOptions) => void;
  setStderr: (o: StdOptions) => void;
  setStdin?: (o: { stdin: () => string | undefined }) => void;
  globals: PyProxyLike;
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: string): void;
    unlink(path: string): void;
    chdir(path: string): void;
    readdir(path: string): string[];
    stat(path: string): { mode: number };
    isDir(mode: number): boolean;
    readFile(path: string, options: { encoding: "utf8" }): string;
  };
};

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideLike>;
  }
}

let scriptPromise: Promise<void> | null = null;
let loadPromise: Promise<PyodideLike> | null = null;
let attachedTerm: Terminal | null = null;
let mirrored = new Set<string>();
// Requirements that micropip installed in this page. The list is lost on reload, like the Pyodide file system.
const installedSpecs = new Set<string>();

// What the editor and Python agreed on at the last copy, in `flattenTree` keys. Null before the first run.
let synced: Map<string, string> | null = null;

function injectScript(): Promise<void> {
  if (typeof window !== "undefined" && window.loadPyodide) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = `${INDEX_URL}pyodide.js`;
      tag.crossOrigin = "anonymous";
      tag.async = true;
      tag.onload = () => resolve();
      tag.onerror = () => {
        tag.remove();
        scriptPromise = null;
        reject(new Error(PYODIDE_DOWNLOAD_ERROR));
      };
      document.head.appendChild(tag);
    });
  }
  return scriptPromise;
}

async function load(): Promise<PyodideLike> {
  if (!loadPromise) {
    loadPromise = (async () => {
      await injectScript();
      if (!window.loadPyodide) throw new Error(PYODIDE_DOWNLOAD_ERROR);
      let py: PyodideLike;
      try {
        py = await window.loadPyodide({ indexURL: INDEX_URL });
      } catch {
        throw new Error(PYODIDE_DOWNLOAD_ERROR);
      }
      py.runPython(`import sys\nif "${HOME}" not in sys.path:\n    sys.path.insert(0, "${HOME}")`);
      return py;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

function mirrorFiles(py: PyodideLike, files: FileNode[]) {
  const next = new Set<string>();
  for (const [key, content] of flattenTree(files)) {
    const abs = `${HOME}/${key}`;
    if (key.endsWith("/")) {
      py.FS.mkdirTree(abs.slice(0, -1));
      continue;
    }
    const slash = abs.lastIndexOf("/");
    py.FS.mkdirTree(abs.slice(0, slash));
    py.FS.writeFile(abs, content);
    next.add(abs);
  }
  for (const old of mirrored) {
    if (!next.has(old)) {
      try {
        py.FS.unlink(old);
      } catch {
        /* already gone */
      }
    }
  }
  mirrored = next;
  synced = flattenTree(files);
  py.FS.chdir(HOME);
}

/** The Python file system under HOME as relative keys. */
function pyAdapter(py: PyodideLike): FsAdapter {
  const abs = (key: string) => (key ? `${HOME}/${key}` : HOME);
  return {
    list(dir) {
      return py.FS.readdir(abs(dir))
        .filter((name) => name !== "." && name !== "..")
        .map((name) => ({ name, isDir: py.FS.isDir(py.FS.stat(`${abs(dir)}/${name}`).mode) }));
    },
    read: (path) => py.FS.readFile(abs(path), { encoding: "utf8" }),
  };
}

/** Read what a script changed in the Python file system. The caller must apply it to the editor. */
async function pullFromPython(getFiles: () => FileNode[]): Promise<Incoming | null> {
  if (!loadPromise || synced === null) return null;
  const py = await loadPromise;
  const scan = await scanFs(pyAdapter(py));
  const ops = incomingFromScan(synced, scan, flattenTree(getFiles()));
  synced = applyIncomingToMap(synced, ops);
  return ops;
}

function stream() {
  const decoder = new TextDecoder();
  return {
    write(buf: Uint8Array) {
      attachedTerm?.write(decoder.decode(buf, { stream: true }));
      return buf.length;
    },
  };
}

export type PythonResult = { ok: true } | { ok: false; message: string };

async function runCode(code: string, files?: FileNode[]): Promise<PythonResult> {
  const py = await load();
  const term = attachedTerm;
  py.setStdout(stream());
  py.setStderr(stream());
  // No stdin in the page: input() gets end of file instead of a browser prompt.
  py.setStdin?.({ stdin: () => undefined });
  if (files) mirrorFiles(py, files);
  let globals: PyProxyLike | null = null;
  try {
    await py.loadPackagesFromImports(code);
    globals = (py.globals.get("dict") as () => PyProxyLike)();
    globals.set("__name__", "__main__");
    await py.runPythonAsync(code, { globals });
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const text = trimPyTraceback(raw);
    term?.writeln(`\x1b[31m${text}\x1b[0m`);
    const lastLine = text.split("\n").filter(Boolean).pop() ?? "Python error";
    return { ok: false, message: lastLine };
  } finally {
    globals?.destroy?.();
  }
}

export type InstallResult = { ok: true } | { ok: false; message: string };

/** Install pip requirements with micropip. A spec that is installed in this page is skipped. */
async function installPackages(specs: string[]): Promise<InstallResult> {
  const py = await load();
  let globals: PyProxyLike | null = null;
  try {
    await py.loadPackage("micropip");
    globals = (py.globals.get("dict") as () => PyProxyLike)();
    for (const spec of specs) {
      if (installedSpecs.has(spec)) continue;
      // The spec goes in as data, never as code.
      globals.set("_spec", spec);
      await py.runPythonAsync("import micropip\nawait micropip.install(_spec)", { globals });
      installedSpecs.add(spec);
    }
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const lines = trimPyTraceback(raw).split("\n").filter(Boolean);
    return { ok: false, message: lines[lines.length - 1] ?? "pip install failed" };
  } finally {
    globals?.destroy?.();
  }
}

function attachTerminal(t: Terminal | null) {
  attachedTerm = t;
}

export function usePyodide() {
  return useMemo(() => ({ load, runCode, attachTerminal, pullFromPython, installPackages }), []);
}
