import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  loginErrorCode,
  loginPath,
  resolveOrigin,
  safeNextPath,
  type LoginErrorCode,
} from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request.url, request.headers);
  const { searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"), origin);
  const fail = (code: LoginErrorCode) => NextResponse.redirect(`${origin}${loginPath(code, next)}`);

  const providerError = searchParams.get("error");
  if (providerError) {
    return fail(loginErrorCode(providerError));
  }

  const code = searchParams.get("code");
  if (!code) {
    return fail("failed");
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return fail("failed");
    }
  } catch (err) {
    console.error("auth callback: code exchange threw", err instanceof Error ? err.message : err);
    return fail("failed");
  }

  return NextResponse.redirect(`${origin}${next ?? "/ide"}`);
}
