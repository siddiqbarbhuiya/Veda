import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      <nav className="flex h-12 items-center gap-5 border-b border-neutral-800 bg-neutral-900 px-4 text-sm">
        <span className="font-semibold">Veda</span>
        <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
        <Link href="/ide" className="hover:text-white">IDE</Link>
      </nav>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
