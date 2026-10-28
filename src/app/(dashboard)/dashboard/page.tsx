"use client";

import { useCallback, useEffect, useState } from "react";
import KeyForm from "@/components/keys/key-form";
import KeyList from "@/components/keys/key-list";
import TopupModal from "@/components/payments/topup-modal";

export default function DashboardPage() {
  const [refresh, setRefresh] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/balance");
      if (!res.ok) return;
      const data = (await res.json()) as { balance_paise: number };
      setBalance(data.balance_paise);
    } catch {
      // Balance stays unchanged.
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h2 className="mb-3 text-lg font-semibold">API Keys</h2>
        <KeyForm onSaved={() => setRefresh((n) => n + 1)} />
        <div className="mt-6">
          <KeyList refreshToken={refresh} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Wallet</h2>
        <div className="mb-4 text-3xl font-semibold" data-testid="wallet-balance">
          {balance === null ? "..." : `₹${(balance / 100).toFixed(2)}`}
        </div>
        <button
          onClick={() => setTopupOpen(true)}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
        >
          Add Credits
        </button>
        <TopupModal open={topupOpen} onClose={() => setTopupOpen(false)} onSuccess={loadBalance} />
      </section>
    </div>
  );
}
