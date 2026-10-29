"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Gift, Plus, Receipt, Sparkles } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/money";
import { formatDateTime } from "./format";

type Transaction = {
  id: string;
  type: string;
  amount_paise: number;
  balance_after_paise: number;
  description: string | null;
  created_at: string;
};

const PAGE_SIZE = 10;

const TYPE_META: Record<string, { label: string; tone: BadgeTone; icon: ReactNode }> = {
  topup: { label: "Top-up", tone: "success", icon: <Plus size={12} aria-hidden="true" /> },
  bonus: { label: "Bonus", tone: "accent", icon: <Gift size={12} aria-hidden="true" /> },
  ai_usage: { label: "AI usage", tone: "neutral", icon: <Sparkles size={12} aria-hidden="true" /> },
};
const OTHER_META = { label: "Other", tone: "neutral" as BadgeTone, icon: <Receipt size={12} aria-hidden="true" /> };

function signOf(amountPaise: number): "+" | "-" | "" {
  const sign = Math.sign(amountPaise);
  return sign > 0 ? "+" : sign < 0 ? "-" : "";
}

export default function TransactionsSection({ refreshToken = 0 }: { refreshToken?: number }) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  // Page 1 replaces the list. Later pages append. Only the newest request may write state.
  const load = useCallback(async (nextPage: number) => {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/wallet/transactions?limit=${PAGE_SIZE}&page=${nextPage}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { transactions?: Transaction[]; total?: number };
      if (id !== requestId.current) return;
      const rows = Array.isArray(data.transactions) ? data.transactions : [];
      setItems((prev) => {
        if (nextPage === 1 || !prev) return rows;
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...rows.filter((t) => !seen.has(t.id))];
      });
      setTotal(typeof data.total === "number" ? data.total : rows.length);
      setPage(nextPage);
      setFailed(false);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount and when refreshToken changes. State is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(1);
    return () => {
      requestId.current += 1;
    };
  }, [load, refreshToken]);

  const hasMore = items !== null && items.length < total;

  const errorBanner = failed ? (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line p-4 text-sm text-danger last:border-b-0">
      <span className="flex items-center gap-2">
        <AlertCircle size={16} aria-hidden="true" />
        Could not load transactions.
      </span>
      <Button size="sm" variant="secondary" loading={busy} onClick={() => void load(items && items.length > 0 ? page + 1 : 1)}>
        Retry
      </Button>
    </div>
  ) : null;

  let body: ReactNode;
  if (items === null && !failed) {
    body = (
      <div role="status" aria-busy="true" className="divide-y divide-line">
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
  } else if (items === null) {
    body = errorBanner;
  } else if (items.length === 0) {
    body = (
      <>
        {errorBanner}
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
            <Receipt size={24} aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-medium text-fg">No transactions yet.</p>
          <p className="mt-1 max-w-xs text-sm text-fg-2">Top-ups and AI usage appear here.</p>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {errorBanner}
        <ul className="divide-y divide-line">
          {items.map((t) => {
            const meta = TYPE_META[t.type] ?? OTHER_META;
            const sign = signOf(t.amount_paise);
            return (
              <li key={t.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={meta.tone} icon={meta.icon} className="shrink-0">
                      {meta.label}
                    </Badge>
                    {t.description ? (
                      <span title={t.description} className="truncate text-sm text-fg-2">
                        {t.description}
                      </span>
                    ) : null}
                  </div>
                  <p className="tnum text-caption text-fg-3">{formatDateTime(t.created_at)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("tnum text-sm font-medium", sign === "+" ? "text-success" : "text-fg")}>
                    {sign}
                    {formatInr(Math.abs(t.amount_paise))}
                  </p>
                  <p className="tnum text-caption text-fg-3">Balance {formatInr(t.balance_after_paise)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {hasMore ? (
          <div className="flex justify-center border-t border-line p-3">
            <Button variant="secondary" size="md" loading={busy} onClick={() => void load(page + 1)}>
              Load more
            </Button>
          </div>
        ) : null}
      </>
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
