"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, external: false },
  // The IDE needs COOP/COEP headers. Only a full page load gets them, so this is a plain link.
  { href: "/ide", label: "Open IDE", icon: SquareTerminal, external: true },
] as const;

export default function DashboardNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav aria-label={vertical ? "Primary" : "Primary (compact)"}>
      <ul className={cn("flex gap-1", vertical ? "flex-col" : "flex-row px-2 py-1.5")}>
        {ITEMS.map(({ href, label, icon: Icon, external }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const className = cn(
            "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 lg:min-h-9",
            active
              ? "bg-accent-subtle text-accent-text"
              : "text-fg-2 hover:bg-fg/[0.07] hover:text-fg active:bg-fg/[0.11]",
          );
          const content = (
            <>
              {active && vertical ? (
                <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />
              ) : null}
              <Icon size={18} aria-hidden="true" />
              {label}
            </>
          );
          return (
            <li key={href} className={vertical ? undefined : "shrink-0"}>
              {external ? (
                <a href={href} className={className}>
                  {content}
                </a>
              ) : (
                <Link href={href} aria-current={active ? "page" : undefined} className={className}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
