"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FilePlus2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Window event with `{ code }` detail. The IDE shell may listen for it to insert code into the editor. */
export const INSERT_CODE_EVENT = "veda:insert-code";

type CopyState = "idle" | "copied" | "failed";

const actionClass =
  "flex h-6 items-center gap-1.5 rounded px-2 text-caption transition-colors duration-120 hover:bg-fg/[0.07] active:bg-fg/[0.11] disabled:opacity-50 disabled:hover:bg-transparent";

export function CodeBlock({
  code,
  language,
  streaming = false,
}: {
  code: string;
  language?: string;
  streaming?: boolean;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = (next: CopyState) => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), next === "failed" ? 2500 : 1500);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      flash("copied");
    } catch {
      flash("failed");
    }
  };

  const insert = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(INSERT_CODE_EVENT, { detail: { code } }));
  };

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-editor">
      <div className="flex h-7 items-center justify-between border-b border-line bg-sunken pl-3 pr-1">
        <span className="text-caption text-fg-3">{language || "text"}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={insert}
            disabled={streaming}
            className={cn(actionClass, "text-fg-2 hover:text-fg")}
          >
            <FilePlus2 size={14} aria-hidden="true" />
            Insert
          </button>
          <button
            type="button"
            onClick={copy}
            className={cn(
              actionClass,
              state === "copied" ? "text-success" : state === "failed" ? "text-danger" : "text-fg-2 hover:text-fg",
            )}
          >
            {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
          </button>
          <span role="status" className="sr-only">
            {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
          </span>
        </div>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}
