// Pure helpers for login redirects. No framework imports, so they are easy to test.

/**
 * Returns a safe same-origin path (with search and hash) or null.
 * Only values that start with "/" and not "//" or "/\" are accepted, then the resolved origin is compared.
 */
export function safeNextPath(next: string | null | undefined, origin: string): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== new URL(origin).origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

type HeaderReader = { get(name: string): string | null };

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** Origin to use in redirects. Prefers x-forwarded-host and x-forwarded-proto, then the request URL. */
export function resolveOrigin(requestUrl: string, headers: HeaderReader): string {
  const url = new URL(requestUrl);
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || !HOST_PATTERN.test(host)) return url.origin;
  const protoRaw = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export type LoginErrorCode = "cancelled" | "failed" | "session_expired";

/** Maps a provider or callback error code to a login error code. Unknown codes become "failed". */
export function loginErrorCode(code: string | null | undefined): LoginErrorCode {
  if (code === "cancelled" || code === "session_expired") return code;
  if (code === "access_denied") return "cancelled";
  return "failed";
}

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  cancelled: "Sign-in was cancelled. Choose an account to try again.",
  failed: "Sign-in failed. Try again.",
  session_expired: "Your session expired. Sign in again.",
};

/** Builds a /login path with an error code and an optional safe next path. */
export function loginPath(error?: LoginErrorCode, next?: string | null): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
