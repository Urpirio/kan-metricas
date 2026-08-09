import { sendEmail } from "@kan/email";
import { createLogger } from "@kan/logger";
import { createSupabaseServerClient } from "@kan/shared/utils/supabase-server";

const log = createLogger("magic-link");

/**
 * Parses the query params from the auth callback URL to determine if this is
 * an invite callback. Returns the `memberPublicId` if `type=invite` and a
 * valid `memberPublicId` is present, otherwise `null`.
 */
export function parseInviteCallbackParams(query: {
  type?: string;
  memberPublicId?: string;
}): { memberPublicId: string } | null {
  if (query.type !== "invite") {
    return null;
  }

  if (!query.memberPublicId || query.memberPublicId.trim() === "") {
    return null;
  }

  return { memberPublicId: query.memberPublicId };
}

/**
 * Completes an invitation by looking up the member by publicId and accepting
 * the invite if it's still in "invited" status.
 *
 * This is a pure function (aside from the injected dependencies) that can be
 * tested without real database or auth sessions.
 *
 * Rejects when:
 * - `memberLookup` returns `null` → invite doesn't exist ("invite_not_found")
 * - The member's `status` is not `"invited"` → already completed ("invite_already_completed")
 */
export async function completeInvite(
  memberPublicId: string,
  userId: string,
  memberLookup: (
    publicId: string,
  ) => Promise<{ id: number; status: string } | null>,
  acceptInvite: (memberId: number, userId: string) => Promise<void>,
): Promise<
  | { success: true }
  | { success: false; reason: "invite_not_found" | "invite_already_completed" }
> {
  const member = await memberLookup(memberPublicId);

  if (!member) {
    return { success: false, reason: "invite_not_found" };
  }

  if (member.status !== "invited") {
    return { success: false, reason: "invite_already_completed" };
  }

  await acceptInvite(member.id, userId);

  return { success: true };
}

/**
 * Sends a magic link for passwordless login using Supabase Auth's OTP mechanism.
 *
 * @param email - The email to send the magic link to
 * @param baseUrl - The application base URL (e.g. from NEXT_PUBLIC_BASE_URL)
 */
export async function sendMagicLink(
  email: string,
  baseUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback`,
      },
    });

    if (error) {
      log.error({ err: error }, "Failed to send magic link");
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    log.error({ err }, "Unexpected error sending magic link");
    return { success: false, error: "Failed to send magic link" };
  }
}

/**
 * Sends a password reset email through Resend (via `@kan/email`) instead of
 * Supabase Auth's own built-in emailer, so the message uses the app's
 * branded `RESET_PASSWORD` template rather than Supabase's default one.
 *
 * Uses the Supabase Admin API (`generateLink`) to produce the same kind of
 * verify link Supabase would otherwise email itself — opening it still
 * completes the existing recovery flow (the browser's cookie-backed
 * Supabase client picks up the session from the redirect automatically), so
 * `apps/web/src/pages/reset-password` needs no changes.
 *
 * Always resolves `{ success: true }` even when no account exists for
 * `email` (logged, not surfaced), so this endpoint can't be used to enumerate
 * registered emails — same externally-observable behavior as
 * `supabase.auth.resetPasswordForEmail`, which also never reveals whether an
 * account exists.
 *
 * @param email - The email to send the password reset link to
 * @param baseUrl - The application base URL (e.g. from NEXT_PUBLIC_BASE_URL)
 */
export async function sendPasswordResetEmail(
  email: string,
  baseUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${baseUrl}/reset-password`,
      },
    });

    if (error) {
      // Supabase returns an error (e.g. "User not found") when no account
      // matches `email`. Swallow it here — the caller always reports
      // success so a bad actor can't use this to check which emails are
      // registered.
      log.warn(
        { err: error, email },
        "Could not generate password reset link (account may not exist)",
      );
      return { success: true };
    }

    await sendEmail(email, "Restablece tu contraseña de Metricas", "RESET_PASSWORD", {
      resetPasswordUrl: data.properties.action_link,
    });

    return { success: true };
  } catch (err) {
    log.error({ err, email }, "Unexpected error sending password reset email");
    // Same reasoning as above: don't leak failures tied to a specific email
    // to the caller, only log them.
    return { success: true };
  }
}

/**
 * Sends a magic link for a workspace invitation using Supabase Auth's OTP mechanism.
 * The redirect URL includes `type=invite` and the `memberPublicId` so the callback
 * can complete the invitation.
 *
 * @param email - The email to send the invitation magic link to
 * @param baseUrl - The application base URL (e.g. from NEXT_PUBLIC_BASE_URL)
 * @param memberPublicId - The publicId of the invited member record
 */
export async function sendInviteMagicLink(
  email: string,
  baseUrl: string,
  memberPublicId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback?type=invite&memberPublicId=${memberPublicId}`,
      },
    });

    if (error) {
      log.error({ err: error }, "Failed to send invite magic link");
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    log.error({ err }, "Unexpected error sending invite magic link");
    return { success: false, error: "Failed to send invite magic link" };
  }
}
