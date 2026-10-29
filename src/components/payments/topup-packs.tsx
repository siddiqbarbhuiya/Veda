"use client";

import { Badge } from "@/components/ui/badge";

export type TopupPack = {
  name: string;
  amountPaise: number;
  creditPaise: number;
  bonusPaise: number;
};

export const TOPUP_PACKS: TopupPack[] = [
  { name: "Starter", amountPaise: 2900, creditPaise: 2900, bonusPaise: 0 },
  { name: "Standard", amountPaise: 4900, creditPaise: 4900, bonusPaise: 0 },
  { name: "Value", amountPaise: 9900, creditPaise: 10900, bonusPaise: 1000 },
];

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
}

export function PackBody({ pack }: { pack: TopupPack }) {
  return (
    <>
      <span className="flex items-center justify-between gap-2 text-sm text-fg-2">
        {pack.name}
        {pack.name === "Standard" ? <Badge tone="accent">Popular</Badge> : null}
      </span>
      <span className="tnum mt-1 block font-display text-2xl font-semibold tracking-[-0.02em] text-fg">
        {formatRupees(pack.amountPaise)}
      </span>
      <span className="tnum mt-1 block text-caption text-fg-3">
        {formatRupees(pack.creditPaise)} credit ({pack.creditPaise} paise)
      </span>
      {pack.bonusPaise > 0 ? (
        <span className="mt-2 block">
          <Badge tone="success">+{formatRupees(pack.bonusPaise)} bonus</Badge>
        </span>
      ) : null}
    </>
  );
}

export default function TopupPacks({
  onSelect,
  disabled = false,
}: {
  onSelect: (pack: TopupPack) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {TOPUP_PACKS.map((pack) => (
        <button
          key={pack.amountPaise}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(pack)}
          className="min-h-11 rounded-lg border border-line-strong bg-elevated p-4 text-left transition-colors duration-150 hover:border-accent-text disabled:opacity-50"
        >
          <PackBody pack={pack} />
        </button>
      ))}
    </div>
  );
}
