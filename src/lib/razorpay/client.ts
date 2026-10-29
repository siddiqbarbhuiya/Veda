import crypto from "crypto";
import { TOPUP_PACKS, creditForAmount } from "./packs";

export { creditForAmount };

/** Paid amount to wallet credit, derived from the shared pack list. */
export const WALLET_PACKS: Record<number, number> = Object.fromEntries(
  TOPUP_PACKS.map((p) => [p.amountPaise, p.creditPaise])
);

function basicAuth(): string {
  return Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString(
    "base64"
  );
}

export async function createRazorpayOrder(
  amountPaise: number,
  notes: Record<string, string> = {},
  receipt?: string
): Promise<{ id: string }> {
  if (process.env.PAYMENT_MODE === "simulator") {
    return { id: `sim_${crypto.randomUUID()}` };
  }

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${basicAuth()}` },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      notes,
      ...(receipt ? { receipt } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay order failed with status ${res.status}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  notes: Record<string, unknown> | unknown[] | null;
};

/**
 * Fetches an order from Razorpay. Returns null when the order does not exist (404 or 400).
 * @throws On network errors and any other non-2xx status, so the caller can retry.
 */
export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder | null> {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: { Authorization: `Basic ${basicAuth()}` },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) {
    throw new Error(`Razorpay order lookup failed with status ${res.status}`);
  }
  return (await res.json()) as RazorpayOrder;
}
