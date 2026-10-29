"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Wallet,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { useFileSystem } from "@/hooks/use-file-system";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { useRuntime, type Runtime } from "./runtime-context";
import { useIdeEvent, useRuntimeState } from "./ide-events";
import { UserMenu } from "./user-menu";
import { formatPaise } from "./format";
import { shortcutKeys, shortcutLabel } from "./use-ide-shortcuts";

const LOW_BALANCE_PAISE = 1000;

export default function Toolbar({
  projectName,
  onOpenProjects,
  onOpenPalette,
  onOpenExport,
  onRun,
  onStop,
}: {
  projectName: string;
  onOpenProjects: () => void;
  onOpenPalette: () => void;
  onOpenExport: () => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const [name, setName] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const userId = useRef<string | null>(null);
  const requestId = useRef(0);
  const { runtime, setRuntime } = useRuntime();
  const { status } = useRuntimeState();
  const { activeFile } = useFileSystem();
  const busy = status === "booting" || status === "running";
  const low = balance !== null && balance < LOW_BALANCE_PAISE;
  const noFile = !activeFile;

  const loadProfile = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const supabase = createBrowserClient();
      if (!userId.current) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw error ?? new Error("No user");
        userId.current = data.user.id;
        if (id === requestId.current) setName((n) => n || data.user.email || "User");
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("display_name, balance_paise")
        .eq("id", userId.current)
        .single();
      if (id !== requestId.current) return;
      if (error || !profile || typeof profile.balance_paise !== "number") throw error ?? new Error("No profile");
      setName(profile.display_name ?? "User");
      setBalance(profile.balance_paise);
      setBalanceError(false);
    } catch {
      // Keep the last known balance. Never show a false "Rs 0.00".
      if (id === requestId.current) setBalanceError(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadProfile(), 0);
    const ids = requestId;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadProfile();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      ids.current++;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProfile]);

  useIdeEvent("veda:balance-changed", () => void loadProfile());

  const runKeys = shortcutKeys("run").join(" ");
  const unavailable = balanceError && balance === null;

  return (
    <header
      id="toolbar"
      className="flex h-10 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-line bg-panel px-3 text-ui"
    >
      <div className="flex min-w-0 shrink items-center gap-2">
        <LogoMark size={22} />
        <span className="font-display font-semibold">Veda</span>
        <ChevronRight size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
        <button
          type="button"
          onClick={onOpenProjects}
          title="Switch or create a project"
          aria-label={`Project ${projectName}. Switch or create a project`}
          className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-fg-2 hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="max-w-24 truncate lg:max-w-32">{projectName}</span>
          <ChevronDown size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
        </button>
      </div>

      <Button
        variant="success"
        size="sm"
        className="ml-2 h-7! gap-1.5! px-2.5! lg:ml-3"
        disabled={busy || noFile}
        onClick={onRun}
        title={noFile ? "Open a file to run" : `Run code (${shortcutLabel("run")})`}
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
          <Kbd className="border-app/30! bg-app/15! text-app!">{runKeys}</Kbd>
        </span>
      </Button>

      {busy ? (
        <Button
          variant="danger"
          size="sm"
          className="h-7! gap-1.5! px-2.5!"
          onClick={onStop}
          title="Stop the running program"
          aria-label="Stop"
          leadingIcon={<Square size={14} aria-hidden="true" />}
        >
          <span className="hidden lg:inline">Stop</span>
        </Button>
      ) : null}

      <span className="relative block shrink-0">
        <select
          aria-label="Runtime"
          value={runtime}
          disabled={busy}
          onChange={(e) => setRuntime(e.target.value as Runtime)}
          className="h-7 w-28 appearance-none rounded-md border border-control bg-sunken pl-2 pr-7 text-ui text-fg transition-colors hover:border-accent-text/70 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
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

      <div className="min-w-0 flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        title={`Command palette (${shortcutLabel("palette")})`}
        className="flex h-7 shrink-0 items-center gap-2 rounded-md border border-line-strong bg-sunken px-2 text-fg-3 transition-colors hover:border-control hover:text-fg focus-visible:outline-2 focus-visible:outline-ring xl:w-72"
      >
        <Search size={14} aria-hidden="true" />
        <span className="hidden min-w-0 flex-1 truncate whitespace-nowrap text-left xl:block">
          Search files and commands
        </span>
        <span className="hidden xl:inline-flex">
          <Kbd>{shortcutKeys("palette").join(" ")}</Kbd>
        </span>
      </button>

      <span
        className={cn(
          "tnum inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2",
          low || unavailable ? "bg-warning-subtle text-warning" : "bg-sunken text-fg-2",
        )}
        title={low ? "Low balance" : unavailable ? "Balance unavailable" : undefined}
      >
        {low || unavailable ? (
          <AlertTriangle size={14} aria-hidden="true" />
        ) : (
          <Wallet size={14} aria-hidden="true" />
        )}
        <span data-testid="balance">
          {balance !== null ? (
            formatPaise(balance)
          ) : unavailable ? (
            <>
              <span className="lg:hidden">Unavailable</span>
              <span className="hidden lg:inline">Balance unavailable</span>
            </>
          ) : (
            "..."
          )}
        </span>
        {low ? <span className="hidden text-caption lg:inline">Low balance</span> : null}
        {balanceError ? (
          <button
            type="button"
            onClick={() => void loadProfile()}
            aria-label="Retry loading balance"
            title="Retry loading balance"
            className="-mr-1 flex size-5 items-center justify-center rounded hover:bg-fg/[0.07] focus-visible:outline-2 focus-visible:outline-ring"
          >
            <RefreshCw size={12} aria-hidden="true" />
          </button>
        ) : null}
      </span>

      {/* Plain anchor: Razorpay checkout cannot load under the IDE COEP header. */}
      <a
        href="/dashboard?topup=1"
        title="Add credits"
        className={buttonStyles({
          variant: "primary",
          size: "sm",
          className: "h-7! shrink-0 gap-1.5! px-2! lg:px-2.5!",
        })}
      >
        <Plus size={14} aria-hidden="true" />
        <span className="sr-only lg:not-sr-only">Add Credits</span>
      </a>

      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Export project as ZIP"
        title="Export project as ZIP"
        onClick={onOpenExport}
      >
        <Download size={16} aria-hidden="true" />
      </Button>
      <ThemeToggle className="size-7! shrink-0" />
      <UserMenu name={name} />
    </header>
  );
}
