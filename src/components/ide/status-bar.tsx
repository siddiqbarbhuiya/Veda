"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  WifiOff,
  CloudOff,
  CloudUpload,
  Cpu,
  FileCode2,
  Keyboard,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useFileSystem } from "@/hooks/use-file-system";
import { useRuntime } from "./runtime-context";
import { useChatState, useIdeEvent, useRuntimeState } from "./ide-events";
import { formatPaise } from "./format";
import { cn } from "@/lib/cn";
import { shortcutLabel } from "./use-ide-shortcuts";

const LANGS: Record<string, string> = {
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  jsx: "JavaScript React",
  ts: "TypeScript",
  tsx: "TypeScript React",
  py: "Python",
  json: "JSON",
  md: "Markdown",
  html: "HTML",
  css: "CSS",
  txt: "Plain Text",
};

function languageOf(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANGS[ext] ?? "Plain Text";
}

const cell = "h-full items-center gap-1.5 px-2 text-caption text-fg-2";
const cellButton = cn(
  cell,
  "flex transition-colors hover:bg-fg/[0.07] hover:text-fg active:bg-fg/[0.11] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
);

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function StatusBar({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  const fs = useFileSystem();
  const { activeFile, syncNow } = fs;
  // `conflict` and `message` come from the file system hook. `dirty` is optional.
  const sync = fs.sync as typeof fs.sync & { conflict?: boolean; message?: string };
  const dirty = ((fs as unknown as { dirty?: boolean }).dirty ?? false) || sync.status === "error";
  const { runtime } = useRuntime();
  const { status, message } = useRuntimeState();
  const chat = useChatState();
  const online = useOnline();
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useIdeEvent("veda:saved", () => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  });
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const view =
    status === "booting"
      ? { label: "Booting runtime...", icon: <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" /> }
      : status === "running"
        ? { label: "Running...", icon: <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" /> }
        : status === "error"
          ? { label: message ? `Error: ${message}` : "Error", icon: <AlertCircle size={14} className="shrink-0 text-danger" aria-hidden="true" /> }
          : { label: "Ready", icon: <CheckCircle2 size={14} className="text-success" aria-hidden="true" /> };

  const cloud =
    sync.status === "syncing"
      ? { label: "Saving to cloud...", icon: <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" /> }
      : sync.status === "synced"
        ? { label: "Saved to cloud", icon: <Cloud size={14} className="text-success" aria-hidden="true" /> }
        : sync.status === "error"
          ? { label: "Cloud save failed", icon: <CloudOff size={14} className="text-danger" aria-hidden="true" /> }
          : sync.status === "off"
            ? { label: "Cloud sync off", icon: <CloudOff size={14} className="text-warning" aria-hidden="true" /> }
            : { label: "Not in cloud yet", icon: <CloudUpload size={14} aria-hidden="true" /> };
  const cloudLabel = sync.message || cloud.label;
  const inactive = sync.status === "syncing" || sync.status === "off";
  // The raw error text stays in the title only.
  const cloudTitle =
    sync.error ??
    (sync.lastSyncedAt
      ? `Last saved to the cloud at ${new Date(sync.lastSyncedAt).toLocaleTimeString("en-IN")}. Click to save now.`
      : "Click to save to the cloud now.");

  return (
    <footer
      id="status-bar"
      className="flex h-6 shrink-0 items-center justify-between overflow-hidden border-t border-line bg-app"
    >
      <div className="flex h-full min-w-0 items-center">
        <span className={cn(cell, "flex min-w-0")} role="status" title={message}>
          {view.icon}
          <span className="max-w-48 truncate lg:max-w-80">{view.label}</span>
        </span>
        <span className={cn(cell, "hidden sm:flex")}>
          <Cpu size={14} aria-hidden="true" />
          {runtime === "node" ? "Node.js" : "Python"}
        </span>
        <button
          type="button"
          className={cn(cellButton, inactive && "cursor-default")}
          onClick={() => {
            if (!inactive) void syncNow();
          }}
          aria-disabled={inactive}
          title={cloudTitle}
          aria-label={cloudLabel}
        >
          {cloud.icon}
          <span className="hidden max-w-60 truncate md:inline">{cloudLabel}</span>
          {dirty ? (
            <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" aria-hidden="true" />
          ) : null}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {cloudLabel}
          {dirty ? ". Unsaved changes." : ""}
          {saved ? " Saved." : ""}
        </span>
        {saved ? (
          <span className={cn(cell, "flex text-success")} aria-hidden="true">
            <CheckCircle2 size={14} />
            Saved
          </span>
        ) : null}
        {sync.conflict ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={cn(cellButton, "bg-warning-subtle text-warning hover:text-warning")}
          >
            <AlertCircle size={14} aria-hidden="true" />
            Changed in another tab. Reload.
          </button>
        ) : null}
        {!online ? (
          <span className={cn(cell, "flex text-warning")} title="You are offline. Changes stay on this device.">
            <WifiOff size={14} aria-hidden="true" />
            Offline
          </span>
        ) : null}
      </div>
      <div className="flex h-full min-w-0 items-center">
        {activeFile ? (
          <span className={cn(cell, "flex min-w-0")}>
            <FileCode2 size={14} className="shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">{languageOf(activeFile.name)}</span>
            <span className="max-w-40 truncate text-fg">{activeFile.name}</span>
          </span>
        ) : null}
        {chat.model ? (
          <span className={cn(cell, "hidden lg:flex")}>
            <Sparkles size={14} aria-hidden="true" />
            <span className="max-w-48 truncate">{chat.model}</span>
          </span>
        ) : null}
        {typeof chat.lastCostPaise === "number" ? (
          <span className={cn(cell, "tnum hidden lg:flex")} title="Cost of the last AI reply">
            Last reply {formatPaise(chat.lastCostPaise)}
          </span>
        ) : null}
        <button
          type="button"
          className={cellButton}
          onClick={onOpenShortcuts}
          aria-label="Keyboard shortcuts"
          title={`Keyboard shortcuts (${shortcutLabel("shortcuts")})`}
        >
          <Keyboard size={14} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
