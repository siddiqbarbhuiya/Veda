import { isFileNodeArray, type FileNode } from "./indexeddb";

/**
 * A synchronous backup of the project in localStorage. A page that closes can stop an IndexedDB write
 * that is still running, but a localStorage write finishes at once. The backup is written when the page
 * is hidden or closed with unsaved edits, and removed after IndexedDB has the same edits.
 */

const PREFIX = "veda-backup:";
/** Skip the backup above this size. localStorage holds about 5 MB for the whole site. */
export const MAX_BACKUP_CHARS = 3 * 1024 * 1024;

export type Backup = { files: FileNode[]; updatedAt: number };

const keyOf = (userId: string, project: string) => `${PREFIX}${userId}:${project}`;

/** Returns false when the backup could not be written (too big, or storage is blocked). */
export function writeBackup(userId: string, project: string, files: FileNode[], updatedAt: number): boolean {
  try {
    const text = JSON.stringify({ files, updatedAt });
    if (text.length > MAX_BACKUP_CHARS) return false;
    localStorage.setItem(keyOf(userId, project), text);
    return true;
  } catch {
    return false;
  }
}

export function readBackup(userId: string, project: string): Backup | null {
  try {
    const raw = localStorage.getItem(keyOf(userId, project));
    if (!raw) return null;
    const value = JSON.parse(raw) as { files?: unknown; updatedAt?: unknown };
    if (!isFileNodeArray(value.files) || typeof value.updatedAt !== "number") return null;
    return { files: value.files, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

export function clearBackup(userId: string, project: string): void {
  try {
    localStorage.removeItem(keyOf(userId, project));
  } catch {
    /* storage is blocked */
  }
}

/** The snapshot with the later `updatedAt`. When both are equal, `a` wins. */
export function newestSnapshot<T extends { updatedAt: number }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}
