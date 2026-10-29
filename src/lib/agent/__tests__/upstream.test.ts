// @vitest-environment node
import { describe, it, expect } from "vitest";
import { upstreamFor } from "../upstream";

const extra = { "anthropic-version": "2023-06-01" };

describe("upstreamFor", () => {
  it("anthropic uses x-api-key, openrouter uses a Bearer token", () => {
    expect(upstreamFor("anthropic", "sk-a", extra)).toMatchObject({ url: "https://api.anthropic.com/v1/messages", headers: { "x-api-key": "sk-a" } });
    const or = upstreamFor("openrouter", "sk-o", extra)!;
    expect(or.url).toBe("https://openrouter.ai/api/v1/messages");
    expect(or.headers.Authorization).toBe("Bearer sk-o");
    expect(or.headers["x-api-key"]).toBeUndefined();
  });
  it("omniroute uses the student's own address from the saved settings", () => {
    const stored = JSON.stringify({ baseUrl: "http://localhost:20128", apiKey: "omni" });
    const u = upstreamFor("omniroute", stored, extra)!;
    expect(u.url).toBe("http://localhost:20128/v1/messages");
    expect(u.headers).toMatchObject({ Authorization: "Bearer omni", "x-api-key": "omni", "anthropic-version": "2023-06-01" });
    expect(typeof u.guard).toBe("function");
  });
  it("omniroute settings that are broken or unsafe give null", () => {
    expect(upstreamFor("omniroute", "not json", extra)).toBeNull();
    expect(upstreamFor("omniroute", JSON.stringify({ baseUrl: "http://169.254.169.254", apiKey: "k" }), extra)).toBeNull();
  });
});
