import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { env } from "next-runtime-env";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  HiInformationCircle,
  HiMiniCheck,
  HiOutlineDocumentDuplicate,
  HiXMark,
} from "react-icons/hi2";
import { z } from "zod";

import type { Subscription } from "@kan/shared/utils";
import { getSubscriptionByPlan } from "@kan/shared/utils";

import Button from "~/components/Button";
import Input from "~/components/Input";
import Toggle from "~/components/Toggle";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const CreateAccountSchema = z.object({
  name: z.string().min(1, { message: t`Name is required` }),
  email: z.string().email({ message: t`Invalid email address` }),
});

type CreateAccountFormValues = z.infer<typeof CreateAccountSchema>;

/**
 * Result of the most recently created account, shown once so the admin can
 * copy the credentials and share them with the new member. The same
 * credentials are also emailed to the new member directly (see
 * `NEW_ACCOUNT` in packages/api/src/routers/member.ts), but that send is
 * fire-and-forget, so this modal remains the reliable fallback — the
 * password is never retrievable again from the UI after this modal closes.
 */
interface CreatedAccount {
  email: string;
  password: string;
}

export function InviteMemberForm({
  subscriptions,
  unlimitedSeats,
  memberCount,
  seatLimit,
}: {
  subscriptions: Subscription[] | undefined;
  unlimitedSeats: boolean;
  memberCount: number;
  seatLimit: number | null;
}) {
  const utils = api.useUtils();
  const [isShareInviteLinkEnabled, setIsShareInviteLinkEnabled] =
    useState(false);
  const [inviteLink, setInviteLink] = useState<string>("");
  const [_isLoadingInviteLink, setIsLoadingInviteLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(
    null,
  );
  const [passwordCopied, setPasswordCopied] = useState(false);
  const { closeModal } = useModal();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAccountFormValues>({
    defaultValues: { name: "", email: "" },
    resolver: zodResolver(CreateAccountSchema),
  });

  const refetchBoards = () => utils.board.all.refetch();

  // Fetch active invite link on component mount
  const { data: activeInviteLink, refetch: _refetchInviteLink } =
    api.member.getActiveInviteLink.useQuery(
      { workspacePublicId: workspace.publicId || "" },
      { enabled: !!workspace.publicId },
    );

  // Set initial state based on active invite link
  useEffect(() => {
    if (activeInviteLink) {
      setIsShareInviteLinkEnabled(activeInviteLink.isActive);
      setInviteLink(activeInviteLink.inviteLink ?? "");
    }
  }, [activeInviteLink]);

  const createAccount = api.member.createAccount.useMutation({
    onSuccess: async (data) => {
      setCreatedAccount({ email: data.email, password: data.temporaryPassword });
      reset();
      await utils.workspace.byId.refetch();
      await refetchBoards();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        showPopup({
          header: t`Error creating account`,
          message: t`User is already a member of this workspace`,
          icon: "error",
        });
      } else if (
        error.data?.code === "FORBIDDEN" &&
        error.message === "SEAT_LIMIT_REACHED"
      ) {
        showPopup({
          header: t`Seat limit reached`,
          message: t`You've reached your ${seatLimit ?? 0}-seat limit. Please upgrade your plan to add more members.`,
          icon: "error",
        });
      } else {
        showPopup({
          header: t`Error creating account`,
          message: t`Please try again later, or contact customer support.`,
          icon: "error",
        });
      }
    },
  });

  const createInviteLink = api.member.createInviteLink.useMutation({
    onSuccess: (data) => {
      setInviteLink(data.inviteLink);
      setIsLoadingInviteLink(false);
    },
    onError: (error) => {
      setIsLoadingInviteLink(false);
      setIsShareInviteLinkEnabled(false);

      if (error.data?.code === "FORBIDDEN") {
        showPopup({
          header: t`Subscription Required`,
          message: t`Invite links require a Team or Pro subscription. Please upgrade your workspace.`,
          icon: "error",
        });
      } else {
        showPopup({
          header: t`Error creating invite link`,
          message: t`Please try again later.`,
          icon: "error",
        });
      }
    },
  });

  const deactivateInviteLink = api.member.deactivateInviteLink.useMutation({
    onSuccess: () => {
      setInviteLink("");
      setIsLoadingInviteLink(false);
    },
    onError: () => {
      setIsLoadingInviteLink(false);
      showPopup({
        header: t`Error deactivating invite link`,
        message: t`Please try again later.`,
        icon: "error",
      });
    },
  });

  const teamSubscription = getSubscriptionByPlan(subscriptions, "team");
  const proSubscription = getSubscriptionByPlan(subscriptions, "pro");

  const hasTeamSubscription = !!teamSubscription;
  const hasProSubscription = !!proSubscription;
  const isPartnerTier = !!(
    teamSubscription?.partnerTier ?? proSubscription?.partnerTier
  );

  let isYearly = false;
  let price = t`$10/month`;
  let billingType = t`monthly billing`;

  if (teamSubscription?.periodStart && teamSubscription.periodEnd) {
    const periodStartDate = new Date(teamSubscription.periodStart);
    const periodEndDate = new Date(teamSubscription.periodEnd);
    const diffInDays = Math.round(
      (periodEndDate.getTime() - periodStartDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    isYearly = diffInDays > 31;
    price = isYearly ? t`$8/month` : t`$10/month`;
    billingType = isYearly ? t`billed annually` : t`billed monthly`;
  }

  const onSubmit = (values: CreateAccountFormValues) => {
    createAccount.mutate({
      name: values.name,
      email: values.email,
      workspacePublicId: workspace.publicId || "",
    });
  };

  const isFreePlan =
    env("NEXT_PUBLIC_KAN_ENV") === "cloud" &&
    !hasTeamSubscription &&
    !hasProSubscription;

  const handleInviteLinkToggle = async () => {
    if (isFreePlan) return;

    setIsLoadingInviteLink(true);

    if (isShareInviteLinkEnabled && workspace.publicId) {
      await deactivateInviteLink.mutateAsync({
        workspacePublicId: workspace.publicId,
      });
      setIsShareInviteLinkEnabled(false);
    } else {
      await createInviteLink.mutateAsync({
        workspacePublicId: workspace.publicId,
      });
      setIsShareInviteLinkEnabled(true);
    }
  };

  const copyToClipboard = async (
    value: string,
    onCopied: (copied: boolean) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      onCopied(true);
      setTimeout(() => onCopied(false), 2000);
    } catch {
      showPopup({
        header: t`Error`,
        message: t`Failed to copy to clipboard`,
        icon: "error",
      });
    }
  };

  useEffect(() => {
    const nameElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#name");
    if (nameElement) nameElement.focus();
  }, []);

  // Once an account has been created, show the credentials instead of the
  // form. This is the only time the password is available, so the admin
  // must copy it here before closing the modal.
  if (createdAccount) {
    return (
      <div>
        <div className="px-5 pt-5">
          <div className="text-neutral-9000 flex w-full items-center justify-between pb-4 dark:text-dark-1000">
            <h2 className="text-sm font-bold">{t`Account created`}</h2>
            <button
              type="button"
              className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
              onClick={closeModal}
            >
              <HiXMark size={18} className="dark:text-dark-9000 text-light-900" />
            </button>
          </div>

          <p className="mb-4 text-sm text-light-900 dark:text-dark-900">
            <Trans>
              Share these credentials with {createdAccount.email} so they can
              sign in.
            </Trans>
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-light-900 dark:text-dark-900">
                {t`Email`}
              </label>
              <Input value={createdAccount.email} readOnly />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-light-900 dark:text-dark-900">
                {t`Temporary password`}
              </label>
              <div className="relative">
                <Input
                  value={createdAccount.password}
                  className="pr-10 font-mono text-sm"
                  readOnly
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-light-900 hover:text-light-950 dark:text-dark-900 dark:hover:text-dark-950"
                  onClick={() =>
                    copyToClipboard(createdAccount.password, setPasswordCopied)
                  }
                >
                  {passwordCopied ? (
                    <HiMiniCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <HiOutlineDocumentDuplicate className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-1">
              <HiInformationCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-dark-900" />
              <p className="text-xs text-gray-500 dark:text-dark-900">
                {t`This password won't be shown again. The member can change it after signing in.`}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end space-x-4 border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
          <Button type="button" onClick={() => setCreatedAccount(null)}>
            {t`Add another`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="text-neutral-9000 flex w-full items-center justify-between pb-4 dark:text-dark-1000">
          <h2 className="text-sm font-bold">{t`Add member`}</h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-300 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <HiXMark size={18} className="dark:text-dark-9000 text-light-900" />
          </button>
        </div>

        <div className="space-y-2">
          <Input
            id="name"
            placeholder={t`Full name`}
            disabled={isFreePlan}
            {...register("name", { required: true })}
            errorMessage={errors.name?.message}
          />
          <Input
            id="email"
            placeholder={t`Email`}
            disabled={isFreePlan}
            {...register("email", { required: true })}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                await handleSubmit(onSubmit)();
              }
            }}
            errorMessage={errors.email?.message}
          />
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-dark-900">
          {t`Creates an active account with a system-generated password and emails the credentials to the new member. You'll also get a copy here to share directly if needed.`}
        </p>

        {!isFreePlan && (
          <div className="my-4">
            <div className="relative">
              <Input
                value={inviteLink}
                className="pr-10 text-sm text-light-900 dark:text-dark-900"
                readOnly
                placeholder={
                  isShareInviteLinkEnabled ? undefined : t`No active link`
                }
              />
              {inviteLink && (
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-light-900 hover:text-light-950 dark:text-dark-900 dark:hover:text-dark-950"
                  onClick={() => copyToClipboard(inviteLink, setCopied)}
                >
                  {copied ? (
                    <HiMiniCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <HiOutlineDocumentDuplicate className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
            {isShareInviteLinkEnabled && inviteLink && (
              <div className="mt-2 flex items-start gap-1">
                <HiInformationCircle className="mt-0.5 h-4 w-4 text-dark-900" />
                <p className="text-xs text-gray-500 dark:text-dark-900">
                  {t`Anyone with this link can join your workspace`}
                </p>
              </div>
            )}
          </div>
        )}

        {env("NEXT_PUBLIC_KAN_ENV") === "cloud" &&
          (isPartnerTier && seatLimit !== null ? (
            <div className="mt-3 rounded-md bg-light-100 p-3 text-xs text-light-900 dark:bg-dark-200 dark:text-dark-900">
              <div className="flex items-center justify-between">
                <span className="font-medium text-emerald-500 dark:text-emerald-400">
                  {hasTeamSubscription ? t`Team Plan` : t`Pro Plan`}
                </span>
                <span className="text-light-900 dark:text-dark-900">
                  {memberCount} / {seatLimit} {t`seats`}
                </span>
              </div>
            </div>
          ) : !unlimitedSeats ? (
            <div className="mt-3 rounded-md bg-light-100 p-3 text-xs text-light-900 dark:bg-dark-200 dark:text-dark-900">
              {hasTeamSubscription || hasProSubscription ? (
                <div>
                  <span className="font-medium text-emerald-500 dark:text-emerald-400">
                    {hasTeamSubscription ? t`Team Plan` : t`Pro Plan ∞`}
                  </span>
                  <p className="mt-1">
                    {t`Adding a new member will cost an additional ${price} (${billingType}) per seat.`}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="font-medium text-light-950 dark:text-dark-950">
                    {t`Free Plan`}
                  </span>
                  <p className="mt-1">
                    {t`Adding members requires a Team or Pro plan. You'll be redirected to upgrade your workspace.`}
                  </p>
                </div>
              )}
            </div>
          ) : null)}
      </div>

      <div className="mt-8 flex items-center justify-end space-x-4 border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        {!isFreePlan && (
          <Toggle
            label={
              isShareInviteLinkEnabled
                ? t`Deactivate invite link`
                : t`Create invite link`
            }
            isChecked={isShareInviteLinkEnabled}
            onChange={handleInviteLinkToggle}
          />
        )}
        <div>
          {isFreePlan ? (
            <Button
              type="button"
              href={`/upgrade/select-plan?plan=pro&workspacePublicId=${workspace.publicId}&returnUrl=${encodeURIComponent("/members")}`}
            >
              {t`Choose plan`}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={createAccount.isPending}
              isLoading={createAccount.isPending}
            >
              {t`Create account`}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
