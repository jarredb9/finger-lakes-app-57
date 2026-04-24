import { encrypt, decrypt } from '../crypto';
import { webcrypto } from 'node:crypto';

// Polyfill webcrypto for Node environment
// JSDOM might have a partial crypto object, so we check for subtle
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

describe('crypto utilities', () => {
  const userId = 'test-user-id';
  const data = { foo: 'bar', secret: 123 };

  it('should encrypt and decrypt data correctly', async () => {
    const encrypted = await encrypt(data, userId);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(JSON.stringify(data));

    const decrypted = await decrypt(encrypted, userId);
    expect(decrypted).toEqual(data);
  });

  it('should fail to decrypt with wrong userId', async () => {
    const encrypted = await encrypt(data, userId);
    // AES-GCM decryption with wrong key/IV/auth tag usually throws
    await expect(decrypt(encrypted, 'wrong-user-id')).rejects.toThrow();
  });

  it('should produce different ciphertexts for same data due to unique IV', async () => {
    const enc1 = await encrypt(data, userId);
    const enc2 = await encrypt(data, userId);
    expect(enc1).not.toBe(enc2);
  });
});
