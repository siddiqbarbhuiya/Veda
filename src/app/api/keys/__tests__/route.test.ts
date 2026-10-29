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
let orderedBy: string | null = null;
let encryptThrows = false;

// Anon client: auth + RLS-scoped reads/deletes.
function anonClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: currentUser }, error: null }),
    },
    from: () => ({
      select: (cols: string) => ({
        eq: (_c: string, uid: string) => ({
          order: async (col: string) => {
            orderedBy = col;
            return {
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
            };
          },
        }),
      }),
      delete: () => ({
        eq: (_c1: string, id: string) => ({
          eq: (_c2: string, uid: string) => ({
            select: async () => {
              const gone = store.filter((r) => r.id === id && r.user_id === uid);
              store = store.filter((r) => !(r.id === id && r.user_id === uid));
              return { data: gone.map((r) => ({ id: r.id })), error: null };
            },
          }),
        }),
      }),
    }),
  };
}

// Service role client: upsert only.
function serviceClient() {
  return {
    from: () => ({
      select: () => ({
        eq: (_c1: string, uid: string) => ({
          eq: (_c2: string, provider: string) => ({
            maybeSingle: async () => ({
              data: store.find((r) => r.user_id === uid && r.provider === provider) ?? null,
              error: null,
            }),
          }),
        }),
      }),
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
  encrypt: vi.fn(() => {
    if (encryptThrows) throw new Error("no secret");
    return { encrypted: "ENC", iv: "IV", authTag: "TAG" };
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => serviceClient()),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

import { POST, GET } from "../route";
import { DELETE } from "../[id]/route";

const KEY_ID = "123e4567-e89b-42d3-a456-426614174000";

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
  orderedBy = null;
  encryptThrows = false;
  currentUser = { id: "user-1" };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});

describe("POST /api/keys", () => {
  it("returns 201 with { id, provider, label } only", async () => {
    const res = await POST(postReq({ provider: "openai", key: "sk-secret", label: "mine" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ id: "id-1", provider: "openai", label: "mine", replaced: false });
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

  it("trims the key and the label before they are stored", async () => {
    const res = await POST(postReq({ provider: "openai", key: "  sk-abc\n", label: "  mine  " }));
    expect(res.status).toBe(201);
    expect((await res.json()).label).toBe("mine");
    expect(upsertArgs?.row.label).toBe("mine");
  });

  it("returns 400 when the key is longer than 512 characters", async () => {
    const res = await POST(postReq({ provider: "openai", key: "k".repeat(513) }));
    expect(res.status).toBe(400);
    expect(upsertArgs).toBeNull();
  });

  it("accepts a key of exactly 512 characters", async () => {
    const res = await POST(postReq({ provider: "openai", key: "k".repeat(512) }));
    expect(res.status).toBe(201);
  });

  it("returns 400 when the label is longer than 60 characters", async () => {
    const res = await POST(postReq({ provider: "openai", key: "sk-x", label: "l".repeat(61) }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with replaced: true and sets updated_at when the provider already has a key", async () => {
    await POST(postReq({ provider: "openai", key: "sk-1" }));
    const res = await POST(postReq({ provider: "openai", key: "sk-2" }));
    expect(res.status).toBe(200);
    expect((await res.json()).replaced).toBe(true);
    expect(typeof upsertArgs?.row.updated_at).toBe("string");
  });

  it("returns a JSON 500 when encryption throws", async () => {
    encryptThrows = true;
    const res = await POST(postReq({ provider: "openai", key: "sk-x" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save key" });
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
    expect(orderedBy).toBe("provider");
    const json = await res.json();
    expect(json).toEqual([
      {
        id: "id-1",
        provider: "gemini",
        label: "g",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: expect.any(String),
      },
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
    store.push({
      id: KEY_ID,
      user_id: "user-1",
      provider: "anthropic",
      label: null,
      created_at: "2026-01-01T00:00:00Z",
      encrypted_key: "ENC",
      iv: "IV",
      auth_tag: "TAG",
    });
    const del = await DELETE(new Request("http://localhost/api/keys/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: KEY_ID }),
    });
    expect(del.status).toBe(204);
    const list = await (await GET()).json();
    expect(list).toEqual([]);
  });

  it("returns 404 when the key does not exist or belongs to another user", async () => {
    store.push({
      id: KEY_ID,
      user_id: "user-2",
      provider: "openai",
      label: null,
      created_at: "2026-01-01T00:00:00Z",
      encrypted_key: "ENC",
      iv: "IV",
      auth_tag: "TAG",
    });
    const res = await DELETE(new Request("http://localhost/api/keys/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: KEY_ID }),
    });
    expect(res.status).toBe(404);
    expect(store).toHaveLength(1);
  });

  it("returns 400 for an id that is not a UUID", async () => {
    const res = await DELETE(new Request("http://localhost/api/keys/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    const res = await DELETE(new Request("http://localhost/api/keys/id-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "id-1" }),
    });
    expect(res.status).toBe(401);
  });
});
