import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const MAX_PAGE = 1000;

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20));
  const from = (page - 1) * limit;

  // Select only the columns the UI shows. Order by id as a tiebreaker so pages do not overlap.
  const { data, error, count } = await supabase
    .from("transactions")
    .select("id, type, amount_paise, balance_after_paise, description, created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + limit - 1);
  if (error) {
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
  return NextResponse.json(
    { transactions: data ?? [], total: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
