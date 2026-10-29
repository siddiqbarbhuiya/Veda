import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/** Result of AES-256-GCM encryption. All fields are base64-encoded. */
export type EncryptedPayload = {
  /** Base64-encoded ciphertext. */
  encrypted: string;
  /** Base64-encoded 12-byte initialization vector, random per call. */
  iv: string;
  /** Base64-encoded GCM authentication tag used to verify integrity on decrypt. */
  authTag: string;
};

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not set');
  }
  const key = Buffer.from(secret, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_SECRET must be a 32-byte hex string');
  }
  return key;
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * @param plaintext - UTF-8 string to encrypt.
 * @returns Payload with base64-encoded ciphertext, iv and auth tag.
 * @throws If ENCRYPTION_SECRET is not set or is not a 32-byte hex string.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts a payload produced by {@link encrypt}.
 * @param encrypted - Base64-encoded ciphertext.
 * @param iv - Base64-encoded initialization vector.
 * @param authTag - Base64-encoded GCM authentication tag.
 * @returns The original UTF-8 plaintext.
 * @throws If ENCRYPTION_SECRET is not set or wrong length, or if the auth tag check fails.
 */
export function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
