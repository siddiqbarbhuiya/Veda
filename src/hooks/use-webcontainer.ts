"use client";

import { useMemo } from "react";
import type { IDisposable, Terminal } from "@xterm/xterm";
import type { WebContainer, FileSystemTree, WebContainerProcess } from "@webcontainer/api";
import type { FileNode } from "@/lib/persistence/indexeddb";
import { diffSync, flattenTree } from "./run-helpers";
import {
  applyIncomingToMap,
  incomingFromScan,
  scanFs,
  shouldIgnore,
  type FsAdapter,
  type Incoming,
} from "@/lib/files/runtime-sync";

export const ISOLATION_MESSAGE =
  "Cross-origin isolation is off. Reload this page (open the IDE from the address bar or press F5).";

export function isIsolationError(e: unknown): boolean {
  return e instanceof Error && e.message === ISOLATION_MESSAGE;
}

export type RunningCommand = {
  /** Resolves with the exit code after all output is written. */
  exit: Promise<number>;
  kill(): void;
  input(data: string): void;
};

// WebContainer.boot() may be called only once per page, so keep the promise at module level.
let bootPromise: Promise<WebContainer> | null = null;

// Terminal that receives output. The panel attaches and detaches it.
let attachedTerm: Terminal | null = null;

// The interactive shell lives for the page. A new terminal re-attaches to it.
let shellProc: WebContainerProcess | null = null;
let shellWriter: WritableStreamDefaultWriter<string> | null = null;
let shellStarting: Promise<void> | null = null;
let shellEnabled = true;
let termListeners: IDisposable[] = [];

// The command that Run started. It gets the keystrokes while it runs.
let current: RunningCommand | null = null;
let lineBuffer = "";

// Last content written into the WebContainer, by path. Null before the first mount.
let synced: Map<string, string> | null = null;

function toTree(nodes: FileNode[]): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const n of nodes) {
    if (n.type === "directory") tree[n.name] = { directory: toTree(n.children ?? []) };
    else tree[n.name] = { file: { contents: n.content ?? "" } };
  }
  return tree;
}

function disposeListeners() {
  termListeners.forEach((d) => d.dispose());
  termListeners = [];
}

/** Keystrokes from xterm: to the running command, else to the idle shell. */
function handleData(data: string) {
  const term = attachedTerm;
  if (current) {
    for (const ch of data) {
      if (ch === "\x03") {
        term?.write("^C\r\n");
        lineBuffer = "";
        current.kill();
      } else if (ch === "\r") {
        term?.write("\r\n");
        current.input(`${lineBuffer}\n`);
        lineBuffer = "";
      } else if (ch === "\x7f") {
        if (lineBuffer) {
          lineBuffer = lineBuffer.slice(0, -1);
          term?.write("\b \b");
        }
      } else if (ch >= " " && !ch.startsWith("\x1b")) {
        lineBuffer += ch;
        term?.write(ch);
      }
    }
    return;
  }
  if (shellEnabled && shellWriter) void shellWriter.write(data);
}

function bindTerminal(term: Terminal) {
  disposeListeners();
  termListeners.push(
    term.onData(handleData),
    term.onResize(({ cols, rows }) => {
      try {
        shellProc?.resize({ cols, rows });
      } catch {
        /* process ended */
      }
    })
  );
}

/** The running WebContainer, or null when it never booted. This never starts one. */
export async function peekWebContainer(): Promise<WebContainer | null> {
  if (!bootPromise) return null;
  try {
    return await bootPromise;
  } catch {
    return null;
  }
}

async function boot(): Promise<WebContainer> {
  if (typeof window !== "undefined" && !window.crossOriginIsolated) {
    throw new Error(ISOLATION_MESSAGE);
  }
  if (!bootPromise) {
    bootPromise = import("@webcontainer/api")
      .then(({ WebContainer }) => WebContainer.boot())
      .catch((err) => {
        bootPromise = null;
        throw err;
      });
  }
  return bootPromise;
}

async function doWrite(files: FileNode[]): Promise<void> {
  const wc = await boot();
  const next = flattenTree(files);
  if (synced === null) {
    // First sync: mount the whole tree.
    await wc.mount(toTree(files));
    synced = next;
    return;
  }
  const { write, remove } = diffSync(synced, next);
  for (const key of remove) {
    await wc.fs.rm(key.replace(/\/$/, ""), { recursive: true, force: true });
  }
  for (const [key, content] of write) {
    if (key.endsWith("/")) {
      await wc.fs.mkdir(key.slice(0, -1), { recursive: true });
      continue;
    }
    const slash = key.lastIndexOf("/");
    if (slash > 0) await wc.fs.mkdir(key.slice(0, slash), { recursive: true });
    await wc.fs.writeFile(key, content);
  }
  synced = next;
}

// Syncs run one after the other so that they never mix.
let syncChain: Promise<unknown> = Promise.resolve();
function writeFiles(files: FileNode[]): Promise<void> {
  const next = syncChain.then(() => doWrite(files), () => doWrite(files));
  syncChain = next;
  return next;
}

