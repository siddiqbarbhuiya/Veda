"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DEFAULT_PROJECT_NAME, useFileSystem } from "@/hooks/use-file-system";
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
  const { files } = useFileSystem();
  const [includePackages, setIncludePackages] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [filesRead, setFilesRead] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ files: number; bytes: number; zipBytes: number; runtime: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const busy = phase === "reading" || phase === "zipping";

  function close() {
    abort.current?.abort();
    setPhase("idle");
    setError(null);
    setResult(null);
    setFilesRead(0);
    onClose();
  }

  async function start() {
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
      const zipped = await createZip(entries, DEFAULT_PROJECT_NAME);
      controller.signal.throwIfAborted();
      download(zipped, exportFileName(DEFAULT_PROJECT_NAME));
      setResult({ files: countFiles(entries), bytes: totalBytes(entries), zipBytes: zipped.byteLength, runtime: wc !== null });
      setPhase("done");
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "The export failed.");
      setPhase("error");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Export project"
      description="Download all your files and folders as one ZIP file."
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
            Your project is saved <strong>only in this browser</strong>. If you clear site data or use another device,
            the files are gone. Export a ZIP often to keep a backup.
          </p>
        </div>

        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-fg-2">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {phase === "reading" ? `Reading files... ${filesRead.toLocaleString("en-IN")}` : "Creating the ZIP file..."}
          </p>
        ) : null}

        {phase === "done" && result ? (
          <p role="status" className="flex items-start gap-2 text-sm text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              ZIP downloaded: {result.files.toLocaleString("en-IN")} files, {formatBytes(result.bytes)} (ZIP size{" "}
              {formatBytes(result.zipBytes)}).
              {result.runtime ? "" : " The Node.js runtime was not running, so only editor files are included."}
            </span>
          </p>
        ) : null}

        {phase === "error" && error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          {busy ? (
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={close}>
              {phase === "done" ? "Close" : "Not now"}
            </Button>
          )}
          <Button
            variant="primary"
            loading={busy}
            leadingIcon={<Download size={16} aria-hidden="true" />}
            onClick={start}
            disabled={busy}
          >
            {phase === "done" ? "Download again" : "Download ZIP"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
