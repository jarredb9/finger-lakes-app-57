const textEncoder = new TextEncoder();

interface SubtleCryptoWithTimingSafe extends SubtleCrypto {
  timingSafeEqual: (a: BufferSource, b: BufferSource) => boolean;
}

function hasTimingSafeEqual(
  subtle: SubtleCrypto,
): subtle is SubtleCryptoWithTimingSafe {
  return (
    "timingSafeEqual" in subtle &&
    typeof Reflect.get(subtle, "timingSafeEqual") === "function"
  );
}

/**
 * Compares two strings in constant time by hashing their UTF-8 representations
 * to fixed 32-byte SHA-256 digests before byte-wise comparison.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [digestBufferA, digestBufferB] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(a)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(b)),
  ]);

  const digestA = new Uint8Array(digestBufferA);
  const digestB = new Uint8Array(digestBufferB);

  if (hasTimingSafeEqual(crypto.subtle)) {
    return crypto.subtle.timingSafeEqual(digestA, digestB);
  }

  let diff = digestA.length ^ digestB.length;
  for (let i = 0; i < digestA.length; i++) {
    diff |= digestA[i] ^ digestB[i];
  }
  return diff === 0;
}

/**
 * Validates an HTTP Authorization header (`Bearer <token>`) in constant time
 * against every non-blank candidate secret.
 */
export async function verifyBearerSecret(
  authHeader: string | null,
  candidateSecrets: ReadonlyArray<string | undefined | null>,
): Promise<boolean> {
  if (!authHeader) {
    return false;
  }

  const match = authHeader.match(/^Bearer\s+([\s\S]+)$/i);
  if (!match) {
    return false;
  }

  const token = match[1].trim();
  if (token.length === 0) {
    return false;
  }

  const validSecrets = candidateSecrets.filter(
    (secret): secret is string => typeof secret === "string" && secret.trim().length > 0,
  );
  if (validSecrets.length === 0) {
    return false;
  }

  // Evaluate all configured candidate secrets without short-circuiting on first match.
  let matched = false;
  for (const secret of validSecrets) {
    if (await constantTimeEqual(token, secret)) {
      matched = true;
    }
  }
  return matched;
}
