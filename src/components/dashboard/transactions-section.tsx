"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Gift, Plus, Receipt, Sparkles } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDateTime, formatInr } from "./format";

type Transaction = {
  id: string;
  type: "topup" | "ai_usage" | "bonus";
  amount_paise: number;
  balance_after_paise: number;
  description: string | null;
  created_at: string;
};

const TYPE_META: Record<Transaction["type"], { label: string; tone: BadgeTone; icon: ReactNode; sign: "+" | "-" }> = {
  topup: { label: "Top-up", tone: "success", icon: <Plus size={12} aria-hidden="true" />, sign: "+" },
  bonus: { label: "Bonus", tone: "accent", icon: <Gift size={12} aria-hidden="true" />, sign: "+" },
  ai_usage: { label: "AI usage", tone: "neutral", icon: <Sparkles size={12} aria-hidden="true" />, sign: "-" },
};

export default function TransactionsSection({ refreshToken = 0 }: { refreshToken?: number }) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet/transactions?limit=10")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as { transactions: Transaction[] };
        if (!cancelled) {
          setItems(data.transactions);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  let body: ReactNode;
  if (failed) {
    body = (
      <p role="alert" className="flex items-center gap-2 p-6 text-sm text-danger">
        <AlertCircle size={16} aria-hidden="true" />
        Failed to load transactions
      </p>
    );
  } else if (items === null) {
    body = (
      <div role="status" className="divide-y divide-line">
        <span className="sr-only">Loading transactions...</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
          <Receipt size={24} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-medium text-fg">No transactions yet</p>
        <p className="mt-1 max-w-xs text-sm text-fg-2">Top-ups and AI usage appear here.</p>
      </div>
    );
  } else {
    body = (
      <ul className="divide-y divide-line">
        {items.map((t) => {
          const meta = TYPE_META[t.type] ?? TYPE_META.ai_usage;
          return (
            <li key={t.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={meta.tone} icon={meta.icon}>
                    {meta.label}
                  </Badge>
                  {t.description ? <span className="truncate text-sm text-fg-2">{t.description}</span> : null}
                </div>
                <p className="tnum text-caption text-fg-3">{formatDateTime(t.created_at)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("tnum text-sm font-medium", meta.sign === "+" ? "text-success" : "text-fg")}>
                  {meta.sign}
                  {formatInr(Math.abs(t.amount_paise))}
                </p>
                <p className="tnum text-caption text-fg-3">Balance {formatInr(t.balance_after_paise)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby="tx-heading" className="space-y-3">
      <h2 id="tx-heading" className="font-display text-xl font-semibold tracking-[-0.01em]">
        Recent transactions
      </h2>
      <Card className="overflow-hidden">{body}</Card>
    </section>
  );
}
