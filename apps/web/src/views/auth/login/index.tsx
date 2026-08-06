import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@lingui/core/macro";

import { authClient } from "@kan/auth/client";

import { Auth } from "~/components/AuthForm";
import AuthLayout from "~/components/AuthLayout";
import { PageHead } from "~/components/PageHead";

export default function LoginPage() {
  const router = useRouter();

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
      </AuthLayout>
    </>
  );
}
