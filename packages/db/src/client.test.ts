import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@kan/logger", () => ({
  createLogger: vi.fn(() => mockLogger),
}));

const { mockPoolConnect, mockPoolConstructor } = vi.hoisted(() => ({
  mockPoolConnect: vi.fn(),
  mockPoolConstructor: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(function MockPool(
    this: { connect: typeof mockPoolConnect },
    options: unknown,
  ) {
    mockPoolConstructor(options);
    this.connect = mockPoolConnect;
  }),
}));

import { createDrizzleClient, resolveDbConfig, verifyInitialConnection } from "./client";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "postgres"];

/**
 * Arbitrary for a "remote" hostname (never matches one of the known local
 * hosts), built from simple lowercase DNS label segments joined by dots.
 */
const remoteHostArbitrary = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) => segments.join("."))
  .filter((host) => host.length > 0 && !LOCAL_HOSTS.includes(host));

const nodeEnvArbitrary = fc.constantFrom(
  "development",
  "test",
  "staging",
  undefined,
);

describe("resolveDbConfig", () => {
  describe("Property 1: Resolución de configuración de base de datos es coherente con el host y el entorno", () => {
    // Validates: Requirements 1.1, 1.2, 1.4, 7.2
    it("returns null when POSTGRES_URL is absent and NODE_ENV is not production", () => {
      fc.assert(
        fc.property(nodeEnvArbitrary, (NODE_ENV) => {
          const result = resolveDbConfig({ POSTGRES_URL: undefined, NODE_ENV });
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("throws a descriptive error when POSTGRES_URL is absent and NODE_ENV is production", () => {
      fc.assert(
        fc.property(fc.constant("production"), (NODE_ENV) => {
          expect(() =>
            resolveDbConfig({ POSTGRES_URL: undefined, NODE_ENV }),
          ).toThrow(/POSTGRES_URL/);
        }),
        { numRuns: 100 },
      );
    });

    it("resolves ssl: false for known local/docker hosts, regardless of sslmode or NODE_ENV", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...LOCAL_HOSTS),
          fc.integer({ min: 1024, max: 65535 }),
          fc.boolean(),
          nodeEnvArbitrary,
          (host, port, includeSslMode, NODE_ENV) => {
            const query = includeSslMode ? "?sslmode=require" : "";
            const POSTGRES_URL = `postgres://user:pass@${host}:${port}/db${query}`;

            const result = resolveDbConfig({ POSTGRES_URL, NODE_ENV });

            expect(result).not.toBeNull();
            expect(result?.ssl).toBe(false);
            expect(result?.connectionString).toBe(POSTGRES_URL);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("resolves ssl: false for any host when the URL already contains sslmode", () => {
      fc.assert(
        fc.property(
          remoteHostArbitrary,
          fc.integer({ min: 1024, max: 65535 }),
          nodeEnvArbitrary,
          (host, port, NODE_ENV) => {
            const POSTGRES_URL = `postgres://user:pass@${host}:${port}/db?sslmode=require`;

            const result = resolveDbConfig({ POSTGRES_URL, NODE_ENV });

            expect(result).not.toBeNull();
            expect(result?.ssl).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("resolves ssl: { rejectUnauthorized: false } for any other remote host without sslmode", () => {
      fc.assert(
        fc.property(
          remoteHostArbitrary,
          fc.integer({ min: 1024, max: 65535 }),
          nodeEnvArbitrary,
          (host, port, NODE_ENV) => {
            const POSTGRES_URL = `postgres://user:pass@${host}:${port}/db`;

            const result = resolveDbConfig({ POSTGRES_URL, NODE_ENV });

            expect(result).not.toBeNull();
            expect(result?.ssl).toEqual({ rejectUnauthorized: false });
            expect(result?.connectionString).toBe(POSTGRES_URL);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("unit cases", () => {
    // _Requirements: 1.1, 1.2, 1.4_
    it("returns null when POSTGRES_URL is absent and NODE_ENV=development", () => {
      const result = resolveDbConfig({
        POSTGRES_URL: undefined,
        NODE_ENV: "development",
      });

      expect(result).toBeNull();
    });

    it("throws a descriptive error when POSTGRES_URL is absent and NODE_ENV=production", () => {
      expect(() =>
        resolveDbConfig({ POSTGRES_URL: undefined, NODE_ENV: "production" }),
      ).toThrow(/POSTGRES_URL/);
    });

    it("resolves ssl: false for the docker-compose service host `postgres`", () => {
      const result = resolveDbConfig({
        POSTGRES_URL: "postgres://user:pass@postgres:5432/kan",
        NODE_ENV: "production",
      });

      expect(result).toEqual({
        connectionString: "postgres://user:pass@postgres:5432/kan",
        ssl: false,
      });
    });

    it("resolves ssl: { rejectUnauthorized: false } for a Supabase host", () => {
      const POSTGRES_URL =
        "postgres://postgres:pass@db.abcdefghijkl.supabase.co:5432/postgres";

      const result = resolveDbConfig({ POSTGRES_URL, NODE_ENV: "production" });

      expect(result).toEqual({
        connectionString: POSTGRES_URL,
        ssl: { rejectUnauthorized: false },
      });
    });
  });
});

describe("verifyInitialConnection", () => {
  // _Requirements: 1.3_
  it("logs a descriptive error via @kan/logger and rethrows when the initial connection fails", async () => {
    const connectionError = new Error("connection refused");

    const fakePool = {
      connect: vi.fn().mockRejectedValue(connectionError),
    } as unknown as Pool;

    mockLogger.error.mockClear();

    await expect(verifyInitialConnection(fakePool)).rejects.toBe(
      connectionError,
    );

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [meta, message] = mockLogger.error.mock.calls[0] as [
      { err: unknown },
      string,
    ];
    expect(meta.err).toBe(connectionError);
    expect(message).toMatch(/connection/i);
  });

  it("releases the client and does not log when the initial connection succeeds", async () => {
    const release = vi.fn();
    const fakePool = {
      connect: vi.fn().mockResolvedValue({ release }),
    } as unknown as Pool;

    mockLogger.error.mockClear();

    await expect(verifyInitialConnection(fakePool)).resolves.toBeUndefined();

    expect(release).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

describe("createDrizzleClient", () => {
  // _Requirements: 1.1, 1.2, 1.3, 1.4, 7.2_
  const originalPostgresUrl = process.env.POSTGRES_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.POSTGRES_URL = originalPostgresUrl;
    process.env.NODE_ENV = originalNodeEnv;
    mockPoolConstructor.mockClear();
    mockPoolConnect.mockClear();
    mockLogger.error.mockClear();
  });

  it("builds the Pool with the connectionString and ssl resolved by resolveDbConfig, and logs via @kan/logger before the initial connection rejection propagates", async () => {
    process.env.POSTGRES_URL =
      "postgres://user:pass@db.abcdefghijkl.supabase.co:5432/postgres";
    process.env.NODE_ENV = "production";

    const connectionError = new Error("connection refused");
    mockPoolConnect.mockRejectedValue(connectionError);

    createDrizzleClient();

    expect(mockPoolConstructor).toHaveBeenCalledWith({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false },
    });

    // `verifyInitialConnection` is fired without being awaited by
    // `createDrizzleClient`, so wait a tick for the rejection to be handled.
    await vi.waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    const [meta, message] = mockLogger.error.mock.calls[0] as [
      { err: unknown },
      string,
    ];
    expect(meta.err).toBe(connectionError);
    expect(message).toMatch(/connection/i);
  });
});
