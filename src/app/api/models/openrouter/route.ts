import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchOpenRouterModels, rateForModel } from "@/lib/openrouter/models";

// Public OpenRouter catalogue for the model picker. Signed-in users only, so the route is not an open proxy.
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const models = await fetchOpenRouterModels();
    // The paise rate is computed here because the exchange-rate settings are server-only.
    return NextResponse.json(
      { models: models.map((m) => ({ ...m, rate: rateForModel(m) })) },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch {
    return NextResponse.json({ error: "Could not load OpenRouter models" }, { status: 502 });
  }
}
