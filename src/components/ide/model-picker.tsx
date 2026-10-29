"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronUp } from "lucide-react";
import type { ModelItem } from "@/hooks/use-model-catalog";
import { cn } from "@/lib/cn";
import { controlClass } from "@/components/ui/field";

const MAX_ROWS = 80;

/** Case-insensitive match on label, model id and group. Words are matched one by one. */
export function filterItems(items: ModelItem[], query: string, freeOnly: boolean): ModelItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (freeOnly && !i.free) return false;
    const hay = `${i.label} ${i.model} ${i.group}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Model selector for the composer row. The list opens upward, above the button.
 * Search and "Free only" keep the 400+ OpenRouter models usable.
 */
export function ModelPicker({
  items,
  value,
  onChange,
  loading = false,
  disabled = false,
  label = "Model",
}: {
  items: ModelItem[];
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selected = items.find((i) => i.key === value);
  const anyFree = useMemo(() => items.some((i) => i.free), [items]);
  const matches = useMemo(() => filterItems(items, query, freeOnly), [items, query, freeOnly]);
  const shown = matches.slice(0, MAX_ROWS);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const choose = (item: ModelItem) => {
    onChange(item.key);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // IME: Enter confirms the composed character, not the choice.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const item = shown[active];
      if (item) choose(item);
    }
  };

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, listId]);

  const buttonText = selected ? selected.label : loading ? "Loading models…" : "No model";

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}: ${buttonText}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || (items.length === 0 && !loading)}
        onClick={() => {
          setActive(Math.max(0, shown.findIndex((i) => i.key === value)));
          setOpen((o) => !o);
        }}
        className={cn(
          controlClass,
          "flex h-8 items-center justify-between gap-1 px-2 text-left text-caption sm:h-8 sm:text-caption",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{buttonText}</span>
        {selected && selected.keyed === false ? (
          <span className="shrink-0 text-warning">no key</span>
        ) : null}
        <ChevronUp size={14} aria-hidden="true" className="shrink-0 text-fg-3" />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-40 mb-1 flex max-h-80 w-[min(22rem,calc(100vw-2rem))] flex-col rounded-lg border border-line-strong bg-overlay shadow-e2 animate-fade-in">
          <div className="flex flex-col gap-2 border-b border-line p-2">
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-label="Search models"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-opt-${active}` : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Search models…"
              className={cn(controlClass, "h-8 text-caption sm:h-8 sm:text-caption")}
            />
            {anyFree ? (
              <label className="flex cursor-pointer items-center gap-2 text-caption text-fg-2">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => {
                    setFreeOnly(e.target.checked);
                    setActive(0);
                  }}
                  className="size-3.5 accent-accent"
                />
                Free only
              </label>
            ) : null}
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-caption text-fg-3">No model matches.</li>
            ) : null}
            {shown.map((item, i) => {
              const heading = i === 0 || shown[i - 1].group !== item.group ? item.group : null;
              const isActive = i === active;
              return (
                <li key={item.key} role="presentation">
                  {heading ? (
                    <p className="px-3 pb-1 pt-2 text-overline font-semibold uppercase tracking-[0.08em] text-fg-3">
                      {heading}
                    </p>
                  ) : null}
                  <div
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={item.key === value}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-caption",
                      isActive ? "bg-accent-subtle text-fg" : "text-fg-2",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate" title={item.model}>
                      {item.label}
                    </span>
                    {item.free ? <span className="shrink-0 text-success">Free</span> : null}
                    {item.keyed === false ? <span className="shrink-0 text-warning">no key</span> : null}
                    {item.key === value ? <Check size={12} aria-hidden="true" className="shrink-0 text-accent-text" /> : null}
                  </div>
                </li>
              );
            })}
            {matches.length > MAX_ROWS ? (
              <li className="px-3 py-2 text-caption text-fg-3">
                Showing {MAX_ROWS} of {matches.length}. Type to narrow the list.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
