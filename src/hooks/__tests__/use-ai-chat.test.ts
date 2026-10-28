import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/hooks/use-file-system", () => ({
  useFileSystem: () => ({ activeFile: { path: "a.js", name: "a.js", type: "file", content: "let x = 1;" } }),
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

afterEach(() => vi.unstubAllGlobals());

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
});
