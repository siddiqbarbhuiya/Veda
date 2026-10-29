"use client";

import { Badge } from "@/components/ui/badge";
import { TOPUP_PACKS, formatRupees, packCreditLabel, type TopupPack } from "@/lib/razorpay/packs";

// The pack data lives in a module without "use client" so the API routes and server components can use it.
// These re-exports keep older import paths working.
export { TOPUP_PACKS, formatRupees };
export type { TopupPack };

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
      <span className="tnum mt-1 block text-caption text-fg-3">You get {packCreditLabel(pack)}</span>
    </>
  );
}
