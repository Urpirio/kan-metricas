import type { NextApiRequest, NextApiResponse } from "next";

import { createLogger } from "@kan/logger";

const log = createLogger("auth-api");

/**
 * Catch-all auth route handler.
 *
 * After replacing Better Auth with Supabase Auth, most authentication flows
 * are handled client-side by `@supabase/supabase-js` (OAuth redirects, session
 * management) or server-side via `@kan/auth/server` functions (getSession,
 * signUpWithPassword, etc.).
 *
 * This route is preserved for backward compatibility with any client-side
 * code that may still hit /api/auth/* endpoints, but it no longer proxies to
 * a Better Auth handler.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  log.warn(
    { path: req.url, method: req.method },
    "Request to legacy /api/auth/* endpoint — Better Auth has been replaced by Supabase Auth",
  );

  res.status(404).json({
    error: "Auth endpoint not found. Authentication is now handled via Supabase Auth.",
  });
}
