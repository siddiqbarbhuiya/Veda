import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const fs = vi.hoisted(() => ({
  files: [{ name: "a.js", path: "a.js", type: "file", content: "A" }] as unknown[],
  createFile: vi.fn(),
  updateFileContent: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock("@/hooks/use-file-system", () => ({
  useFileSystem: () => ({
    files: fs.files,
    projectName: "default",
    createFile: fs.createFile,
    updateFileContent: fs.updateFileContent,
    deleteFile: fs.deleteFile,
  }),
}));

import { describeAgentError, useAgent } from "../use-agent";

const choice = { provider: "openrouter", model: "a/b:free" };

function sse(events: object[], runId = "s1.r1") {
  const enc = new TextEncoder();
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const body = new ReadableStream({
    start(c) {
      // Split in the middle of an event to exercise buffering.
      c.enqueue(enc.encode(text.slice(0, 15)));
      c.enqueue(enc.encode(text.slice(15)));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream", "X-Agent-Run": runId } });
}

const text = (seq: number) => ({ seq, type: "text", text: `t${seq}` });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("useAgent", () => {
  it("sends the project, the prompt and the model, and collects events", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([text(0), { seq: 1, type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    await act(async () => {
      await result.current.send("build it", choice);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agent/run");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ project: "default", prompt: "build it", model: choice, newConversation: true });
    expect(body.files).toEqual(fs.files);
    expect(result.current.turns[0].events.map((e) => e.seq)).toEqual([0, 1]);
    expect(result.current.turns[0].runId).toBe("s1.r1");
    expect(result.current.running).toBe(false);
  });

  it("reconnects with the last seq plus one and drops duplicate events", async () => {
    const fetchMock = vi
      .fn()
      // The first connection ends after seq 2, without "done".
      .mockResolvedValueOnce(sse([text(0), text(1), text(2)]))
      // The reconnect repeats seq 1 and 2, then finishes.
      .mockResolvedValueOnce(sse([text(1), text(2), text(3), { seq: 4, type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    await act(async () => {
      await result.current.send("go", choice);
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/agent/run?run=s1.r1&from=3");
    expect(result.current.turns[0].events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(result.current.error).toBeNull();
  });

  it("removes the turn and gives the text back when the run does not start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "no key", code: "no_api_key" }), { status: 400 }))
    );
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    await act(async () => {
      await result.current.send("hello", choice);
    });
    expect(result.current.turns).toEqual([]);
    expect(result.current.draft).toBe("hello");
    expect(result.current.error?.code).toBe("no_api_key");
    expect(result.current.running).toBe(false);
  });

  it("does not start a second run while one is going", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn().mockImplementation(async () => {
      await gate;
      return sse([{ seq: 0, type: "done" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    let first!: Promise<void>;
    act(() => {
      first = result.current.send("one", choice);
    });
    await act(async () => {
      await result.current.send("two", choice);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await act(async () => {
      await first;
    });
  });

  it("stops by asking the server, and keeps the stream open", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/agent/stop") return new Response("{}", { status: 200 });
      return sse([text(0), { seq: 1, type: "done" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    await act(async () => {
      await result.current.send("go", choice);
    });
    act(() => result.current.stop());
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/api/agent/stop")).toBe(true));
    const stopCall = fetchMock.mock.calls.find((c) => c[0] === "/api/agent/stop")!;
    expect(JSON.parse(stopCall[1].body)).toEqual({ run: "s1.r1" });
  });

  it("applies accepted changes, marks conflicts, and marks rejected ones", async () => {
    const changes = [
      { path: "a.js", op: "update", content: "A2" },
      { path: "new.js", op: "create", content: "N" },
      { path: "b.js", op: "update", content: "B2" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([{ seq: 0, type: "changes", changes }, { seq: 1, type: "done" }])));
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    await act(async () => {
      await result.current.send("go", choice);
    });
    const id = result.current.turns[0].id;
    act(() => result.current.accept(id, ["a.js", "new.js"]));
    act(() => result.current.reject(id, ["b.js"]));
    expect(fs.updateFileContent).toHaveBeenCalledWith("a.js", "A2");
    expect(fs.createFile).toHaveBeenCalledWith("new.js", "file", "N");
    expect(result.current.decisions[id]).toEqual({ "a.js": "applied", "new.js": "applied", "b.js": "rejected" });
  });

  it("new chat clears the turns and the next run starts a new conversation", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => sse([{ seq: 0, type: "done" }]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAgent({ reconnectDelayMs: 0 }));
    await act(async () => {
      await result.current.send("one", choice);
    });
    await act(async () => {
      await result.current.send("two", choice);
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).newConversation).toBe(false);
    act(() => result.current.newChat());
    expect(result.current.turns).toEqual([]);
    await act(async () => {
      await result.current.send("three", choice);
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).newConversation).toBe(true);
  });
});

describe("describeAgentError", () => {
  it("maps the Claude Code codes", () => {
    expect(describeAgentError(503, "agent_unavailable", undefined).message).toMatch(/not set up/);
    expect(describeAgentError(409, "busy", "Wait.").message).toBe("Wait.");
    expect(describeAgentError(502, "sandbox_unavailable", undefined).action).toEqual({ kind: "retry" });
    expect(describeAgentError(400, "no_api_key", undefined).action?.kind).toBe("link");
  });
});
