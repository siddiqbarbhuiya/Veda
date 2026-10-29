import { AlertTriangle, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { LOW_BALANCE_PAISE, formatInr } from "./format";

export default function WalletCard({
  balance,
  onAddCredits,
}: {
  balance: number | null;
  onAddCredits: () => void;
}) {
  const low = balance !== null && balance < LOW_BALANCE_PAISE;
  return (
    <Card className="flex flex-col justify-between gap-6 p-6">
      <div>
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Wallet balance</SectionLabel>
          {low ? (
            <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden="true" />}>
              Low balance
            </Badge>
          ) : null}
        </div>
        <div
          data-testid="wallet-balance"
          className="tnum mt-3 font-display text-4xl font-semibold tracking-[-0.02em] text-fg sm:text-5xl"
        >
          {balance === null ? "..." : formatInr(balance)}
        </div>
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
