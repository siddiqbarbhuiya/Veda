import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <Link href="/" aria-label="Veda home" className="inline-flex min-h-11 items-center rounded-md">
        <Logo />
      </Link>
      <h1 className="font-display text-[clamp(96px,22vw,200px)] font-bold leading-none tracking-[-0.04em] text-accent-text">
        404
      </h1>
      <p className="max-w-md text-lg text-fg-2">We could not find this page. It may have moved, or the link is wrong.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonStyles({ variant: "primary", size: "lg" })}>
          Back to home
        </Link>
        <Link href="/dashboard" className={buttonStyles({ variant: "ghost", size: "lg" })}>
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
