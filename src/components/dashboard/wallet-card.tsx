import { AlertCircle, AlertTriangle, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInr, isLowBalance } from "@/lib/money";

export default function WalletCard({
  balance,
  error = false,
  retrying = false,
  onRetry,
  onAddCredits,
}: {
  balance: number | null;
  error?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
  onAddCredits: () => void;
}) {
  const low = isLowBalance(balance);
  const loading = balance === null && !error;
  return (
    <Card className="flex flex-col justify-between gap-6 p-6" aria-busy={loading || retrying}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Wallet balance</SectionLabel>
          {/* The live region exists before the badge appears, so the change is announced. */}
          <div role="status">
            {low ? (
              <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden="true" />}>
                Low balance
              </Badge>
            ) : null}
          </div>
        </div>
        <div
          data-testid="wallet-balance"
          className="tnum mt-3 font-display text-4xl font-semibold tracking-[-0.02em] text-fg sm:text-5xl"
        >
          {balance !== null ? (
            formatInr(balance)
          ) : loading ? (
            <>
              <Skeleton className="h-10 w-44 sm:h-12" />
              <span className="sr-only">Loading balance</span>
            </>
          ) : (
            <span className="text-fg-3">-</span>
          )}
        </div>
        {error ? (
          <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-danger">
            <span className="flex items-center gap-2">
              <AlertCircle size={16} aria-hidden="true" />
              {balance === null ? "Could not load your balance." : "Could not refresh your balance."}
            </span>
            {onRetry ? (
              <Button size="sm" variant="secondary" loading={retrying} onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          className="sm:h-9 sm:text-sm"
          leadingIcon={<Plus size={16} aria-hidden="true" />}
          onClick={onAddCredits}
        >
          Add Credits
        </Button>
        <p className="flex items-center gap-1.5 text-caption text-fg-3">
          <ShieldCheck size={14} aria-hidden="true" />
          Payments by Razorpay
        </p>
      </div>
    </Card>
  );
}
