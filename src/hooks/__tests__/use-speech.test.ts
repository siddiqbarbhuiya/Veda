import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { appendSpoken, useSpeech } from "../use-speech";

type Handlers = {
  onresult?: (e: unknown) => void;
  onerror?: (e: { error: string }) => void;
  onend?: () => void;
};
let last: FakeRec | null = null;

class FakeRec {
  started = false;
  stopped = false;
  lang = "";
  continuous = false;
  interimResults = true;
  onresult?: Handlers["onresult"];
  onerror?: Handlers["onerror"];
  onend?: Handlers["onend"];
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the test needs the instance the hook creates
    last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
}

const result = (phrases: { t: string; final: boolean }[]) => ({
  resultIndex: 0,
  results: phrases.map((p) => Object.assign([{ transcript: p.t }], { isFinal: p.final })),
});

afterEach(() => {
  vi.unstubAllGlobals();
  last = null;
});

describe("appendSpoken", () => {
  it("joins with one space and keeps an existing trailing space", () => {
    expect(appendSpoken("", "hello")).toBe("hello");
    expect(appendSpoken("make a page", "with a button")).toBe("make a page with a button");
    expect(appendSpoken("make a page ", "with a button")).toBe("make a page with a button");
  });
});

describe("useSpeech", () => {
  it("is not supported when the browser has no recognizer", async () => {
    const { result: r } = renderHook(() => useSpeech(() => {}));
    await new Promise((res) => setTimeout(res, 10));
    expect(r.current.supported).toBe(false);
  });

  it("starts, sends only final phrases, and stops", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRec);
    const onText = vi.fn();
    const { result: r } = renderHook(() => useSpeech(onText));
    await waitFor(() => expect(r.current.supported).toBe(true));
    act(() => r.current.toggle());
    expect(last?.started).toBe(true);
    expect(r.current.listening).toBe(true);
    act(() => last!.onresult!(result([{ t: "hello", final: false }, { t: " world ", final: true }])));
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("world");
    act(() => r.current.toggle());
    expect(last?.stopped).toBe(true);
    expect(r.current.listening).toBe(false);
  });

  it("explains a blocked microphone", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRec);
    const { result: r } = renderHook(() => useSpeech(() => {}));
    await waitFor(() => expect(r.current.supported).toBe(true));
    act(() => r.current.toggle());
    act(() => last!.onerror!({ error: "not-allowed" }));
    expect(r.current.error).toMatch(/Microphone access is blocked/);
  });
});
