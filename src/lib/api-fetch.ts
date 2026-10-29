/**
 * fetch wrapper for same-origin API calls. On 401 the session is gone, so the browser goes to the login page
 * with a clear reason. Callers still receive the response and handle other errors themselves.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login?error=session_expired");
  }
  return res;
}
