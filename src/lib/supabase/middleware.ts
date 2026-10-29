import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import type { Database } from "@/types/database";

const PROTECTED_PREFIXES = ["/ide", "/dashboard"];

// A redirect response does not carry the cookies that setAll put on the pass-through response.
function redirectWithCookies(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the token with the Supabase Auth server. A failure counts as signed out.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error("middleware: getUser failed, treating the request as signed out:", err instanceof Error ? err.message : err);
  }

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    const next = safeNextPath(`${path}${request.nextUrl.search}`, request.nextUrl.origin);
    url.pathname = "/login";
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    return redirectWithCookies(url, response);
  }

  // A signed-in user has no reason to see the login page. Keep it when it shows an error.
  if (user && path === "/login" && !request.nextUrl.searchParams.has("error")) {
    const url = request.nextUrl.clone();
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), request.nextUrl.origin);
    const target = new URL(next ?? "/dashboard", request.nextUrl.origin);
    url.pathname = target.pathname;
    url.search = target.search;
    return redirectWithCookies(url, response);
  }

  return response;
}
