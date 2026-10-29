"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to show */
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-editor">
      <div className="flex h-7 items-center justify-between border-b border-line bg-sunken pl-3 pr-1">
        <span className="text-caption text-fg-3">{language || "text"}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded px-2 text-caption transition-colors duration-120 hover:bg-fg/[0.07] active:bg-fg/[0.11]",
            copied ? "text-success" : "text-fg-2 hover:text-fg",
          )}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}
