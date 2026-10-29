"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

export default function UserMenu() {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        const user = data.user;
        if (!user || cancelled) return;
        const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
        setName(meta?.full_name ?? meta?.name ?? user.email ?? "User");
      })
      .catch(() => {
        // The avatar falls back to a placeholder.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
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
    await createBrowserClient().auth.signOut();
    router.push("/login");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent-text transition-colors duration-150 hover:bg-accent hover:text-accent-fg active:scale-[0.98] lg:size-9"
      >
        {(name[0] ?? "?").toUpperCase()}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="User menu"
          className="absolute right-0 top-full z-40 mt-2 w-56 animate-scale-in rounded-lg bg-overlay p-1 shadow-e2"
        >
          <p className="truncate px-3 py-2 text-caption text-fg-3">{name}</p>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-fg-2 transition-colors duration-150 hover:bg-fg/[0.07] hover:text-fg lg:min-h-9"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
