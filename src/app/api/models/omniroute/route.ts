import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient, loadProviderKey } from "@/lib/agent/admin";
import { decodeConfig, omniFetch, omniHeaders } from "@/lib/omniroute/config";

const MAX_MODELS = 600;

export type OmniModel = { id: string; combo: boolean; context_length: number };

/**
 * The models and combos of the signed-in student's OWN OmniRoute, for the model picker.
 * Combos come first. The list is read live, so a combo made in OmniRoute shows up at once.
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let stored: string | null;
  try {
    stored = await loadProviderKey(createAdminClient(), user.id, "omniroute");
  } catch {
    return NextResponse.json({ error: "Could not read your OmniRoute settings", code: "server_error" }, { status: 500 });
  }
  if (stored === null) return NextResponse.json({ error: "OmniRoute is not set up", code: "not_configured" }, { status: 404 });
  const cfg = decodeConfig(stored);
  if (!cfg) {
    return NextResponse.json(
      { error: "The saved OmniRoute address is not valid. Save it again in your dashboard.", code: "invalid_config" },
      { status: 400 }
    );
  }

  let res: Response;
  try {
    res = await omniFetch(cfg, "/v1/models", { headers: omniHeaders(cfg) });
  } catch {
    return NextResponse.json({ error: "Could not reach your OmniRoute.", code: "unreachable" }, { status: 502 });
  }
  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ error: "Your OmniRoute rejected the key.", code: "key_rejected" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: "Your OmniRoute returned an error.", code: "unreachable" }, { status: 502 });

  let data: unknown;
  try {
    data = (await res.json())?.data;
  } catch {
    return NextResponse.json({ error: "Your OmniRoute sent an answer that Veda cannot read.", code: "bad_response" }, { status: 502 });
  }
  const models: OmniModel[] = [];
  for (const m of Array.isArray(data) ? data : []) {
    const r = m as { id?: unknown; owned_by?: unknown; context_length?: unknown };
    if (typeof r.id !== "string" || !r.id || r.id.length > 200) continue;
    models.push({ id: r.id, combo: r.owned_by === "combo", context_length: typeof r.context_length === "number" ? r.context_length : 0 });
  }
  // Combos first, then the rest in the order OmniRoute gives.
  models.sort((a, b) => Number(b.combo) - Number(a.combo));
  return NextResponse.json({ models: models.slice(0, MAX_MODELS) }, { headers: { "Cache-Control": "private, no-store" } });
}
