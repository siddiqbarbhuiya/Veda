"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Loader2, LogOut } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useFileSystem } from "@/hooks/use-file-system";

/**
 * Sign out in four steps: flush the files, end the session, clear the local copy (only when the
 * cloud copy is safe), then a hard navigation. The hard navigation also drops the WebContainer
 * and Pyodide memory, so the next user on a shared PC sees nothing of this user.
 */
export function useSignOut() {
  const { flushNow, clearLocal } = useFileSystem();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const signOut = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const { cloudOk } = await flushNow();
      const { error: authError } = await createBrowserClient().auth.signOut();
      if (authError) throw authError;
      if (cloudOk) await clearLocal();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full navigation is required (COOP/COEP)
      window.location.assign("/login");
    } catch (err) {
      busy.current = false;
      setPending(false);
      setError(err instanceof Error && err.message ? `Sign out failed. ${err.message}` : "Sign out failed. Try again.");
    }
  }, [flushNow, clearLocal]);

  return { signOut, pending, error };
}

export function UserMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { signOut, pending, error } = useSignOut();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Move focus to the first item when the menu opens.
    items()[0]?.focus();
    const onDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      close(true);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const move = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(list.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex size-7 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-text transition-colors hover:bg-accent hover:text-accent-fg focus-visible:outline-2 focus-visible:outline-ring"
      >
        {(name[0] ?? "?").toUpperCase()}
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="User menu"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-9 z-40 w-56 animate-scale-in rounded-lg border border-line-strong bg-overlay p-1 shadow-e2"
        >
          <div className="truncate px-2 py-1.5 text-caption text-fg-3">{name}</div>
          <button
            type="button"
            role="menuitem"
            aria-disabled={pending}
            onClick={() => {
              if (!pending) void signOut();
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-ui text-fg-2 hover:bg-fg/[0.07] hover:text-fg focus-visible:bg-fg/[0.07] focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-ring"
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <LogOut size={14} aria-hidden="true" />
            )}
            {pending ? "Signing out..." : "Sign out"}
          </button>
          {error ? (
            <p role="alert" className="px-2 py-1.5 text-caption text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
