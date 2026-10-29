"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export type ComboOption = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: { label: string; tone: BadgeTone };
};

// Very small on purpose: the PACKAGES section has little room.
const TAG: Record<BadgeTone, string> = {
  neutral: "bg-fg/[0.08] text-fg-2",
  accent: "bg-accent-subtle text-accent-text",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
};

/**
 * A tiny search box with a list of suggestions (the ARIA combobox pattern).
 * Arrow keys move in the list. Enter on a suggestion picks it. Enter with no suggestion chosen submits the typed text.
 */
export function PackageCombobox({
  label,
  value,
  onChange,
  options,
  loading,
  error,
  placeholder,
  emptyText,
  onPick,
  onSubmit,
  inputRef,
}: {
  /** The name for screen readers. It is not drawn. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  loading: boolean;
  error: string | null;
  placeholder: string;
  /** Shown when the text is long enough, the search ended, and nothing matched. */
  emptyText?: string;
  onPick: (option: ComboOption) => void;
  onSubmit: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLUListElement>(null);

  // A new list starts with nothing chosen, so Enter submits the typed text.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(-1);
  }, [options]);

  // Keep the chosen row in view.
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const showList = open && options.length > 0;
  const showEmpty = open && !loading && !error && options.length === 0 && value.trim().length >= 2 && !!emptyText;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (options.length > 0) setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length > 0) setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0) onPick(options[active]);
      else onSubmit();
    } else if (e.key === "Escape" && (showList || showEmpty)) {
      // Close the list first. A second Escape closes the dialog.
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <input
          id={`${uid}-input`}
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${uid}-opt-${active}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-6 w-full rounded border border-control bg-sunken pl-6 pr-6 text-[11px] text-fg placeholder:text-fg-3 hover:border-accent-text/70 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
        />
        {loading ? <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-fg-3" aria-label="Searching" /> : null}
      </div>

      {error ? (
        <p role="status" className="mt-1 text-[10px] leading-tight text-warning">
          {error}
        </p>
      ) : null}
      {showEmpty ? (
        <p role="status" className="mt-1 text-[10px] leading-tight text-fg-3">
          {emptyText}
        </p>
      ) : null}

      {showList ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="mt-1 max-h-52 divide-y divide-line overflow-y-auto rounded border border-line-strong bg-sunken"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${uid}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              // Mouse down, not click: the input must not lose focus before the pick.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(o);
              }}
              onMouseMove={() => setActive(i)}
              className={cn("cursor-pointer px-2 py-1", i === active ? "bg-accent-subtle" : "hover:bg-fg/[0.05]")}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-fg">{o.title}</span>
                {o.meta ? <span className="shrink-0 text-[10px] text-fg-3">{o.meta}</span> : null}
                {o.badge ? (
                  <span className={cn("shrink-0 rounded px-1 text-[9px] leading-[14px]", TAG[o.badge.tone])}>{o.badge.label}</span>
                ) : null}
              </div>
              {o.subtitle ? <p className="truncate text-[10px] leading-tight text-fg-3">{o.subtitle}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
