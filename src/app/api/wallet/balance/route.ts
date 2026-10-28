import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("balance_paise")
    .eq("id", user.id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load balance" }, { status: 500 });
  }
  return NextResponse.json({ balance_paise: data.balance_paise });
}
