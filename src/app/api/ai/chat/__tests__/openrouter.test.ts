// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  estimateHoldPaise: vi.fn(),
  deductHold: vi.fn(),
  settleHold: vi.fn(),
  decrypt: vi.fn(),
  streamChat: vi.fn(),
  fetchModels: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({
        data: { encrypted_key: "enc", iv: "iv", auth_tag: "tag", input_paise_per_1k_tokens: 10, output_paise_per_1k_tokens: 30 },
        error: null,
      });
      return chain;
    },
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@/lib/circuit-breaker", () => ({ checkCircuitBreaker: async () => ({ allowed: true }) }));
vi.mock("@/lib/billing/hold", () => ({
  estimateHoldPaise: mocks.estimateHoldPaise,
  deductHold: mocks.deductHold,
  settleHold: mocks.settleHold,
}));
vi.mock("@/lib/crypto/encryption", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/lib/ai-providers", () => ({ getProviderAdapter: () => ({ streamChat: mocks.streamChat }) }));
vi.mock("@/lib/openrouter/models", async (orig) => ({
  ...(await orig<typeof import("@/lib/openrouter/models")>()),
  fetchOpenRouterModels: mocks.fetchModels,
}));

import { POST } from "../route";

const FREE = "meta-llama/llama-3.3-70b-instruct:free";
const PAID = "anthropic/claude-sonnet-4";

function req(body: unknown) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const base = { messages: [{ role: "user", content: "hello world!" }], stream: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mocks.estimateHoldPaise.mockReturnValue(20);
  mocks.deductHold.mockResolvedValue({ success: true, newBalance: 80 });
  mocks.settleHold.mockResolvedValue(undefined);
  mocks.decrypt.mockReturnValue("or-key");
  mocks.fetchModels.mockResolvedValue([
    { id: FREE, name: "Free", context_length: 1, free: true, prompt_usd_per_token: 0, completion_usd_per_token: 0 },
    { id: PAID, name: "Paid", context_length: 1, free: false, prompt_usd_per_token: 0.000003, completion_usd_per_token: 0.000015 },
  ]);
  mocks.streamChat.mockImplementation(async function* () {
    yield { chunk: "Hi there", done: false };
    yield { chunk: "", done: true, usage: { input_tokens: 100, output_tokens: 50 } };
  });
});

describe("chat route with OpenRouter", () => {
  it("passes a model id with slash and colon to the adapter unchanged", async () => {
    const res = await POST(req({ ...base, provider: "openrouter", model: FREE }));
    expect(res.status).toBe(200);
    await res.text();
    expect(mocks.streamChat.mock.calls[0][1]).toBe(FREE);
  });

  it("charges 0 paise for a free model and settles the full hold back", async () => {
    const res = await POST(req({ ...base, provider: "openrouter", model: FREE }));
    await res.text();
    expect(mocks.settleHold).toHaveBeenCalledTimes(1);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
  });

  it("answers model_unsupported for an id that is not in the catalogue", async () => {
    const res = await POST(req({ ...base, provider: "openrouter", model: "nope/none" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("model_unsupported");
    expect(mocks.deductHold).not.toHaveBeenCalled();
  });

  it("answers 500 when the catalogue cannot load", async () => {
    mocks.fetchModels.mockRejectedValue(new Error("down"));
    const res = await POST(req({ ...base, provider: "openrouter", model: FREE }));
    expect(res.status).toBe(500);
    expect(mocks.deductHold).not.toHaveBeenCalled();
  });
});

describe("combo fallback", () => {
  const limited = () =>
    async function* () {
      throw Object.assign(new Error("rate limited"), { status: 429 });
    };

  it("moves to the next entry when the first fails with 429 before any text", async () => {
    mocks.streamChat.mockImplementationOnce(limited());
    const res = await POST(
      req({ ...base, provider: "openrouter", model: FREE, fallbacks: [{ provider: "openrouter", model: PAID }] })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Hi there");
    expect(mocks.streamChat).toHaveBeenCalledTimes(2);
    expect(mocks.streamChat.mock.calls[1][1]).toBe(PAID);
    // 100 input and 50 output tokens at the PAID rate (27 and 135 paise per 1k) = 3 + 7 = 10, below the hold of 20.
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 10);
  });

  it("does not move on for a 401", async () => {
    mocks.streamChat.mockImplementationOnce(async function* () {
      throw Object.assign(new Error("bad key"), { status: 401 });
    });
    const res = await POST(
      req({ ...base, provider: "openrouter", model: FREE, fallbacks: [{ provider: "openrouter", model: PAID }] })
    );
    expect(res.status).toBe(502);
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
  });

  it("fails with the last error when every entry is limited", async () => {
    mocks.streamChat.mockImplementation(limited());
    const res = await POST(
      req({ ...base, provider: "openrouter", model: FREE, fallbacks: [{ provider: "openrouter", model: PAID }] })
    );
    expect(res.status).toBe(429);
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
  });

  it("skips a first model that is not in the catalogue and runs the next entry", async () => {
    const res = await POST(
      req({ ...base, provider: "openrouter", model: "gone/vanished:free", fallbacks: [{ provider: "openrouter", model: FREE }] })
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(mocks.streamChat.mock.calls[0][1]).toBe(FREE);
    // The hold and the cost use the model that ran: FREE costs 0.
    expect(mocks.settleHold).toHaveBeenCalledWith("user-1", 20, 0);
  });

  it("answers with the first entry's error when no entry can run", async () => {
    const res = await POST(
      req({ ...base, provider: "openrouter", model: "gone/one", fallbacks: [{ provider: "openrouter", model: "gone/two" }] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("model_unsupported");
    expect(mocks.deductHold).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("rejects more than 4 fallbacks", async () => {
    const res = await POST(
      req({ ...base, provider: "openrouter", model: FREE, fallbacks: new Array(5).fill({ provider: "openrouter", model: PAID }) })
    );
    expect(res.status).toBe(400);
  });
});
