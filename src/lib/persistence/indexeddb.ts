import { openDB, type IDBPDatabase } from "idb";

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  content?: string;
  children?: FileNode[];
};

const DB_NAME = "indicsandbox";
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

  async save(userId: string, projectName: string, files: FileNode[]): Promise<void> {
    try {
      const db = await this.getDb();
      await db.put(STORE_NAME, files, this.key(userId, projectName));
    } catch {
      this.dbPromise = null;
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
