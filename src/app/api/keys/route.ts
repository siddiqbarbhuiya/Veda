import { NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto/encryption";
import { KEY_PROVIDER_VALUES, MAX_KEY_LENGTH, MAX_LABEL_LENGTH, isKeyProvider } from "@/lib/key-providers";
import type { Database } from "@/types/database";

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
  if (!isKeyProvider(provider)) {
    return NextResponse.json(
      { error: `provider must be one of: ${KEY_PROVIDER_VALUES.join(", ")}` },
      { status: 400 }
    );
  }
  const keyValue = typeof key === "string" ? key.trim() : "";
  if (keyValue === "") {
    return NextResponse.json({ error: "key must be a non-empty string" }, { status: 400 });
  }
  if (keyValue.length > MAX_KEY_LENGTH) {
    return NextResponse.json(
      { error: `key must be at most ${MAX_KEY_LENGTH} characters` },
      { status: 400 }
    );
  }
  const labelValue = typeof label === "string" && label.trim() !== "" ? label.trim() : null;
  if (labelValue !== null && labelValue.length > MAX_LABEL_LENGTH) {
    return NextResponse.json(
      { error: `label must be at most ${MAX_LABEL_LENGTH} characters` },
      { status: 400 }
    );
  }

  let encryptedParts: { encrypted: string; iv: string; authTag: string };
  try {
    encryptedParts = encrypt(keyValue);
  } catch (err) {
    console.error("keys: encryption failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }
  const { encrypted, iv, authTag } = encryptedParts;

  const admin = createServiceRoleClient();

  const { data: existing } = await admin
    .from("api_keys")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();
  const replaced = Boolean(existing);

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    )
    .select("id, provider, label")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }

  return NextResponse.json(
    { id: data.id, provider: data.provider, label: data.label, replaced },
    { status: replaced ? 200 : 201 }
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
    .select("id, provider, label, created_at, updated_at")
    .eq("user_id", user.id)
    .order("provider", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load keys" }, { status: 500 });
  }
  return NextResponse.json(data ?? [], { status: 200, headers: { "Cache-Control": "no-store" } });
}
