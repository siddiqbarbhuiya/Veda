"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { AlertCircle, Eraser, Loader2, Play, Square, X } from "lucide-react";
import { useFileSystem } from "@/hooks/use-file-system";
import { useWebContainer, isIsolationError, type RunningCommand } from "@/hooks/use-webcontainer";
import { usePyodide, PYODIDE_DOWNLOAD_ERROR } from "@/hooks/use-pyodide";
import { nodePath, runtimeForFile, type RunKind } from "@/hooks/run-helpers";
import { useTheme } from "@/components/ui/theme";
import { Button } from "@/components/ui/button";
import { useRuntime } from "./runtime-context";
import { emit, useIdeEvent } from "./ide-events";
import { buildXtermTheme, terminalFontFamily } from "./xterm-theme";

const BOOT_LABEL = "Booting Node.js runtime...";
const RUNNING_LABEL = "Running...";
const PY_LOADING_LABEL = "Loading Python (about 10 s on first run)...";

type PanelError = { message: string; kind: "isolation" | "boot" | "python-load" | "run" };
type Busy = Record<RunKind, string | null>;

function dim(term: Terminal, text: string) {
  term.writeln(`\x1b[90m${text}\x1b[0m`);
}

export default function TerminalPanel() {
  const { files, activeFile } = useFileSystem();
  const { runtime, setRuntime } = useRuntime();
  const wc = useWebContainer();
  const py = usePyodide();
  const theme = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const procRef = useRef<RunningCommand | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const [busy, setBusy] = useState<Busy>({ node: null, python: null });
  const busyRef = useRef<Busy>({ node: null, python: null });
  const [hasOutput, setHasOutput] = useState(false);
  const [termReady, setTermReady] = useState(false);
  const [bootNonce, setBootNonce] = useState(0);

  // The latest values for stable callbacks.
  const latest = useRef({ files, activeFile, runtime });
  useEffect(() => {
    latest.current = { files, activeFile, runtime };
  });

  const setBusyFor = useCallback((kind: RunKind, label: string | null) => {
    busyRef.current = { ...busyRef.current, [kind]: label };
    setBusy(busyRef.current);
  }, []);

  // Create the xterm instance once (browser only).
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !hostRef.current) return;
      const host = hostRef.current;
      const term = new Terminal({
        convertEol: true,
        fontSize: 13,
        fontFamily: terminalFontFamily(),
        theme: buildXtermTheme(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      const safeFit = () => {
        // A collapsed panel has no size. Fitting then would shrink the buffer to 1 row.
        if (host.clientWidth === 0 || host.clientHeight === 0) return;
        try {
          fit.fit();
        } catch {
          /* container hidden */
        }
      };
      safeFit();
      termRef.current = term;
      wc.attachTerminal(term);
      py.attachTerminal(term);
      // Hide the empty-state hint after the first output.
      const written = term.onWriteParsed(() => setHasOutput(true));
      const ro = new ResizeObserver(safeFit);
      ro.observe(host);
      cleanups.push(() => {
        written.dispose();
        ro.disconnect();
        term.dispose();
        termRef.current = null;
        wc.attachTerminal(null);
        py.attachTerminal(null);
      });
      setTermReady(true);
    })();
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
    };
  }, [wc, py]);

  // Re-apply the xterm theme when the app theme changes.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = buildXtermTheme();
  }, [theme]);

  // In Node mode, boot the runtime and attach the interactive shell.
  useEffect(() => {
    wc.setShellActive(runtime === "node");
    if (runtime !== "node" || !termReady) return;
    let cancelled = false;
    (async () => {
      if (busyRef.current.node === null) setBusyFor("node", BOOT_LABEL);
      try {
        await wc.writeFiles(latest.current.files);
        if (cancelled || !termRef.current) return;
        await wc.startShell(termRef.current);
      } catch (e) {
        if (cancelled) return;
        if (isIsolationError(e)) setError({ message: (e as Error).message, kind: "isolation" });
        else
          setError({
            message: `Node.js runtime unavailable: ${e instanceof Error ? e.message : String(e)}. WebContainers need a supported browser (not incognito).`,
            kind: "boot",
          });
      } finally {
        if (busyRef.current.node === BOOT_LABEL) setBusyFor("node", null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime, termReady, bootNonce, wc, setBusyFor]);

  const run = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const { files: projectFiles, activeFile: file, runtime: current } = latest.current;
    setHasOutput(true);
    if (!file || file.type !== "file") {
      dim(term, "Open a file first, then press Run.");
      return;
    }
    if (busyRef.current.node || busyRef.current.python) {
      dim(term, "The runtime is busy. Wait for it, or press Stop.");
      return;
    }
    const kind = runtimeForFile(file.name);
    if (!kind) {
      term.writeln(`\x1b[31mThis file type cannot be run: ${file.name}. Run .js, .mjs, .cjs or .py files.\x1b[0m`);
      return;
    }
    if (kind !== current) {
      setRuntime(kind);
      dim(term, `Switched to ${kind === "node" ? "Node.js" : "Python"} to run ${file.name}.`);
    }
    setError(null);
    try {
      if (kind === "node") {
        setBusyFor("node", RUNNING_LABEL);
        await wc.writeFiles(projectFiles);
        dim(term, `$ node ${nodePath(file.path)}`);
        const cmd = await wc.runCommand("node", [nodePath(file.path)]);
        procRef.current = cmd;
        const code = await cmd.exit;
        dim(term, `exited with code ${code}`);
      } else {
        setBusyFor("python", PY_LOADING_LABEL);
        await py.load();
        setBusyFor("python", RUNNING_LABEL);
        dim(term, "Python runs in the page: infinite loops cannot be stopped; reload if it freezes.");
        dim(term, `>>> ${file.path}`);
        const result = await py.runCode(file.content ?? "", projectFiles);
        if (result.ok) {
          dim(term, "exited with code 0");
        } else {
          dim(term, "exited with code 1");
          setError({ message: `Python error: ${result.message}`, kind: "run" });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isIsolationError(e)) setError({ message: msg, kind: "isolation" });
      else if (msg === PYODIDE_DOWNLOAD_ERROR) setError({ message: msg, kind: "python-load" });
      else setError({ message: `${kind === "node" ? "Node.js" : "Python"} runtime failed: ${msg}`, kind: "run" });
    } finally {
      procRef.current = null;
      setBusyFor(kind, null);
    }
  }, [wc, py, setRuntime, setBusyFor]);

  const stop = useCallback(() => {
    procRef.current?.kill();
  }, []);

  // Shell -> terminal: same as the Run button.
  useIdeEvent("veda:run", () => {
    void run();
  });
  useIdeEvent("veda:stop", stop);

  const busyLabel = busy.node ?? busy.python;
  const nodeRunning = busy.node === RUNNING_LABEL;

  // Terminal -> shell: report every busy/error transition.
  useEffect(() => {
    if (error) emit("veda:runtime-status", { status: "error", message: error.message });
    else if (busyLabel) emit("veda:runtime-status", { status: busyLabel === RUNNING_LABEL ? "running" : "booting", message: busyLabel });
    else emit("veda:runtime-status", { status: "idle" });
  }, [busyLabel, error]);

  const noFile = !activeFile || activeFile.type !== "file";

  return (
    <div id="terminal-panel" data-panel="terminal" className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-elevated pl-3 pr-2">
        <h2 className="flex h-full items-center border-b-2 border-accent text-ui font-medium text-fg">Terminal</h2>
        <span className="text-caption text-fg-3">{runtime === "node" ? "Node.js" : "Python"}</span>
        {busyLabel && (
          <span role="status" className="flex min-w-0 items-center gap-1.5 text-caption text-warning">
            <Loader2 size={14} aria-hidden="true" className="shrink-0 animate-spin" />
            <span className="truncate">{busyLabel}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={<Eraser size={14} aria-hidden="true" />} onClick={() => termRef.current?.clear()}>
            Clear
          </Button>
          {nodeRunning && (
            <Button variant="danger" size="sm" leadingIcon={<Square size={14} aria-hidden="true" />} onClick={stop}>
              Stop
            </Button>
          )}
          <span title={noFile ? "Open a file to run it" : undefined}>
            <Button
              variant="success"
              size="sm"
              leadingIcon={<Play size={14} aria-hidden="true" />}
              onClick={run}
              disabled={noFile || busyLabel !== null}
            >
              Run
            </Button>
          </span>
        </div>
      </div>
      {error && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-danger/30 bg-danger-subtle px-3 py-1.5 text-caption text-danger">
          <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="wrap-anywhere min-w-0 flex-1">{error.message}</span>
          {error.kind === "isolation" && (
            <Button variant="secondary" size="xs" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          )}
          {error.kind === "boot" && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                setError(null);
                setBootNonce((n) => n + 1);
              }}
            >
              Retry
            </Button>
          )}
          {error.kind === "python-load" && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                setError(null);
                void run();
              }}
            >
              Retry
            </Button>
          )}
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="shrink-0 rounded-sm p-0.5 hover:bg-danger/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={14} aria-hidden="true" />
          </button>
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
