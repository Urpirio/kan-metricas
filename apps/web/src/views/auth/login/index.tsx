import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { env } from "next-runtime-env";

import { authClient } from "@kan/auth/client";

import { Auth } from "~/components/AuthForm";
import AuthLayout from "~/components/AuthLayout";
import { PageHead } from "~/components/PageHead";

export default function LoginPage() {
  const router = useRouter();
  const isSignUpDisabled = env("NEXT_PUBLIC_DISABLE_SIGN_UP") === "true";

  const redirect = useSearchParams().get("next");

  const { data } = authClient.useSession();

  if (data?.user.id) router.push(redirect ?? "/boards");

  return (
    <>
      <PageHead title={t`Login | Metricas`} />
      <AuthLayout>
        <h1 className="text-3xl font-bold tracking-tight text-brand-800 dark:text-dark-1000">
          {t`Welcome`}{" "}
          <span className="rounded-md bg-accent-500 px-2 py-0.5 text-white">
            {t`back`}
          </span>
        </h1>
        <p className="mt-3 text-sm text-brand-500 dark:text-dark-900">
          {t`Enter your credentials to continue`}
        </p>

        <div className="mt-8">
          <Auth />
        </div>

        {(!isSignUpDisabled || redirect?.startsWith("/invite/")) && (
          <p className="mt-8 text-sm text-brand-500 dark:text-dark-900">
            <Trans>
              Don't have an account?{" "}
              <span className="font-medium text-accent-600 underline dark:text-accent-400">
                <Link href={redirect ? `/signup?next=${redirect}` : "/signup"}>
                  Sign up
                </Link>
              </span>
            </Trans>
          </p>
        )}
      </AuthLayout>
    </>
  );
}
