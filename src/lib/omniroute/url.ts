import dns from "node:dns/promises";
import net from "node:net";

/**
 * A student gives Veda the address of their own OmniRoute. The Veda server then calls that address,
 * so the address must never let a student reach the server's own network (SSRF).
 *
 * - Production: https only, and the host must be a public name or public IP.
 * - Development (NODE_ENV is not "production"): `http://localhost` and `http://127.0.0.1` are allowed too,
 *   because OmniRoute runs on the same machine as the dev server.
 */

export type UrlResult = { ok: true; url: string } | { ok: false; error: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const bare = (host: string) => host.replace(/^\[|\]$/g, "");

/** The eight 16-bit groups of an IPv6 address, or null when it cannot be read. */
function expandV6(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0];
  const dotted = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const o = dotted[1].split(".").map(Number);
    if (o.some((x) => x > 255)) return null;
    v = v.slice(0, -dotted[1].length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...new Array(fill).fill("0"), ...tail].map((x) => parseInt(x, 16));
  return groups.length === 8 && groups.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? groups : null;
}

/** True for an IP that is not on the public internet. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const g = expandV6(ip);
    if (!g) return true; // cannot read it: treat it as private
    const allZeroTo = (n: number) => g.slice(0, n).every((x) => x === 0);
    if (allZeroTo(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
    // IPv4 inside IPv6: ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), 64:ff9b::a.b.c.d (NAT64). Check the IPv4 part.
    const embedded = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    if ((allZeroTo(5) && (g[5] === 0xffff || g[5] === 0)) || (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))) {
      return isPrivateIp(embedded);
    }
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80; // fc00::/7 unique local, fe80::/10 link-local
  }
  return false;
}

function blockedName(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home.arpa") ||
    !host.includes(".") // a single-label name resolves inside the network
  );
}

/** Check and normalize an OmniRoute address. The result has no path, query or trailing slash. */
export function parseBaseUrl(raw: string, opts: { allowLocal?: boolean } = {}): UrlResult {
  const allowLocal = opts.allowLocal ?? process.env.NODE_ENV !== "production";
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Enter a full address, for example https://omniroute.example.com" };
  }
  if (u.username || u.password) return { ok: false, error: "Do not put a user name or password in the address." };
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "The address must start with https://" };
  const host = bare(u.hostname.toLowerCase());
  if (LOOPBACK.has(host)) {
    if (!allowLocal) {
      return {
        ok: false,
        error: "Veda cannot reach localhost on your computer. Give a public https address, for example from a tunnel.",
      };
    }
    return { ok: true, url: u.origin };
  }
  if (u.protocol !== "https:") return { ok: false, error: "The address must start with https://" };
  if (net.isIP(host) ? isPrivateIp(host) : blockedName(host)) {
    return { ok: false, error: "That address is on a private network. Give a public https address." };
  }
  return { ok: true, url: u.origin };
}

/**
 * Before a request: the name must resolve to public addresses only (outside development).
 * This blocks a public name that points at a private address. It does not stop a name that changes between
 * this check and the request (DNS rebinding), so the caller also turns redirects off.
 */
export async function assertPublicHost(baseUrl: string, opts: { allowLocal?: boolean } = {}): Promise<void> {
  const allowLocal = opts.allowLocal ?? process.env.NODE_ENV !== "production";
  const host = bare(new URL(baseUrl).hostname.toLowerCase());
  if (LOOPBACK.has(host)) {
    if (allowLocal) return;
    throw new Error("Address is not public");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Address is not public");
    return;
  }
  const found = await dns.lookup(host, { all: true });
  if (found.length === 0 || found.some((f) => isPrivateIp(f.address))) throw new Error("Address is not public");
}
