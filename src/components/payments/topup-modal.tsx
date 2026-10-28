"use client";

import { useState } from "react";
import TopupPacks, { type TopupPack } from "./topup-packs";

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

export default function TopupModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (!open) return null;

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
        name: "IndicSandbox",
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add credits"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-neutral-700 bg-neutral-950 p-5 text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add credits</h2>
          <button aria-label="Close" onClick={onClose} className="text-neutral-400 hover:text-white">
            {"✕"}
          </button>
        </div>
        <TopupPacks onSelect={select} disabled={busy} />
        {message && (
          <p
            role="status"
            className={`mt-3 text-sm ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
