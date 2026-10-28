"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useFileSystem } from "@/hooks/use-file-system";
import { useWebContainer } from "@/hooks/use-webcontainer";
import { usePyodide } from "@/hooks/use-pyodide";
import { useRuntime } from "./runtime-context";

export default function TerminalPanel() {
  const { files, activeFile } = useFileSystem();
  const { runtime } = useRuntime();
  const wc = useWebContainer();
  const py = usePyodide();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create the xterm instance once (browser only).
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !hostRef.current) return;
      const term = new Terminal({ convertEol: true, fontSize: 12, theme: { background: "#000000" } });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term;
      wc.attachTerminal(term);
      py.attachTerminal(term);
      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* container hidden */
        }
      });
      ro.observe(hostRef.current);
      cleanups.push(() => {
        ro.disconnect();
        term.dispose();
        termRef.current = null;
        wc.attachTerminal(null);
        py.attachTerminal(null);
      });
    })();
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
    };
    // wc/py expose stable refs; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In Node mode, boot the runtime and start an interactive shell.
  useEffect(() => {
    if (runtime !== "node") return;
    let cancelled = false;
    const t = setInterval(async () => {
      if (!termRef.current) return;
      clearInterval(t);
      try {
        setBusy("Booting Node.js runtime...");
        await wc.writeFiles(files);
        if (cancelled) return;
        await wc.startShell(termRef.current);
      } catch (e) {
        setError(
          `Node.js runtime unavailable: ${e instanceof Error ? e.message : String(e)}. WebContainers need a supported browser (not incognito) and cross-origin isolation.`
        );
      } finally {
        setBusy(null);
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // Boot once per switch to node; file sync happens on Run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  const run = useCallback(async () => {
    const term = termRef.current;
    if (!term || !activeFile || activeFile.type !== "file") return;
    setError(null);
    try {
      if (runtime === "node") {
        setBusy("Running...");
        await wc.writeFiles(files);
        term.writeln(`\x1b[90m$ node ${activeFile.path}\x1b[0m`);
        await wc.runCommand("node", [activeFile.path]);
      } else {
        setBusy("Loading Python (about 10 s on first run)...");
        await py.load();
        setBusy("Running...");
        term.writeln(`\x1b[90m>>> ${activeFile.path}\x1b[0m`);
        await py.runCode(activeFile.content ?? "");
      }
    } catch (e) {
      setError(`${runtime === "node" ? "Node.js" : "Python"} runtime failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [runtime, files, activeFile, wc, py]);

  return (
    <div id="terminal-panel" data-panel="terminal" className="flex h-48 shrink-0 flex-col border-t border-neutral-800 bg-black">
      <div className="flex h-7 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-2 text-xs">
        <button
          onClick={run}
          disabled={!activeFile || busy !== null}
          className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Run
        </button>
        <span className="text-neutral-400">{runtime === "node" ? "Node.js" : "Python"}</span>
        {busy && <span className="text-amber-400">{busy}</span>}
      </div>
      {error && (
        <div role="alert" className="border-b border-red-900 bg-red-950 px-2 py-1 text-xs text-red-300">
          {error}
        </div>
      )}
      <div ref={hostRef} className="min-h-0 flex-1 px-1" />
    </div>
  );
}
