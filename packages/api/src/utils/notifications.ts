import { env } from "next-runtime-env";

import type { dbClient } from "@kan/db/client";
import { createLogger } from "@kan/logger";

const log = createLogger("notifications");
import * as cardRepo from "@kan/db/repository/card.repo";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as notificationRepo from "@kan/db/repository/notification.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { sendEmail } from "@kan/email";
import { parseMentionsFromHTML } from "@kan/shared/utils";

/**
 * Sends mention notification emails to mentioned members
 * Only sends emails for new mentions (checks notification table to avoid duplicates)
 */
export async function sendMentionEmails({
  db,
  cardPublicId,
  commentHtml,
  commenterUserId,
  commentId,
}: {
  db: dbClient;
  cardPublicId: string;
  commentHtml: string;
  commenterUserId: string;
  commentId?: number;
}) {
  try {
    // Parse mentions from HTML
    const mentionPublicIds = parseMentionsFromHTML(commentHtml);
    if (mentionPublicIds.length === 0) return;

    // Get card with board information
    const card = await cardRepo.getWithListAndMembersByPublicId(db, cardPublicId);
    if (!card?.list.board) return;

    const board = card.list.board;
    const boardName = board.name;
    const cardTitle = card.title;
    const cardId = card.id;

    // Get workspace ID from workspace publicId
    const workspace = await workspaceRepo.getByPublicId(
      db,
      board.workspace.publicId,
    );
    if (!workspace?.id) return;

    const workspaceId = workspace.id;

    // Get commenter information
    const commenter = await userRepo.getById(db, commenterUserId);
    if (!commenter) return;

    const commenterName = commenter.name?.trim() || commenter.email;

    // Get mentioned members with full details (filtered by workspace)
    const membersWithDetails = await memberRepo.getByPublicIdsWithUsers(
      db,
      mentionPublicIds,
      workspaceId,
    );

    // Filter out the commenter
    const membersToNotify = membersWithDetails.filter(
      (member) => member.user?.id !== commenterUserId,
    );

    if (membersToNotify.length === 0) return;

    const baseUrl = env("NEXT_PUBLIC_BASE_URL");
    const cardUrl = `${baseUrl}/cards/${cardPublicId}`;

    log.info({ cardPublicId, mentionCount: membersToNotify.length, commenterUserId }, "Sending mention emails");
    // Send emails to all mentioned members (only if notification doesn't exist)
    await Promise.all(
      membersToNotify.map(async (member) => {
        const userId = member.user?.id;
        const email = member.user?.email ?? member.email;

        // Skip pending members (no userId) - they can be mentioned but won't receive emails
        if (!userId || !email) return;

        try {
          // Check if notification already exists for this mention
          const notificationExists = await notificationRepo.exists(db, {
            userId,
            cardId,
            type: "mention",
          });

          // If notification already exists, skip sending email
          if (notificationExists) {
            log.debug({ email, cardPublicId }, "Skipping duplicate mention email");
            return;
          }

          // Create notification record
          await notificationRepo.create(db, {
            type: "mention",
            userId,
            cardId,
            commentId,
          });

          // Send email
          await sendEmail(
            email,
            `${commenterName} te mencionó en un comentario en ${cardTitle}`,
            "MENTION",
            {
              commenterName,
              boardName,
              cardTitle,
              cardUrl,
            },
          );
          log.info({ email, cardPublicId }, "Mention email sent");
        } catch (error) {
          log.error({ err: error, email, cardPublicId }, "Failed to send mention email");
        }
      }),
    );
  } catch (error) {
    log.error({ err: error, cardPublicId }, "Error sending mention emails");
  }
}

function stripHtml(html: string, maxLength = 200): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/**
 * Sends "new comment" notification emails to the card's assigned members
 * (excluding the commenter), regardless of whether the comment contains an
 * `@mention` — this is separate from, and runs alongside, `sendMentionEmails`.
 *
 * Only intended for newly-created comments (call from `card.addComment`),
 * not comment edits — editing doesn't create a new `commentId`, so reusing
 * this for edits would either skip (if de-duped against the original
 * comment's notification) or re-notify on every edit.
 */
