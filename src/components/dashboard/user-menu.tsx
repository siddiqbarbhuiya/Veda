"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, LogOut } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

// Disclosure pattern: a button that shows a panel. No role="menu", so no arrow-key promises.
export default function UserMenu({ name = "User" }: { name?: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    signOutRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const { error: signOutError } = await createBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      // Hard navigation drops the client router cache, so no protected data stays in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch {
      setError("Could not sign out. Try again.");
      setSigningOut(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Tab moves focus out of the widget: close the panel.
        if (open && !rootRef.current?.contains(event.relatedTarget as Node | null) && event.relatedTarget) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls="user-menu-panel"
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent-text transition-colors duration-150 hover:bg-accent hover:text-accent-fg active:scale-[0.98] lg:size-9"
      >
        {(name[0] ?? "?").toUpperCase()}
      </button>
      {open ? (
        <div
          id="user-menu-panel"
          className="absolute right-0 top-full z-40 mt-2 w-56 animate-scale-in rounded-lg bg-overlay p-1 shadow-e2"
        >
          <p className="truncate px-3 py-2 text-caption text-fg-3">{name}</p>
          <button
            ref={signOutRef}
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-fg-2 transition-colors duration-150 hover:bg-fg/[0.07] hover:text-fg disabled:opacity-50 lg:min-h-9"
          >
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
          <div aria-live="polite">
            {error ? (
              <p className="flex items-start gap-2 px-3 py-2 text-caption text-danger">
                <AlertCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
