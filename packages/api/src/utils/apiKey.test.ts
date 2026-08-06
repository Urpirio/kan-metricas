import { describe, it, expect } from "vitest";

import {
  extractApiKeyFromHeaders,
  hashApiKey,
  findMatchingApiKey,
  generateApiKey,
  generatePublicId,
} from "./apiKey";

describe("extractApiKeyFromHeaders", () => {
  it("prioritizes Authorization: Bearer over x-api-key when both are present", () => {
    const result = extractApiKeyFromHeaders({
      authorization: "Bearer kan_bearertoken123",
      "x-api-key": "kan_xapikey456",
    });

    expect(result).toBe("kan_bearertoken123");
  });

  it("returns x-api-key when Authorization header is absent", () => {
    const result = extractApiKeyFromHeaders({
      "x-api-key": "kan_xapikey456",
    });

    expect(result).toBe("kan_xapikey456");
  });

  it("returns null when neither header is present", () => {
    const result = extractApiKeyFromHeaders({});

    expect(result).toBeNull();
  });

  it("returns null when Authorization header does not start with Bearer", () => {
    const result = extractApiKeyFromHeaders({
      authorization: "Basic abc123",
    });

    expect(result).toBeNull();
  });

  it("returns null when Bearer token is empty", () => {
    const result = extractApiKeyFromHeaders({
      authorization: "Bearer ",
    });

    expect(result).toBeNull();
  });

  it("returns null when x-api-key is empty/whitespace only", () => {
    const result = extractApiKeyFromHeaders({
      "x-api-key": "   ",
    });

    expect(result).toBeNull();
  });

  it("trims whitespace from x-api-key", () => {
    const result = extractApiKeyFromHeaders({
      "x-api-key": "  kan_mykey  ",
    });

    expect(result).toBe("kan_mykey");
  });
});

describe("hashApiKey", () => {
  it("returns a consistent SHA-256 hex hash", () => {
    const hash1 = hashApiKey("test-key");
    const hash2 = hashApiKey("test-key");

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it("returns different hashes for different inputs", () => {
    const hash1 = hashApiKey("key-a");
    const hash2 = hashApiKey("key-b");

    expect(hash1).not.toBe(hash2);
  });
});

describe("findMatchingApiKey", () => {
  const now = new Date("2024-06-01T12:00:00Z");

  it("returns userId for a valid, non-revoked, non-expired key", () => {
    const hash = hashApiKey("my-secret");
    const storedKeys = [
      { keyHash: hash, userId: "user-1", revokedAt: null, expiresAt: null },
    ];

    const result = findMatchingApiKey(hash, storedKeys, now);

    expect(result).toEqual({ userId: "user-1" });
  });

  it("returns null when no key matches the hash", () => {
    const storedKeys = [
      {
        keyHash: "nonmatching-hash",
        userId: "user-1",
        revokedAt: null,
        expiresAt: null,
      },
    ];

    const result = findMatchingApiKey("other-hash", storedKeys, now);

    expect(result).toBeNull();
  });

  it("returns null when matching key is revoked", () => {
    const hash = hashApiKey("my-secret");
    const storedKeys = [
      {
        keyHash: hash,
        userId: "user-1",
        revokedAt: new Date("2024-05-01"),
        expiresAt: null,
      },
    ];

    const result = findMatchingApiKey(hash, storedKeys, now);

    expect(result).toBeNull();
  });

  it("returns null when matching key is expired", () => {
    const hash = hashApiKey("my-secret");
    const storedKeys = [
      {
        keyHash: hash,
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date("2024-05-01"),
      },
    ];

    const result = findMatchingApiKey(hash, storedKeys, now);

    expect(result).toBeNull();
  });

  it("returns userId when expiresAt is in the future", () => {
    const hash = hashApiKey("my-secret");
    const storedKeys = [
      {
        keyHash: hash,
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date("2025-01-01"),
      },
    ];

    const result = findMatchingApiKey(hash, storedKeys, now);

    expect(result).toEqual({ userId: "user-1" });
  });

  it("returns null for an empty stored keys array", () => {
    const result = findMatchingApiKey("some-hash", [], now);

    expect(result).toBeNull();
  });
});

describe("generateApiKey", () => {
  it("generates a key starting with kan_", () => {
    const { secret } = generateApiKey();

    expect(secret.startsWith("kan_")).toBe(true);
  });

  it("generates unique keys on each call", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1.secret).not.toBe(key2.secret);
    expect(key1.keyHash).not.toBe(key2.keyHash);
  });

  it("keyHash is the SHA-256 of the secret", () => {
    const { secret, keyHash } = generateApiKey();

    expect(hashApiKey(secret)).toBe(keyHash);
  });

  it("keyPrefix is the first 8 characters of the secret", () => {
    const { secret, keyPrefix } = generateApiKey();

    expect(keyPrefix).toBe(secret.slice(0, 8));
  });
});

describe("generatePublicId", () => {
  it("generates a 12-character string", () => {
    const publicId = generatePublicId();

    expect(publicId).toHaveLength(12);
  });

  it("uses only base62 characters", () => {
    const publicId = generatePublicId();

    expect(publicId).toMatch(/^[0-9A-Za-z]+$/);
  });
});
