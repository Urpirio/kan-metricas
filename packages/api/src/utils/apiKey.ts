import { createHash, randomBytes } from "crypto";

// Base62 character set
const BASE62_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Extracts an API key from request headers.
 * Prioritizes `Authorization: Bearer <key>` over `x-api-key`.
 */
export function extractApiKeyFromHeaders(headers: {
  authorization?: string;
  "x-api-key"?: string;
}): string | null {
  const authHeader = headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  const xApiKey = headers["x-api-key"];
  if (xApiKey && xApiKey.trim().length > 0) {
    return xApiKey.trim();
  }

  return null;
}

/**
 * Hashes an API key plaintext using SHA-256, returning the hex digest.
 */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Finds a matching API key from a list of stored keys.
 * A key matches if:
 * 1. Its hash matches exactly
 * 2. It is not revoked (revokedAt is null)
 * 3. It is not expired (expiresAt is null or is after `now`)
 */
export function findMatchingApiKey(
  hash: string,
  storedKeys: {
    keyHash: string;
    userId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  }[],
  now: Date,
): { userId: string } | null {
  for (const key of storedKeys) {
    if (key.keyHash !== hash) {
      continue;
    }

    if (key.revokedAt !== null) {
      return null;
    }

    if (key.expiresAt !== null && key.expiresAt <= now) {
      return null;
    }

    return { userId: key.userId };
  }

  return null;
}

/**
 * Encodes a Buffer to base62 string.
 */
function toBase62(buffer: Buffer): string {
  let result = "";
  for (const byte of buffer) {
    result += BASE62_CHARS[byte % 62];
  }
  return result;
}

/**
 * Generates a new API key.
 * Returns the full plaintext secret (shown once to the user) and
 * the keyHash + keyPrefix for storage.
 *
 * Secret format: `kan_` + 32 random bytes encoded in base62
 */
export function generateApiKey(): {
  secret: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = toBase62(randomBytes(32));
  const secret = `kan_${randomPart}`;
  const keyHash = hashApiKey(secret);
  const keyPrefix = secret.slice(0, 8); // "kan_" + first 4 chars of random part

  return { secret, keyHash, keyPrefix };
}

/**
 * Generates a random 12-character public ID using base62 characters.
 */
export function generatePublicId(): string {
  return toBase62(randomBytes(12));
}
