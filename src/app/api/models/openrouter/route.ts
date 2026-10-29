import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchOpenRouterModels } from "@/lib/openrouter/models";

// Public OpenRouter catalogue for the model picker. Signed-in users only, so the route is not an open proxy.
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const models = await fetchOpenRouterModels();
    return NextResponse.json(
      { models },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch {
    return NextResponse.json({ error: "Could not load OpenRouter models" }, { status: 502 });
  }
}