export async function sendNewCommentEmails({
  db,
  cardPublicId,
  commentHtml,
  commenterUserId,
  commentId,
}: {
  db: dbClient;
  cardPublicId: string;
  commentHtml: string;
  commenterUserId: string;
  commentId: number;
}) {
  try {
    const card = await cardRepo.getWithListAndMembersByPublicId(
      db,
      cardPublicId,
    );
    if (!card?.list.board) return;

    const board = card.list.board;
    const boardName = board.name;
    const cardTitle = card.title;
    const cardId = card.id;

    const commenter = await userRepo.getById(db, commenterUserId);
    if (!commenter) return;

    const commenterName = commenter.name?.trim() || commenter.email;

    // Notify assigned members only (not the whole workspace), excluding
    // whoever just commented.
    const membersToNotify = card.members.filter(
      (member) => member.user && member.user.id !== commenterUserId,
    );

    if (membersToNotify.length === 0) return;

    const baseUrl = env("NEXT_PUBLIC_BASE_URL");
    const cardUrl = `${baseUrl}/cards/${cardPublicId}`;
    const commentExcerpt = stripHtml(commentHtml);

    await Promise.all(
      membersToNotify.map(async (member) => {
        const userId = member.user?.id;
        const email = member.email;

        if (!userId || !email) return;

        try {
          const notificationExists = await notificationRepo.exists(db, {
            userId,
            cardId,
            type: "comment",
            commentId,
          });

          if (notificationExists) return;

          await notificationRepo.create(db, {
            type: "comment",
            userId,
            cardId,
            commentId,
          });

          await sendEmail(
            email,
            `${commenterName} comentó en ${cardTitle}`,
            "NEW_COMMENT",
            {
              commenterName,
              boardName,
              cardTitle,
              commentExcerpt,
              cardUrl,
            },
          );
          log.info({ email, cardPublicId }, "New comment email sent");
        } catch (error) {
          log.error(
            { err: error, email, cardPublicId },
            "Failed to send new comment email",
          );
        }
      }),
    );
  } catch (error) {
    log.error({ err: error, cardPublicId }, "Error sending new comment emails");
  }
}

/**
 * Sends "card moved to a different list" notification emails to the card's
 * assigned members (excluding whoever moved it).
 *
 * NOTE on dedup: like `sendMentionEmails`, this dedupes via
 * `notificationRepo.exists({ userId, cardId, type })`, which keys only on
 * (user, card, type) — not on which lists were involved. So each member is
 * emailed at most ONCE per card for status changes, total, not once per
 * move. `metadata` still records the last from->to pair for debugging/audit,
 * but isn't part of the dedup key. If per-move emails are wanted later,
 * `notificationRepo.exists`/`create` need a way to key on the move itself
 * (e.g. a synthetic id or the activity row), same caveat as comments before
 * `commentId` was wired into the dedup key.
 */
export async function sendCardStatusChangedEmails({
  db,
  cardPublicId,
  actorUserId,
  fromListName,
  toListName,
}: {
  db: dbClient;
  cardPublicId: string;
  actorUserId: string;
  fromListName: string;
  toListName: string;
}) {
  try {
    const card = await cardRepo.getWithListAndMembersByPublicId(
      db,
      cardPublicId,
    );
    if (!card?.list.board) return;

    const board = card.list.board;
    const boardName = board.name;
    const cardTitle = card.title;
    const cardId = card.id;

    const actor = await userRepo.getById(db, actorUserId);
    if (!actor) return;

    const actorName = actor.name?.trim() || actor.email;

    const membersToNotify = card.members.filter(
      (member) => member.user && member.user.id !== actorUserId,
    );

    if (membersToNotify.length === 0) return;

    const baseUrl = env("NEXT_PUBLIC_BASE_URL");
    const cardUrl = `${baseUrl}/cards/${cardPublicId}`;

    await Promise.all(
      membersToNotify.map(async (member) => {
        const userId = member.user?.id;
        const email = member.email;

        if (!userId || !email) return;

        try {
          const notificationExists = await notificationRepo.exists(db, {
            userId,
            cardId,
            type: "card.status_changed",
          });

          if (notificationExists) return;

          await notificationRepo.create(db, {
            type: "card.status_changed",
            userId,
            cardId,
            metadata: `${fromListName} -> ${toListName}`,
          });

          await sendEmail(
            email,
            `${cardTitle} se movió a ${toListName}`,
            "CARD_STATUS_CHANGED",
            {
              actorName,
              boardName,
              cardTitle,
              fromListName,
              toListName,
              cardUrl,
            },
          );
          log.info({ email, cardPublicId }, "Card status changed email sent");
        } catch (error) {
          log.error(
            { err: error, email, cardPublicId },
            "Failed to send card status changed email",
          );
        }
      }),
    );
  } catch (error) {
    log.error(
      { err: error, cardPublicId },
      "Error sending card status changed emails",
    );
  }
}

