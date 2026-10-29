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

function makeRequest(body: unknown, signal?: AbortSignal) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

const validBody = {
  provider: "openai",
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello world!" }],
  stream: true,
};

// A generator that yields some text, then waits for the abort signal and throws AbortError.
function abortableStream(text: string) {
  return async function* (_k: string, _m: string, _msgs: unknown, signal: AbortSignal) {
    if (text) yield { chunk: text, done: false };
    await new Promise((_, reject) => {
      const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail);
    });
  };
}

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
    expect((await res.json()).code).toBe("unauthenticated");
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
    expect(await res.json()).toMatchObject({ code: "rate_limited", retry_after: 42 });
    expect(mocks.deductHold).not.toHaveBeenCalled();
  });

  it("returns 402 when the balance is insufficient", async () => {
    mocks.deductHold.mockResolvedValue({ success: false, newBalance: 0 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("insufficient_balance");
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("returns a JSON 503 when billing fails", async () => {
    mocks.deductHold.mockRejectedValue(new Error("conflict"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("billing_unavailable");
  });

  it("returns 200 SSE stream and settles the hold", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(res.body).toBeInstanceOf(ReadableStream);

    const text = await res.text();
    expect(text).toBe(
      'data: {"chunk":"Hel","done":false}\n\n' +
        'data: {"chunk":"lo","done":false}\n\n' +
        'data: {"chunk":"","done":true,"usage":{"input_tokens":5,"output_tokens":2},"cost_paise":7}\n\n'
    );
    expect(mocks.decrypt).toHaveBeenCalledWith("enc", "iv", "tag");
    expect(mocks.streamChat).toHaveBeenCalledWith(
      "sk-plain",
      "gpt-4o-mini",
      validBody.messages,
      expect.any(AbortSignal)
    );
    expect(mocks.settleHold).toHaveBeenCalledTimes(1);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 7);
  });

  it("puts finish_reason in the done event", async () => {
    mocks.streamChat.mockImplementation(async function* () {
      yield { chunk: "Hi", done: false };
      yield { chunk: "", done: true, usage: { input_tokens: 5, output_tokens: 2 }, finish_reason: "length" };
    });
    const text = await (await POST(makeRequest(validBody))).text();
    expect(text).toContain('"finish_reason":"length"');
  });

  describe("usage handling", () => {
    it("charges the estimate when usage is 0/0", async () => {
      mocks.calculateCostPaise.mockReturnValue(9);
      mocks.streamChat.mockImplementation(async function* () {
        yield { chunk: "Hi!!", done: false };
        yield { chunk: "", done: true, usage: { input_tokens: 0, output_tokens: 0 } };
      });
      const text = await (await POST(makeRequest(validBody))).text();
      // input estimate: ceil(12 / 4) + 4 overhead = 7; output estimate: ceil(4 / 4) = 1
      expect(mocks.calculateCostPaise).toHaveBeenCalledWith(7, 1, rate);
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 9);
      expect(text).toContain('"cost_paise":9');
      expect(text).not.toContain('"usage"');
    });

    it("charges the estimate, capped at the hold, when usage is missing", async () => {
      mocks.calculateCostPaise.mockReturnValue(99);
      mocks.streamChat.mockImplementation(async function* () {
        yield { chunk: "Hello", done: false };
        yield { chunk: "", done: true };
      });
      await (await POST(makeRequest(validBody))).text();
      expect(mocks.settleHold).toHaveBeenCalledTimes(1);
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 20);
    });
  });

  describe("client abort", () => {
    it("settles the partial cost (not 0) when the client aborts mid-stream", async () => {
      let seenSignal: AbortSignal | undefined;
      const inner = abortableStream("Hello wor");
      mocks.streamChat.mockImplementation(async function* (k: string, m: string, msgs: unknown, signal: AbortSignal) {
        seenSignal = signal;
        yield* inner(k, m, msgs, signal);
      });
      const ac = new AbortController();
      const res = await POST(makeRequest(validBody, ac.signal));
      const reader = res.body!.getReader();
      await reader.read();
      ac.abort();
      while (!(await reader.read()).done) {
        /* drain */
      }
      expect(seenSignal?.aborted).toBe(true);
      // output estimate: ceil(9 / 4) = 3
      expect(mocks.calculateCostPaise).toHaveBeenCalledWith(7, 3, rate);
      expect(mocks.settleHold).toHaveBeenCalledTimes(1);
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 7);
    });

    it("settles the partial cost when the response stream is cancelled", async () => {
      mocks.streamChat.mockImplementation(abortableStream("Hello"));
      const res = await POST(makeRequest(validBody));
      const reader = res.body!.getReader();
      await reader.read();
      await reader.cancel();
      await vi.waitFor(() => expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 7));
      expect(mocks.settleHold).toHaveBeenCalledTimes(1);
    });

    it("refunds the full hold when the client aborts before any text", async () => {
      mocks.streamChat.mockImplementation(abortableStream(""));
      const ac = new AbortController();
      const pending = POST(makeRequest(validBody, ac.signal));
      await new Promise((r) => setTimeout(r, 10));
      ac.abort();
      await pending;
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
    });
  });

  it("charges the partial cost and sends code + error when the stream fails after text", async () => {
    mocks.streamChat.mockImplementation(async function* () {
      yield { chunk: "Hel", done: false };
      throw new Error("provider down");
    });
    const text = await (await POST(makeRequest(validBody))).text();
    expect(text).toContain('"error"');
    expect(text).toContain('"code":"provider_error"');
    expect(mocks.settleHold).toHaveBeenCalledTimes(1);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 7);
  });

  describe("provider failures before the first chunk", () => {
    it("maps 401 to HTTP 502 provider_auth and refunds", async () => {
      mocks.streamChat.mockImplementation(async function* () {
        throw Object.assign(new Error("Incorrect API key provided: sk-abc123"), { status: 401 });
      });
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: "Your OpenAI key was rejected. Check the key in your dashboard.",
        code: "provider_auth",
      });
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
    });

    it("maps 429 to provider_rate_limit with retry_after and Retry-After", async () => {
      mocks.streamChat.mockImplementation(async function* () {
        throw Object.assign(new Error("slow down"), { status: 429, retryAfter: 12 });
      });
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("12");
      const body = await res.json();
      expect(body.code).toBe("provider_rate_limit");
      expect(body.retry_after).toBe(12);
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
    });

    it("maps other failures to 502 provider_error with a sanitized message", async () => {
      mocks.streamChat.mockImplementation(async function* () {
        throw Object.assign(new Error("Server exploded for key sk-secret-key-123456"), { status: 500 });
      });
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.code).toBe("provider_error");
      expect(body.error).not.toContain("sk-secret");
      expect(body.error).toContain("Server exploded");
      expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
    });
  });

  it("checks the API key BEFORE the hold and leaves the ledger alone", async () => {
    mocks.tables.api_keys = { data: null, error: null };
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("no_api_key");
    expect(mocks.deductHold).not.toHaveBeenCalled();
    expect(mocks.settleHold).not.toHaveBeenCalled();
  });

  it("returns 500 when the key lookup fails, before any hold", async () => {
    mocks.tables.api_keys = { data: null, error: { message: "db down" } };
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    expect(mocks.deductHold).not.toHaveBeenCalled();
  });

  describe("validation", () => {
    it("returns 413 for more than 40 messages", async () => {
      const messages = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" }));
      const res = await POST(makeRequest({ ...validBody, messages }));
      expect(res.status).toBe(413);
      expect((await res.json()).code).toBe("too_many_messages");
      expect(mocks.deductHold).not.toHaveBeenCalled();
    });

    it("returns 413 for more than 200 KB of content", async () => {
      const res = await POST(
        makeRequest({ ...validBody, messages: [{ role: "user", content: "x".repeat(200_001) }] })
      );
      expect(res.status).toBe(413);
      expect((await res.json()).code).toBe("payload_too_large");
    });

    it("returns 400 for empty content", async () => {
      const res = await POST(makeRequest({ ...validBody, messages: [{ role: "user", content: "   " }] }));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("empty_content");
    });

    it("returns 400 when the first message is from the assistant", async () => {
      const res = await POST(
        makeRequest({ ...validBody, messages: [{ role: "assistant", content: "hi" }, { role: "user", content: "yo" }] })
      );
      expect(res.status).toBe(400);
    });

    it("accepts a leading system message before the user message", async () => {
      const res = await POST(
        makeRequest({ ...validBody, messages: [{ role: "system", content: "ctx" }, { role: "user", content: "yo" }] })
      );
      expect(res.status).toBe(200);
      await res.text();
    });

    it("returns 400 for an empty messages array", async () => {
      const res = await POST(makeRequest({ ...validBody, messages: [] }));
      expect(res.status).toBe(400);
    });
  });
});
