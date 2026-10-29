"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Play,
  Plus,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import TopupModal from "@/components/payments/topup-modal";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { useRuntime, type Runtime } from "./runtime-context";
import { emit } from "./ide-events";
import { useRuntimeStatus } from "./use-runtime-status";
import { UserMenu } from "./user-menu";
import { formatPaise } from "./format";

const LOW_BALANCE_PAISE = 1000;

export default function Toolbar({
  projectName,
  onOpenPalette,
  onOpenExport,
  topupOpen,
  onTopupOpenChange,
}: {
  projectName: string;
  onOpenPalette: () => void;
  onOpenExport: () => void;
  topupOpen: boolean;
  onTopupOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const { runtime, setRuntime } = useRuntime();
  const { status } = useRuntimeStatus();
  const busy = status === "booting" || status === "running";
  const low = balance !== null && balance < LOW_BALANCE_PAISE;

  const loadProfile = useCallback(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, balance_paise")
        .eq("id", user.id)
        .single();
      setName(profile?.display_name ?? user.email ?? "User");
      setBalance(profile?.balance_paise ?? 0);
    });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return (
    <header
      id="toolbar"
      className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 text-ui"
    >
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark size={22} />
        <span className="font-display font-semibold">Veda</span>
        <ChevronRight size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
        <span className="max-w-32 truncate text-fg-2">{projectName}</span>
      </div>

      <Button
        variant="success"
        size="sm"
        className="ml-3 h-7! gap-1.5! px-2.5!"
        disabled={busy}
        onClick={() => emit("veda:run")}
        title="Run code (Ctrl Enter)"
        leadingIcon={
          busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )
        }
      >
        Run
        <span className="hidden lg:inline-flex">
          <Kbd className="border-app/30! bg-app/15! text-app!">Ctrl Enter</Kbd>
        </span>
      </Button>

      <span className="relative block">
        <select
          aria-label="Runtime"
          value={runtime}
          onChange={(e) => setRuntime(e.target.value as Runtime)}
          className="h-7 w-28 appearance-none rounded-md border border-control bg-sunken pl-2 pr-7 text-ui text-fg transition-colors hover:border-accent-text/70 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="node">Node.js</option>
          <option value="python">Python</option>
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-3"
        />
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        title="Command palette (Ctrl K)"
        className="flex h-7 items-center gap-2 rounded-md border border-line-strong bg-sunken px-2 text-fg-3 transition-colors hover:border-control hover:text-fg xl:w-72"
      >
        <Search size={14} aria-hidden="true" />
        <span className="hidden min-w-0 flex-1 truncate whitespace-nowrap text-left xl:block">
          Search files and commands
        </span>
        <span className="hidden xl:inline-flex">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>

      <span
        className={cn(
          "tnum inline-flex h-7 items-center gap-1.5 rounded-md px-2",
          low ? "bg-warning-subtle text-warning" : "bg-sunken text-fg-2",
        )}
      >
        {low ? <AlertTriangle size={14} aria-hidden="true" /> : <Wallet size={14} aria-hidden="true" />}
        <span data-testid="balance">{balance === null ? "..." : formatPaise(balance)}</span>
        {low ? <span className="text-caption">Low balance</span> : null}
      </span>

      <Button
        variant="primary"
        size="sm"
        className="h-7! px-2.5!"
        leadingIcon={<Plus size={14} aria-hidden="true" />}
        onClick={() => onTopupOpenChange(true)}
      >
        Add Credits
      </Button>
      <TopupModal open={topupOpen} onClose={() => onTopupOpenChange(false)} onSuccess={loadProfile} />

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Export project as ZIP"
        title="Export project as ZIP"
        onClick={onOpenExport}
      >
        <Download size={16} aria-hidden="true" />
      </Button>
      <ThemeToggle className="size-7!" />
      <Link
        href="/dashboard"
        aria-label="Settings"
        title="Settings"
        className="flex size-7 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-fg/[0.07] hover:text-fg"
      >
        <Settings size={16} aria-hidden="true" />
      </Link>
      <UserMenu name={name} />
    </header>
  );
}
