"use client";

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
          className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-left hover:border-emerald-500 disabled:opacity-50"
        >
          <div className="text-sm text-neutral-400">{pack.name}</div>
          <div className="text-2xl font-semibold">{formatRupees(pack.amountPaise)}</div>
          <div className="mt-1 text-xs text-neutral-400">
            {formatRupees(pack.creditPaise)} credit ({pack.creditPaise} paise)
          </div>
          {pack.bonusPaise > 0 && (
            <div className="mt-1 text-xs text-emerald-400">+{formatRupees(pack.bonusPaise)} bonus</div>
          )}
        </button>
      ))}
    </div>
  );
}
