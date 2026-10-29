import crypto from "node:crypto";
import type { ComboEntry } from "@/lib/combos";

/** What the sandbox may do with the LLM proxy. The token carries no key. */
export type AgentTokenPayload = {
  userId: string;
  runId: string;
  /** Models to try, in order. */
  combo: ComboEntry[];
  strategy: "priority" | "round_robin";
  /** Expiry, seconds since epoch. */
  exp: number;
};

export const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60;

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function signingKey(secretHex: string): Buffer {
  return crypto.createHmac("sha256", Buffer.from(secretHex, "hex")).update("veda-agent-token").digest();
}

/** Sign a token: base64url(payload) + "." + base64url(HMAC-SHA256). */
export function signAgentToken(
  p: Omit<AgentTokenPayload, "exp"> & { ttlSeconds?: number },
  secretHex: string,
  now: number = Date.now()
): string {
  const { ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS, ...rest } = p;
  const payload: AgentTokenPayload = { ...rest, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", signingKey(secretHex)).update(body).digest();
  return `${body}.${b64(sig)}`;
}

/** Check signature and expiry. Returns null for any bad, changed or expired token. */
export function verifyAgentToken(token: string, secretHex: string, now: number = Date.now()): AgentTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let expected: Buffer;
  let given: Buffer;
  try {
    expected = crypto.createHmac("sha256", signingKey(secretHex)).update(body).digest();
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AgentTokenPayload;
    if (typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
    if (typeof p.userId !== "string" || typeof p.runId !== "string" || !Array.isArray(p.combo)) return null;
    return p;
  } catch {
    return null;
  }
}
