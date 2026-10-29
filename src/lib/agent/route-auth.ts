import { createServerClient } from "@/lib/supabase/server";
import { getSandboxProvider } from "./provider";
import { sandboxIdOf, type SandboxHandle } from "./sandbox";

export function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** The signed-in user id, or null. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * The sandbox of a run, when it belongs to this user. Null for a bad run id, a missing sandbox,
 * or a sandbox of another student (the caller answers 404 in all three cases, so ids are not probed).
 */
export async function ownedHandle(runId: unknown, userId: string): Promise<SandboxHandle | null> {
  if (typeof runId !== "string") return null;
  const sandboxId = sandboxIdOf(runId);
  const provider = getSandboxProvider();
  if (!sandboxId || !provider) return null;
  const handle = await provider.connect(sandboxId);
  return handle && handle.userId === userId ? handle : null;
}

/** Server-sent events response for a generator of JSON-able events. */
export function sseResponse(
  events: AsyncGenerator<unknown>,
  headers: Record<string, string> = {},
  onEnd?: () => void | Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      } catch (err) {
        console.error("agent stream failed", err);
      } finally {
        try {
          await onEnd?.();
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...headers,
    },
  });
}
