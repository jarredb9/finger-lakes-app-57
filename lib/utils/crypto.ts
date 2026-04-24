/**
 * Hardened Web Crypto Wrapper
 * Implements AES-GCM encryption with PBKDF2 key derivation.
 * Optimized for PWA offline data protection.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

/**
 * Encrypts a JSON-serializable object using a key derived from the userId.
 * Returns a base64-encoded string containing salt, IV, and ciphertext.
 */
export async function encrypt(data: any, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const rawData = encoder.encode(JSON.stringify(data));
  
  // 1. Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // 2. Derive key from userId and salt
  const key = await deriveKey(userId, salt);

  // 3. Encrypt data
  const encryptedContent = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    rawData
  );

  // 4. Combine salt + iv + ciphertext into a single buffer
  const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypts a base64-encoded string using a key derived from the userId.
 * Returns the original JSON-serializable object.
 */
export async function decrypt(encryptedData: string, userId: string): Promise<any> {
  // 1. Decode base64 and extract salt, IV, and ciphertext
  const combined = base64ToArrayBuffer(encryptedData);
  
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  // 2. Derive key from userId and salt
  const key = await deriveKey(userId, salt);

  // 3. Decrypt data
  const decryptedContent = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  // 4. Decode and parse JSON
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedContent));
}

/**
 * Derives a CryptoKey from a userId and salt using PBKDF2.
 */
async function deriveKey(userId: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  // Import the userId as a raw key for derivation
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the actual AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Utility functions for Base64 conversion (Node/Browser compatible)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
