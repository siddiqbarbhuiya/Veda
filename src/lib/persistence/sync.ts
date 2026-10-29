import type { FileNode } from "@/lib/persistence/indexeddb";

export const MAX_PROJECT_BYTES = 5_000_000;

/** A saved copy of a project and the time of the last edit that it holds (ms since epoch). */
export type Snapshot = { files: FileNode[]; updatedAt: number };

export type Choice = {
  /** Which copy to open. "default" means nothing was saved anywhere. */
  source: "local" | "cloud" | "default";
  /** True when the cloud copy is missing or older and must be updated. */
  push: boolean;
};

const hasFiles = (s: Snapshot | null): s is Snapshot => s !== null && s.files.length > 0;

/** Newest edit wins. A tie keeps the browser copy and does not upload. */
export function chooseSource(local: Snapshot | null, cloud: Snapshot | null): Choice {
  const l = hasFiles(local) ? local : null;
  const c = hasFiles(cloud) ? cloud : null;
  if (!l && !c) return { source: "default", push: false };
  if (l && !c) return { source: "local", push: true };
  if (!l && c) return { source: "cloud", push: false };
  if (c!.updatedAt > l!.updatedAt) return { source: "cloud", push: false };
  if (l!.updatedAt > c!.updatedAt) return { source: "local", push: true };
  return { source: "local", push: false };
}

/** Plain words for the sync status. The raw error text stays in `SyncState.error`. */
export function describeSync(status: "idle" | "syncing" | "synced" | "error" | "off", error: string | null, online = true): string {
  if (status === "idle") return "";
  if (status === "syncing") return "Saving...";
  if (status === "synced") return "Saved to the cloud";
  if (!online || (error && /failed to fetch|network|offline|load failed/i.test(error))) return "Offline";
  if (error && /schema cache|does not exist|relation .*projects|table .*projects|could not find the table/i.test(error)) {
    return "Cloud save is not set up yet";
  }
  return "Cloud save failed. Click to retry.";
}

export function projectBytes(files: FileNode[]): number {
  return new TextEncoder().encode(JSON.stringify(files)).byteLength;
}

export function isTooLarge(files: FileNode[]): boolean {
  return projectBytes(files) > MAX_PROJECT_BYTES;
}
