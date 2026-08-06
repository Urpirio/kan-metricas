import { z } from "zod";

// ─── member.invite ───────────────────────────────────────────
export const memberInviteResponseSchema = z.object({
  publicId: z.string(),
});

// ─── member.createAccount ──────────────────────────────────────
export const memberCreateAccountResponseSchema = z.object({
  publicId: z.string(),
  email: z.string(),
  // Returned once, at creation time, so the admin can share it with the
  // new member. Never persisted in plaintext and never returned again.
  temporaryPassword: z.string(),
});
