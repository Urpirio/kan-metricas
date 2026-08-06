import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveMigrationUrl } from "./migration-url";

/**
 * Arbitrary for a non-empty connection-string-like value. Kept simple: any
 * non-empty string works for the resolution logic, which only cares about
 * presence/absence, not the URL format.
 */
const nonEmptyUrlArbitrary = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((value) => value.length > 0);

// Presence can be: absent (undefined), empty string, or a non-empty value.
const maybeUrlArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  nonEmptyUrlArbitrary,
);

describe("resolveMigrationUrl", () => {
  describe("Property 2: La URL de migración prioriza la conexión directa sobre la pooled", () => {
    // Feature: migrate-supabase-vercel, Property 2
    // Validates: Requirements 2.2, 2.3
    it("uses POSTGRES_URL_NON_POOLING whenever it is present and non-empty", () => {
      fc.assert(
        fc.property(
          nonEmptyUrlArbitrary,
          maybeUrlArbitrary,
          (nonPooling, pooled) => {
            const result = resolveMigrationUrl({
              POSTGRES_URL_NON_POOLING: nonPooling,
              POSTGRES_URL: pooled,
            });

            expect(result).toBe(nonPooling);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("never returns the pooled URL when the direct (non-pooling) URL is present and different", () => {
      fc.assert(
        fc.property(
          nonEmptyUrlArbitrary,
          nonEmptyUrlArbitrary,
          (nonPooling, pooled) => {
            fc.pre(nonPooling !== pooled);

            const result = resolveMigrationUrl({
              POSTGRES_URL_NON_POOLING: nonPooling,
              POSTGRES_URL: pooled,
            });

            expect(result).not.toBe(pooled);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("falls back to POSTGRES_URL when the direct URL is absent or empty", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(undefined, ""),
          maybeUrlArbitrary,
          (nonPooling, pooled) => {
            const result = resolveMigrationUrl({
              POSTGRES_URL_NON_POOLING: nonPooling,
              POSTGRES_URL: pooled,
            });

            expect(result).toBe(pooled ?? "");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("always returns a string (never undefined)", () => {
      fc.assert(
        fc.property(maybeUrlArbitrary, maybeUrlArbitrary, (nonPooling, pooled) => {
          const result = resolveMigrationUrl({
            POSTGRES_URL_NON_POOLING: nonPooling,
            POSTGRES_URL: pooled,
          });

          expect(typeof result).toBe("string");
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("unit cases", () => {
    // _Requirements: 2.3, 7.1_
    it("uses POSTGRES_URL for migrations when only POSTGRES_URL is defined (self-hosting)", () => {
      const result = resolveMigrationUrl({
        POSTGRES_URL: "postgres://user:pass@postgres:5432/kan",
      });

      expect(result).toBe("postgres://user:pass@postgres:5432/kan");
    });

    it("prioritizes the direct connection over the pooled connection", () => {
      const result = resolveMigrationUrl({
        POSTGRES_URL_NON_POOLING:
          "postgres://postgres:pass@db.abcdefghijkl.supabase.co:5432/postgres",
        POSTGRES_URL:
          "postgres://postgres:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      });

      expect(result).toBe(
        "postgres://postgres:pass@db.abcdefghijkl.supabase.co:5432/postgres",
      );
    });

    it("returns an empty string when neither variable is defined", () => {
      expect(resolveMigrationUrl({})).toBe("");
    });
  });
});
