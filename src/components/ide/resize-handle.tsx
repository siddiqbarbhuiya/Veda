"use client";

import { Separator } from "react-resizable-panels";
import { cn } from "@/lib/cn";

/** 1px line with an invisible hit area (set on the Group). Accent on hover, drag and keyboard focus. */
export function ResizeHandle({
  direction,
  id,
  label,
}: {
  direction: "vertical" | "horizontal";
  id: string;
  label: string;
}) {
  return (
    <Separator
      id={id}
      aria-label={label}
      className={cn(
        "relative z-20 shrink-0 bg-line outline-none transition-colors duration-120",
        "data-[separator=hover]:bg-accent data-[separator=active]:bg-accent data-[separator=focus]:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-ring",
        direction === "vertical" ? "w-px" : "h-px",
      )}
    />
  );
}
