"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <AlertTriangle size={24} aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-[-0.015em]">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-2">
        The dashboard could not load. Your wallet and keys are safe. Try again.
      </p>
      <Button
        variant="primary"
        size="lg"
        className="mt-6 sm:h-9 sm:text-sm"
        leadingIcon={<RotateCw size={16} aria-hidden="true" />}
        onClick={reset}
      >
        Try again
      </Button>
    </div>
  );
}