/** The WebContainer file system as relative keys. */
function wcAdapter(wc: WebContainer): FsAdapter {
  const abs = (key: string) => `/${key}`;
  return {
    async list(dir) {
      const list = await wc.fs.readdir(abs(dir), { withFileTypes: true });
      return list.map((ent) => ({ name: ent.name, isDir: ent.isDirectory() }));
    },
    read: (path) => wc.fs.readFile(abs(path), "utf-8"),
  };
}

async function doPull(getFiles: () => FileNode[]): Promise<Incoming | null> {
  if (synced === null || !bootPromise) return null;
  const wc = await boot();
  const scan = await scanFs(wcAdapter(wc));
  const ops = incomingFromScan(synced, scan, flattenTree(getFiles()));
  synced = applyIncomingToMap(synced, ops);
  return ops;
}

/** Read the runtime and return what the terminal or a script changed. The caller must apply it to the editor. */
function pullFromRuntime(getFiles: () => FileNode[]): Promise<Incoming | null> {
  const next = syncChain.then(() => doPull(getFiles), () => doPull(getFiles));
  syncChain = next;
  return next;
}

const changeListeners = new Set<() => void>();
let watcher: { close(): void } | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let notifyFirstAt = 0;
const NOTIFY_QUIET_MS = 500;
const NOTIFY_MAX_MS = 3000;

function scheduleNotify() {
  const now = Date.now();
  if (notifyTimer === null) notifyFirstAt = now;
  else clearTimeout(notifyTimer);
  const wait = Math.max(0, Math.min(NOTIFY_QUIET_MS, notifyFirstAt + NOTIFY_MAX_MS - now));
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    changeListeners.forEach((cb) => cb());
  }, wait);
}

/** Watch the runtime file system once. Change events are grouped, then each listener runs. */
async function ensureWatcher(): Promise<void> {
  if (watcher) return;
  const wc = await boot();
  try {
    watcher = wc.fs.watch("/", { recursive: true }, (_event, filename) => {
      const name = typeof filename === "string" ? filename : new TextDecoder().decode(filename ?? new Uint8Array());
      if (name && shouldIgnore(name)) return;
      scheduleNotify();
    });
  } catch {
    // No watcher: the sync still runs after each Run command.
    watcher = null;
  }
}

/** Run `cb` after the runtime files changed. Returns the function that removes the listener. */
function onRuntimeChange(cb: () => void): () => void {
  changeListeners.add(cb);
  void ensureWatcher();
  return () => {
    changeListeners.delete(cb);
  };
}

async function runCommand(cmd: string, args: string[] = []): Promise<RunningCommand> {
  const wc = await boot();
  const proc = await wc.spawn(cmd, args);
  const pipe = proc.output
    .pipeTo(
      new WritableStream({
        write(chunk) {
          attachedTerm?.write(chunk);
        },
      })
    )
    .catch(() => undefined);
  const writer = proc.input.getWriter();
  let cmdHandle: RunningCommand | null = null;
  cmdHandle = {
    exit: (async () => {
      const code = await proc.exit;
      // The output pipe can end a little after the exit. Wait for it, but not for ever.
      await Promise.race([pipe, new Promise((r) => setTimeout(r, 1000))]);
      if (current === cmdHandle) {
        current = null;
        lineBuffer = "";
      }
      try {
        writer.releaseLock();
      } catch {
        /* already released */
      }
      return code;
    })(),
    kill() {
      try {
        proc.kill();
      } catch {
        /* already ended */
      }
    },
    input(data: string) {
      void writer.write(data).catch(() => undefined);
    },
  };
  current = cmdHandle;
  lineBuffer = "";
  return cmdHandle;
}

/** Start the interactive shell once. A later call re-attaches the shell to the current terminal. */
async function startShell(term: Terminal): Promise<void> {
  attachedTerm = term;
  bindTerminal(term);
  if (shellStarting) {
    await shellStarting;
    try {
      shellProc?.resize({ cols: term.cols, rows: term.rows });
    } catch {
      /* ignore */
    }
    return;
  }
  shellStarting = (async () => {
    const wc = await boot();
    const proc = await wc.spawn("jsh", { terminal: { cols: term.cols, rows: term.rows } });
    shellProc = proc;
    shellWriter = proc.input.getWriter();
    void proc.output.pipeTo(new WritableStream({ write: (c) => attachedTerm?.write(c) })).catch(() => undefined);
    void proc.exit.then(() => {
      shellProc = null;
      shellWriter = null;
      shellStarting = null;
    });
  })();
  try {
    await shellStarting;
  } catch (e) {
    shellStarting = null;
    throw e;
  }
}

function attachTerminal(t: Terminal | null) {
  attachedTerm = t;
  if (!t) disposeListeners();
}

/** Turn the keyboard link to the idle shell on or off (off in Python mode). */
function setShellActive(active: boolean) {
  shellEnabled = active;
}

export function useWebContainer() {
  // The functions live at module level, so the returned object never changes.
  return useMemo(
    () => ({
      boot,
      writeFiles,
      pullFromRuntime,
      onRuntimeChange,
      runCommand,
      startShell,
      attachTerminal,
      setShellActive,
    }),
    []
  );
}
