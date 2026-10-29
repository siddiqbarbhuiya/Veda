import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-sunken px-1 font-mono text-overline font-medium text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
