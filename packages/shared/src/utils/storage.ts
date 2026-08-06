import { env } from "next-runtime-env";

import { createLogger } from "@kan/logger";

import { createSupabaseServerClient } from "./supabase-server";

const log = createLogger("storage");

/**
 * Clamps the requested expiration time based on the operation type.
 * - "upload": min 1s, max 60s
 * - "download": min 1s, max 3600s
 */
export function clampExpiresIn(
  requested: number | undefined,
  operation: "upload" | "download",
): number {
  const max = operation === "upload" ? 60 : 3600;
  const value = requested ?? max;
  return Math.min(Math.max(value, 1), max);
}

/**
 * Validates an upload request against size and content type limits.
 */
export function validateUploadRequest(
  input: { size: number; contentType: string },
  limits: { maxSizeBytes: number; allowedContentTypes: string[] },
): { valid: true } | { valid: false; reason: string } {
  if (input.size > limits.maxSizeBytes) {
    return {
      valid: false,
      reason: `File size ${input.size} bytes exceeds maximum allowed size of ${limits.maxSizeBytes} bytes`,
    };
  }

  if (!limits.allowedContentTypes.includes(input.contentType)) {
    return {
      valid: false,
      reason: `Content type "${input.contentType}" is not allowed. Allowed types: ${limits.allowedContentTypes.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Generates a signed upload URL using Supabase Storage.
 * The expiresIn parameter is clamped to a maximum of 60 seconds.
 */
export async function generateUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn?: number,
): Promise<string> {
  // Clamp expiry for documentation/validation purposes
  // Supabase createSignedUploadUrl generates short-lived one-time use URLs
  clampExpiresIn(expiresIn, "upload");
  const supabase = createSupabaseServerClient();
  const result = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(key, {
      upsert: false,
    });

  if (result.error) {
    throw new Error(
      `Failed to generate upload URL for ${bucket}/${key}: ${result.error.message}`,
    );
  }

  return result.data.signedUrl;
}

/**
 * Generates a signed download URL using Supabase Storage.
 */
export async function generateDownloadUrl(
  bucket: string,
  key: string,
  expiresIn?: number,
): Promise<string> {
  const clamped = clampExpiresIn(expiresIn, "download");
  const supabase = createSupabaseServerClient();
  const result = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, clamped);

  if (result.error) {
    throw new Error(
      `Failed to generate download URL for ${bucket}/${key}: ${result.error.message}`,
    );
  }

  return result.data.signedUrl;
}

/**
 * Deletes an object from Supabase Storage.
 */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.storage.from(bucket).remove([key]);

  if (error) {
    throw new Error(
      `Failed to delete object ${bucket}/${key}: ${error.message}`,
    );
  }
}

/**
 * Generate signed URL for an avatar image.
 * Returns the URL as-is if it's already a full URL (external provider).
 * Returns signed URL if it's a Supabase Storage key.
 * Returns null if image key is missing, bucket is not configured, or URL generation fails.
 */
export async function generateAvatarUrl(
  imageKey: string | null | undefined,
  expiresIn?: number,
): Promise<string | null> {
  if (!imageKey) {
    return null;
  }

  if (imageKey.startsWith("http://") || imageKey.startsWith("https://")) {
    return imageKey;
  }

  const bucket = env("NEXT_PUBLIC_AVATAR_BUCKET_NAME");
  if (!bucket) {
    return null;
  }

  try {
    return await generateDownloadUrl(bucket, imageKey, expiresIn);
  } catch {
    return null;
  }
}

/**
 * Generate signed URL for an attachment.
 * Returns null if attachment key is missing, bucket is not configured, or URL generation fails.
 */
export async function generateAttachmentUrl(
  attachmentKey: string | null | undefined,
  expiresIn?: number,
): Promise<string | null> {
  if (!attachmentKey) {
    return null;
  }

  const bucket = env("NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME");
  if (!bucket) {
    return null;
  }

  try {
    return await generateDownloadUrl(bucket, attachmentKey, expiresIn);
  } catch {
    return null;
  }
}

/**
 * Checks connectivity with Supabase Storage by verifying both buckets exist.
 * Returns "ok", "error", or "not_configured".
 */
export async function checkSupabaseStorageConnection(): Promise<
  "ok" | "error" | "not_configured"
> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return "not_configured";
  }

  try {
    const supabase = createSupabaseServerClient();
    const avatarBucketName = env("NEXT_PUBLIC_AVATAR_BUCKET_NAME");
    const attachmentsBucketName = env("NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME");

    if (!avatarBucketName || !attachmentsBucketName) {
      return "not_configured";
    }

    const { error: avatarError } =
      await supabase.storage.getBucket(avatarBucketName);
    if (avatarError) {
      log.error(
        { err: avatarError },
        `Failed to verify avatar bucket: ${avatarBucketName}`,
      );
      return "error";
    }

    const { error: attachmentsError } =
      await supabase.storage.getBucket(attachmentsBucketName);
    if (attachmentsError) {
      log.error(
        { err: attachmentsError },
        `Failed to verify attachments bucket: ${attachmentsBucketName}`,
      );
      return "error";
    }

    return "ok";
  } catch (error) {
    log.error({ err: error }, "Failed to check Supabase Storage connection");
    return "error";
  }
}
