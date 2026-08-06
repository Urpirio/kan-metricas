import type { NextApiRequest, NextApiResponse } from "next";

import { getSupportedOAuthProviders } from "@kan/auth/server";

/**
 * Returns the list of OAuth providers supported by Supabase Auth,
 * based on environment variables that have non-empty client id/secret values.
 *
 * Providers without native Supabase Auth support (kick, dropbox, vk, reddit, roblox)
 * are excluded.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // List of all possible provider identifiers checked via env vars.
  // Providers without native Supabase Auth support have been excluded:
  // kick, dropbox, vk, reddit, roblox (per Requisito 8.6).
  // The generic OIDC provider (genericOAuth) has also been removed.
  const allProviders = [
    "google",
    "github",
    "discord",
    "gitlab",
    "microsoft",
    "twitter",
    "zoom",
    "linkedin",
    "spotify",
    "tiktok",
    "twitch",
    "apple",
  ];

  // Filter to providers with configured credentials
  const configuredProviders = allProviders.filter((provider) => {
    const id = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    const secret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    return id && id.length > 0 && secret && secret.length > 0;
  });

  // Exclude unsupported providers
  const supported = getSupportedOAuthProviders(configuredProviders);

  res.status(200).json(supported);
}
