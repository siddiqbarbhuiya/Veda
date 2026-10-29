import { describe, it, expect, beforeEach, vi } from "vitest";

const exchange = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ auth: { exchangeCodeForSession: exchange } })),
}));

import { GET } from "../route";

function callback(query: string, headers: Record<string, string> = {}) {
  // NextRequest is only used for .url and .headers here.
  const request = new Request(`http://internal:3000/auth/callback${query}`, { headers });
  return GET(request as unknown as Parameters<typeof GET>[0]);
}

const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  exchange.mockReset();
  exchange.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /auth/callback", () => {
  it("redirects to /ide after a successful exchange", async () => {
    const res = await callback("?code=abc");
    expect(location(res)).toBe("http://internal:3000/ide");
  });

  it("redirects to a validated next path", async () => {
    expect(location(await callback("?code=abc&next=%2Fdashboard"))).toBe("http://internal:3000/dashboard");
  });

  it("ignores an external or protocol-relative next", async () => {
    expect(location(await callback("?code=abc&next=%2F%2Fevil.com"))).toBe("http://internal:3000/ide");
    expect(location(await callback("?code=abc&next=https%3A%2F%2Fevil.com"))).toBe("http://internal:3000/ide");
  });

  it("uses forwarded host and proto for the redirect origin", async () => {
    const res = await callback("?code=abc", { "x-forwarded-host": "veda.example", "x-forwarded-proto": "https" });
    expect(location(res)).toBe("https://veda.example/ide");
  });

  it("redirects a provider error to /login with a mapped code", async () => {
    const res = await callback("?error=access_denied&error_description=nope");
    expect(location(res)).toBe("http://internal:3000/login?error=cancelled");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("redirects a missing code to /login?error=failed", async () => {
    expect(location(await callback(""))).toBe("http://internal:3000/login?error=failed");
  });

  it("redirects an exchange error to /login?error=failed", async () => {
    exchange.mockResolvedValue({ error: { message: "bad code" } });
    expect(location(await callback("?code=abc"))).toBe("http://internal:3000/login?error=failed");
  });

  it("redirects an exchange exception to /login?error=failed", async () => {
    exchange.mockRejectedValue(new Error("network"));
    expect(location(await callback("?code=abc"))).toBe("http://internal:3000/login?error=failed");
  });
});
