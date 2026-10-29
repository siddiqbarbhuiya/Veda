import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileNode } from "@/lib/persistence/indexeddb";
import { isTooLarge, type Snapshot } from "@/lib/persistence/sync";

export type CloudSaveResult = { ok: true } | { ok: false; error: string };

/** `exists`: the name is taken. `limit`: the user has the most projects. `other`: a network or server error. */
export type CloudWriteResult = { ok: true } | { ok: false; kind: "exists" | "limit" | "other"; error: string };

// A narrow client type keeps the table name and row shape out of the generic Database type.
type Client = Pick<SupabaseClient, "from">;

export class CloudStore {
  constructor(private readonly client: Client) {}

  async load(userId: string, projectName: string): Promise<Snapshot | null> {
    const { data, error } = await this.client
      .from("projects")
      .select("files, updated_at")
      .eq("user_id", userId)
      .eq("name", projectName)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const files = Array.isArray(data.files) ? (data.files as FileNode[]) : [];
    const at = new Date(data.updated_at as string).getTime();
    return { files, updatedAt: Number.isFinite(at) ? at : 0 };
  }

  /** The projects of a user (name and last edit time). Throws when the cloud cannot be read. */
  async list(userId: string): Promise<Array<{ name: string; updatedAt: number }>> {
    const { data, error } = await this.client.from("projects").select("name, updated_at").eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const at = new Date((row as { updated_at: string }).updated_at).getTime();
      return { name: (row as { name: string }).name, updatedAt: Number.isFinite(at) ? at : 0 };
    });
  }

  /** Make a new project. It never replaces a project that has the same name. */
  async create(userId: string, projectName: string, files: FileNode[], updatedAt: number): Promise<CloudWriteResult> {
    const { error } = await this.client
      .from("projects")
      .insert({ user_id: userId, name: projectName, files, updated_at: new Date(updatedAt).toISOString() });
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: false, kind: "exists", error: "A project with this name exists." };
    if (error.code === "42501") return { ok: false, kind: "limit", error: "You have the most projects that you can keep." };
    return { ok: false, kind: "other", error: error.message };
  }

  async remove(userId: string, projectName: string): Promise<CloudWriteResult> {
    const { error } = await this.client.from("projects").delete().eq("user_id", userId).eq("name", projectName);
    return error ? { ok: false, kind: "other", error: error.message } : { ok: true };
  }

  async save(userId: string, projectName: string, files: FileNode[], updatedAt: number): Promise<CloudSaveResult> {
    if (isTooLarge(files)) return { ok: false, error: "The project is larger than 5 MB, so it is not saved to the cloud." };
    const { error } = await this.client.from("projects").upsert(
      { user_id: userId, name: projectName, files, updated_at: new Date(updatedAt).toISOString() },
      { onConflict: "user_id,name" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  }
}
