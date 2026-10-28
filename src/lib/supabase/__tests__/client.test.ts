import { describe, it, expect, beforeEach, vi } from "vitest";

describe("createBrowserClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("returns a Supabase client with auth and from()", async () => {
    const { createBrowserClient } = await import("../client");
    const client = createBrowserClient();
    expect(client).toBeDefined();
    expect(typeof client.auth.signInWithOAuth).toBe("function");
    expect(typeof client.from).toBe("function");
  });
});
