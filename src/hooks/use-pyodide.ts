"use client";

import { useCallback, useRef } from "react";
import type { Terminal } from "@xterm/xterm";

type PyodideLike = {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (o: { batched: (s: string) => void }) => void;
  setStderr: (o: { batched: (s: string) => void }) => void;
};

let loadPromise: Promise<PyodideLike> | null = null;

export function usePyodide() {
  const terminal = useRef<Terminal | null>(null);

  const load = useCallback(async (): Promise<PyodideLike> => {
    if (!loadPromise) {
      loadPromise = import("pyodide")
        .then(async ({ loadPyodide, version }) => {
          const py = (await loadPyodide({
            indexURL: `https://cdn.jsdelivr.net/pyodide/v${version}/full/`,
          })) as unknown as PyodideLike;
          return py;
        })
        .catch((err) => {
          loadPromise = null;
          throw err;
        });
    }
    return loadPromise;
  }, []);

  const runCode = useCallback(
    async (code: string): Promise<void> => {
      const py = await load();
      const out = (s: string) => terminal.current?.writeln(s);
      py.setStdout({ batched: out });
      py.setStderr({ batched: out });
      try {
        await py.runPythonAsync(code);
      } catch (err) {
        terminal.current?.writeln(`\x1b[31m${String(err instanceof Error ? err.message : err)}\x1b[0m`);
      }
    },
    [load]
  );

  const attachTerminal = useCallback((t: Terminal | null) => {
    terminal.current = t;
  }, []);

  return { load, runCode, terminal, attachTerminal };
}
