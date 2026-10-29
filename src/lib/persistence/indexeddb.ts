import { openDB, type IDBPDatabase } from "idb";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  content?: string;
  children?: FileNode[];
};

const DB_NAME = "veda";
const STORE_NAME = "projects";

export class IndexedDBStore {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private getDb() {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        },
      });
    }
    return this.dbPromise;
  }

  private key(userId: string, projectName: string) {
    return `${userId}:${projectName}`;
  }

  /** `updatedAt` is the time of the last edit. It is kept beside the files so a cloud copy can be compared. */
  async save(userId: string, projectName: string, files: FileNode[], updatedAt: number = Date.now()): Promise<void> {
    try {
      const db = await this.getDb();
      const key = this.key(userId, projectName);
      await db.put(STORE_NAME, files, key);
      await db.put(STORE_NAME, { updatedAt }, `${key}#meta`);
    } catch (err) {
      console.error("IndexedDBStore.save failed", err);
      this.dbPromise = null;
    }
  }

  /** The files plus the time of the last edit (0 for a project saved before this field existed). */
  async loadWithMeta(userId: string, projectName: string): Promise<{ files: FileNode[]; updatedAt: number } | null> {
    const files = await this.load(userId, projectName);
    if (!files) return null;
    try {
      const db = await this.getDb();
      const meta = (await db.get(STORE_NAME, `${this.key(userId, projectName)}#meta`)) as
        | { updatedAt?: number }
        | undefined;
      return { files, updatedAt: meta?.updatedAt ?? 0 };
    } catch {
      return { files, updatedAt: 0 };
    }
  }

  async load(userId: string, projectName: string): Promise<FileNode[] | null> {
    try {
      const db = await this.getDb();
      const value = await db.get(STORE_NAME, this.key(userId, projectName));
      return (value as FileNode[] | undefined) ?? null;
    } catch {
      this.dbPromise = null;
      return null;
    }
  }
}
