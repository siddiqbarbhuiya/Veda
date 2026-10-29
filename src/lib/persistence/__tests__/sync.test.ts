import { describe, expect, it } from "vitest";
import { CloudStore } from "../cloud-store";
import { chooseSource, isTooLarge, MAX_PROJECT_BYTES, type Snapshot } from "../sync";
import type { FileNode } from "../indexeddb";

const file = (name: string, content = ""): FileNode => ({ name, path: name, type: "file", content });
const snap = (updatedAt: number, ...names: string[]): Snapshot => ({ files: names.map((n) => file(n)), updatedAt });

describe("chooseSource", () => {
  it("uses defaults when nothing is saved", () => {
    expect(chooseSource(null, null)).toEqual({ source: "default", push: false });
  });
  it("treats an empty file list as nothing saved", () => {
    expect(chooseSource(snap(5), snap(9, "a.js"))).toEqual({ source: "cloud", push: false });
  });
  it("uploads a browser-only project", () => {
    expect(chooseSource(snap(5, "a.js"), null)).toEqual({ source: "local", push: true });
  });
  it("downloads a cloud-only project (new device)", () => {
    expect(chooseSource(null, snap(5, "a.js"))).toEqual({ source: "cloud", push: false });
  });
  it("keeps the newer cloud copy", () => {
    expect(chooseSource(snap(5, "a.js"), snap(9, "b.js"))).toEqual({ source: "cloud", push: false });
  });
  it("uploads when the browser copy is newer", () => {
    expect(chooseSource(snap(9, "a.js"), snap(5, "b.js"))).toEqual({ source: "local", push: true });
  });
  it("does not upload on a tie", () => {
    expect(chooseSource(snap(5, "a.js"), snap(5, "a.js"))).toEqual({ source: "local", push: false });
  });
});

describe("isTooLarge", () => {
  it("accepts a small project", () => {
    expect(isTooLarge([file("a.js", "x")])).toBe(false);
  });
  it("rejects a project over the limit", () => {
    expect(isTooLarge([file("big.txt", "x".repeat(MAX_PROJECT_BYTES))])).toBe(true);
  });
});

type Call = { table: string; op: string; args: unknown[] };

function fakeClient(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Call[] = [];
  const builder = {
    select: (...args: unknown[]) => (calls.push({ table: "projects", op: "select", args }), builder),
    eq: (...args: unknown[]) => (calls.push({ table: "projects", op: "eq", args }), builder),
    maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
    upsert: async (...args: unknown[]) => (calls.push({ table: "projects", op: "upsert", args }), { error: result.error ?? null }),
  };
  const client = { from: (table: string) => (calls.push({ table, op: "from", args: [] }), builder) };
  return { client: client as never, calls };
}

describe("CloudStore", () => {
  it("loads files and converts the time to ms", async () => {
    const { client } = fakeClient({ data: { files: [file("a.js")], updated_at: "2026-10-29T10:00:00.000Z" } });
    const loaded = await new CloudStore(client).load("u1", "default");
    expect(loaded?.files).toHaveLength(1);
    expect(loaded?.updatedAt).toBe(Date.parse("2026-10-29T10:00:00.000Z"));
  });
  it("returns null when no row exists", async () => {
    const { client } = fakeClient({ data: null });
    expect(await new CloudStore(client).load("u1", "default")).toBeNull();
  });
  it("throws when the query fails", async () => {
    const { client } = fakeClient({ error: { message: "boom" } });
    await expect(new CloudStore(client).load("u1", "default")).rejects.toThrow("boom");
  });
  it("saves with an upsert on user and name", async () => {
    const { client, calls } = fakeClient({});
    const result = await new CloudStore(client).save("u1", "default", [file("a.js")], 1_000);
    expect(result).toEqual({ ok: true });
    const upsert = calls.find((c) => c.op === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ user_id: "u1", name: "default", updated_at: new Date(1_000).toISOString() });
    expect(upsert.args[1]).toEqual({ onConflict: "user_id,name" });
  });
  it("does not call the server for an oversized project", async () => {
    const { client, calls } = fakeClient({});
    const result = await new CloudStore(client).save("u1", "default", [file("big", "x".repeat(MAX_PROJECT_BYTES))], 1);
    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });
  it("reports a server error", async () => {
    const { client } = fakeClient({ error: { message: "rls denied" } });
    expect(await new CloudStore(client).save("u1", "default", [file("a.js")], 1)).toEqual({ ok: false, error: "rls denied" });
  });
});

describe("describeSync", () => {
  it("maps raw errors to plain words", async () => {
    const { describeSync } = await import("../sync");
    expect(describeSync("error", "x", false)).toBe("Offline");
    expect(describeSync("off", "Failed to fetch")).toBe("Offline");
    expect(describeSync("off", "Could not find the table 'public.projects' in the schema cache")).toBe("Cloud save is not set up yet");
    expect(describeSync("error", "boom")).toBe("Cloud save failed. Click to retry.");
    expect(describeSync("synced", null)).toBe("Saved to the cloud");
  });
});
