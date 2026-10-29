// @vitest-environment node
import { describe, it, expect } from "vitest";
import { signAgentToken, verifyAgentToken } from "../token";

const SECRET = "ab".repeat(32);
const base = { userId: "u1", runId: "run-1", combo: [{ provider: "openrouter", model: "a/b:free" }], strategy: "priority" as const };

describe("agent token", () => {
  it("round-trips the payload", () => {
    const t = signAgentToken(base, SECRET, 1_000_000);
    const p = verifyAgentToken(t, SECRET, 1_000_000);
    expect(p).toMatchObject(base);
    expect(p?.exp).toBe(1_000 + 15 * 60);
  });
  it("rejects an expired token", () => {
    const t = signAgentToken({ ...base, ttlSeconds: 60 }, SECRET, 1_000_000);
    expect(verifyAgentToken(t, SECRET, 1_000_000 + 59_000)).not.toBeNull();
    expect(verifyAgentToken(t, SECRET, 1_000_000 + 60_000)).toBeNull();
  });
  it("rejects a changed payload", () => {
    const t = signAgentToken(base, SECRET, 1_000_000);
    const [body, sig] = t.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.userId = "someone-else";
    const bad = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect(verifyAgentToken(bad, SECRET, 1_000_000)).toBeNull();
  });
  it("rejects a token signed with another secret and garbage input", () => {
    const t = signAgentToken(base, SECRET, 1_000_000);
    expect(verifyAgentToken(t, "cd".repeat(32), 1_000_000)).toBeNull();
    for (const g of ["", "x", "a.b.c", "....", "%%%.%%%"]) expect(verifyAgentToken(g, SECRET)).toBeNull();
  });
});
