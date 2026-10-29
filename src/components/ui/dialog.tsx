"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/*
 * Native <dialog>: focus trap, inert background and focus restore come from the browser.
 *
 * Contract:
 * - The parent owns the `open` state. onClose is called ONCE per user close request.
 * - dismissible (default true): when false, Escape and backdrop clicks do nothing.
 *   The Close button still calls onClose, so the parent can guard it (for example while busy).
 * - Escape is routed through the native `cancel` event (default prevented) and then onClose,
 *   so the native dialog never closes by itself while `open` is still true.
 * - Backdrop close needs pointerdown AND click on the backdrop (a text-selection drag that
 *   ends on the backdrop does not close).
 * - initialFocusRef: element to focus when the dialog opens. Default is the browser choice.
 * - Name: aria-labelledby the title (and aria-describedby the description). If ariaLabel is passed,
 *   aria-label is used instead.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  ariaLabel,
  className,
  dismissible = true,
  initialFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  ariaLabel?: string;
  className?: string;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pointerDownOnBackdrop = useRef(false);
  const closingFromProp = useRef(false);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      initialFocusRef?.current?.focus();
    }
    if (!open && dialog.open) {
      closingFromProp.current = true;
      dialog.close();
    }
    // initialFocusRef is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="veda-dialog"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        // Escape: the parent decides. Keep the native dialog open until `open` becomes false.
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        // Native close that we did not cause (for example <form method="dialog">): tell the parent once.
        if (closingFromProp.current) {
          closingFromProp.current = false;
          return;
        }
        onClose();
      }}
      onPointerDown={(event) => {
        pointerDownOnBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        const fromBackdrop = pointerDownOnBackdrop.current && event.target === ref.current;
        pointerDownOnBackdrop.current = false;
        if (fromBackdrop && dismissible) onClose();
      }}
    >
      <div
        className={cn(
          "veda-dialog-panel max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-overlay p-6 text-fg shadow-e3",
          className,
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-fg-2">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm-touch"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-1"
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
