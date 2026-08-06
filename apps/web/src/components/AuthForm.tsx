import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  FaApple,
  FaDiscord,
  FaFacebook,
  FaGithub,
  FaGitlab,
  FaGoogle,
  FaLinkedin,
  FaMicrosoft,
  FaSpotify,
  FaTiktok,
  FaTwitch,
  FaTwitter,
} from "react-icons/fa";
import { SiZoom } from "react-icons/si";
import { z } from "zod";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { usePopup } from "~/providers/popup";

/**
 * OAuth provider identifiers supported by Supabase Auth.
 * Providers without native Supabase Auth support (kick, dropbox, vk, reddit, roblox)
 * have been removed per Requisito 8.6.
 */
type AuthProvider = string;

interface FormValues {
  name?: string;
  email: string;
  password: string;
}

interface AuthProps {
  isSignUp?: boolean;
  callbackURL?: string;
}

const EmailSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * OAuth providers with native Supabase Auth support.
 *
 * Providers excluded per Requisito 8.6 (no native Supabase Auth support):
 *   kick, dropbox, vk, reddit, roblox
 *
 * The generic OIDC provider has also been removed (genericOAuth plugin eliminated).
 *
 * The list of providers shown in the UI is determined at runtime by the
 * `/api/auth/social-providers` endpoint, which uses `getSupportedOAuthProviders`
 * from `@kan/auth/server` to filter out unsupported providers.
 */
const availableSocialProviders = {
  google: {
    id: "google",
    name: "Google",
    icon: FaGoogle,
  },
  github: {
    id: "github",
    name: "GitHub",
    icon: FaGithub,
  },
  discord: {
    id: "discord",
    name: "Discord",
    icon: FaDiscord,
  },
  apple: {
    id: "apple",
    name: "Apple",
    icon: FaApple,
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft",
    icon: FaMicrosoft,
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    icon: FaFacebook,
  },
  spotify: {
    id: "spotify",
    name: "Spotify",
    icon: FaSpotify,
  },
  twitch: {
    id: "twitch",
    name: "Twitch",
    icon: FaTwitch,
  },
  twitter: {
    id: "twitter",
    name: "Twitter",
    icon: FaTwitter,
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    icon: FaLinkedin,
  },
  gitlab: {
    id: "gitlab",
    name: "GitLab",
    icon: FaGitlab,
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    icon: FaTiktok,
  },
  zoom: {
    id: "zoom",
    name: "Zoom",
    icon: SiZoom,
  },
};

export function Auth({ isSignUp, callbackURL: callbackURLProp }: AuthProps) {
  const [isLoginWithProviderPending, setIsLoginWithProviderPending] =
    useState<null | AuthProvider>(null);
  const [isLoginWithEmailPending, setIsLoginWithEmailPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { showPopup } = usePopup();

  const redirect = useSearchParams().get("next");
  const callbackURL = callbackURLProp ?? redirect ?? "/boards";

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(EmailSchema),
  });

  const { data: socialProviders } = useQuery({
    queryKey: ["social_providers"],
    queryFn: () => authClient.getSocialProviders(),
  });

  const handleLoginWithEmail = async (
    email: string,
    password: string,
    name?: string,
  ) => {
    setIsLoginWithEmailPending(true);
    setLoginError(null);

    if (isSignUp) {
      await authClient.signUp.email(
        {
          name: name ?? "",
          email,
          password,
        },
        {
          onSuccess: () =>
            showPopup({
              header: t`Success`,
              message: t`You have been signed up successfully.`,
              icon: "success",
            }),
          onError: ({ error }) => setLoginError(error.message),
        },
      );
    } else {
      await authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onSuccess: () =>
            showPopup({
              header: t`Success`,
              message: t`You have been logged in successfully.`,
              icon: "success",
            }),
          onError: ({ error }) => setLoginError(error.message),
        },
      );
    }

    setIsLoginWithEmailPending(false);
  };

  const handleLoginWithProvider = async (provider: AuthProvider) => {
    setIsLoginWithProviderPending(provider);
    setLoginError(null);

    const result = await authClient.signIn.social({
      provider,
      callbackURL,
    });

    setIsLoginWithProviderPending(null);

    if (result.error) {
      setLoginError(
        t`Failed to login with ${provider.at(0)?.toUpperCase() + provider.slice(1)}. Please try again.`,
      );
    }
  };

  const onSubmit = async (values: FormValues) => {
    await handleLoginWithEmail(values.email, values.password, values.name);
  };

  return (
    <div className="space-y-6">
      {socialProviders?.length !== 0 && (
        <div className="space-y-2">
          {Object.entries(availableSocialProviders).map(([key, provider]) => {
            if (!socialProviders?.includes(key)) {
              return null;
            }
            return (
              <Button
                key={key}
                onClick={() => handleLoginWithProvider(key as AuthProvider)}
                isLoading={isLoginWithProviderPending === key}
                iconLeft={<provider.icon />}
                fullWidth
                size="lg"
              >
                <Trans>
                  Continue with {provider.name}
                </Trans>
              </Button>
            );
          })}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)}>
        {socialProviders?.length !== 0 && (
          <div className="mb-[1.5rem] flex w-full items-center gap-4">
            <div className="h-[1px] w-full bg-light-600 dark:bg-dark-600" />
            <span className="text-sm text-light-900 dark:text-dark-900">
              {t`or`}
            </span>
            <div className="h-[1px] w-full bg-light-600 dark:bg-dark-600" />
          </div>
        )}
        <div className="space-y-2">
          {isSignUp && (
            <div>
              <Input
                {...register("name", { required: true })}
                placeholder={t`Enter your name`}
              />
              {errors.name && (
                <p className="mt-2 text-xs text-red-400">
                  {t`Please enter a valid name`}
                </p>
              )}
            </div>
          )}
          <div>
            <Input
              {...register("email", { required: true })}
              placeholder={t`Enter your email address`}
            />
            {errors.email && (
              <p className="mt-2 text-xs text-red-400">
                {t`Please enter a valid email address`}
              </p>
            )}
          </div>

          <div>
            <Input
              type="password"
              {...register("password", { required: true })}
              placeholder={t`Enter your password`}
            />
            {errors.password && (
              <p className="mt-2 text-xs text-red-400">
                {errors.password.message ?? t`Please enter a valid password`}
              </p>
            )}
          </div>
          {loginError && (
            <p className="mt-2 text-xs text-red-400">{loginError}</p>
          )}
        </div>

        {!isSignUp && (
          <div className="mt-3 flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-brand-500 underline hover:text-accent-600 dark:text-dark-900"
            >
              {t`Forgot your password?`}
            </Link>
          </div>
        )}

        <div className="mt-[1.5rem] flex items-center gap-4">
          <Button
            isLoading={isLoginWithEmailPending}
            fullWidth
            size="lg"
            variant="accent"
          >
            {isSignUp ? t`Sign up` : t`Sign in`}
          </Button>
        </div>
      </form>
    </div>
  );
}
