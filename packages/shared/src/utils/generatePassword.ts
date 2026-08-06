import { randomInt } from "crypto";

/**
 * Character set deliberately excludes visually ambiguous characters
 * (0/O, 1/l/I) since the generated password is meant to be read and typed by
 * a human (shared by an admin with an invited member), not just pasted.
 */
const CHARSET =
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";

/**
 * Generates a cryptographically random password suitable for provisioning a
 * new user's account. Length 16 comfortably exceeds Supabase Auth's minimum
 * and gives enough entropy that it doesn't need to be memorised — it is
 * shown to the admin once and expected to be rotated or replaced by the
 * member on first login.
 */
export function generatePassword(length = 16): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += CHARSET[randomInt(CHARSET.length)];
  }
  return password;
}
