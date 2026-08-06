import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import { TRPCError } from "@trpc/server";

import { getRedisClient } from "@kan/db/redis";
import { createLogger } from "@kan/logger";

const log = createLogger("apiKeyRateLimit");

const API_KEY_RATE_LIMIT_POINTS = 100;
const API_KEY_RATE_LIMIT_DURATION_S = 60;

let rateLimiter: RateLimiterRedis | RateLimiterMemory | null = null;

function getApiKeyRateLimiter(): RateLimiterRedis | RateLimiterMemory {
  if (rateLimiter) {
    return rateLimiter;
  }

  const redis = getRedisClient();

  if (redis) {
    log.debug("Using Redis for API key rate limiting");
    rateLimiter = new RateLimiterRedis({
      storeClient: redis,
      points: API_KEY_RATE_LIMIT_POINTS,
      duration: API_KEY_RATE_LIMIT_DURATION_S,
      keyPrefix: "apikey_ratelimit",
    });
  } else {
    log.debug(
      "Redis unavailable, falling back to in-memory API key rate limiting",
    );
    rateLimiter = new RateLimiterMemory({
      points: API_KEY_RATE_LIMIT_POINTS,
      duration: API_KEY_RATE_LIMIT_DURATION_S,
      keyPrefix: "apikey_ratelimit",
    });
  }

  return rateLimiter;
}

/**
 * Consumes a rate limit point for the given API key public ID.
 * Throws a TRPCError with code TOO_MANY_REQUESTS if the limit is exceeded.
 */
export async function consumeApiKeyRateLimit(publicId: string): Promise<void> {
  const limiter = getApiKeyRateLimiter();

  try {
    await limiter.consume(publicId);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      ("msBeforeNext" in error || "remainingPoints" in error)
    ) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "API key rate limit exceeded. Please try again later.",
      });
    }

    // Unexpected error — log but don't block the request
    log.error({ err: error }, "Unexpected error in API key rate limiter");
  }
}

/**
 * Resets the rate limiter singleton (used for testing).
 */
export function resetApiKeyRateLimiter(): void {
  rateLimiter = null;
}
