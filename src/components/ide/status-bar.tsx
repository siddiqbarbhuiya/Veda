"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, FileCode2, Keyboard, Loader2, Sparkles } from "lucide-react";
import { useFileSystem } from "@/hooks/use-file-system";
import { useRuntime } from "./runtime-context";
import { useIdeEvent } from "./ide-events";
import { useRuntimeStatus } from "./use-runtime-status";
import { formatPaise } from "./format";
import { cn } from "@/lib/cn";

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
const cellButton = cn(cell, "flex transition-colors hover:bg-fg/[0.07] hover:text-fg active:bg-fg/[0.11]");

export function StatusBar({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  const { activeFile } = useFileSystem();
  const { runtime } = useRuntime();
  const { status, message } = useRuntimeStatus();
  const [chat, setChat] = useState<{ model?: string; lastCostPaise?: number }>({});
  useIdeEvent("veda:chat-status", (d) => setChat((prev) => ({ ...prev, ...d })));

  const view =
    status === "booting"
      ? { label: "Booting runtime...", icon: <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" /> }
      : status === "running"
        ? { label: "Running...", icon: <Loader2 size={14} className="animate-spin text-info" aria-hidden="true" /> }
        : status === "error"
          ? { label: "Error", icon: <AlertCircle size={14} className="text-danger" aria-hidden="true" /> }
          : { label: "Ready", icon: <CheckCircle2 size={14} className="text-success" aria-hidden="true" /> };

  return (
    <footer
      id="status-bar"
      className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-app"
    >
      <div className="flex h-full min-w-0 items-center">
        <span className={cn(cell, "flex")} role="status" title={message}>
          {view.icon}
          <span>{view.label}</span>
        </span>
        <span className={cn(cell, "hidden sm:flex")}>
          <Cpu size={14} aria-hidden="true" />
          {runtime === "node" ? "Node.js" : "Python"}
        </span>
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
        <button type="button" className={cellButton} onClick={onOpenShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
          <Keyboard size={14} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
