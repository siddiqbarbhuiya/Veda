import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileNode } from "@/lib/persistence/indexeddb";
import { isTooLarge, type Snapshot } from "@/lib/persistence/sync";

export type CloudSaveResult = { ok: true } | { ok: false; error: string };

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

  async save(userId: string, projectName: string, files: FileNode[], updatedAt: number): Promise<CloudSaveResult> {
    if (isTooLarge(files)) return { ok: false, error: "The project is larger than 5 MB, so it is not saved to the cloud." };
    const { error } = await this.client.from("projects").upsert(
      { user_id: userId, name: projectName, files, updated_at: new Date(updatedAt).toISOString() },
      { onConflict: "user_id,name" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  }
}
