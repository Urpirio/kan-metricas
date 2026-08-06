/**
 * Providers without native support in Supabase Auth.
 * These are excluded from the OAuth providers list per Requisito 8.6.
 */
const UNSUPPORTED_PROVIDERS = new Set([
  "kick",
  "dropbox",
  "vk",
  "reddit",
  "roblox",
]);

/**
 * Pure function that filters a list of configured OAuth provider identifiers,
 * excluding those without native support in Supabase Auth.
 *
 * ## OAuth Provider Configuration (Supabase Auth)
 *
 * The configuration of client id/secret per supported OAuth provider is done
 * exclusively in the **Supabase dashboard** (Authentication → Providers), NOT
 * via environment variables in this application. The previous Better Auth
 * approach of setting `<PROVIDER>_CLIENT_ID` / `<PROVIDER>_CLIENT_SECRET` in
 * `.env` is no longer used for the OAuth handshake itself — Supabase Auth
 * handles the full OAuth flow server-side.
 *
 * The environment variables `<PROVIDER>_CLIENT_ID` / `<PROVIDER>_CLIENT_SECRET`
 * are still read by `apps/web/src/pages/api/auth/social-providers.ts` solely to
 * determine which provider buttons to show in the login/signup UI (i.e., which
 * providers the operator has configured). The actual OAuth credentials used for
 * the authentication flow live in the Supabase project settings.
 *
 * @param configuredEnvProviders - Array of provider identifiers that have
 *   client id/secret configured (non-empty) in the environment. Used only to
 *   determine which buttons to display in the UI.
 * @returns Filtered array excluding kick, dropbox, vk, reddit, roblox.
 */
export function getSupportedOAuthProviders(
  configuredEnvProviders: string[],
): string[] {
  return configuredEnvProviders.filter(
    (provider) => !UNSUPPORTED_PROVIDERS.has(provider.toLowerCase()),
  );
}
