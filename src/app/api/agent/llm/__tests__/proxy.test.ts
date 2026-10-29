// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ loadProviderKey: vi.fn() }));

vi.mock("@/lib/agent/admin", () => ({
  createAdminClient: () => ({}),
  loadProviderKey: mocks.loadProviderKey,
}));

import { POST } from "../v1/messages/route";
import { signAgentToken } from "@/lib/agent/token";

const SECRET = "ab".repeat(32);
const REAL_KEY = "sk-or-REAL-KEY-123";

const combo = [
  { provider: "openrouter", model: "a/first:free" },
  { provider: "openrouter", model: "b/second" },
];

function token(over: Partial<Parameters<typeof signAgentToken>[0]> = {}, now?: number) {
  return signAgentToken({ userId: "u1", runId: "s1.r1", combo, strategy: "priority", ...over }, SECRET, now);
}

function req(tok: string, body: unknown = { model: "whatever", messages: [{ role: "user", content: "hi" }], stream: true }) {
  return new Request("http://localhost/api/agent/llm/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}`, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
}

const sse = () => new Response("event: message_start\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_SECRET", SECRET);
  mocks.loadProviderKey.mockReset();
  mocks.loadProviderKey.mockResolvedValue(REAL_KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("agent LLM proxy", () => {
  it("answers 401 for an expired token and never calls the upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token({ ttlSeconds: 60 }, Date.now() - 3_600_000)));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.loadProviderKey).not.toHaveBeenCalled();
  });

  it("answers 401 for a changed token and for no token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = token();
    const [body, sig] = t.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.userId = "other";
    const bad = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect((await POST(req(bad))).status).toBe(401);
    expect((await POST(req(""))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the real key and the combo model upstream, and never returns the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token()));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(REAL_KEY);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/messages");
    expect(init.headers.Authorization).toBe(`Bearer ${REAL_KEY}`);
    expect(JSON.parse(init.body).model).toBe("a/first:free");
    expect(mocks.loadProviderKey).toHaveBeenCalledWith(expect.anything(), "u1", "openrouter");
  });

  it("uses the x-api-key header for Anthropic", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse());
    vi.stubGlobal("fetch", fetchMock);
    await POST(req(token({ combo: [{ provider: "anthropic", model: "claude-sonnet-5-5" }] })));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe(REAL_KEY);
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("tries the next combo entry on 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"rate"}', { status: 429 }))
      .mockResolvedValueOnce(sse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token()));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("b/second");
  });

  it("does not move on for a 400 and returns the provider error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"bad request"}', { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token()));
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the last error when every entry is limited", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{"error":"rate"}', { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token()));
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers 400 and does not call the upstream when no key is saved", async () => {
    mocks.loadProviderKey.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token()));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores providers that Claude Code cannot use", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token({ combo: [{ provider: "openai", model: "gpt-4o" }] })));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the request to the student's own OmniRoute with the combo name, and never follows a redirect", async () => {
    mocks.loadProviderKey.mockResolvedValue(JSON.stringify({ baseUrl: "http://localhost:20128", apiKey: "omni-key" }));
    const fetchMock = vi.fn().mockResolvedValue(sse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token({ combo: [{ provider: "omniroute", model: "veda_combo" }] })));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:20128/v1/messages");
    expect(init.headers.Authorization).toBe("Bearer omni-key");
    expect(init.redirect).toBe("manual");
    expect(JSON.parse(init.body).model).toBe("veda_combo");
    expect(await res.text()).not.toContain("omni-key");
  });

  it("does not call out when the saved OmniRoute settings are unsafe", async () => {
    mocks.loadProviderKey.mockResolvedValue(JSON.stringify({ baseUrl: "http://10.1.1.1:20128", apiKey: "k" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(token({ combo: [{ provider: "omniroute", model: "veda_combo" }] })));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back from OmniRoute to the next entry when it is down", async () => {
    mocks.loadProviderKey.mockImplementation(async (_a: unknown, _u: string, provider: string) =>
      provider === "omniroute" ? JSON.stringify({ baseUrl: "http://localhost:20128", apiKey: "omni-key" }) : REAL_KEY
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(sse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      req(token({ combo: [{ provider: "omniroute", model: "veda_combo" }, { provider: "openrouter", model: "a/b:free" }] }))
    );
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/messages");
  });
});
