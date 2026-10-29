import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const SECRET = "whsec_test";

let existingRow: { id: string } | null = null;
let lookupError: { message: string } | null = null;
let insertResult: { error: { code?: string; message: string } | null } = { error: null };
let inserted: Record<string, unknown>[] = [];
const creditBalance = vi.fn();

vi.mock("@/lib/billing/hold", () => ({
  creditBalance: (...args: unknown[]) => creditBalance(...args),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingRow, error: lookupError }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        if (!insertResult.error) inserted.push(row);
        return insertResult;
      },
    }),
  })),
}));

import { POST } from "../razorpay/route";

function sign(body: string) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

function captured(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_1",
          order_id: "order_1",
          amount: 9900,
          currency: "INR",
          // Client-controlled notes must be ignored.
          notes: { user_id: "attacker" },
          ...overrides,
        },
      },
    },
  });
}

function webhookReq(body: string, signature = sign(body)) {
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: { "x-razorpay-signature": signature },
    body,
  });
}

function mockOrder(order: Record<string, unknown> | null, status = 200) {
  const fetchMock = vi.fn(async () =>
    order === null
      ? new Response("{}", { status: status === 200 ? 404 : status })
      : new Response(JSON.stringify(order), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const goodOrder = { id: "order_1", amount: 9900, currency: "INR", notes: { user_id: USER_ID } };

beforeEach(() => {
  existingRow = null;
  lookupError = null;
  insertResult = { error: null };
  inserted = [];
  creditBalance.mockReset();
  creditBalance.mockResolvedValue({ success: true, newBalance: 12345 });
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "key-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/razorpay", () => {
  it("returns 400 for a bad signature and does nothing", async () => {
    const fetchMock = mockOrder(goodOrder);
    const res = await POST(webhookReq(captured(), "bad"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 200 and ignores events that are not payment.captured", async () => {
    const fetchMock = mockOrder(goodOrder);
    const res = await POST(webhookReq(JSON.stringify({ event: "payment.failed" })));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("takes the user from the order notes (not payment notes) and credits with the correct balance", async () => {
    const fetchMock = mockOrder(goodOrder);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders/order_1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("rzp_test_x:key-secret").toString("base64")}`
    );
    expect(creditBalance).toHaveBeenCalledTimes(1);
    expect(creditBalance).toHaveBeenCalledWith(USER_ID, 10900);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      user_id: USER_ID,
      type: "topup",
      amount_paise: 10900,
      balance_after_paise: 12345,
      razorpay_payment_id: "pay_1",
    });
  });

  it("returns 200 and does not credit when the order is missing", async () => {
    mockOrder(null);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(200);
    expect(creditBalance).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("returns 500 (retry) when the order lookup fails with a server error", async () => {
    mockOrder({}, 503);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(500);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 500 (retry) when the order lookup throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network"))));
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(500);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 200 and does not credit when the payment amount differs from the order amount", async () => {
    mockOrder({ ...goodOrder, amount: 2900 });
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(200);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 200 and does not credit when the currency is not INR", async () => {
    mockOrder({ ...goodOrder, currency: "USD" });
    const res = await POST(webhookReq(captured({ currency: "USD" })));
    expect(res.status).toBe(200);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 200 and does not credit when the amount is not a pack", async () => {
    mockOrder({ ...goodOrder, amount: 5000 });
    const res = await POST(webhookReq(captured({ amount: 5000 })));
    expect(res.status).toBe(200);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 200 and does not credit when the order has no user_id or array notes", async () => {
    mockOrder({ ...goodOrder, notes: [] });
    expect((await POST(webhookReq(captured()))).status).toBe(200);
    mockOrder({ ...goodOrder, notes: { user_id: "not-a-uuid" } });
    expect((await POST(webhookReq(captured()))).status).toBe(200);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("returns 200 without crediting when the payment is already in the ledger", async () => {
    existingRow = { id: "tx-1" };
    mockOrder(goodOrder);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(200);
    expect(creditBalance).not.toHaveBeenCalled();
  });

  it("rolls the credit back on a duplicate payment id (23505) that raced, and returns 200", async () => {
    insertResult = { error: { code: "23505", message: "duplicate key" } };
    mockOrder(goodOrder);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(200);
    expect(creditBalance).toHaveBeenNthCalledWith(1, USER_ID, 10900);
    expect(creditBalance).toHaveBeenNthCalledWith(2, USER_ID, -10900);
  });

  it("returns 500 and does not insert when the credit fails", async () => {
    creditBalance.mockRejectedValueOnce(new Error("conflict"));
    mockOrder(goodOrder);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(500);
    expect(inserted).toHaveLength(0);
    expect(creditBalance).toHaveBeenCalledTimes(1);
  });

  it("rolls the credit back and returns 500 when the ledger insert fails", async () => {
    insertResult = { error: { message: "db down" } };
    mockOrder(goodOrder);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(500);
    expect(creditBalance).toHaveBeenNthCalledWith(2, USER_ID, -10900);
  });

  it("logs a critical error with the payment id when the rollback fails, and returns 200", async () => {
    insertResult = { error: { message: "db down" } };
    creditBalance
      .mockResolvedValueOnce({ success: true, newBalance: 12345 })
      .mockRejectedValueOnce(new Error("rollback failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockOrder(goodOrder);
    const res = await POST(webhookReq(captured()));
    expect(res.status).toBe(200);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("CRITICAL");
    expect(logged).toContain("pay_1");
  });
});
