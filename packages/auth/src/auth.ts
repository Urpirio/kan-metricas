import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

import type { dbClient } from "@kan/db/client";
import { createLogger } from "@kan/logger";
import { createSupabaseServerClient } from "@kan/shared/utils/supabase-server";

const log = createLogger("auth");

/**
 * Sign up a new user with email and password using Supabase Auth.
 */
export async function signUpWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    log.error({ err: error }, "Supabase Auth signUp failed");
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * Sign in an existing user with email and password using Supabase Auth.
 */
export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    log.error({ err: error }, "Supabase Auth signInWithPassword failed");
    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * Sign out the current user using Supabase Auth.
 */
export async function signOut() {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    log.error({ err: error }, "Supabase Auth signOut failed");
    return { error };
  }

  return { error: null };
}

/**
 * Retrieves the current session from the request cookies using `@supabase/ssr`
 * in the Pages Router pattern.
 *
 * This reads and refreshes auth tokens from cookies attached to the incoming
 * request, making it suitable for use in `getServerSideProps`, API routes, and
 * the tRPC context.
 */
export async function getSession(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    log.error(
      { missing: [!url && "NEXT_PUBLIC_SUPABASE_URL", !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean) },
      "Cannot create Supabase SSR client: missing environment variables",
    );
    return null;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? "");
      },
      setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.appendHeader(
            "Set-Cookie",
            serializeCookieHeader(name, value, options),
          );
        });
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    log.warn({ err: error }, "Failed to get user from session");
    return null;
  }

  if (!user) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      emailVerified: !!user.email_confirmed_at,
      name: String(user.user_metadata.name ?? user.user_metadata.full_name ?? ""),
      image: (user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null) as string | null,
      createdAt: new Date(user.created_at),
      updatedAt: new Date(user.updated_at ?? user.created_at),
      stripeCustomerId: (user.user_metadata.stripeCustomerId ?? null) as string | null,
    },
  };
}

/**
 * Two-phase user deletion: executes DB deletions inside a Drizzle transaction,
 * then calls `supabase.auth.admin.deleteUser(userId)` as the last step within
 * the transaction callback. If the Supabase call fails, the error is rethrown,
 * causing the transaction to ROLLBACK.
 *
 * This ensures the final state is always either "both deleted" or "neither deleted".
 */
export async function deleteUser(
  db: dbClient,
  userId: string,
  performDbDeletions: (tx: unknown) => Promise<void>,
) {
  const supabase = createSupabaseServerClient();

  await db.transaction(async (tx) => {
    // Step 1: Execute all DB deletions/anonymizations
    await performDbDeletions(tx);

    // Step 2: Delete user from Supabase Auth (last step inside transaction)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      // Rethrow to trigger ROLLBACK of the DB transaction
      throw new Error(
        `Failed to delete user from Supabase Auth: ${error.message}`,
      );
    }
  });
}

/**
 * Set or update a user's password using Supabase Auth admin API.
 */
export async function setUserPassword(userId: string, newPassword: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    log.error({ err: error }, "Failed to set user password via Supabase Auth");
    throw error;
  }
}
