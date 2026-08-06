import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { resolveSupabaseBrowserConfig } from "./supabase";
import { resolveSupabaseServerConfig } from "./supabase-server";

const URL_VALUE = "https://abcdefghijkl.supabase.co";
const ANON_KEY_VALUE = "anon-key-123";
const SERVICE_ROLE_KEY_VALUE = "service-role-key-456";

beforeEach(() => {
  mockLogger.error.mockClear();
});

/**
 * Feature: migrate-supabase-vercel, Property 4
 *
 * Property 4: La resolución de configuración de Supabase respeta el aislamiento
 * servidor/navegador.
 *
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6
 */
describe("Feature: migrate-supabase-vercel, Property 4", () => {
  // Arbitrary that independently decides presence/absence of each of the three
  // Supabase env vars, so every combination (2^3 = 8) can be explored.
  const envArbitrary = fc.record({
    hasUrl: fc.boolean(),
    hasAnonKey: fc.boolean(),
    hasServiceRoleKey: fc.boolean(),
  });

  it("keeps SUPABASE_SERVICE_ROLE_KEY out of the browser config for every presence/absence combination", () => {
    fc.assert(
      fc.property(envArbitrary, ({ hasUrl, hasAnonKey, hasServiceRoleKey }) => {
        const url = hasUrl ? URL_VALUE : undefined;
        const anonKey = hasAnonKey ? ANON_KEY_VALUE : undefined;
        const serviceRoleKey = hasServiceRoleKey
          ? SERVICE_ROLE_KEY_VALUE
          : undefined;

        const browserConfig = resolveSupabaseBrowserConfig({
          NEXT_PUBLIC_SUPABASE_URL: url,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        });

        const serverConfig = resolveSupabaseServerConfig({
          NEXT_PUBLIC_SUPABASE_URL: url,
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        });

        // Browser config never carries the service role key. Regardless of
        // whether the service role key is present, its value must never appear
        // anywhere in the resolved browser config.
        if (browserConfig !== null) {
          const serialized = JSON.stringify(browserConfig);
          expect(serialized).not.toContain(SERVICE_ROLE_KEY_VALUE);
          expect(browserConfig).not.toHaveProperty("serviceRoleKey");
        }

        // Browser config resolves iff both browser vars are present, and does
        // not depend on the presence of the server-only service role key.
        if (hasUrl && hasAnonKey) {
          expect(browserConfig).toEqual({
            url: URL_VALUE,
            anonKey: ANON_KEY_VALUE,
          });
        } else {
          expect(browserConfig).toBeNull();
        }

        // Server config resolves iff both server vars are present.
        if (hasUrl && hasServiceRoleKey) {
          expect(serverConfig).toEqual({
            url: URL_VALUE,
            serviceRoleKey: SERVICE_ROLE_KEY_VALUE,
          });
        } else {
          expect(serverConfig).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("resolveSupabaseServerConfig", () => {
  // _Requirements: 7.3, 7.5_
  it("resolves the config when all required vars are present", () => {
    const result = resolveSupabaseServerConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY_VALUE,
    });

    expect(result).toEqual({
      url: URL_VALUE,
      serviceRoleKey: SERVICE_ROLE_KEY_VALUE,
    });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("returns null and logs which var is missing when NEXT_PUBLIC_SUPABASE_URL is absent", () => {
    const result = resolveSupabaseServerConfig({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY_VALUE,
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [meta, message] = mockLogger.error.mock.calls[0] as [
      { missing: string[] },
      string,
    ];
    expect(meta.missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("returns null and logs which var is missing when SUPABASE_SERVICE_ROLE_KEY is absent", () => {
    const result = resolveSupabaseServerConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [meta, message] = mockLogger.error.mock.calls[0] as [
      { missing: string[] },
      string,
    ];
    expect(meta.missing).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("resolveSupabaseBrowserConfig", () => {
  // _Requirements: 7.4, 7.6_
  it("resolves the config when all required vars are present", () => {
    const result = resolveSupabaseBrowserConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY_VALUE,
    });

    expect(result).toEqual({
      url: URL_VALUE,
      anonKey: ANON_KEY_VALUE,
    });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("returns null and logs which var is missing when NEXT_PUBLIC_SUPABASE_URL is absent", () => {
    const result = resolveSupabaseBrowserConfig({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY_VALUE,
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [meta, message] = mockLogger.error.mock.calls[0] as [
      { missing: string[] },
      string,
    ];
    expect(meta.missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("returns null and logs which var is missing when NEXT_PUBLIC_SUPABASE_ANON_KEY is absent", () => {
    const result = resolveSupabaseBrowserConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [meta, message] = mockLogger.error.mock.calls[0] as [
      { missing: string[] },
      string,
    ];
    expect(meta.missing).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});
