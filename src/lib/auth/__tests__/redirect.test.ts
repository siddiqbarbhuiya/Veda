import { describe, it, expect } from "vitest";
import { loginErrorCode, loginPath, resolveOrigin, safeNextPath } from "../redirect";

const ORIGIN = "https://veda.example";

describe("safeNextPath", () => {
  it("accepts a plain path and keeps search and hash", () => {
    expect(safeNextPath("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(safeNextPath("/dashboard?topup=1#x", ORIGIN)).toBe("/dashboard?topup=1#x");
  });

  it.each([null, undefined, "", "dashboard", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/ok\nSet-Cookie: a=b"])(
    "rejects %s",
    (value) => {
      expect(safeNextPath(value as string | null | undefined, ORIGIN)).toBeNull();
    }
  );

  it("rejects an overlong value", () => {
    expect(safeNextPath(`/${"a".repeat(3000)}`, ORIGIN)).toBeNull();
  });
});

describe("resolveOrigin", () => {
  const url = "http://internal:3000/auth/callback?code=1";
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

  it("uses the request origin without forwarded headers", () => {
    expect(resolveOrigin(url, headers({}))).toBe("http://internal:3000");
  });

  it("prefers x-forwarded-host and x-forwarded-proto", () => {
    expect(
      resolveOrigin(url, headers({ "x-forwarded-host": "veda.example", "x-forwarded-proto": "https" }))
    ).toBe("https://veda.example");
  });

  it("uses the first value of a comma list", () => {
    expect(
      resolveOrigin(url, headers({ "x-forwarded-host": "veda.example, proxy", "x-forwarded-proto": "https, http" }))
    ).toBe("https://veda.example");
  });

  it("ignores a malformed forwarded host", () => {
    expect(resolveOrigin(url, headers({ "x-forwarded-host": "evil.com/path" }))).toBe("http://internal:3000");
  });

  it("falls back to the request protocol when the forwarded proto is unknown", () => {
    expect(
      resolveOrigin(url, headers({ "x-forwarded-host": "veda.example", "x-forwarded-proto": "gopher" }))
    ).toBe("http://veda.example");
  });
});

describe("loginErrorCode and loginPath", () => {
  it("maps provider codes", () => {
    expect(loginErrorCode("access_denied")).toBe("cancelled");
    expect(loginErrorCode("session_expired")).toBe("session_expired");
    expect(loginErrorCode("server_error")).toBe("failed");
    expect(loginErrorCode(null)).toBe("failed");
  });

  it("builds a login path", () => {
    expect(loginPath()).toBe("/login");
    expect(loginPath("failed")).toBe("/login?error=failed");
    expect(loginPath("failed", "/dashboard?a=1")).toBe("/login?error=failed&next=%2Fdashboard%3Fa%3D1");
  });
});
