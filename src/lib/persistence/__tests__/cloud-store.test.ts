import { describe, expect, it } from "vitest";
import type { FileNode } from "../indexeddb";
import { CloudStore } from "../cloud-store";

const files: FileNode[] = [{ name: "a.js", path: "a.js", type: "file", content: "1" }];

type Call = { table: string; op: string; args: unknown[] };

/** A fake Supabase client. Each query ends with the `result` that the test gives. */
function fakeClient(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const calls: Call[] = [];
  const chain = (table: string, op: string, args: unknown[]) => {
    calls.push({ table, op, args });
    const node: Record<string, unknown> = {
      eq: (...a: unknown[]) => {
        calls.push({ table, op: "eq", args: a });
        return node;
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null }),
    };
    return node;
  };
  const client = {
    from: (table: string) => ({
      select: (...a: unknown[]) => chain(table, "select", a),
      insert: (...a: unknown[]) => chain(table, "insert", a),
      delete: (...a: unknown[]) => chain(table, "delete", a),
      upsert: (...a: unknown[]) => chain(table, "upsert", a),
    }),
  };
  return { client: client as unknown as ConstructorParameters<typeof CloudStore>[0], calls };
}

describe("CloudStore.list", () => {
  it("returns the names and times of the projects", async () => {
    const { client, calls } = fakeClient({
      data: [
        { name: "a", updated_at: "2026-10-29T10:00:00.000Z" },
        { name: "b", updated_at: "not a date" },
      ],
    });
    const list = await new CloudStore(client).list("u1");
    expect(list).toEqual([
      { name: "a", updatedAt: Date.parse("2026-10-29T10:00:00.000Z") },
      { name: "b", updatedAt: 0 },
    ]);
    expect(calls).toContainEqual({ table: "projects", op: "eq", args: ["user_id", "u1"] });
  });
  it("returns an empty list when there are no rows", async () => {
    expect(await new CloudStore(fakeClient({ data: null }).client).list("u1")).toEqual([]);
  });
  it("throws when the cloud cannot be read", async () => {
    await expect(new CloudStore(fakeClient({ error: { message: "offline" } }).client).list("u1")).rejects.toThrow("offline");
  });
});

describe("CloudStore.create", () => {
  it("inserts a new project", async () => {
    const { client, calls } = fakeClient({});
    expect(await new CloudStore(client).create("u1", "app", files, 1000)).toEqual({ ok: true });
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.args[0]).toMatchObject({ user_id: "u1", name: "app", files });
  });
  it("reports a name that exists", async () => {
    const r = await new CloudStore(fakeClient({ error: { code: "23505", message: "duplicate" } }).client).create("u1", "app", files, 1);
    expect(r).toMatchObject({ ok: false, kind: "exists" });
  });
  it("reports the project limit", async () => {
    const r = await new CloudStore(fakeClient({ error: { code: "42501", message: "rls" } }).client).create("u1", "app", files, 1);
    expect(r).toMatchObject({ ok: false, kind: "limit" });
  });
  it("reports any other error", async () => {
    const r = await new CloudStore(fakeClient({ error: { message: "Failed to fetch" } }).client).create("u1", "app", files, 1);
    expect(r).toEqual({ ok: false, kind: "other", error: "Failed to fetch" });
  });
});

describe("CloudStore.remove", () => {
  it("deletes one project of one user", async () => {
    const { client, calls } = fakeClient({});
    expect(await new CloudStore(client).remove("u1", "app")).toEqual({ ok: true });
    expect(calls).toContainEqual({ table: "projects", op: "eq", args: ["user_id", "u1"] });
    expect(calls).toContainEqual({ table: "projects", op: "eq", args: ["name", "app"] });
  });
  it("reports an error", async () => {
    const r = await new CloudStore(fakeClient({ error: { message: "denied" } }).client).remove("u1", "app");
    expect(r).toEqual({ ok: false, kind: "other", error: "denied" });
  });
});
