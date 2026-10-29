"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Files, MessageSquare, Search, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const item =
  "group relative flex size-10 items-center justify-center rounded-md text-fg-3 transition-colors duration-150 " +
  "hover:bg-fg/[0.07] hover:text-fg active:bg-fg/[0.11]";

function Indicator({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -left-1 top-2 h-6 w-0.5 rounded-full bg-accent transition-opacity duration-150",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

function ToggleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const active = !!pressed;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(item, active && "text-fg")}
    >
      <Indicator active={active} />
      {children}
    </button>
  );
}

export function ActivityBar({
  sidebarOpen,
  chatOpen,
  onToggleSidebar,
  onToggleChat,
  onOpenPalette,
}: {
  sidebarOpen: boolean;
  chatOpen: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <nav
      aria-label="Activity bar"
      className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-line bg-app py-2"
    >
      <div className="flex flex-col items-center gap-1">
        <ToggleButton label="Files" pressed={sidebarOpen} onClick={onToggleSidebar}>
          <Files size={20} aria-hidden="true" />
        </ToggleButton>
        <ToggleButton label="AI Chat" pressed={chatOpen} onClick={onToggleChat}>
          <MessageSquare size={20} aria-hidden="true" />
        </ToggleButton>
        <ToggleButton label="Command palette" onClick={onOpenPalette}>
          <Search size={20} aria-hidden="true" />
        </ToggleButton>
      </div>
      <Link href="/dashboard" aria-label="Dashboard" title="Dashboard" className={item}>
        <Settings size={20} aria-hidden="true" />
      </Link>
    </nav>
  );
}
