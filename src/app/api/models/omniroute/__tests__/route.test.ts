// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ userId: "u1" as string | null, stored: null as string | null | Error }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null } }) } }),
}));
vi.mock("@/lib/agent/admin", () => ({
  createAdminClient: () => ({}),
  loadProviderKey: async () => {
    if (mocks.stored instanceof Error) throw mocks.stored;
    return mocks.stored;
  },
}));
import { GET } from "../route";

const cfg = JSON.stringify({ baseUrl: "http://localhost:20128", apiKey: "omni-key" });

beforeEach(() => {
  mocks.userId = "u1";
  mocks.stored = cfg;
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/models/omniroute", () => {
  it("answers 401 when signed out", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);
  });
  it("answers 404 not_configured when the student has no OmniRoute", async () => {
    mocks.stored = null;
    const res = await GET();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_configured");
  });
  it("answers 400 for saved settings that are no longer valid", async () => {
    mocks.stored = JSON.stringify({ baseUrl: "http://10.0.0.1", apiKey: "k" });
    const res = await GET();
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_config");
  });
  it("lists combos first, sends the student's key, and drops bad rows", async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "openrouter/a/b:free", owned_by: "openrouter", context_length: 8000 },
            { id: "", owned_by: "x" },
            { id: 5 },
            { id: "my_combo", owned_by: "combo", context_length: 400000 },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", f);
    const body = await (await GET()).json();
    expect(body.models).toEqual([
      { id: "my_combo", combo: true, context_length: 400000 },
      { id: "openrouter/a/b:free", combo: false, context_length: 8000 },
    ]);
    expect(f.mock.calls[0][0]).toBe("http://localhost:20128/v1/models");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer omni-key");
    expect(f.mock.calls[0][1].redirect).toBe("manual");
  });
  it("tells a rejected key, an unreachable server and a bad answer apart", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    expect((await (await GET()).json()).code).toBe("key_rejected");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect((await (await GET()).json()).code).toBe("unreachable");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect((await (await GET()).json()).code).toBe("bad_response");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 302 })));
    expect((await (await GET()).json()).code).toBe("unreachable");
  });
  it("never returns the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));
    expect(JSON.stringify(await (await GET()).json())).not.toContain("omni-key");
  });
});
