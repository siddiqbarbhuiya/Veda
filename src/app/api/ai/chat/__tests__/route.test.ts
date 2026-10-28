// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkCircuitBreaker: vi.fn(),
  estimateHoldPaise: vi.fn(),
  deductHold: vi.fn(),
  settleHold: vi.fn(),
  calculateCostPaise: vi.fn(),
  decrypt: vi.fn(),
  streamChat: vi.fn(),
  getProviderAdapter: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => mocks.tables[table] ?? { data: null, error: null };
      return chain;
    },
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@/lib/circuit-breaker", () => ({ checkCircuitBreaker: mocks.checkCircuitBreaker }));
vi.mock("@/lib/billing/hold", () => ({
  estimateHoldPaise: mocks.estimateHoldPaise,
  deductHold: mocks.deductHold,
  settleHold: mocks.settleHold,
}));
vi.mock("@/lib/billing/cost", () => ({ calculateCostPaise: mocks.calculateCostPaise }));
vi.mock("@/lib/crypto/encryption", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/lib/ai-providers", () => ({ getProviderAdapter: mocks.getProviderAdapter }));

import { POST } from "../route";

const rate = { input_paise_per_1k_tokens: 10, output_paise_per_1k_tokens: 30 };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  provider: "openai",
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello world!" }],
  stream: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = {
    rate_config: { data: rate, error: null },
    api_keys: { data: { encrypted_key: "enc", iv: "iv", auth_tag: "tag" }, error: null },
  };
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mocks.checkCircuitBreaker.mockResolvedValue({ allowed: true, retryAfterSeconds: null });
  mocks.estimateHoldPaise.mockReturnValue(20);
  mocks.deductHold.mockResolvedValue({ success: true, newBalance: 80 });
  mocks.settleHold.mockResolvedValue(undefined);
  mocks.calculateCostPaise.mockReturnValue(7);
  mocks.decrypt.mockReturnValue("sk-plain");
  mocks.getProviderAdapter.mockReturnValue({ streamChat: mocks.streamChat });
  mocks.streamChat.mockImplementation(async function* () {
    yield { chunk: "Hel", done: false };
    yield { chunk: "lo", done: false };
    yield { chunk: "", done: true, usage: { input_tokens: 5, output_tokens: 2 } };
  });
});

describe("POST /api/ai/chat", () => {
  it("returns 401 when not authenticated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
    expect(mocks.deductHold).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid provider", async () => {
    const res = await POST(makeRequest({ ...validBody, provider: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the model is not in rate_config", async () => {
    mocks.tables.rate_config = { data: null, error: null };
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 429 with Retry-After when the circuit breaker triggers", async () => {
    mocks.checkCircuitBreaker.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(mocks.deductHold).not.toHaveBeenCalled();
  });

  it("returns 402 when the balance is insufficient", async () => {
    mocks.deductHold.mockResolvedValue({ success: false, newBalance: 0 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(402);
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("returns 200 SSE stream and settles the hold", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.body).toBeInstanceOf(ReadableStream);

    const text = await res.text();
    expect(text).toBe(
      'data: {"chunk":"Hel","done":false}\n\n' +
        'data: {"chunk":"lo","done":false}\n\n' +
        'data: {"chunk":"","done":true,"usage":{"input_tokens":5,"output_tokens":2},"cost_paise":7}\n\n'
    );
    expect(mocks.decrypt).toHaveBeenCalledWith("enc", "iv", "tag");
    expect(mocks.streamChat).toHaveBeenCalledWith("sk-plain", "gpt-4o-mini", validBody.messages);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 7);
  });

  it("refunds the full hold when the stream fails", async () => {
    mocks.streamChat.mockImplementation(async function* () {
      yield { chunk: "Hel", done: false };
      throw new Error("provider down");
    });
    const res = await POST(makeRequest(validBody));
    const text = await res.text();
    expect(text).toContain('"error"');
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
  });

  it("refunds the hold when the API key is missing", async () => {
    mocks.tables.api_keys = { data: null, error: null };
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
  });
});
