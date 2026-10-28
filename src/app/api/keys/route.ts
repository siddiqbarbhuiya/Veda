import { NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto/encryption";
import type { Database } from "@/types/database";

const VALID_PROVIDERS = ["openai", "gemini", "anthropic"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (VALID_PROVIDERS as readonly string[]).includes(value);
}

// Service role client bypasses RLS. Use only for writes after auth is checked.
function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { provider?: unknown; key?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { provider, key, label } = body;
  if (!isProvider(provider)) {
    return NextResponse.json(
      { error: "provider must be one of: openai, gemini, anthropic" },
      { status: 400 }
    );
  }
  if (typeof key !== "string" || key.trim() === "") {
    return NextResponse.json({ error: "key must be a non-empty string" }, { status: 400 });
  }
  const labelValue = typeof label === "string" && label.trim() !== "" ? label : null;

  const { encrypted, iv, authTag } = encrypt(key);

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("api_keys")
    .upsert(
      {
        user_id: user.id,
        provider,
        encrypted_key: encrypted,
        iv,
        auth_tag: authTag,
        label: labelValue,
      },
      { onConflict: "user_id,provider" }
    )
    .select("id, provider, label")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }

  return NextResponse.json(
    { id: data.id, provider: data.provider, label: data.label },
    { status: 201 }
  );
}

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, provider, label, created_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to load keys" }, { status: 500 });
  }
  return NextResponse.json(data ?? [], { status: 200 });
}
