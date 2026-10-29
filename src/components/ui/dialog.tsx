"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// Native <dialog>: focus trap, Escape, inert background and focus restore come from the browser.
export function Dialog({
  open,
  onClose,
  title,
  description,
  ariaLabel,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="veda-dialog"
      aria-label={ariaLabel ?? title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div
        className={cn(
          "veda-dialog-panel w-[min(34rem,calc(100vw-2rem))] rounded-xl bg-overlay p-6 text-fg shadow-e3",
          className,
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">{title}</h2>
            {description ? <p className="mt-1 text-sm text-fg-2">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
