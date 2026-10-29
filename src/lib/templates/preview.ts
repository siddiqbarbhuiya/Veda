export type ServerLike = { port: number };

/** Ports that front-end dev servers use. The Preview tab shows one of these first. */
const FRONT_END_PORTS = [5173, 5174, 4173, 8080, 4200];

/** The server that the Preview tab shows by default: a front-end port if one runs, otherwise the newest server. */
export function preferredServer<T extends ServerLike>(servers: T[]): T | null {
  for (const port of FRONT_END_PORTS) {
    const hit = servers.find((s) => s.port === port);
    if (hit) return hit;
  }
  return servers[servers.length - 1] ?? null;
}
