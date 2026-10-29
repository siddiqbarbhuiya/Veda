import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readCombos, writeCombos, readActiveCombo, writeActiveCombo } from "../combo-storage";
import type { Combo } from "../combos";

const combo: Combo = {
  id: "c1",
  name: "Free first",
  strategy: "priority",
  entries: [{ provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" }],
};

/** A small in-memory localStorage. The test environment has a broken global one. */
function memoryStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
    ...overrides,
  } as Storage;
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("combo storage", () => {
  it("round-trips a combo", () => {
    writeCombos([combo]);
    expect(readCombos()).toEqual([combo]);
  });
  it("returns [] for bad JSON and drops malformed combos", () => {
    localStorage.setItem("veda:combos:v1", "{oops");
    expect(readCombos()).toEqual([]);
    localStorage.setItem("veda:combos:v1", JSON.stringify([combo, { id: 1 }, { ...combo, entries: [] }]));
    expect(readCombos()).toEqual([combo]);
  });
  it("returns [] when storage throws", () => {
    vi.stubGlobal(
      "localStorage",
      memoryStorage({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    );
    expect(readCombos()).toEqual([]);
    expect(readActiveCombo()).toBeNull();
  });
  it("does not throw when writing is blocked", () => {
    vi.stubGlobal(
      "localStorage",
      memoryStorage({
        setItem: () => {
          throw new Error("blocked");
        },
      }),
    );
    expect(() => writeCombos([combo])).not.toThrow();
    expect(() => writeActiveCombo("c1")).not.toThrow();
  });
  it("stores and clears the active combo", () => {
    writeActiveCombo("c1");
    expect(readActiveCombo()).toBe("c1");
    writeActiveCombo(null);
    expect(readActiveCombo()).toBeNull();
  });
});
