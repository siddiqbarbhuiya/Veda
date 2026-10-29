import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: [{ provider: "anthropic", model: "claude-haiku-3.5", input_paise_per_1k_tokens: 6, output_paise_per_1k_tokens: 18 }], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { useModelCatalog } from "../use-model-catalog";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubFetch(omni: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/keys") return json([{ provider: "omniroute" }, { provider: "anthropic" }]);
      if (url === "/api/models/openrouter") return json({ models: [{ id: "a/b:free", name: "AB", context_length: 1000, free: true, rate: { input_paise_per_1k_tokens: 0, output_paise_per_1k_tokens: 0 } }] });
      return omni;
    })
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("useModelCatalog with OmniRoute", () => {
  it("puts the student's own combos and models first, at zero rate", async () => {
    stubFetch(json({ models: [{ id: "my_combo", combo: true, context_length: 262144 }, { id: "openrouter/x/y", combo: false, context_length: 8000 }] }));
    const { result } = renderHook(() => useModelCatalog());
    await waitFor(() => expect(result.current.omni.state).toBe("ready"));
    await waitFor(() => expect(result.current.items.some((i) => i.provider === "openrouter")).toBe(true));
    const items = result.current.items;
    expect(items.slice(0, 2).map((i) => `${i.group}|${i.model}`)).toEqual(["OmniRoute combos|my_combo", "OmniRoute models|openrouter/x/y"]);
    expect(items[0].rate).toEqual({ input_paise_per_1k_tokens: 0, output_paise_per_1k_tokens: 0 });
    expect(items[0].keyed).toBe(true);
    expect(items[0].contextLength).toBe(262144);
  });
  it("reports none when OmniRoute is not set up, and an error with a reason when it cannot be read", async () => {
    stubFetch(json({ code: "not_configured" }, 404));
    const a = renderHook(() => useModelCatalog());
    await waitFor(() => expect(a.result.current.omni.state).toBe("none"));
    stubFetch(json({ error: "Could not reach your OmniRoute.", code: "unreachable" }, 502));
    const b = renderHook(() => useModelCatalog());
    await waitFor(() => expect(b.result.current.omni).toEqual({ state: "error", message: "Could not reach your OmniRoute." }));
  });
  it("is skipped when the list is limited to other providers", async () => {
    stubFetch(json({ models: [{ id: "x", combo: true, context_length: 1 }] }));
    const { result } = renderHook(() => useModelCatalog(["anthropic"]));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.items.every((i) => i.provider === "anthropic")).toBe(true);
  });
});
