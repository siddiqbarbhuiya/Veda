"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LaunchScene } from "./launch-scene";

// Bump the suffix to show the banner again after a new release.
const STORAGE_KEY = "veda-launch-banner-v1";

function wasSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage is blocked: show the banner each visit.
    return false;
  }
}

const noopSubscribe = () => () => {};

export function LaunchBanner() {
  // The server snapshot is "seen", so the pop-up never renders on the server and hydration matches.
  const seen = useSyncExternalStore(noopSubscribe, wasSeen, () => true);
  const [dismissed, setDismissed] = useState(false);
  const open = !seen && !dismissed;

  function close() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore: the banner shows again next visit.
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Veda v1 is live"
      description="This is our first version. We are launching our MVP."
      className="w-[min(40rem,calc(100vw-2rem))] p-0 [&>div:first-child]:px-6 [&>div:first-child]:pt-6"
    >
      <div className="mb-5">
        <LaunchScene />
      </div>
      <div className="px-6 pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent" icon={<Rocket size={12} aria-hidden="true" />}>
            MVP launch
          </Badge>
          <Badge tone="neutral">Version 1</Badge>
        </div>
        <p className="text-sm text-fg-2">
          Veda is new, and some parts are still rough. Bring your own AI key, write code in the browser, and tell us what to
          build next. Your feedback shapes version 2.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="touch" onClick={close}>
            Explore first
          </Button>
          <Link href="/login" onClick={close} className={buttonStyles({ variant: "primary", size: "touch" })}>
            Start coding
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
