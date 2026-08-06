import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createLogger } from "@kan/logger";

import { extractApiKeyFromHeaders, hashApiKey } from "./apiKey";
import { consumeApiKeyRateLimit } from "./apiKeyRateLimit";

const log = createLogger("apiKeyMiddleware");

/**
 * Authenticates a request using an API key.
 * Returns the userId if a valid API key is found, or null if no API key is present.
 * Throws UNAUTHORIZED if an invalid/revoked/expired key is provided.
 * Throws TOO_MANY_REQUESTS if the rate limit is exceeded.
 */
export async function authenticateApiKey(ctx: {
  db: unknown;
  headers: Headers;
}): Promise<{ userId: string; publicId: string } | null> {
  const headers: { authorization?: string; "x-api-key"?: string } = {};

  const authHeader = ctx.headers.get("authorization");
  if (authHeader) {
    headers.authorization = authHeader;
  }

  const xApiKey = ctx.headers.get("x-api-key");
  if (xApiKey) {
    headers["x-api-key"] = xApiKey;
  }

  const plaintext = extractApiKeyFromHeaders(headers);
  if (!plaintext) {
    return null;
  }

  // Only process keys that look like our format
  if (!plaintext.startsWith("kan_")) {
    return null;
  }

  const keyHash = hashApiKey(plaintext);

  // Lazy import to avoid loading schema at module initialization time
  const { apiKeys } = await import("@kan/db/schema");

  // Query the database for matching key by hash
  const db = ctx.db as {
    query: {
      apiKeys: {
        findFirst: (opts: {
          where: unknown;
          columns: Record<string, boolean>;
        }) => Promise<{
          userId: string;
          publicId: string;
          revokedAt: Date | null;
          expiresAt: Date | null;
        } | undefined>;
      };
    };
    update: (table: typeof apiKeys) => {
      set: (values: Record<string, unknown>) => {
        where: (condition: unknown) => Promise<unknown>;
      };
    };
  };

  let storedKey;
  try {
    storedKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
      columns: {
        userId: true,
        publicId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
  } catch (error) {
    log.error({ err: error }, "Failed to query API key from database");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to validate API key",
    });
  }

  if (!storedKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid API key",
    });
  }

  if (storedKey.revokedAt !== null) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "API key has been revoked",
    });
  }

  const now = new Date();
  if (storedKey.expiresAt !== null && storedKey.expiresAt <= now) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "API key has expired",
    });
  }

  // Apply rate limiting
  await consumeApiKeyRateLimit(storedKey.publicId);

  // Update lastUsedAt (fire and forget)
  try {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(apiKeys.keyHash, keyHash));
  } catch (error) {
    log.warn({ err: error }, "Failed to update lastUsedAt for API key");
  }

  return { userId: storedKey.userId, publicId: storedKey.publicId };
}
