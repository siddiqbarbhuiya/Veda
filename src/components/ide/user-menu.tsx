"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

export function useSignOut() {
  const router = useRouter();
  return useCallback(async () => {
    await createBrowserClient().auth.signOut();
    router.push("/login");
  }, [router]);
}

export function UserMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const signOut = useSignOut();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-7 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-text transition-colors hover:bg-accent hover:text-accent-fg"
      >
        {(name[0] ?? "?").toUpperCase()}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="User menu"
          className="absolute right-0 top-9 z-40 w-48 animate-scale-in rounded-lg border border-line-strong bg-overlay p-1 shadow-e2"
        >
          <div className="truncate px-2 py-1.5 text-caption text-fg-3">{name}</div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-ui text-fg-2 hover:bg-fg/[0.07] hover:text-fg"
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
