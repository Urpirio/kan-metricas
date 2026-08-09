import { render } from "@react-email/render";
import { Resend } from "resend";

import { createLogger } from "@kan/logger";

const log = createLogger("email");

import CardStatusChangedTemplate from "./templates/card-status-changed";
import JoinWorkspaceTemplate from "./templates/join-workspace";
import MagicLinkTemplate from "./templates/magic-link";
import MentionTemplate from "./templates/mention";
import NewAccountTemplate from "./templates/new-account";
import NewCommentTemplate from "./templates/new-comment";
import ResetPasswordTemplate from "./templates/reset-password";

type Templates =
  | "MAGIC_LINK"
  | "JOIN_WORKSPACE"
  | "RESET_PASSWORD"
  | "MENTION"
  | "NEW_ACCOUNT"
  | "NEW_COMMENT"
  | "CARD_STATUS_CHANGED";

const emailTemplates: Record<Templates, React.ComponentType<any>> = {
  MAGIC_LINK: MagicLinkTemplate,
  JOIN_WORKSPACE: JoinWorkspaceTemplate,
  RESET_PASSWORD: ResetPasswordTemplate,
  MENTION: MentionTemplate,
  NEW_ACCOUNT: NewAccountTemplate,
  NEW_COMMENT: NewCommentTemplate,
  CARD_STATUS_CHANGED: CardStatusChangedTemplate,
};

let _resend: Resend | null = null;

/**
 * Lazily resolves the Resend client so that importing this module doesn't
 * blow up at build/boot time for self-hosted deployments that run without
 * `RESEND_API_KEY` set (email sending simply isn't available in that case,
 * same as the previous SMTP transport when `SMTP_HOST` was unset).
 */
function getResendClient(): Resend {
  if (_resend) return _resend;

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Cannot send email: RESEND_API_KEY environment variable is not set.",
    );
  }

  _resend = new Resend(apiKey);
  return _resend;
}

export const sendEmail = async (
  to: string,
  subject: string,
  template: Templates,
  data: Record<string, string>,
) => {
  log.info({ to, subject, template }, "Sending email");
  try {
    const EmailTemplate = emailTemplates[template];

    const html = await render(<EmailTemplate {...data} />, { pretty: true });

    const from = process.env.EMAIL_FROM;

    if (!from) {
      throw new Error(
        "Cannot send email: EMAIL_FROM environment variable is not set.",
      );
    }

    const resend = getResendClient();

    const { data: response, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    log.info({ to, subject, template, messageId: response?.id }, "Email sent");
    return response;
  } catch (error) {
    log.error(
      { err: error, to, from: process.env.EMAIL_FROM, subject, template },
      "Email sending failed",
    );
    throw error;
  }
};
