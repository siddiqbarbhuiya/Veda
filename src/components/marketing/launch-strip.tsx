import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { LaunchScene } from "./launch-scene";

/* Permanent MVP launch banner on the home page. The pop-up shows the same message once. */
export function LaunchStrip() {
  return (
    <section aria-labelledby="launch-title" className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-6">
      <div className="grid overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-e1 md:grid-cols-2">
        <div className="flex flex-col justify-center p-6 md:p-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="accent" icon={<Rocket size={12} aria-hidden="true" />}>
              MVP launch
            </Badge>
            <Badge tone="neutral">Version 1</Badge>
          </div>
          <h2
            id="launch-title"
            className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-4xl"
          >
            Veda v1 is live. This is our first version.
          </h2>
          <p className="mt-3 max-w-prose text-fg-2">
            We are launching our MVP. Bring your own AI key, write code in the browser, and tell us what to build next. Your
            feedback shapes version 2.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href="/login" className={buttonStyles({ variant: "primary", size: "lg" })}>
              Start coding
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/#how-it-works" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              See how it works
            </Link>
          </div>
        </div>
        <LaunchScene />
      </div>
    </section>
  );
}
