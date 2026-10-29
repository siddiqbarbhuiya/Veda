"use client";

import { useCallback, useEffect, useState } from "react";
import BillingCard from "@/components/dashboard/billing-card";
import KeysSection from "@/components/dashboard/keys-section";
import TopupSection from "@/components/dashboard/topup-section";
import TransactionsSection from "@/components/dashboard/transactions-section";
import WalletCard from "@/components/dashboard/wallet-card";
import TopupModal from "@/components/payments/topup-modal";

export default function DashboardPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number | undefined>(undefined);
  const [txRefresh, setTxRefresh] = useState(0);

  const loadBalance = useCallback(() => {
    return fetch("/api/wallet/balance")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { balance_paise: number };
        setBalance(data.balance_paise);
      })
      .catch(() => {
        // Balance stays unchanged.
      });
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const openTopup = (amountPaise?: number) => {
    setTopupAmount(amountPaise);
    setTopupOpen(true);
  };

  const onTopupSuccess = () => {
    void loadBalance();
    setTxRefresh((n) => n + 1);
  };

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">Overview</h1>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <WalletCard balance={balance} onAddCredits={() => openTopup()} />
        <BillingCard />
      </div>

      <TopupSection onChoose={openTopup} />
      <KeysSection />
      <TransactionsSection refreshToken={txRefresh} />

      <TopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onSuccess={onTopupSuccess}
        initialAmountPaise={topupAmount}
      />
    </div>
  );
}
