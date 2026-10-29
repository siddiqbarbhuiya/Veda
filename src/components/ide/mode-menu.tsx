"use client";

import { useRef, useState } from "react";
import { Hand, ListChecks, Pencil, Zap } from "lucide-react";
import { AGENT_MODES, modeInfo, type AgentMode } from "@/lib/agent/modes";
import { MenuPopover } from "./menu-popover";

const ICONS: Record<AgentMode, React.ReactNode> = {
  manual: <Hand size={14} aria-hidden="true" />,
  edits: <Pencil size={14} aria-hidden="true" />,
  plan: <ListChecks size={14} aria-hidden="true" />,
  auto: <Zap size={14} aria-hidden="true" />,
};

/**
 * How much Claude Code may do without asking: a small button in the composer footer that opens a menu.
 * Manual asks for everything, Edits runs edits, Plan only plans, Auto never asks.
 */
export function ModeMenu({ value, onChange, disabled = false }: { value: AgentMode; onChange: (mode: AgentMode) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const info = modeInfo(value);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Permission mode: ${info.label}`}
        title={`${info.label}: ${info.description}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 items-center gap-1 rounded px-1.5 text-caption text-fg-2 transition-colors hover:bg-fg/[0.07] hover:text-fg focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-45"
      >
        <span className="text-fg-3">{ICONS[value]}</span>
        {info.short}
      </button>
      {open ? (
        <MenuPopover
          label="Permission mode"
          radio
          rootRef={rootRef}
          onClose={close}
          className="left-auto right-2"
          items={AGENT_MODES.map((m) => ({
            id: m.id,
            label: m.label,
            description: m.description,
            icon: ICONS[m.id],
            checked: m.id === value,
            onSelect: () => onChange(m.id),
          }))}
        />
      ) : null}
    </div>
  );
}
