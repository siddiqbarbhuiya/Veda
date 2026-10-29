"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";

// Disclosure menu for screens below 768 px. Escape closes it and returns focus to the button.
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon-touch"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </Button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-app px-4 pb-4 pt-2 shadow-e2"
      >
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-2 text-fg-2 hover:text-fg"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-4">
          <Link href="/login" className={buttonStyles({ variant: "secondary", size: "touch" })}>
            Log in
          </Link>
          <Link href="/login" className={buttonStyles({ variant: "primary", size: "touch" })}>
            Start coding free
          </Link>
        </div>
      </div>
    </div>
  );
}
