"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { FileIcon } from "./file-icon";

export type EditorTab = { path: string; name: string };

/** Internal event: the file tree clicked a file (also when it is already the active file). */
export const FILE_OPENED_EVENT = "veda:file-opened";

export function EditorTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
}: {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = listRef.current?.querySelectorAll<HTMLElement>("[role='tab']");
    els?.forEach((el) => {
      if (el.dataset.path === activePath) el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  }, [activePath, tabs.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = tabs.findIndex((t) => t.path === activePath);
    if (i < 0) return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onSelect(next.path);
    requestAnimationFrame(() => {
      listRef.current?.querySelectorAll<HTMLElement>("[role='tab']").forEach((el) => {
        if (el.dataset.path === next.path) el.focus();
      });
    });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Open files"
      onKeyDown={onKeyDown}
      className="flex h-9 shrink-0 overflow-x-auto overflow-y-hidden border-b border-line bg-sunken [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const active = t.path === activePath;
        return (
          <div
            key={t.path}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(t.path);
              }
            }}
            className={cn(
              "group relative flex h-9 min-w-0 max-w-[200px] shrink-0 items-center border-r border-t-2 border-r-line text-ui transition-colors duration-120",
              active
                ? "border-t-accent bg-editor text-fg"
                : "border-t-transparent text-fg-3 hover:bg-elevated hover:text-fg",
            )}
          >
            <button
              role="tab"
              type="button"
              aria-selected={active}
              data-path={t.path}
              tabIndex={active ? 0 : -1}
              title={t.path}
              onClick={() => onSelect(t.path)}
              className="flex h-full min-w-0 items-center gap-1.5 pl-3 pr-7 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <FileIcon name={t.name} size={14} />
              <span className="truncate">{t.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${t.name}`}
              title="Close"
              onClick={() => onClose(t.path)}
              className={cn(
                "absolute right-1 flex size-5 items-center justify-center rounded text-fg-3 outline-none transition-opacity duration-120 hover:bg-fg/[0.1] hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
                active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
