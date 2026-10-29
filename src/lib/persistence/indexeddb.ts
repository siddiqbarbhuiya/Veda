import { openDB, type IDBPDatabase } from "idb";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  content?: string;
  children?: FileNode[];
  /** Set only on runtime view nodes (node_modules). They are never saved. */
  readOnly?: boolean;
};

const DB_NAME = "veda";
const STORE_NAME = "projects";

/** Type guard for a saved tree. A bad shape in storage is treated as "nothing saved". */
export function isFileNodeArray(value: unknown): value is FileNode[] {
  if (!Array.isArray(value)) return false;
  return value.every((n) => {
    if (!n || typeof n !== "object") return false;
    const o = n as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.path !== "string") return false;
    if (o.type === "file") return o.content === undefined || typeof o.content === "string";
    if (o.type === "directory") return o.children === undefined || isFileNodeArray(o.children);
    return false;
  });
}

export class IndexedDBStore {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  /** Cached handle. With it a write can start in the same tick, which lets it survive a page unload. */
  private db: IDBPDatabase | null = null;

  private getDb() {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        },
        terminated: () => {
          this.db = null;
          this.dbPromise = null;
        },
      }).then(
        (db) => {
          this.db = db;
          return db;
        },
        (err) => {
          this.dbPromise = null;
          throw err;
        },
      );
    }
    return this.dbPromise;
  }

  /** Open the database early so the first write needs no wait. */
  warm(): void {
    this.getDb().catch(() => {});
  }

  private key(userId: string, projectName: string) {
    return `${userId}:${projectName}`;
  }

  private reset() {
    this.db = null;
    this.dbPromise = null;
  }

  /** `updatedAt` is the time of the last edit. It is kept beside the files so a cloud copy can be compared. */
  async save(userId: string, projectName: string, files: FileNode[], updatedAt: number = Date.now()): Promise<void> {
    try {
      // No await before the transaction when the handle is cached: the write starts at once.
      const db = this.db ?? (await this.getDb());
      const key = this.key(userId, projectName);
      const tx = db.transaction(STORE_NAME, "readwrite");
      void tx.store.put(files, key);
      void tx.store.put({ updatedAt }, `${key}#meta`);
      await tx.done;
    } catch (err) {
      console.error("IndexedDBStore.save failed", err);
      this.reset();
    }
  }

  /** Delete the saved project and its meta for this user. */
  async clear(userId: string, projectName: string): Promise<void> {
    try {
      const db = this.db ?? (await this.getDb());
      const key = this.key(userId, projectName);
      const tx = db.transaction(STORE_NAME, "readwrite");
      void tx.store.delete(key);
      void tx.store.delete(`${key}#meta`);
      await tx.done;
    } catch (err) {
      console.error("IndexedDBStore.clear failed", err);
      this.reset();
    }
  }

  /** The files plus the time of the last edit (0 for a project saved before this field existed). */
  async loadWithMeta(userId: string, projectName: string): Promise<{ files: FileNode[]; updatedAt: number } | null> {
    try {
      const db = await this.getDb();
      const key = this.key(userId, projectName);
      const tx = db.transaction(STORE_NAME, "readonly");
      const [files, meta] = await Promise.all([tx.store.get(key), tx.store.get(`${key}#meta`), tx.done]);
      if (!isFileNodeArray(files)) return null;
      const at = (meta as { updatedAt?: unknown } | undefined)?.updatedAt;
      return { files, updatedAt: typeof at === "number" ? at : 0 };
    } catch {
      this.reset();
      return null;
    }
  }

  async load(userId: string, projectName: string): Promise<FileNode[] | null> {
    return (await this.loadWithMeta(userId, projectName))?.files ?? null;
  }
}
