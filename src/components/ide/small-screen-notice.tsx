import Link from "next/link";
import { Monitor } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { buttonStyles } from "@/components/ui/button";

export function SmallScreenNotice() {
  return (
    <main className="flex h-full w-full flex-col bg-app">
      <div className="flex h-12 items-center justify-between px-4">
        <LogoMark size={28} />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
          <Monitor size={24} aria-hidden="true" />
        </span>
        <h1 className="font-display text-xl font-semibold">Veda&apos;s IDE works best on a laptop or desktop.</h1>
        <p className="max-w-xs text-sm text-fg-2">Open it on a larger screen.</p>
        <Link href="/dashboard" className={buttonStyles({ variant: "primary", size: "md" })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
