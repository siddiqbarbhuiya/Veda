import { currentUserId, json, ownedHandle } from "@/lib/agent/route-auth";

export const runtime = "nodejs";

const PERMISSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Answer a permission request from Claude Code. Body: `{ run, id, allow, always? }`. */
export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Not authenticated", code: "unauthenticated" }, 401);
  let body: { run?: unknown; id?: unknown; allow?: unknown; always?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_request" }, 400);
  }
  if (typeof body.id !== "string" || !PERMISSION_ID.test(body.id) || typeof body.allow !== "boolean") {
    return json({ error: "Invalid request", code: "invalid_request" }, 400);
  }
  const handle = await ownedHandle(body.run, userId);
  if (!handle) return json({ error: "Run not found", code: "not_found" }, 404);
  try {
    await handle.answerPermission(body.run as string, body.id, body.allow, body.always === true);
  } catch (err) {
    console.error("agent permission failed", err);
    return json({ error: "Could not send the answer", code: "server_error" }, 502);
  }
  return json({ ok: true }, 200);
}
