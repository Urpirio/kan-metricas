import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "next-runtime-env";
import { t } from "@lingui/core/macro";

/**
 * Auth callback page for Supabase Auth redirects (magic link / OTP and OAuth).
 *
 * Supabase can return the session in two shapes depending on the flow:
 * - PKCE flow: a `?code=` query param that must be exchanged for a session.
 * - Implicit / hash flow: tokens in the URL fragment, which `createBrowserClient`
 *   picks up automatically via `detectSessionInUrl`.
 *
 * Once a session exists, the user is redirected to the boards page. Invite
 * callbacks (`type=invite`) are acknowledged here so the redirect keeps the
 * invite context; the membership itself is accepted server-side on the next
 * authenticated request.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `router.isReady` guarantees query params are populated.
    if (!router.isReady) return;

    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (!url || !anonKey) {
      setError(t`Authentication is not configured correctly.`);
      return;
    }

    const supabase = createBrowserClient(url, anonKey);

    const completeSignIn = async () => {
      const code = typeof router.query.code === "string" ? router.query.code : null;

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(t`We couldn't complete your sign in. Please request a new link.`);
        return;
      }

      await router.replace("/boards");
    };

    void completeSignIn();
  }, [router, router.isReady]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div
          role="alert"
          className="max-w-md text-center text-sm text-neutral-900 dark:text-dark-1000"
        >
          <p className="mb-4">{error}</p>
          <button
            type="button"
            onClick={() => void router.replace("/login")}
            className="rounded-md bg-light-1000 px-4 py-2 text-sm text-light-50 dark:bg-dark-1000 dark:text-dark-50"
          >
            {t`Back to login`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p
        aria-live="polite"
        className="text-sm text-neutral-900 dark:text-dark-1000"
      >
        {t`Signing you in...`}
      </p>
    </div>
  );
}
