import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { buttonStyles } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
    >
      Skip to content
    </a>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-app/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" aria-label="Veda home" className="rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-fg-2 transition-colors hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden md:inline-flex">
            <Link href="/login" className={buttonStyles({ variant: "ghost" })}>
              Log in
            </Link>
          </span>
          <Link href="/login" className={buttonStyles({ variant: "primary" })}>
            <span className="sm:hidden">Start free</span>
            <span className="hidden sm:inline">Start coding free</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
