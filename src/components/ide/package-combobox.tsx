"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export type ComboOption = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: { label: string; tone: BadgeTone };
};

/**
 * A search box with a list of suggestions (the ARIA combobox pattern).
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
  autoFocus,
}: {
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
  autoFocus?: boolean;
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
      <label htmlFor={`${uid}-input`} className="mb-1.5 block text-ui font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <input
          id={`${uid}-input`}
          role="combobox"
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
          autoFocus={autoFocus}
          className={cn(controlClass, "h-11 pl-9 pr-9 sm:h-9")}
        />
        {loading ? <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-fg-3" aria-label="Searching" /> : null}
      </div>

      {error ? (
        <p role="status" className="mt-1.5 text-caption text-warning">
          {error}
        </p>
      ) : null}
      {showEmpty ? (
        <p role="status" className="mt-1.5 text-caption text-fg-3">
          {emptyText}
        </p>
      ) : null}

      {showList ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="mt-1.5 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line-strong bg-sunken"
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
              className={cn("cursor-pointer px-3 py-2", i === active ? "bg-accent-subtle" : "hover:bg-fg/[0.05]")}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-ui font-medium text-fg">{o.title}</span>
                {o.meta ? <span className="shrink-0 text-caption text-fg-3">{o.meta}</span> : null}
                {o.badge ? (
                  <span className="ml-auto shrink-0">
                    <Badge tone={o.badge.tone}>{o.badge.label}</Badge>
                  </span>
                ) : null}
              </div>
              {o.subtitle ? <p className="truncate text-caption text-fg-3">{o.subtitle}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
