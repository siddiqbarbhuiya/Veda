import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = {
  id: string;
  user_id: string;
  provider: string;
  label: string | null;
  created_at: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
};

let store: Row[] = [];
let currentUser: { id: string } | null = null;
let upsertArgs: { row: Record<string, unknown>; opts: unknown } | null = null;
let nextId = 1;

// Anon client: auth + RLS-scoped reads/deletes.
function anonClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: currentUser }, error: null }),
    },
    from: () => ({
      select: (cols: string) => ({
        eq: async (_c: string, uid: string) => ({
          data: store
            .filter((r) => r.user_id === uid)
            .map((r) => {
              const out: Record<string, unknown> = {};
              cols.split(",").map((s) => s.trim()).forEach((k) => {
                out[k] = (r as Record<string, unknown>)[k];
              });
              return out;
            }),
          error: null,
        }),
      }),
      delete: () => ({
        eq: (_c1: string, id: string) => ({
          eq: async (_c2: string, uid: string) => {
            store = store.filter((r) => !(r.id === id && r.user_id === uid));
            return { error: null };
          },
        }),
      }),
    }),
  };
}

// Service role client: upsert only.
function serviceClient() {
  return {
    from: () => ({
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        upsertArgs = { row, opts };
        return {
          select: () => ({
            single: async () => {
              const existing = store.find(
                (r) => r.user_id === row.user_id && r.provider === row.provider
              );
              if (existing) {
                Object.assign(existing, row);
                return { data: existing, error: null };
              }
              const created = {
                id: `id-${nextId++}`,
                created_at: "2026-01-01T00:00:00Z",
                ...row,
              } as Row;
              store.push(created);
              return { data: created, error: null };
            },
          }),
        };
      },
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => anonClient()),
}));
vi.mock("@/lib/crypto/encryption", () => ({
  encrypt: vi.fn(() => ({ encrypted: "ENC", iv: "IV", authTag: "TAG" })),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => serviceClient()),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

import { POST, GET } from "../route";
import { DELETE } from "../[id]/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  store = [];
  nextId = 1;
  upsertArgs = null;
  currentUser = { id: "user-1" };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});

describe("POST /api/keys", () => {
  it("returns 201 with { id, provider, label } only", async () => {
    const res = await POST(postReq({ provider: "openai", key: "sk-secret", label: "mine" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ id: "id-1", provider: "openai", label: "mine" });
    expect(JSON.stringify(json)).not.toContain("sk-secret");
    expect(upsertArgs?.row).toMatchObject({
      user_id: "user-1",
      provider: "openai",
      encrypted_key: "ENC",
      iv: "IV",
      auth_tag: "TAG",
    });
    expect(JSON.stringify(upsertArgs)).not.toContain("sk-secret");
    expect(upsertArgs?.opts).toEqual({ onConflict: "user_id,provider" });
  });

  it("returns 400 when provider is missing", async () => {
    const res = await POST(postReq({ key: "sk-x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid provider", async () => {
    const res = await POST(postReq({ provider: "cohere", key: "sk-x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty key", async () => {
    const res = await POST(postReq({ provider: "openai", key: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(postReq("not json"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    const res = await POST(postReq({ provider: "openai", key: "sk-x" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/keys", () => {
  it("returns key metadata without encrypted fields", async () => {
    await POST(postReq({ provider: "gemini", key: "g-key", label: "g" }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([
      { id: "id-1", provider: "gemini", label: "g", created_at: "2026-01-01T00:00:00Z" },
    ]);
    const text = JSON.stringify(json);
    expect(text).not.toContain("ENC");
    expect(text).not.toContain("encrypted_key");
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    expect((await GET()).status).toBe(401);
  });
});

describe("DELETE /api/keys/:id", () => {
  it("returns 204 and the key is gone on subsequent GET", async () => {
    await POST(postReq({ provider: "anthropic", key: "a-key" }));
    const del = await DELETE(new Request("http://localhost/api/keys/id-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "id-1" }),
    });
    expect(del.status).toBe(204);
    const list = await (await GET()).json();
    expect(list).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    const res = await DELETE(new Request("http://localhost/api/keys/id-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "id-1" }),
    });
    expect(res.status).toBe(401);
  });
});
