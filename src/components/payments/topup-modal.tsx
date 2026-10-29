"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import PackRadioGroup from "./pack-radio-group";
import TopupPacks, { TOPUP_PACKS, formatRupees, type TopupPack } from "./topup-packs";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  handler: (r: { razorpay_payment_id: string }) => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const DEFAULT_PACK = TOPUP_PACKS[1];

export default function TopupModal({
  open,
  onClose,
  onSuccess,
  initialAmountPaise,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** When set, the dialog shows the packs as a selection with this one chosen, and a pay button. */
  initialAmountPaise?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const confirmMode = initialAmountPaise !== undefined;
  const selectedAmount = picked ?? initialAmountPaise ?? DEFAULT_PACK.amountPaise;
  const selectedPack = TOPUP_PACKS.find((p) => p.amountPaise === selectedAmount) ?? DEFAULT_PACK;

  const close = () => {
    setMessage(null);
    setPicked(null);
    onClose();
  };

  const select = async (pack: TopupPack) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: pack.amountPaise }),
      });
      const data = (await res.json()) as { order_id?: string; error?: string };
      if (!res.ok || !data.order_id) {
        setMessage({ kind: "error", text: data.error ?? "Top-up failed" });
        return;
      }
      // Simulator orders start with "sim_". The server already credited the wallet.
      if (data.order_id.startsWith("sim_")) {
        setMessage({ kind: "ok", text: "Credits added!" });
        onSuccess?.();
        return;
      }
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId || !(await loadCheckoutScript()) || !window.Razorpay) {
        setMessage({ kind: "error", text: "Could not start checkout" });
        return;
      }
      new window.Razorpay({
        key: keyId,
        amount: pack.amountPaise,
        currency: "INR",
        order_id: data.order_id,
        name: "Veda",
        handler: () => {
          setMessage({ kind: "ok", text: "Payment received. Credits will appear shortly." });
          onSuccess?.();
        },
      }).open();
    } catch {
      setMessage({ kind: "error", text: "Top-up failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add credits"
      ariaLabel="Add credits"
      description="Choose an amount. Credits are added to your wallet."
      className="sm:w-[min(40rem,calc(100vw-2rem))]"
    >
      {confirmMode ? (
        <div className="space-y-4">
          <span id="topup-pack-label" className="sr-only">
            Top-up amount
          </span>
          <PackRadioGroup
            name="topup-modal-pack"
            labelledBy="topup-pack-label"
            value={selectedAmount}
            onChange={setPicked}
            disabled={busy}
          />
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={busy}
            onClick={() => void select(selectedPack)}
          >
            Pay {formatRupees(selectedPack.amountPaise)}
          </Button>
        </div>
      ) : (
        <TopupPacks onSelect={select} disabled={busy} />
      )}
      {message ? (
        <p
          role="status"
          className={cn(
            "mt-4 flex items-start gap-2 text-sm",
            message.kind === "ok" ? "text-success" : "text-danger",
          )}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          {message.text}
        </p>
      ) : null}
    </Dialog>
  );
}
