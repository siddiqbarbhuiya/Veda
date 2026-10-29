/** Lower-case extension of a file name. Returns "" when there is no dot after position 0 (so ".env" and "json" have none). */
export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return "";
  return name.slice(i + 1).toLowerCase();
}
