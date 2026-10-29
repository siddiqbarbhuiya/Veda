/** The packages that a project already lists. */

export type InstalledPackage = { name: string; version: string; dev: boolean };

/** The dependencies and devDependencies in a `package.json` text. Bad JSON gives an empty list. */
export function listNpmDeps(packageJsonText: string | undefined): InstalledPackage[] {
  if (!packageJsonText) return [];
  try {
    const pkg = JSON.parse(packageJsonText) as { dependencies?: unknown; devDependencies?: unknown };
    const read = (value: unknown, dev: boolean): InstalledPackage[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([name, version]) => ({ name, version: version as string, dev }))
        : [];
    return [...read(pkg.dependencies, false), ...read(pkg.devDependencies, true)].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** The package name of an npm spec such as `lodash`, `lodash@4` or `@types/node@22`. */
export function npmNameOf(spec: string): string {
  const s = spec.trim();
  const at = s.startsWith("@") ? s.indexOf("@", 1) : s.indexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

export function isNpmInstalled(installed: InstalledPackage[], spec: string): boolean {
  const name = npmNameOf(spec);
  return installed.some((p) => p.name === name);
}
