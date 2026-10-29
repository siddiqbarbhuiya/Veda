"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { AlertCircle, Eraser, Loader2, Play } from "lucide-react";
import { useFileSystem } from "@/hooks/use-file-system";
import { useWebContainer } from "@/hooks/use-webcontainer";
import { usePyodide } from "@/hooks/use-pyodide";
import { useTheme } from "@/components/ui/theme";
import { Button } from "@/components/ui/button";
import { useRuntime } from "./runtime-context";
import { emit, useIdeEvent } from "./ide-events";
import { buildXtermTheme, terminalFontFamily } from "./xterm-theme";

export default function TerminalPanel() {
  const { files, activeFile } = useFileSystem();
  const { runtime } = useRuntime();
  const wc = useWebContainer();
  const py = usePyodide();
  const theme = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasOutput, setHasOutput] = useState(false);

  // Create the xterm instance once (browser only).
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !hostRef.current) return;
      const term = new Terminal({
        convertEol: true,
        fontSize: 13,
        fontFamily: terminalFontFamily(),
        theme: buildXtermTheme(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term;
      wc.attachTerminal(term);
      py.attachTerminal(term);
      // Hide the empty-state hint after the first output.
      const written = term.onWriteParsed(() => setHasOutput(true));
      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* container hidden */
        }
      });
      ro.observe(hostRef.current);
      cleanups.push(() => {
        written.dispose();
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

  // Re-apply the xterm theme when the app theme changes.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = buildXtermTheme();
  }, [theme]);

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
    setHasOutput(true);
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

  // Shell -> terminal: same as the Run button (no-op when busy or no active file).
  useIdeEvent("veda:run", () => {
    if (busy === null && activeFile) void run();
  });

  // Terminal -> shell: report every busy/error transition.
  useEffect(() => {
    if (error) emit("veda:runtime-status", { status: "error", message: error });
    else if (busy) emit("veda:runtime-status", { status: busy === "Running..." ? "running" : "booting", message: busy });
    else emit("veda:runtime-status", { status: "idle" });
  }, [busy, error]);

  return (
    <div id="terminal-panel" data-panel="terminal" className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-elevated pl-3 pr-2">
        <h2 className="flex h-full items-center border-b-2 border-accent text-ui font-medium text-fg">Terminal</h2>
        <span className="text-caption text-fg-3">{runtime === "node" ? "Node.js" : "Python"}</span>
        {busy && (
          <span role="status" className="flex min-w-0 items-center gap-1.5 text-caption text-warning">
            <Loader2 size={14} aria-hidden="true" className="shrink-0 animate-spin" />
            <span className="truncate">{busy}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={<Eraser size={14} aria-hidden="true" />} onClick={() => termRef.current?.clear()}>
            Clear
          </Button>
          <Button
            variant="success"
            size="sm"
            leadingIcon={<Play size={14} aria-hidden="true" />}
            onClick={run}
            disabled={!activeFile || busy !== null}
          >
            Run
          </Button>
        </div>
      </div>
      {error && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-danger/30 bg-danger-subtle px-3 py-1.5 text-caption text-danger">
          <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="wrap-anywhere min-w-0">{error}</span>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-x-2 bottom-0 top-1" />
        {!hasOutput && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-ui text-fg-3">
            Run your code to see output here
          </p>
        )}
      </div>
    </div>
  );
}
