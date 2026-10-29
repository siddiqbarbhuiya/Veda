// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { omnirouteAdapter } from "../omniroute";
import { ProviderError } from "../sse";

const stored = JSON.stringify({ baseUrl: "http://localhost:20128", apiKey: "omni-key" });

function sse(lines: string[], status = 200): Response {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { lines.forEach((l) => c.enqueue(enc.encode(l))); c.close(); } }), { status });
}
const collect = async (g: AsyncGenerator<unknown>) => {
  const out: unknown[] = [];
  for await (const x of g) out.push(x);
  return out;
};
afterEach(() => vi.unstubAllGlobals());

describe("omnirouteAdapter", () => {
  it("calls the student's own address with the combo name and the key, and streams", async () => {
    const f = vi.fn().mockResolvedValue(sse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\n', "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", f);
    const out = await collect(omnirouteAdapter.streamChat(stored, "veda_combo", [{ role: "user", content: "x" }]));
    expect(out).toEqual([{ chunk: "Hi", done: false }, { chunk: "", done: true, usage: { input_tokens: 4, output_tokens: 2 }, finish_reason: undefined }]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer omni-key");
    expect(init.redirect).toBe("manual");
    expect(JSON.parse(init.body).model).toBe("veda_combo");
  });
  it("refuses saved settings that are not valid, without calling out", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(omnirouteAdapter.streamChat("not json", "m", []).next()).rejects.toBeInstanceOf(ProviderError);
    await expect(omnirouteAdapter.streamChat(JSON.stringify({ baseUrl: "http://10.0.0.1", apiKey: "k" }), "m", []).next()).rejects.toMatchObject({ status: 400 });
    expect(f).not.toHaveBeenCalled();
  });
  it("turns a network failure, a redirect and an HTTP error into clear errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(omnirouteAdapter.streamChat(stored, "m", []).next()).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/Could not reach/) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 302 })));
    await expect(omnirouteAdapter.streamChat(stored, "m", []).next()).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/redirect/) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })));
    await expect(omnirouteAdapter.streamChat(stored, "m", []).next()).rejects.toMatchObject({ status: 401, message: "bad key" });
  });
  it("passes an abort through as an abort", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("a"), { name: "AbortError" })));
    await expect(omnirouteAdapter.streamChat(stored, "m", []).next()).rejects.toMatchObject({ name: "AbortError" });
  });
});
