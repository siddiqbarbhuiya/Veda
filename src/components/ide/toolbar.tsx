"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRuntime, type Runtime } from "./runtime-context";

export default function Toolbar({ projectName }: { projectName: string }) {
  const [name, setName] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const { runtime, setRuntime } = useRuntime();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, balance_paise")
        .eq("id", user.id)
        .single();
      setName(profile?.display_name ?? user.email ?? "User");
      setBalance(profile?.balance_paise ?? 0);
    });
  }, []);

  const signOut = async () => {
    await createBrowserClient().auth.signOut();
    router.push("/login");
  };

  return (
    <header id="toolbar" className="flex h-10 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 text-sm">
      <span className="font-semibold">IndicSandbox</span>
      <span className="text-neutral-400">{projectName}</span>
      <select
        aria-label="Runtime"
        value={runtime}
        onChange={(e) => setRuntime(e.target.value as Runtime)}
        className="rounded bg-neutral-800 px-2 py-0.5"
      >
        <option value="node">Node.js</option>
        <option value="python">Python</option>
      </select>
      <div className="ml-auto flex items-center gap-3">
        <span data-testid="balance">{balance === null ? "..." : `₹${(balance / 100).toFixed(2)}`}</span>
        <Link href="/ide?topup=1" className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-500">
          Add Credits
        </Link>
        <Link href="/settings" aria-label="Settings" title="Settings">{"⚙"}</Link>
        <div className="relative">
          <button
            aria-label="User menu"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-700"
          >
            {(name[0] ?? "?").toUpperCase()}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-40 rounded border border-neutral-700 bg-neutral-900 py-1">
              <div className="truncate px-3 py-1 text-xs text-neutral-400">{name}</div>
              <button className="block w-full px-3 py-1 text-left hover:bg-neutral-800" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
