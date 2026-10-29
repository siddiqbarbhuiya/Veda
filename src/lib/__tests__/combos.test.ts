import { describe, it, expect } from "vitest";
import { orderEntries, isFallbackStatus, parseEntries, type Combo } from "../combos";

const entries = [
  { provider: "openrouter", model: "a" },
  { provider: "openrouter", model: "b" },
  { provider: "openai", model: "c" },
];
const combo = (strategy: Combo["strategy"]): Combo => ({ id: "1", name: "x", strategy, entries });

describe("orderEntries", () => {
  it("keeps the order for priority", () => {
    expect(orderEntries(combo("priority"), 7).map((e) => e.model)).toEqual(["a", "b", "c"]);
  });
  it("rotates for round robin", () => {
    expect(orderEntries(combo("round_robin"), 1).map((e) => e.model)).toEqual(["b", "c", "a"]);
    expect(orderEntries(combo("round_robin"), 3).map((e) => e.model)).toEqual(["a", "b", "c"]);
  });
  it("does not change the saved list", () => {
    orderEntries(combo("round_robin"), 2);
    expect(entries.map((e) => e.model)).toEqual(["a", "b", "c"]);
  });
});

describe("isFallbackStatus", () => {
  it("moves on for limits, server errors and network failures", () => {
    for (const s of [0, 429, 500, 502, 503]) expect(isFallbackStatus(s)).toBe(true);
  });
  it("stays for client errors", () => {
    for (const s of [400, 401, 402, 403, 404, 413]) expect(isFallbackStatus(s)).toBe(false);
  });
});

describe("parseEntries", () => {
  it("accepts undefined as no entries", () => expect(parseEntries(undefined, 4)).toEqual([]));
  it("keeps model ids with slash and colon", () => {
    const m = "meta-llama/llama-3.3-70b-instruct:free";
    expect(parseEntries([{ provider: "openrouter", model: m }], 4)).toEqual([{ provider: "openrouter", model: m }]);
  });
  it("rejects too many, wrong types and empty values", () => {
    expect(parseEntries(new Array(5).fill(entries[0]), 4)).toBeNull();
    expect(parseEntries([{ provider: 1, model: "a" }], 4)).toBeNull();
    expect(parseEntries([{ provider: "openai", model: "" }], 4)).toBeNull();
    expect(parseEntries("x", 4)).toBeNull();
  });
});
