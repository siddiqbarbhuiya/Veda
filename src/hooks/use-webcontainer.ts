"use client";

import { useCallback, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import type { WebContainer, FileSystemTree } from "@webcontainer/api";
import type { FileNode } from "@/lib/persistence/indexeddb";

// WebContainer.boot() may be called only once per page, so keep the promise at module level.
let bootPromise: Promise<WebContainer> | null = null;

function toTree(nodes: FileNode[]): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const n of nodes) {
    if (n.type === "directory") tree[n.name] = { directory: toTree(n.children ?? []) };
    else tree[n.name] = { file: { contents: n.content ?? "" } };
  }
  return tree;
}

export function useWebContainer() {
  // The terminal panel sets this ref when the xterm instance exists.
  const terminal = useRef<Terminal | null>(null);
  const shellInput = useRef<WritableStreamDefaultWriter<string> | null>(null);

  const boot = useCallback(async (): Promise<WebContainer> => {
    if (!bootPromise) {
      bootPromise = import("@webcontainer/api")
        .then(({ WebContainer }) => WebContainer.boot())
        .catch((err) => {
          bootPromise = null;
          throw err;
        });
    }
    return bootPromise;
  }, []);

  const writeFiles = useCallback(
    async (files: FileNode[]) => {
      const wc = await boot();
      await wc.mount(toTree(files));
    },
    [boot]
  );

  const runCommand = useCallback(
    async (cmd: string, args: string[] = []): Promise<number> => {
      const wc = await boot();
      const proc = await wc.spawn(cmd, args);
      void proc.output.pipeTo(
        new WritableStream({
          write(chunk) {
            terminal.current?.write(chunk);
          },
        })
      );
      return proc.exit;
    },
    [boot]
  );

  /** Start an interactive shell once. Keyboard input from xterm goes to it. */
  const startShell = useCallback(
    async (term: Terminal) => {
      if (shellInput.current) return;
      const wc = await boot();
      const proc = await wc.spawn("jsh", { terminal: { cols: term.cols, rows: term.rows } });
      void proc.output.pipeTo(new WritableStream({ write: (c) => term.write(c) }));
      const writer = proc.input.getWriter();
      shellInput.current = writer;
      term.onData((d) => void writer.write(d));
    },
    [boot]
  );

  const attachTerminal = useCallback((t: Terminal | null) => {
    terminal.current = t;
  }, []);

  return { boot, writeFiles, runCommand, startShell, terminal, attachTerminal };
}
