import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@kan/auth/client";

import AuthLayout from "~/components/AuthLayout";
import Button from "~/components/Button";
import Input from "~/components/Input";
import { PageHead } from "~/components/PageHead";
import { usePopup } from "~/providers/popup";

const Schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof Schema>;

/**
 * Completes the password recovery flow.
 *
 * Supabase establishes a short-lived recovery session when the emailed link is
 * opened, so this page only needs to submit the new password. If that session
 * is missing or expired, `updatePassword` fails and the error is surfaced.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { showPopup } = usePopup();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) });

  const onSubmit = async (values: FormValues) => {
    setIsPending(true);
    setError(null);

    await authClient.updatePassword(
      { newPassword: values.password },
      {
        onSuccess: () => {
          showPopup({
            header: t`Password updated`,
            message: t`You can now sign in with your new password.`,
            icon: "success",
          });
          router.push("/boards");
        },
        onError: ({ error }) => setError(error.message),
      },
    );

    setIsPending(false);
  };

  return (
    <>
      <PageHead title={t`New password | Metricas`} />
      <AuthLayout>
        <h1 className="text-3xl font-bold tracking-tight text-brand-800 dark:text-dark-1000">
          {t`Choose a new`}{" "}
          <span className="rounded-md bg-accent-500 px-2 py-0.5 text-white">
            {t`password`}
          </span>
        </h1>
        <p className="mt-3 text-sm text-brand-500 dark:text-dark-900">
          {t`Must be at least 8 characters`}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-2">
          <div>
            <Input
              type="password"
              {...register("password", { required: true })}
              placeholder={t`Enter your new password`}
            />
            {errors.password && (
              <p className="mt-2 text-xs text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <Input
              type="password"
              {...register("confirmPassword", { required: true })}
              placeholder={t`Confirm your new password`}
            />
            {errors.confirmPassword && (
              <p className="mt-2 text-xs text-red-400">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <div className="pt-4">
            <Button isLoading={isPending} fullWidth size="lg" variant="accent">
              {t`Update password`}
            </Button>
          </div>
        </form>

        <p className="mt-8 text-sm text-brand-500 dark:text-dark-900">
          <Trans>
            <span className="font-medium text-accent-600 underline dark:text-accent-400">
              <Link href="/login">Back to sign in</Link>
            </span>
          </Trans>
        </p>
      </AuthLayout>
    </>
  );
}
