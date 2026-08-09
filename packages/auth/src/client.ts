import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";
import { env } from "next-runtime-env";

import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/**
 * Lazy singleton Supabase browser client.
 *
 * Uses `createBrowserClient` from `@supabase/ssr` (rather than `createClient`
 * from `@supabase/supabase-js`) so that the session is persisted in **cookies**
 * instead of localStorage. This is required for the server-side `getSession`
 * in `packages/auth/src/auth.ts` to be able to read the session from the
 * incoming request's cookie header.
 *
 * Env vars are read lazily via `next-runtime-env` so that the runtime-injected
 * `__ENV.js` values are available before the client is constructed.
 */
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = env("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "";

  if (!url || !anonKey) {
    throw new Error(
      "Cannot create Supabase browser client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  _supabase = createBrowserClient(url, anonKey);
  return _supabase;
}

/**
 * Returns the same cookie-backed Supabase browser client singleton used for
 * sign-in/sign-up/session state (see the module doc comment above).
 *
 * Any browser-side code that needs to act as the current user — including
 * Realtime `postgres_changes` subscriptions, whose RLS policies rely on
 * `auth.uid()` — must go through this singleton rather than constructing a
 * fresh client (e.g. via `createClient` from `@supabase/supabase-js`), since
 * only this cookie-backed client actually carries the logged-in user's
 * session/JWT.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  return getSupabase();
}

interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  stripeCustomerId: string | null;
}

interface SessionData {
  user: SessionUser;
}

function mapSupabaseUser(user: SupabaseUser): SessionUser {
  return {
    id: user.id,
    email: user.email ?? "",
    emailVerified: !!user.email_confirmed_at,
    name: String(user.user_metadata.name ?? user.user_metadata.full_name ?? ""),
    image: (user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null) as string | null,
    createdAt: new Date(user.created_at),
    updatedAt: new Date(user.updated_at ?? user.created_at),
    stripeCustomerId: (user.user_metadata.stripeCustomerId ?? null) as string | null,
  };
}

/**
 * React hook that subscribes to Supabase Auth state changes.
 * Drop-in replacement for `authClient.useSession()` from Better Auth.
 */
function useSession(): { data: SessionData | null; isPending: boolean } {
  const [data, setData] = useState<SessionData | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    // Get initial session
    void getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setData({ user: mapSupabaseUser(session.user) });
      } else {
        setData(null);
      }
      setIsPending(false);
    });

    // Subscribe to auth state changes
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setData({ user: mapSupabaseUser(session.user) });
        } else {
          setData(null);
        }
        setIsPending(false);
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { data, isPending };
}

/**
 * Client-side auth interface that replaces the Better Auth `authClient`.
 * Preserves the same method signatures used across `apps/web` components.
 */
export const authClient = {
  useSession,

  signUp: {
    email: async (
      body: { name: string; email: string; password: string },
      opts?: {
        onSuccess?: (ctx: unknown) => void;
        onError?: (ctx: { error: { message: string } }) => void;
      },
    ) => {
      const { data, error } = await getSupabase().auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: { name: body.name },
        },
      });

      if (error) {
        opts?.onError?.({ error: { message: error.message } });
        return;
      }

      opts?.onSuccess?.(data);
    },
  },

  signIn: {
    email: async (
      body: { email: string; password: string },
      opts?: {
        onSuccess?: (ctx: unknown) => void;
        onError?: (ctx: { error: { message: string } }) => void;
      },
    ) => {
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      if (error) {
        opts?.onError?.({ error: { message: error.message } });
        return;
      }

      opts?.onSuccess?.(data);
    },

    social: async (body: { provider: string; callbackURL?: string }) => {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin;
      const redirectTo = body.callbackURL
        ? `${baseUrl}${body.callbackURL}`
        : `${baseUrl}/auth/callback`;

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      const { error } = await getSupabase().auth.signInWithOAuth({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: body.provider as any,
        options: {
          redirectTo,
        },
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */

      if (error) {
        return { error: { message: error.message } };
      }

      return { error: null };
    },

    oauth2: (_body: { providerId: string; callbackURL?: string }) => {
      // genericOAuth (OIDC) removed per Requisito 8.6 — no-op stub
      return {
        error: {
          message:
            "Generic OIDC provider is not supported after Supabase Auth migration.",
        },
      };
    },
  },

  signOut: async () => {
    await getSupabase().auth.signOut();
  },

  // Password reset requests go through the `user.requestPasswordReset` tRPC
  // mutation (packages/api/src/routers/user.ts), which sends a
  // Resend-branded email via `sendPasswordResetEmail`
  // (packages/auth/src/magic-link.ts) instead of Supabase Auth's own
  // emailer. See apps/web/src/views/auth/forgot-password.

  /**
   * Sets a new password for the user in the current (recovery) session.
   */
  updatePassword: async (
    body: { newPassword: string },
    opts?: {
      onSuccess?: () => void;
      onError?: (ctx: { error: { message: string } }) => void;
    },
  ) => {
    const { error } = await getSupabase().auth.updateUser({
      password: body.newPassword,
    });

    if (error) {
      opts?.onError?.({ error: { message: error.message } });
      return;
    }

    opts?.onSuccess?.();
  },

  deleteUser: async () => {
    // User deletion is now handled via the tRPC user.deleteAccount mutation.
    // Components that call this should migrate to using the tRPC client directly.
    // This is a compatibility shim that calls the tRPC endpoint via fetch.
    const response = await fetch("/api/trpc/user.deleteAccount", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: {},
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { json?: { message?: string } };
      };
      throw new Error(
        errorData.error?.json?.message ?? "Failed to delete account",
      );
    }

    return (await response.json()) as unknown;
  },

  changePassword: async (body: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => {
    const { error } = await getSupabase().auth.updateUser({
      password: body.newPassword,
    });

    if (error) {
      return { error: { message: error.message } };
    }

    return { error: null };
  },

  /**
   * API Key management methods.
   * These delegate to the tRPC API endpoints that interact with the `apiKeys` table.
   */
  apiKey: {
    create: async (body: { name: string; prefix?: string }) => {
      const response = await fetch("/api/trpc/apiKey.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: body }),
      });
      const result = (await response.json()) as {
        result?: { data?: { json?: unknown } };
      };
      return { data: result.result?.data?.json ?? null };
    },

    list: async () => {
      const response = await fetch("/api/trpc/apiKey.list", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        result?: { data?: { json?: unknown } };
      };
      return { data: result.result?.data?.json ?? [] };
    },

    delete: async (body: { keyId: string }) => {
      const response = await fetch("/api/trpc/apiKey.revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: body }),
      });
      const result = (await response.json()) as {
        result?: { data?: { json?: unknown } };
      };
      return { data: result.result?.data?.json ?? null };
    },
  },

  /**
   * Returns the list of supported OAuth providers.
   * Providers without native Supabase Auth support (kick, dropbox, vk, reddit, roblox)
   * are excluded.
   */
  getSocialProviders: async () => {
    const response = await fetch("/api/auth/social-providers");
    if (!response.ok) {
      return [];
    }
    return response.json() as Promise<string[]>;
  },
};
