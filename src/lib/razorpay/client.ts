import crypto from "crypto";

export const WALLET_PACKS: Record<number, number> = {
  2900: 2900,
  4900: 4900,
  9900: 10900, // includes 1000 paise bonus
};

export function creditForAmount(amountPaise: number): number | null {
  return WALLET_PACKS[amountPaise] ?? null;
}

export async function createRazorpayOrder(
  amountPaise: number,
  notes: Record<string, string> = {}
): Promise<{ id: string }> {
  if (process.env.PAYMENT_MODE === "simulator") {
    return { id: `sim_${crypto.randomUUID()}` };
  }

  const auth = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", notes }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay order failed with status ${res.status}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}
