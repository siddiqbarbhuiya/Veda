import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let currentUser: { id: string } | null = null;
let balance = 0;
let inserted: Record<string, unknown>[] = [];
let insertFails = false;

function serviceClient() {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { balance_paise: balance }, error: null }),
            }),
          }),
          update: (vals: { balance_paise: number }) => ({
            eq: () => ({
              eq: () => ({
                select: async () => {
                  balance = vals.balance_paise;
                  return { data: [{ balance_paise: balance }], error: null };
                },
              }),
            }),
          }),
        };
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          if (insertFails) return { error: { message: "insert failed" } };
          inserted.push(row);
          return { error: null };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  })),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => serviceClient()),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

import { GET, POST } from "../topup/route";

function req(body: unknown) {
  return new Request("http://localhost/api/wallet/topup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  currentUser = { id: "user-1" };
  balance = 100;
  inserted = [];
  insertFails = false;
  vi.stubEnv("PAYMENT_MODE", "simulator");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});

describe("POST /api/wallet/topup (simulator)", () => {
  it("credits 2900 and returns a sim order id", async () => {
    const res = await POST(req({ amount_paise: 2900 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.order_id).toMatch(/^sim_/);
    expect(balance).toBe(3000);
    expect(inserted[0]).toMatchObject({ user_id: "user-1", type: "topup", amount_paise: 2900 });
  });

  it("credits 10900 for the 9900 pack", async () => {
    const res = await POST(req({ amount_paise: 9900 }));
    expect(res.status).toBe(200);
    expect(balance).toBe(11000);
    expect(inserted[0]).toMatchObject({ amount_paise: 10900, balance_after_paise: 11000 });
  });

  it("rejects an amount that is not allowed", async () => {
    const res = await POST(req({ amount_paise: 5000 }));
    expect(res.status).toBe(400);
    expect(balance).toBe(100);
  });

  it("returns 400 for invalid JSON", async () => {
    expect((await POST(req("nope"))).status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    expect((await POST(req({ amount_paise: 2900 }))).status).toBe(401);
  });

  it("rolls the credit back when the ledger insert fails, so a retry cannot double-credit", async () => {
    insertFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ amount_paise: 2900 }));
    expect(res.status).toBe(500);
    expect(balance).toBe(100);
  });

  it("refuses simulator mode in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ amount_paise: 2900 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Simulator mode is disabled in production" });
    expect(balance).toBe(100);
  });
});

describe("GET /api/wallet/topup", () => {
  it("returns the payment mode", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ mode: "simulator" });
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    expect((await GET()).status).toBe(401);
  });
});

describe("POST /api/wallet/topup (live)", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENT_MODE", "live");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret");
  });

  it("creates a Razorpay order with notes and a receipt, and does not credit", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "order_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ amount_paise: 9900 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order_id: "order_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ amount: 9900, currency: "INR", notes: { user_id: "user-1" } });
    expect(sent.receipt).toMatch(/^user-1/);
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(balance).toBe(100);
    expect(inserted).toHaveLength(0);
  });

  it("returns 500 when Razorpay rejects the order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ amount_paise: 2900 }));
    expect(res.status).toBe(500);
  });
});
