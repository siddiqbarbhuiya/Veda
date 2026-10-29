"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type MenuItem = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** For a radio menu: the current choice. */
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * A small menu that opens upward, above the composer. It is placed against the nearest positioned ancestor
 * (the sticky composer box), so it stays inside a narrow panel. The parent owns the open state.
 *
 * Keyboard: arrows, Home, End, Enter or Space to choose, Escape to close. A click outside `rootRef` closes it.
 */
export function MenuPopover({
  items,
  label,
  onClose,
  rootRef,
  radio = false,
  className,
}: {
  items: MenuItem[];
  label: string;
  onClose: () => void;
  /** The element that holds the trigger and the menu. A click outside it closes the menu. */
  rootRef: RefObject<HTMLElement | null>;
  radio?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((i) => i.checked)));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose, rootRef]);

  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (!items[i].disabled) break;
    }
    setActive(i);
  };

  const choose = (item: MenuItem | undefined) => {
    if (!item || item.disabled) return;
    item.onSelect();
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      aria-activedescendant={`menu-item-${items[active]?.id}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Home") {
          e.preventDefault();
          setActive(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setActive(items.length - 1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose(items[active]);
        }
      }}
      className={cn(
        "absolute bottom-full left-2 z-40 mb-1 w-64 max-w-[calc(100%-1rem)] rounded-lg border border-line-strong bg-overlay p-1 shadow-e2 outline-none animate-fade-in",
        className,
      )}
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          id={`menu-item-${item.id}`}
          role={radio ? "menuitemradio" : "menuitem"}
          aria-checked={radio ? !!item.checked : undefined}
          aria-disabled={item.disabled || undefined}
          onPointerEnter={() => !item.disabled && setActive(i)}
          onClick={() => choose(item)}
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5",
            i === active && !item.disabled ? "bg-accent-subtle" : "",
            item.disabled ? "cursor-not-allowed opacity-45" : "",
          )}
        >
          {item.icon ? <span className="mt-0.5 shrink-0 text-fg-3">{item.icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block text-ui text-fg">{item.label}</span>
            {item.description ? <span className="block text-caption text-fg-3">{item.description}</span> : null}
          </span>
          {item.checked ? <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" /> : null}
        </div>
      ))}
    </div>
  );
}
