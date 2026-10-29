"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button, buttonStyles } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error", error.digest ?? "(no digest)", error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-app px-4 py-16 text-center text-fg"
    >
      <Link href="/" aria-label="Veda home" className="inline-flex min-h-11 items-center rounded-md">
        <Logo />
      </Link>
      <TriangleAlert size={40} className="text-warning" aria-hidden="true" />
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">Something went wrong</h1>
      <p className="max-w-md text-fg-2">
        The page had an error. Your saved files are safe. Try again, or go back to the home page.
      </p>
      {error.digest ? <p className="tnum text-caption text-fg-3">Error code: {error.digest}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" size="lg" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg" })}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
