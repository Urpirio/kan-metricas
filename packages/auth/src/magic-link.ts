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
