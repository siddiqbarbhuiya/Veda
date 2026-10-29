"use client";

import { cn } from "@/lib/cn";

export type PanelTab<T extends string> = { id: T; label: string; icon?: React.ReactNode };

/** Tab strip for the AI panel. Arrow keys, Home and End move between tabs. */
export function PanelTabs<T extends string>({
  tabs,
  active,
  onChange,
  idPrefix = "ai-tab",
}: {
  tabs: PanelTab<T>[];
  active: T;
  onChange: (id: T) => void;
  idPrefix?: string;
}) {
  const move = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`${idPrefix}-${tabs[next].id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="AI assistant" className="flex min-w-0 items-center gap-0.5">
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={`${idPrefix}-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-ui font-medium transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-ring",
              selected ? "bg-accent-subtle text-accent-text" : "text-fg-2 hover:bg-fg/[0.07] hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
