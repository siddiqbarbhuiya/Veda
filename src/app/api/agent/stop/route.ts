import { currentUserId, json, ownedHandle } from "@/lib/agent/route-auth";

export const runtime = "nodejs";

/** Ask a Claude Code run to stop. Body: `{ run }`. */
export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Not authenticated", code: "unauthenticated" }, 401);
  let body: { run?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_request" }, 400);
  }
  const handle = await ownedHandle(body.run, userId);
  if (!handle) return json({ error: "Run not found", code: "not_found" }, 404);
  try {
    await handle.stop(body.run as string);
  } catch (err) {
    console.error("agent stop failed", err);
    return json({ error: "Could not stop the run", code: "server_error" }, 502);
  }
  return json({ ok: true }, 200);
}
