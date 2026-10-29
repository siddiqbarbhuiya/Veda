"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error("dashboard error", { message: error.message, digest: error.digest });
    headingRef.current?.focus();
  }, [error]);

  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <AlertTriangle size={24} aria-hidden="true" />
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 font-display text-2xl font-semibold tracking-[-0.015em] focus:outline-none"
      >
        Something went wrong
      </h1>
      <p className="mt-2 max-w-sm text-sm text-fg-2">
        The dashboard could not load. Try again. If your session expired, sign in again.
      </p>
      {error.digest ? <p className="tnum mt-2 text-caption text-fg-3">Error ID: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          size="lg"
          className="sm:h-9 sm:text-sm"
          leadingIcon={<RotateCw size={16} aria-hidden="true" />}
          onClick={reset}
        >
          Try again
        </Button>
        {/* Plain link: a full page load clears any stale session state. */}
        <a
          href="/login?error=session_expired"
          className={buttonStyles({ variant: "secondary", size: "lg", className: "sm:h-9 sm:text-sm" })}
        >
          Sign in again
        </a>
      </div>
    </div>
  );
}
