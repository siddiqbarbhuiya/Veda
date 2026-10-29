"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BillingCard from "@/components/dashboard/billing-card";
import KeysSection from "@/components/dashboard/keys-section";
import TopupSection from "@/components/dashboard/topup-section";
import TransactionsSection from "@/components/dashboard/transactions-section";
import WalletCard from "@/components/dashboard/wallet-card";
import TopupModal from "@/components/payments/topup-modal";
import { apiFetch } from "@/lib/api-fetch";

export default function DashboardPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number | undefined>(undefined);
  const [txRefresh, setTxRefresh] = useState(0);
  const requestId = useRef(0);

  // Only the newest request may write state, so an older response cannot overwrite a newer balance.
  const loadBalance = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await apiFetch("/api/wallet/balance", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { balance_paise?: unknown };
      if (typeof data.balance_paise !== "number" || !Number.isFinite(data.balance_paise)) {
        throw new Error("invalid balance");
      }
      if (id !== requestId.current) return;
      setBalance(data.balance_paise);
      setBalanceError(false);
    } catch {
      if (id !== requestId.current) return;
      setBalanceError(true);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount and when refreshToken changes. State is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBalance();
    return () => {
      requestId.current += 1;
    };
  }, [loadBalance]);

  // Refresh when the user returns to the tab, for example after a payment in another tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadBalance();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadBalance]);

  // The IDE toolbar links here with ?topup=1. Open the dialog once, then remove the parameter.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("topup") !== "1") return;
    url.searchParams.delete("topup");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTopupOpen(true);
  }, []);

  const retry = async () => {
    setRetrying(true);
    await loadBalance();
    setRetrying(false);
  };

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
        <WalletCard
          balance={balance}
          error={balanceError}
          retrying={retrying}
          onRetry={() => void retry()}
          onAddCredits={() => openTopup()}
        />
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
