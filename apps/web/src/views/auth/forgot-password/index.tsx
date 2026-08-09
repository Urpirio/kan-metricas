import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import AuthLayout from "~/components/AuthLayout";
import Button from "~/components/Button";
import Input from "~/components/Input";
import { PageHead } from "~/components/PageHead";
import { api } from "~/utils/api";

const Schema = z.object({ email: z.string().email() });

type FormValues = z.infer<typeof Schema>;

export default function ForgotPasswordPage() {
  const [isSent, setIsSent] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) });

  // Sent via Resend (see packages/auth/src/magic-link.ts::sendPasswordResetEmail)
  // instead of Supabase Auth's own emailer.
  const requestPasswordReset = api.user.requestPasswordReset.useMutation({
    onSuccess: (_data, variables) => {
      setRecipient(variables.email);
      setIsSent(true);
    },
    onError: () => {
      setError(t`Please try again later, or contact customer support.`);
    },
  });

  const onSubmit = (values: FormValues) => {
    setError(null);
    requestPasswordReset.mutate({ email: values.email });
  };

  return (
    <>
      <PageHead title={t`Reset password | Metricas`} />
      <AuthLayout>
        {isSent ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-brand-800 dark:text-dark-1000">
              {t`Check your inbox`}
            </h1>
            <p className="mt-3 text-sm text-brand-500 dark:text-dark-900">
              <Trans>
                We've sent a password reset link to {recipient}. Open it to
                choose a new password.
              </Trans>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-brand-800 dark:text-dark-1000">
              {t`Reset your`}{" "}
              <span className="rounded-md bg-accent-500 px-2 py-0.5 text-white">
                {t`password`}
              </span>
            </h1>
            <p className="mt-3 text-sm text-brand-500 dark:text-dark-900">
              {t`Enter your email and we'll send you a reset link`}
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-8">
              <Input
                {...register("email", { required: true })}
                placeholder={t`Enter your email address`}
              />
              {errors.email && (
                <p className="mt-2 text-xs text-red-400">
                  {t`Please enter a valid email address`}
                </p>
              )}
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

              <div className="mt-6">
                <Button
                  isLoading={requestPasswordReset.isPending}
                  fullWidth
                  size="lg"
                  variant="accent"
                >
                  {t`Send reset link`}
                </Button>
              </div>
            </form>
          </>
        )}

        <p className="mt-8 text-sm text-brand-500 dark:text-dark-900">
          <Trans>
            Remembered it?{" "}
            <span className="font-medium text-accent-600 underline dark:text-accent-400">
              <Link href="/login">Back to sign in</Link>
            </span>
          </Trans>
        </p>
      </AuthLayout>
    </>
  );
}
