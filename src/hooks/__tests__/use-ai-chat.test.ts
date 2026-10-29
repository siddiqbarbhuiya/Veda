import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const fsState = vi.hoisted(() => ({ content: "let x = 1;" }));
vi.mock("@/hooks/use-file-system", () => ({
  useFileSystem: () => ({ activeFile: { path: "a.js", name: "a.js", type: "file", content: fsState.content } }),
}));

import { useAiChat } from "../use-ai-chat";

function sseResponse(events: object[]) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      // Split mid-event to exercise buffering.
      const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
      c.enqueue(enc.encode(text.slice(0, 20)));
      c.enqueue(enc.encode(text.slice(20)));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const EVENTS = [
  { chunk: "Hel", done: false },
  { chunk: "lo", done: false },
  { chunk: "", done: true, usage: { input_tokens: 10, output_tokens: 5 }, cost_paise: 7 },
];

afterEach(() => {
  vi.unstubAllGlobals();
  fsState.content = "let x = 1;";
});

describe("useAiChat", () => {
  it("appends the user message and sends file context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(EVENTS));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.messages[0]).toEqual({ role: "user", content: "hi" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.provider).toBe("openai");
    expect(body.stream).toBe(true);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("let x = 1;");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "hi" });
  });

  it("builds the assistant message from chunks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(EVENTS)));
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toEqual({ role: "assistant", content: "Hello" });
    expect(result.current.isStreaming).toBe(false);
  });

  it("updates cost from the final event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(EVENTS)));
    const { result } = renderHook(() => useAiChat());
    expect(result.current.estimatedCostPaise).toBe(0);
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    await waitFor(() => expect(result.current.estimatedCostPaise).toBe(7));
  });

  describe("HTTP errors", () => {
    const CHOICE = { provider: "openai", model: "gpt-4o" };
    const failWith = (status: number, body: object, headers: Record<string, string> = {}) =>
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
      );

    async function send(fetchMock: ReturnType<typeof vi.fn>) {
      vi.stubGlobal("fetch", fetchMock);
      const hook = renderHook(() => useAiChat());
      await act(async () => {
        await hook.result.current.sendMessage("hi", CHOICE);
      });
      return hook.result;
    }

    it("401 offers a plain sign-in link and removes the dangling message", async () => {
      const result = await send(failWith(401, { error: "Not authenticated", code: "unauthenticated" }));
      expect(result.current.error?.action).toEqual({ kind: "link", label: "Sign in again", href: "/login" });
      expect(result.current.messages).toEqual([]);
      expect(result.current.draft).toBe("hi");
    });

    it("400 no_api_key links to the dashboard", async () => {
      const result = await send(failWith(400, { error: "No API key saved for OpenAI", code: "no_api_key" }));
      expect(result.current.error?.action).toEqual({ kind: "link", label: "Add your API key", href: "/dashboard" });
    });

    it("402 links to the top-up", async () => {
      const result = await send(failWith(402, { error: "Insufficient balance", code: "insufficient_balance" }));
      expect(result.current.error?.action).toEqual({ kind: "link", label: "Add credits", href: "/dashboard?topup=1" });
    });

    it("429 sets a retry countdown from the body, or the Retry-After header", async () => {
      let result = await send(failWith(429, { error: "Too many requests", code: "rate_limited", retry_after: 42 }));
      expect(result.current.error?.retryAfter).toBe(42);
      result = await send(failWith(429, { error: "x" }, { "Retry-After": "9" }));
      expect(result.current.error?.retryAfter).toBe(9);
    });

    it("provider_auth shows the key message and links to the dashboard", async () => {
      const result = await send(
        failWith(502, { error: "Your OpenAI key was rejected. Check the key in your dashboard.", code: "provider_auth" }),
      );
      expect(result.current.error?.message).toContain("key was rejected");
      expect(result.current.error?.action).toMatchObject({ kind: "link", href: "/dashboard" });
    });

    it("413 says the message is too long", async () => {
      const result = await send(failWith(413, { error: "Message too long", code: "payload_too_large" }));
      expect(result.current.error?.message).toContain("Message too long");
    });

    it("5xx offers Retry, which re-sends the last user message once", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "down", code: "provider_error" }), { status: 502 }))
        .mockResolvedValueOnce(sseResponse(EVENTS));
      const result = await send(fetchMock);
      expect(result.current.error?.action).toEqual({ kind: "retry" });
      expect(result.current.messages).toEqual([]);
      await act(async () => {
        result.current.retry();
      });
      await waitFor(() => expect(result.current.messages).toHaveLength(2));
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages.at(-1)).toEqual({ role: "user", content: "hi" });
      expect(result.current.error).toBeNull();
    });
  });

  it("dispatches veda:balance-changed after a reply settles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(EVENTS)));
    const listener = vi.fn();
    window.addEventListener("veda:balance-changed", listener);
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    window.removeEventListener("veda:balance-changed", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the partial reply and shows the error from an in-stream error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          { chunk: "Part", done: false },
          { chunk: "", done: true, error: "Your OpenAI key was rejected.", code: "provider_auth", cost_paise: 3 },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.messages[1]).toEqual({ role: "assistant", content: "Part" });
    expect(result.current.error?.code).toBe("provider_auth");
    expect(result.current.error?.message).toContain("rejected");
  });

  it("shows an error and removes both messages for an empty reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([{ chunk: "", done: true, cost_paise: 1 }])));
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error?.code).toBe("empty_reply");
    expect(result.current.error?.action).toEqual({ kind: "retry" });
  });

  it("accepts CRLF separators and an event split mid-way", async () => {
    const enc = new TextEncoder();
    const text =
      `data: ${JSON.stringify({ chunk: "Hi", done: false })}\r\n\r\n` +
      `data: ${JSON.stringify({ chunk: "", done: true, cost_paise: 2 })}\r\n\r\n`;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(text.slice(0, 30)));
        c.enqueue(enc.encode(text.slice(30)));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.messages[1].content).toBe("Hi");
    expect(result.current.estimatedCostPaise).toBe(2);
  });

  it("flags a cut-off reply when finish_reason is length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          { chunk: "Long", done: false },
          { chunk: "", done: true, cost_paise: 4, finish_reason: "length" },
        ]),
      ),
    );
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.truncated).toBe(true);
  });

  it("ignores a second send while a stream is running", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_, reject) =>
          init.signal.addEventListener("abort", () => reject(Object.assign(new Error("a"), { name: "AbortError" }))),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.sendMessage("one", { provider: "openai", model: "gpt-4o" });
      void result.current.sendMessage("two", { provider: "openai", model: "gpt-4o" });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.stop();
      await first;
    });
  });

  it("on Stop with no text removes the messages and restores the draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_u: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) =>
            init.signal.addEventListener("abort", () => reject(Object.assign(new Error("a"), { name: "AbortError" }))),
          ),
      ),
    );
    const { result } = renderHook(() => useAiChat());
    let p!: Promise<void>;
    await act(async () => {
      p = result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    expect(result.current.isStreaming).toBe(true);
    await act(async () => {
      result.current.stop();
      await p;
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.draft).toBe("hi");
    expect(result.current.isStreaming).toBe(false);
  });

  it("on Stop with partial text keeps the reply", async () => {
    const enc = new TextEncoder();
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctl = c;
        c.enqueue(enc.encode(`data: ${JSON.stringify({ chunk: "Par", done: false })}\n\n`));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_u: string, init: { signal: AbortSignal }) => {
        init.signal.addEventListener("abort", () => ctl.error(Object.assign(new Error("a"), { name: "AbortError" })));
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );
    const { result } = renderHook(() => useAiChat());
    let p!: Promise<void>;
    await act(async () => {
      p = result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe("Par"));
    await act(async () => {
      result.current.stop();
      await p;
    });
    expect(result.current.messages[1]).toEqual({ role: "assistant", content: "Par" });
    expect(result.current.error).toBeNull();
  });

  it("caps the file context at 20,000 characters and says so", async () => {
    fsState.content = "x".repeat(25_000);
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(EVENTS));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    const ctx: string = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(ctx).toContain("cut off");
    expect(ctx).toContain("20,000");
    expect(ctx.length).toBeLessThan(21_000);
  });

  it("sends only the last 20 history messages", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(sseResponse(EVENTS)));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    for (let i = 0; i < 14; i++) {
      await act(async () => {
        await result.current.sendMessage(`m${i}`, { provider: "openai", model: "gpt-4o" });
      });
    }
    const sent = JSON.parse(fetchMock.mock.calls[13][1].body).messages;
    // system + at most 20 history + the new user message
    expect(sent.length).toBeLessThanOrEqual(22);
    expect(sent[1].role).toBe("user");
  });

  it("New chat clears the conversation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(EVENTS)));
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("hi", { provider: "openai", model: "gpt-4o" });
    });
    act(() => result.current.newChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe("useAiChat compact", () => {
  const choice = { provider: "openrouter", model: "a/b:free" };

  it("replaces the conversation with a summary and an acknowledgement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(EVENTS))
      .mockResolvedValueOnce(
        sseResponse([
          { chunk: "We talked about ", done: false },
          { chunk: "a todo app.", done: false },
          { chunk: "", done: true, cost_paise: 0 },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("first question", choice);
    });
    expect(result.current.messages).toHaveLength(2);
    await act(async () => {
      await result.current.compact(choice);
    });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.messages.at(-1).content).toMatch(/Summarize our conversation/);
    expect(result.current.messages).toEqual([
      { role: "user", content: "Summary of our conversation so far:\n\nWe talked about a todo app." },
      { role: "assistant", content: "Understood. I will continue from this summary." },
    ]);
    expect(result.current.isStreaming).toBe(false);
  });

  it("does nothing when there is no conversation yet", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.compact(choice);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the conversation and shows an error when the summary fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(EVENTS))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "x", code: "insufficient_balance" }), { status: 402 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAiChat());
    await act(async () => {
      await result.current.sendMessage("q", choice);
    });
    await act(async () => {
      await result.current.compact(choice);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("q");
    expect(result.current.error?.code).toBe("insufficient_balance");
  });
});
