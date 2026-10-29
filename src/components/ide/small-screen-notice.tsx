"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { Button, buttonStyles } from "@/components/ui/button";

/** Full-screen overlay above the IDE shell. The shell stays mounted behind it, so no state is lost. */
export function SmallScreenNotice({ onContinue }: { onContinue: () => void }) {
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="small-screen-title"
      className="fixed inset-0 z-50 flex flex-col bg-app"
    >
      <div className="flex h-12 items-center justify-between px-4">
        <LogoMark size={28} />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
          <Monitor size={24} aria-hidden="true" />
        </span>
        <h1 id="small-screen-title" className="font-display text-xl font-semibold">
          Veda&apos;s IDE works best on a laptop or desktop.
        </h1>
        <p className="max-w-xs text-ui text-fg-2">
          The screen is small. You can still continue, but some panels will be tight.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button ref={continueRef} variant="primary" size="md" onClick={onContinue}>
            Continue anyway
          </Button>
          <Link href="/dashboard" className={buttonStyles({ variant: "secondary", size: "md" })}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
