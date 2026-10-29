"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";
import { TOPUP_PACKS, packForAmount } from "@/lib/razorpay/packs";
import PackRadioGroup from "./pack-radio-group";

type RazorpayFailure = { error?: { description?: string } };
type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", cb: (response: RazorpayFailure) => void) => void;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  handler: (r: { razorpay_payment_id: string }) => void;
  modal?: { ondismiss?: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 40_000;
const SIMULATOR_BANNER_MS = 5000;

let scriptPromise: Promise<boolean> | null = null;

function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      script.remove();
      scriptPromise = null; // allow a retry
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A modal <dialog> makes everything outside it inert, so checkout must not open while one is open.
async function waitForDialogsClosed() {
  for (let i = 0; i < 20; i++) {
    if (!document.querySelector("dialog[open]")) return;
    await sleep(50);
  }
}

async function readBalance(): Promise<number | null> {
  try {
    const res = await apiFetch("/api/wallet/balance", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { balance_paise?: unknown };
    return typeof data.balance_paise === "number" && Number.isFinite(data.balance_paise)
      ? data.balance_paise
      : null;
  } catch {
    return null;
  }
}

type Mode = "simulator" | "live";
type Banner = { kind: "pending" | "ok" | "error" | "info"; text: string; paymentId?: string };

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
  /** Pack that is selected when the dialog opens. An amount that is not a pack falls back to the default pack. */
  initialAmountPaise?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const inFlight = useRef(false);
  const modeRef = useRef<Mode | null>(null);
  const pollId = useRef(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Stop polling and banner timers when the component unmounts.
  useEffect(() => {
    return () => {
      pollId.current += 1;
    };
  }, []);

  const selectedPack = packForAmount(picked ?? initialAmountPaise) ?? DEFAULT_PACK;
  const selectedAmount = selectedPack.amountPaise;

  const getMode = async (): Promise<Mode | null> => {
    if (modeRef.current) return modeRef.current;
    try {
      const res = await apiFetch("/api/wallet/topup", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { mode?: unknown };
      if (data.mode === "simulator" || data.mode === "live") {
        modeRef.current = data.mode;
        return data.mode;
      }
    } catch {
      // Falls through to null.
    }
    return null;
  };

  // When the dialog opens: learn the mode, preload checkout.js in live mode, focus the chosen pack.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const mode = await getMode();
      if (!cancelled && mode === "live" && process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
        void loadCheckoutScript();
      }
    })();
    const frame = requestAnimationFrame(() => {
      groupRef.current?.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // getMode only reads refs and module state.
  }, [open]);

  const release = () => {
    inFlight.current = false;
    setBusy(false);
  };

  const close = () => {
    // The native close event also fires when we close the dialog on purpose. Keep state during a payment.
    if (!inFlight.current) {
      setMessage(null);
      setPicked(null);
    }
    onClose();
  };

  // Poll the balance until it changes. A stale response (older poll) is ignored by the id check.
  const waitForCredit = async (paymentId: string, baseline: number | null) => {
    const myId = ++pollId.current;
    setBanner({ kind: "pending", text: "Waiting for payment confirmation...", paymentId });
    let base = baseline;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      if (pollId.current !== myId) return;
      const value = await readBalance();
      if (pollId.current !== myId) return;
      if (value === null) continue;
      if (base === null) {
        base = value;
        continue;
      }
      if (value !== base) {
        setBanner({ kind: "ok", text: "Credits added to your wallet.", paymentId });
        onSuccessRef.current?.();
        release();
        return;
      }
    }
    if (pollId.current !== myId) return;
    setBanner({
      kind: "info",
      text: "Payment received, but your balance has not changed yet. It can take a few minutes. If credits do not appear, contact support with the payment ID.",
      paymentId,
    });
    onSuccessRef.current?.();
    release();
  };

  const openCheckout = async (keyId: string, orderId: string, amountPaise: number, baseline: number | null) => {
    // Close our dialog first. Checkout would be inert and hidden behind a modal dialog.
    onClose();
    await waitForDialogsClosed();

    let settled = false;
    let failure: string | undefined;
    try {
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("checkout.js is not loaded");
      const rzp = new Razorpay({
        key: keyId,
        amount: amountPaise,
        currency: "INR",
        order_id: orderId,
        name: "Veda",
        handler: (response) => {
          settled = true;
          void waitForCredit(response.razorpay_payment_id, baseline);
        },
        modal: {
          ondismiss: () => {
            if (settled) return;
            settled = true;
            release();
            setBanner(
              failure
                ? { kind: "error", text: `Payment failed: ${failure} Open Add credits to try again.` }
                : { kind: "info", text: "Payment cancelled. No money was taken." },
            );
          },
        },
      });
      // Checkout stays open after a failure so the user can retry inside it. Remember the reason for ondismiss.
      rzp.on("payment.failed", (response) => {
        failure = response.error?.description ?? "The payment was not completed.";
        if (failure && !/[.!?]$/.test(failure)) failure += ".";
      });
      rzp.open();
    } catch {
      settled = true;
      release();
      setBanner({ kind: "error", text: "Could not open the payment window. Try again." });
    }
  };

  const pay = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setBanner(null);
    let handedOff = false;
    try {
      const mode = await getMode();
      if (!mode) {
        setMessage({ kind: "error", text: "Could not reach the payment service. Try again." });
        return;
      }

      // Check live prerequisites BEFORE an order exists, so a failure leaves no orphan order.
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (mode === "live") {
        if (!keyId) {
          setMessage({ kind: "error", text: "Payments are not configured." });
          return;
        }
        if (!(await loadCheckoutScript())) {
          setMessage({
            kind: "error",
            text: "Could not load the payment window. Check your connection and try again.",
          });
          return;
        }
      }
      const baseline = mode === "live" ? await readBalance() : null;

      const res = await apiFetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_paise: selectedPack.amountPaise }),
      });
      const data = (await res.json().catch(() => ({}))) as { order_id?: string; error?: string };
      if (!res.ok || !data.order_id) {
        setMessage({ kind: "error", text: data.error ?? "Top-up failed. Try again." });
        return;
      }

      if (mode === "simulator") {
        // The server already credited the wallet. Close the dialog so a second click cannot add more.
        onClose();
        setBanner({ kind: "ok", text: `${formatRupees(selectedPack.creditPaise)} added to your wallet.` });
        onSuccessRef.current?.();
        const bannerPollId = ++pollId.current;
        void sleep(SIMULATOR_BANNER_MS).then(() => {
          if (pollId.current === bannerPollId) setBanner(null);
        });
        return;
      }

      handedOff = true;
      await openCheckout(keyId as string, data.order_id, selectedPack.amountPaise, baseline);
    } catch {
      setMessage({ kind: "error", text: "Top-up failed. Try again." });
    } finally {
      if (!handedOff) release();
    }
  };

  const bannerTone = banner?.kind === "error" ? "danger" : banner?.kind === "ok" ? "success" : "neutral";

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!busy}
        title="Add credits"
        ariaLabel="Add credits"
        description="Choose an amount, then press Pay. Credits are added to your wallet."
        className="sm:w-[min(40rem,calc(100vw-2rem))]"
      >
        <div className="space-y-4">
          <span id="topup-pack-label" className="sr-only">
            Top-up amount
          </span>
          <div ref={groupRef}>
            <PackRadioGroup
              name="topup-modal-pack"
              labelledBy="topup-pack-label"
              value={selectedAmount}
              onChange={setPicked}
              disabled={busy}
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={busy}
            disabled={busy}
            onClick={() => void pay()}
          >
            Pay {formatRupees(selectedAmount)}
          </Button>
          <div aria-live="polite">
            {message ? (
              <p
                className={cn(
                  "flex items-start gap-2 text-sm",
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
          </div>
        </div>
      </Dialog>

      {/* Page-level notice. It sits outside the dialog, so it stays visible while checkout is open or after it closes. */}
      <div
        aria-live={banner?.kind === "error" ? "assertive" : "polite"}
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      >
        {banner ? (
          <div
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border bg-overlay p-4 text-sm shadow-e2",
              bannerTone === "danger" && "border-danger text-danger",
              bannerTone === "success" && "border-success text-success",
              bannerTone === "neutral" && "border-line-strong text-fg",
            )}
          >
            {banner.kind === "pending" ? (
              <Loader2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin" />
            ) : banner.kind === "ok" ? (
              <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            ) : banner.kind === "error" ? (
              <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            ) : (
              <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p>{banner.text}</p>
              {banner.paymentId ? (
                <p className="tnum mt-1 break-all text-caption text-fg-2">Payment ID: {banner.paymentId}</p>
              ) : null}
            </div>
            {banner.kind !== "pending" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss notice"
                onClick={() => setBanner(null)}
                className="-mr-2 -mt-1"
              >
                <X size={16} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
