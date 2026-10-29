"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useFileSystem } from "@/hooks/use-file-system";
import { peekWebContainer } from "@/hooks/use-webcontainer";
import {
  collectFsEntries,
  countFiles,
  createZip,
  exportFileName,
  flattenFileNodes,
  formatBytes,
  mergeEntries,
  totalBytes,
  type ZipEntry,
} from "@/lib/export/zip";

type Phase = "idle" | "reading" | "zipping" | "done" | "error";

// Runtime caches and shell history are not part of the user's project.
const ALWAYS_EXCLUDED = [".npm", ".cache", ".jsh_history"];

function download(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { files, projectName } = useFileSystem();
  const [includePackages, setIncludePackages] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [filesRead, setFilesRead] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ files: number; bytes: number; zipBytes: number; runtime: boolean; fileName: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const empty = flattenFileNodes(files).length === 0;

  const busy = phase === "reading" || phase === "zipping";

  // Focus the primary action (not the Close button) when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => primaryRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // The result is long. Show it, and the buttons under it, when the download ends.
  useEffect(() => {
    if (phase === "done") actionsRef.current?.scrollIntoView?.({ block: "end" });
  }, [phase]);

  function cancel() {
    abort.current?.abort();
    abort.current = null;
    setPhase("idle");
    setFilesRead(0);
  }

  function close() {
    abort.current?.abort();
    abort.current = null;
    setPhase("idle");
    setError(null);
    setResult(null);
    setFilesRead(0);
    onClose();
  }

  async function start() {
    if (empty) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase("reading");
    setError(null);
    setResult(null);
    setFilesRead(0);
    try {
      const editorEntries = flattenFileNodes(files);
      const wc = await peekWebContainer();
      let runtimeEntries: ZipEntry[] = [];
      if (wc) {
        runtimeEntries = await collectFsEntries(wc.fs, {
          excludes: includePackages ? ALWAYS_EXCLUDED : [...ALWAYS_EXCLUDED, "node_modules"],
          onProgress: setFilesRead,
          signal: controller.signal,
        });
      }
      // Files you edited in the editor win over the copy inside the runtime.
      const entries = mergeEntries(runtimeEntries, editorEntries);
      setPhase("zipping");
      const zipped = await createZip(entries, projectName);
      if (abort.current !== controller) return;
      const fileName = exportFileName(projectName);
      download(zipped, fileName);
      setResult({ files: countFiles(entries), bytes: totalBytes(entries), zipBytes: zipped.byteLength, runtime: wc !== null, fileName });
      setPhase("done");
    } catch (err) {
      // A newer run or a cancel owns the state now. Do not touch it.
      if (abort.current !== controller) return;
      setError(err instanceof Error ? err.message : "The export failed.");
      setPhase("error");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Export project as ZIP"
      description={`Download the whole project "${projectName}" (all files and folders) as one ZIP file.`}
      ariaLabel="Export project"
    >
      <div className="space-y-4">
        <ul className="space-y-1.5 text-sm text-fg-2">
          <li>Every file and folder in the editor.</li>
          <li>Files that your code made in the Node.js runtime, when it is running.</li>
        </ul>

        <label className="flex items-start gap-3 rounded-lg border border-line-strong bg-sunken p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--accent)]"
            checked={includePackages}
            disabled={busy}
            onChange={(e) => setIncludePackages(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium text-fg">Include installed packages (node_modules)</span>
            <span className="mt-0.5 block text-caption text-fg-3">
              This can be large and slow. You can restore packages with <code>npm install</code>.
            </span>
          </span>
        </label>

        <p className="text-caption text-fg-3">
          Python packages that you install in the browser are not included.
        </p>

        <div className="flex items-start gap-3 rounded-lg bg-warning-subtle p-3 text-sm text-fg">
          <HardDrive size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p>
            Your files are saved in this browser, and also to the cloud when cloud sync is on (see the status bar).
            A ZIP is a manual backup that you keep yourself.
          </p>
        </div>

        {empty ? <p className="text-sm text-fg-2">The project has no files to export.</p> : null}

        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-fg-2">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {phase === "reading" ? (
              <>
                Reading files... <span aria-hidden="true">{filesRead.toLocaleString("en-IN")}</span>
              </>
            ) : (
              "Creating the ZIP file..."
            )}
          </p>
        ) : null}

        {phase === "done" && result ? (
          <div role="status" className="space-y-2 rounded-lg border border-success/30 bg-success-subtle p-3 text-sm">
            <p className="flex items-start gap-2 font-medium text-success">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="wrap-anywhere">
                Saved as <span className="font-mono">{result.fileName}</span>
              </span>
            </p>
            <p className="text-fg-2">
              {result.files.toLocaleString("en-IN")} files, {formatBytes(result.bytes)} (ZIP size {formatBytes(result.zipBytes)}).
              {result.runtime ? "" : " The Node.js runtime was not running, so only editor files are included."}
            </p>
            <div className="text-fg">
              <p className="font-medium">Where is the file?</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-fg-2">
                <li>Your browser saved it. Veda cannot see the folder. It is usually your <b>Downloads</b> folder.</li>
                <li>
                  Chrome or Edge: press <kbd className="rounded border border-line-strong px-1 font-mono text-caption">Ctrl</kbd>+
                  <kbd className="rounded border border-line-strong px-1 font-mono text-caption">J</kbd>, then click <b>Show in folder</b> beside the file.
                </li>
                <li>
                  Firefox: press <kbd className="rounded border border-line-strong px-1 font-mono text-caption">Ctrl</kbd>+
                  <kbd className="rounded border border-line-strong px-1 font-mono text-caption">Shift</kbd>+
                  <kbd className="rounded border border-line-strong px-1 font-mono text-caption">Y</kbd>.
                </li>
                <li>Windows: right-click the ZIP file and choose <b>Extract All</b> to open the folder inside.</li>
                <li>To choose the folder each time, turn on &quot;Ask where to save each file&quot; in your browser download settings.</li>
              </ul>
            </div>
          </div>
        ) : null}

        {phase === "error" && error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div ref={actionsRef} className="flex justify-end gap-2 pt-1">
          {busy ? (
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={close}>
              {phase === "done" ? "Close" : "Not now"}
            </Button>
          )}
          <Button
            ref={primaryRef}
            variant="primary"
            loading={busy}
            leadingIcon={<Download size={16} aria-hidden="true" />}
            onClick={start}
            disabled={busy || empty}
          >
            {phase === "done" ? "Download again" : "Download ZIP"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
