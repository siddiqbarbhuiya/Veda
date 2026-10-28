import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt } from '../encryption';

const TEST_SECRET = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const OTHER_SECRET = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';

const originalSecret = process.env.ENCRYPTION_SECRET;

beforeAll(() => {
  process.env.ENCRYPTION_SECRET = TEST_SECRET;
});

afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env.ENCRYPTION_SECRET;
  } else {
    process.env.ENCRYPTION_SECRET = originalSecret;
  }
});

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

describe('encryption', () => {
  test('encrypt returns encrypted, iv, and authTag as base64 strings', () => {
    const result = encrypt('sk-test-key-12345');

    expect(typeof result.encrypted).toBe('string');
    expect(typeof result.iv).toBe('string');
    expect(typeof result.authTag).toBe('string');
    expect(result.encrypted).toMatch(BASE64_PATTERN);
    expect(result.iv).toMatch(BASE64_PATTERN);
    expect(result.authTag).toMatch(BASE64_PATTERN);
    expect(Buffer.from(result.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(result.authTag, 'base64')).toHaveLength(16);
  });

  test('decrypt recovers the original plaintext', () => {
    const result = encrypt('sk-test-key-12345');
    expect(decrypt(result.encrypted, result.iv, result.authTag)).toBe('sk-test-key-12345');
  });

  test('decrypt with wrong key throws', () => {
    const result = encrypt('sk-test-key-12345');

    process.env.ENCRYPTION_SECRET = OTHER_SECRET;
    try {
      expect(() => decrypt(result.encrypted, result.iv, result.authTag)).toThrow();
    } finally {
      process.env.ENCRYPTION_SECRET = TEST_SECRET;
    }
  });

  test('decrypt with tampered ciphertext throws', () => {
    const result = encrypt('sk-test-key-12345');

    const bytes = Buffer.from(result.encrypted, 'base64');
    bytes[0] = bytes[0] ^ 0x01;
    const tampered = bytes.toString('base64');

    expect(() => decrypt(tampered, result.iv, result.authTag)).toThrow();
  });

  test('each encrypt call produces a different IV', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a.iv).not.toBe(b.iv);
  });
});
