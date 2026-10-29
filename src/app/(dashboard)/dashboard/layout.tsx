import Link from "next/link";
import DashboardNav from "@/components/dashboard/dashboard-nav";
import UserMenu from "@/components/dashboard/user-menu";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-app text-fg lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-overlay focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-panel p-4 lg:flex">
        <Link href="/dashboard" className="rounded-md px-1 py-1">
          <Logo />
        </Link>
        <DashboardNav orientation="vertical" />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-panel px-4 md:px-6">
          <Link href="/dashboard" className="rounded-md lg:hidden">
            <Logo />
          </Link>
          <span className="hidden text-sm font-medium text-fg-2 lg:block">Dashboard</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <div className="border-b border-line bg-panel lg:hidden">
          <DashboardNav orientation="horizontal" />
        </div>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
