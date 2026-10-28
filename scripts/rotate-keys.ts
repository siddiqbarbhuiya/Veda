/**
 * Re-encrypts all api_keys rows from ENCRYPTION_SECRET_OLD to ENCRYPTION_SECRET.
 * Run: npx tsx scripts/rotate-keys.ts
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ALGORITHM = "aes-256-gcm";

function loadKey(name: string): Buffer {
  const secret = process.env[name];
  if (!secret) throw new Error(`${name} is not set`);
  const key = Buffer.from(secret, "hex");
  if (key.length !== 32) throw new Error(`${name} must be a 32-byte hex string`);
  return key;
}

function decryptWith(key: Buffer, encrypted: string, iv: string, authTag: string): string {
  const d = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([d.update(Buffer.from(encrypted, "base64")), d.final()]).toString("utf8");
}

function encryptWith(key: Buffer, plaintext: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return {
    encrypted_key: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: c.getAuthTag().toString("base64"),
  };
}

async function main() {
  const newKey = loadKey("ENCRYPTION_SECRET");
  const oldKey = loadKey("ENCRYPTION_SECRET_OLD");
  if (newKey.equals(oldKey)) {
    throw new Error("ENCRYPTION_SECRET and ENCRYPTION_SECRET_OLD are the same");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: rows, error } = await supabase
    .from("api_keys")
    .select("id, encrypted_key, iv, auth_tag");
  if (error) throw new Error(`Fetch failed: ${error.message}`);

  console.log(`Rotating ${rows.length} key(s)...`);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const plaintext = decryptWith(oldKey, row.encrypted_key, row.iv, row.auth_tag);
      const { error: upErr } = await supabase
        .from("api_keys")
        .update({ ...encryptWith(newKey, plaintext), updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      ok++;
      console.log(`[${ok + failed}/${rows.length}] rotated ${row.id}`);
    } catch (e) {
      failed++;
      console.error(`[${ok + failed}/${rows.length}] FAILED ${row.id}: ${(e as Error).message}`);
    }
  }
  console.log(`Done. rotated=${ok} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
