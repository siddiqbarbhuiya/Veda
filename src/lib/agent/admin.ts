import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { decrypt } from "@/lib/crypto/encryption";
import type { Database } from "@/types/database";

/** Service role client. It bypasses RLS: use it only after the user is checked. */
export function createAdminClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export type AdminClient = ReturnType<typeof createAdminClient>;

/** Decrypted key for one provider, or null when the student has not saved one. Throws on a database or decrypt error. */
export async function loadProviderKey(admin: AdminClient, userId: string, provider: string): Promise<string | null> {
  const { data, error } = await admin
    .from("api_keys")
    .select("encrypted_key, iv, auth_tag")
    .eq("user_id", userId)
    .eq("provider", provider as Database["public"]["Tables"]["api_keys"]["Row"]["provider"])
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return decrypt(data.encrypted_key, data.iv, data.auth_tag);
}
