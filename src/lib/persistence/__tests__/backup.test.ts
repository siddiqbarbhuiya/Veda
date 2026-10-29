import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileNode } from "../indexeddb";
import { MAX_BACKUP_CHARS, clearAllBackups, clearBackup, newestSnapshot, readBackup, writeBackup } from "../backup";

const files: FileNode[] = [{ name: "a.js", path: "a.js", type: "file", content: "1" }];

/** A small in-memory localStorage. The test environment has a broken global one. */
function memoryStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
    ...overrides,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("backup", () => {
  it("writes and reads a backup", () => {
    expect(writeBackup("u1", "default", files, 123)).toBe(true);
    expect(readBackup("u1", "default")).toEqual({ files, updatedAt: 123 });
  });
  it("keeps users and projects apart", () => {
    writeBackup("u1", "default", files, 1);
    expect(readBackup("u2", "default")).toBeNull();
    expect(readBackup("u1", "other")).toBeNull();
  });
  it("clears a backup", () => {
    writeBackup("u1", "default", files, 1);
    clearBackup("u1", "default");
    expect(readBackup("u1", "default")).toBeNull();
  });
  it("does not write a backup that is too big", () => {
    const big: FileNode[] = [{ name: "b", path: "b", type: "file", content: "x".repeat(MAX_BACKUP_CHARS) }];
    expect(writeBackup("u1", "default", big, 1)).toBe(false);
    expect(readBackup("u1", "default")).toBeNull();
  });
  it("ignores text that is not a backup", () => {
    localStorage.setItem("veda-backup:u1:default", "{ broken");
    expect(readBackup("u1", "default")).toBeNull();
    localStorage.setItem("veda-backup:u1:default", JSON.stringify({ files: "no", updatedAt: 1 }));
    expect(readBackup("u1", "default")).toBeNull();
    localStorage.setItem("veda-backup:u1:default", JSON.stringify({ files: [], updatedAt: "late" }));
    expect(readBackup("u1", "default")).toBeNull();
  });
  it("survives blocked storage", () => {
    vi.stubGlobal(
      "localStorage",
      memoryStorage({
        setItem: () => {
          throw new Error("blocked");
        },
      })
    );
    expect(writeBackup("u1", "default", files, 1)).toBe(false);
  });
});

describe("newestSnapshot", () => {
  const snap = (updatedAt: number, tag: string) => ({ updatedAt, tag });
  it("returns the other one when one is missing", () => {
    expect(newestSnapshot(null, snap(1, "b"))?.tag).toBe("b");
    expect(newestSnapshot(snap(1, "a"), null)?.tag).toBe("a");
    expect(newestSnapshot(null, null)).toBeNull();
  });
  it("returns the later one", () => {
    expect(newestSnapshot(snap(1, "a"), snap(2, "b"))?.tag).toBe("b");
    expect(newestSnapshot(snap(3, "a"), snap(2, "b"))?.tag).toBe("a");
  });
  it("lets the first win when the times are equal", () => {
    expect(newestSnapshot(snap(2, "a"), snap(2, "b"))?.tag).toBe("a");
  });
});

describe("clearAllBackups", () => {
  it("removes the backups of one user only", () => {
    writeBackup("u1", "a", files, 1);
    writeBackup("u1", "b", files, 2);
    writeBackup("u2", "a", files, 3);
    clearAllBackups("u1");
    expect(readBackup("u1", "a")).toBeNull();
    expect(readBackup("u1", "b")).toBeNull();
    expect(readBackup("u2", "a")).not.toBeNull();
  });
});
