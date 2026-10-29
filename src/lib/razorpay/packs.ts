// Single source of truth for top-up packs. No "use client": safe for the server route, the webhook and client components.
import { formatRupees } from "@/lib/money";

export type TopupPack = {
  name: string;
  /** What the user pays, in paise. */
  amountPaise: number;
  /** What the wallet receives, in paise (amount plus bonus). */
  creditPaise: number;
  bonusPaise: number;
};

export const TOPUP_PACKS: TopupPack[] = [
  { name: "Starter", amountPaise: 2900, creditPaise: 2900, bonusPaise: 0 },
  { name: "Standard", amountPaise: 4900, creditPaise: 4900, bonusPaise: 0 },
  { name: "Value", amountPaise: 9900, creditPaise: 10900, bonusPaise: 1000 },
];

export { formatRupees };

export function packForAmount(amountPaise: unknown): TopupPack | undefined {
  return TOPUP_PACKS.find((p) => p.amountPaise === amountPaise);
}

/** Wallet credit for a paid amount, or null when the amount is not a pack. */
export function creditForAmount(amountPaise: number): number | null {
  return packForAmount(amountPaise)?.creditPaise ?? null;
}

/** For example "₹109 (includes ₹10 bonus)" or "₹29". */
export function packCreditLabel(pack: TopupPack): string {
  return pack.bonusPaise > 0
    ? `${formatRupees(pack.creditPaise)} (includes ${formatRupees(pack.bonusPaise)} bonus)`
    : formatRupees(pack.creditPaise);
}

/** For example "2900, 4900, 9900", for error messages. */
export function allowedAmountsText(): string {
  return TOPUP_PACKS.map((p) => p.amountPaise).join(", ");
}
