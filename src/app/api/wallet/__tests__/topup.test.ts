import { describe, it, expect, beforeEach, vi } from "vitest";

let currentUser: { id: string } | null = null;
let balance = 0;
let inserted: Record<string, unknown>[] = [];

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

import { POST } from "../topup/route";

function req(body: unknown) {
  return new Request("http://localhost/api/wallet/topup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  currentUser = { id: "user-1" };
  balance = 100;
  inserted = [];
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
});
