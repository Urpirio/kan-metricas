import { env } from "next-runtime-env";

import type { dbClient } from "@kan/db/client";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import { createLogger } from "@kan/logger";
import { createSupabaseServerClient } from "@kan/shared/utils/supabase-server";

import { downloadImage } from "./utils";

const log = createLogger("auth");

/**
 * Pure function that determines whether a sign-up attempt should be allowed,
 * based on the current configuration and the user's invitation status.
 *
 * This function is invoked BEFORE calling `supabase.auth.signUp` in the
 * registration procedure. If it returns `false`, the sign-up is rejected
 * without invoking Supabase Auth (Requirements 8.7, 8.13).
 *
 * Rules:
 * - If `disableSignUp` is `true` and `hasPendingInvitation` is `false`, reject.
 * - If `allowedDomains` is non-empty, the email's domain must be in the list.
 * - Otherwise, allow.
 */
export function isSignUpAllowed(input: {
  email: string;
  disableSignUp: boolean;
  hasPendingInvitation: boolean;
  allowedDomains: string[]; // empty array = no restriction
}): boolean {
  const { email, disableSignUp, hasPendingInvitation, allowedDomains } = input;

  // If sign-up is disabled and there's no pending invitation, reject
  if (disableSignUp && !hasPendingInvitation) {
    return false;
  }

  // If allowed domains are configured, enforce domain restriction
  if (allowedDomains.length > 0) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || !allowedDomains.includes(domain)) {
      return false;
    }
  }

  return true;
}

/**
 * Post-signup hook: uploads user avatar to Supabase Storage if the user's
 * image is an external URL (from OAuth provider), replacing the old s3.ts
 * pattern with storage.ts (task 12).
 */
export async function handlePostSignupAvatar(
  db: dbClient,
  user: {
    id: string;
    image?: string | null;
    name?: string;
    email: string;
    emailVerified?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    stripeCustomerId?: string | null;
  },
) {
  let avatarKey = user.image;
  const storageDomain = process.env.NEXT_PUBLIC_STORAGE_DOMAIN;

  if (user.image && storageDomain && !user.image.includes(storageDomain)) {
    try {
      const supabase = createSupabaseServerClient();

      const allowedFileExtensions = ["jpg", "jpeg", "png", "webp"];

      const fileExtension =
        user.image.split(".").pop()?.split("?")[0] ?? "jpg";
      const key = `${user.id}/avatar.${!allowedFileExtensions.includes(fileExtension) ? "jpg" : fileExtension}`;

      const imageBuffer = await downloadImage(user.image);

      const contentType = `image/${!allowedFileExtensions.includes(fileExtension) ? "jpeg" : fileExtension}`;

      const { error } = await supabase.storage
        .from(env("NEXT_PUBLIC_AVATAR_BUCKET_NAME") ?? "")
        .upload(key, imageBuffer, { contentType });

      if (error) {
        throw error;
      }

      avatarKey = key;

      await userRepo.update(db, user.id, {
        image: key,
      });
    } catch (error) {
      log.error({ err: error }, "Error uploading avatar to storage");
    }
  }

  return avatarKey;
}

/**
 * Checks whether a sign-up should be allowed based on the current environment
 * configuration, querying the database for pending invitations.
 *
 * This is the async version that reads env vars and queries the DB,
 * suitable for use in tRPC procedures/handlers.
 */
export async function checkSignUpAllowed(
  db: dbClient,
  email: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const disableSignUp =
    env("NEXT_PUBLIC_DISABLE_SIGN_UP")?.toLowerCase() === "true";

  let hasPendingInvitation = false;
  if (disableSignUp) {
    const pendingInvitation = await memberRepo.getByEmailAndStatus(
      db,
      email,
      "invited",
    );
    hasPendingInvitation = !!pendingInvitation;
  }

  const allowedDomainsStr = process.env.BETTER_AUTH_ALLOWED_DOMAINS;
  const allowedDomains = allowedDomainsStr
    ? allowedDomainsStr
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const allowed = isSignUpAllowed({
    email,
    disableSignUp,
    hasPendingInvitation,
    allowedDomains,
  });

  if (!allowed) {
    if (disableSignUp && !hasPendingInvitation) {
      return {
        allowed: false,
        reason: "Sign-up is disabled and no pending invitation was found for this email.",
      };
    }
    if (allowedDomains.length > 0) {
      return {
        allowed: false,
        reason: "The email domain is not in the list of allowed domains.",
      };
    }
    return { allowed: false, reason: "Sign-up is not allowed." };
  }

  return { allowed: true };
}
