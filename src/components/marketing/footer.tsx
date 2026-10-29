import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";
import { buttonStyles } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-4 pb-16 md:px-6 md:pb-24">
      <div className="mx-auto max-w-6xl rounded-2xl border border-accent bg-accent-subtle px-6 py-14 text-center shadow-glow md:py-20">
        <h2
          id="cta-title"
          className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-4xl"
        >
          Your next assignment can start in a minute
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-fg-2">
          Sign in, add your key and open the IDE. Top up from ₹29 only when you want the in-app AI.
        </p>
        <Link href="/login" className={buttonStyles({ variant: "primary", size: "lg", className: "mt-8" })}>
          Start coding free
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-6">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-ui text-fg-2">Made for Indian students.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-flex min-h-11 items-center text-ui text-fg-2 hover:text-fg">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeToggle />
      </div>
      <div className="border-t border-line py-5 text-center text-caption text-fg-3">
        &copy; {new Date().getFullYear()} Veda
      </div>
    </footer>
  );
}
