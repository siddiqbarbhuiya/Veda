import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { buttonStyles } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";
import { NAV_LINKS } from "./nav-links";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="no-print sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
    >
      Skip to content
    </a>
  );
}

export function Nav() {
  return (
    <header className="no-print sticky top-0 z-10 border-b border-line bg-app/80 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 md:px-6">
        <Link href="/" aria-label="Veda home" className="inline-flex min-h-11 items-center rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-fg/[0.07] hover:text-fg"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden md:inline-flex">
            <Link href="/login" className={buttonStyles({ variant: "ghost" })}>
              Log in
            </Link>
          </span>
          <Link href="/login" className={buttonStyles({ variant: "primary", size: "touch", className: "hidden sm:inline-flex" })}>
            Start coding free
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
