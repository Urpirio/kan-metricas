-- Script_SQL_Esquema generado automáticamente por scripts/generate-schema-sql.ts.
-- NO editar a mano: se regenera con `pnpm db:generate-schema-sql`.
-- Fuente de verdad: packages/db/migrations/*.sql (concatenadas en orden cronológico).

-- Migration: 20250508083758_SetupTables.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";--> statement-breakpoint

CREATE TYPE "public"."board_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."card_activity_type" AS ENUM('card.created', 'card.updated.title', 'card.updated.description', 'card.updated.index', 'card.updated.list', 'card.updated.label.added', 'card.updated.label.removed', 'card.updated.member.added', 'card.updated.member.removed', 'card.updated.comment.added', 'card.updated.comment.updated', 'card.updated.comment.deleted', 'card.archived');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('trello');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('started', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('invited', 'active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."slug_type" AS ENUM('reserved', 'premium');--> statement-breakpoint
CREATE TYPE "public"."workspace_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" uuid NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apiKey" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"userId" uuid NOT NULL,
	"refillInterval" integer,
	"refillAmount" integer,
	"lastRefillAt" timestamp,
	"enabled" boolean,
	"rateLimitEnabled" boolean,
	"rateLimitTimeWindow" integer,
	"rateLimitMax" integer,
	"requestCount" integer,
	"remaining" integer,
	"lastRequest" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
ALTER TABLE "apiKey" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"slug" varchar(255) NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	"importId" bigint,
	"workspaceId" bigint NOT NULL,
	"visibility" "board_visibility" DEFAULT 'private' NOT NULL,
	CONSTRAINT "board_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "board" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"type" "card_activity_type" NOT NULL,
	"cardId" bigint NOT NULL,
	"fromIndex" integer,
	"toIndex" integer,
	"fromListId" bigint,
	"toListId" bigint,
	"labelId" bigint,
	"workspaceMemberId" bigint,
	"fromTitle" varchar(255),
	"toTitle" varchar(255),
	"fromDescription" text,
	"toDescription" text,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"commentId" bigint,
	"fromComment" text,
	"toComment" text,
	CONSTRAINT "card_activity_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_card_workspace_members" (
	"cardId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	CONSTRAINT "_card_workspace_members_cardId_workspaceMemberId_pk" PRIMARY KEY("cardId","workspaceMemberId")
);
--> statement-breakpoint
ALTER TABLE "_card_workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"index" integer NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	"listId" bigint NOT NULL,
	"importId" bigint,
	CONSTRAINT "card_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_card_labels" (
	"cardId" bigint NOT NULL,
	"labelId" bigint NOT NULL,
	CONSTRAINT "_card_labels_cardId_labelId_pk" PRIMARY KEY("cardId","labelId")
);
--> statement-breakpoint
ALTER TABLE "_card_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"comment" text NOT NULL,
	"cardId" bigint NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "card_comments_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feedback" text NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"url" text NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"source" "source" NOT NULL,
	"status" "status" NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "import_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "import" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "label" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"colourCode" varchar(12),
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"boardId" bigint NOT NULL,
	"importId" bigint,
	CONSTRAINT "label_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "label" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "list" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"index" integer NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	"boardId" bigint NOT NULL,
	"importId" bigint,
	CONSTRAINT "list_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "list" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"stripeCustomerId" varchar(255),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_slugs" (
	"slug" varchar(255) NOT NULL,
	"type" "slug_type" NOT NULL,
	CONSTRAINT "workspace_slugs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"userId" uuid NOT NULL,
	"workspaceId" bigint NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	"role" "role" NOT NULL,
	"status" "member_status" DEFAULT 'invited' NOT NULL,
	CONSTRAINT "workspace_members_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"slug" varchar(255) NOT NULL,
	"plan" "workspace_plan" DEFAULT 'free' NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "workspace_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_importId_import_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."import"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_fromListId_list_id_fk" FOREIGN KEY ("fromListId") REFERENCES "public"."list"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_toListId_list_id_fk" FOREIGN KEY ("toListId") REFERENCES "public"."list"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_labelId_label_id_fk" FOREIGN KEY ("labelId") REFERENCES "public"."label"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_commentId_card_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."card_comments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_card_workspace_members" ADD CONSTRAINT "_card_workspace_members_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_card_workspace_members" ADD CONSTRAINT "_card_workspace_members_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_listId_list_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_importId_import_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."import"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_card_labels" ADD CONSTRAINT "_card_labels_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_card_labels" ADD CONSTRAINT "_card_labels_labelId_label_id_fk" FOREIGN KEY ("labelId") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import" ADD CONSTRAINT "import_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_importId_import_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."import"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list" ADD CONSTRAINT "list_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list" ADD CONSTRAINT "list_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list" ADD CONSTRAINT "list_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list" ADD CONSTRAINT "list_importId_import_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."import"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace" ADD CONSTRAINT "workspace_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace" ADD CONSTRAINT "workspace_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_visibility_idx" ON "board" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_slug_per_workspace" ON "board" USING btree ("workspaceId","slug") WHERE "board"."deletedAt" IS NULL;

-- Migration: 20250522083748_AddEmailToWorkspaceMembers.sql
ALTER TABLE "workspace_members" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "email" varchar(255);--> statement-breakpoint
UPDATE "workspace_members" wm SET "email" = u."email" FROM "user" u WHERE wm."userId" = u."id";--> statement-breakpoint
ALTER TABLE "workspace_members" ALTER COLUMN "email" SET NOT NULL;

-- Migration: 20250527203813_AddDeletedAtToLabel.sql
ALTER TABLE "label" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "label" ADD COLUMN "deletedBy" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250605101155_AddCascadeDeleteToCardRelations.sql
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_fromListId_list_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_toListId_list_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_labelId_label_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_workspaceMemberId_workspace_members_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_commentId_card_comments_id_fk";
--> statement-breakpoint
ALTER TABLE "_card_workspace_members" DROP CONSTRAINT "_card_workspace_members_cardId_card_id_fk";
--> statement-breakpoint
ALTER TABLE "_card_labels" DROP CONSTRAINT "_card_labels_cardId_card_id_fk";
--> statement-breakpoint
ALTER TABLE "card_comments" DROP CONSTRAINT "card_comments_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card_comments" DROP CONSTRAINT "card_comments_deletedBy_user_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_fromListId_list_id_fk" FOREIGN KEY ("fromListId") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_toListId_list_id_fk" FOREIGN KEY ("toListId") REFERENCES "public"."list"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_labelId_label_id_fk" FOREIGN KEY ("labelId") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_commentId_card_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."card_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_card_workspace_members" ADD CONSTRAINT "_card_workspace_members_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_card_labels" ADD CONSTRAINT "_card_labels_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Migration: 20250608100932_AddIntegrationsTable.sql
CREATE TABLE IF NOT EXISTS "integration" (
	"provider" varchar(255) NOT NULL,
	"userId" uuid NOT NULL,
	"accessToken" varchar(255) NOT NULL,
	"refreshToken" varchar(255),
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "integration_pkey" PRIMARY KEY("userId","provider")
);
--> statement-breakpoint
ALTER TABLE "integration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration" ADD CONSTRAINT "integration_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250608175448_AddOnDeleteActionToUserDeletion.sql
ALTER TABLE "board" DROP CONSTRAINT "board_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "board" DROP CONSTRAINT "board_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_workspaceMemberId_workspace_members_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT "card_activity_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card" DROP CONSTRAINT "card_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card" DROP CONSTRAINT "card_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card_comments" DROP CONSTRAINT "card_comments_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "card_comments" DROP CONSTRAINT "card_comments_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "import" DROP CONSTRAINT "import_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "label" DROP CONSTRAINT "label_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "label" DROP CONSTRAINT "label_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "list" DROP CONSTRAINT "list_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "list" DROP CONSTRAINT "list_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace" DROP CONSTRAINT "workspace_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace" DROP CONSTRAINT "workspace_deletedBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "board" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_activity" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_comments" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "label" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "list" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ALTER COLUMN "createdBy" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import" ADD CONSTRAINT "import_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list" ADD CONSTRAINT "list_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "list" ADD CONSTRAINT "list_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace" ADD CONSTRAINT "workspace_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace" ADD CONSTRAINT "workspace_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250610200449_ReaddIntegrationTable.sql
CREATE TABLE IF NOT EXISTS "integration" (
	"provider" varchar(255) NOT NULL,
	"userId" uuid NOT NULL,
	"accessToken" varchar(255) NOT NULL,
	"refreshToken" varchar(255),
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "integration_pkey" PRIMARY KEY("userId","provider")
);
--> statement-breakpoint
ALTER TABLE "integration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration" ADD CONSTRAINT "integration_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Migration: 20250806202106_glossy_luminals.sql
CREATE TABLE IF NOT EXISTS "card_checklist_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"title" varchar(500) NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"index" integer NOT NULL,
	"checklistId" bigint NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "card_checklist_item_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card_checklist_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_checklist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"index" integer NOT NULL,
	"cardId" bigint NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "card_checklist_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card_checklist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration" (
	"provider" varchar(255) NOT NULL,
	"userId" uuid NOT NULL,
	"accessToken" varchar(255) NOT NULL,
	"refreshToken" varchar(255),
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "integration_pkey" PRIMARY KEY("userId","provider")
);
--> statement-breakpoint
ALTER TABLE "integration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist_item" ADD CONSTRAINT "card_checklist_item_checklistId_card_checklist_id_fk" FOREIGN KEY ("checklistId") REFERENCES "public"."card_checklist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist_item" ADD CONSTRAINT "card_checklist_item_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist_item" ADD CONSTRAINT "card_checklist_item_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist" ADD CONSTRAINT "card_checklist_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist" ADD CONSTRAINT "card_checklist_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist" ADD CONSTRAINT "card_checklist_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration" ADD CONSTRAINT "integration_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250813141748_AddChecklistActivityTypes.sql
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.added' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.renamed' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.deleted' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.item.added' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.item.updated' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.item.completed' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.item.uncompleted' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.checklist.item.deleted' BEFORE 'card.archived';

-- Migration: 20250902085406_AddSubscriptions.sql
CREATE TABLE IF NOT EXISTS "subscription" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"plan" varchar(255) NOT NULL,
	"referenceId" varchar(12) NOT NULL,
	"stripeCustomerId" varchar(255),
	"stripeSubscriptionId" varchar(255),
	"status" varchar(255) NOT NULL,
	"periodStart" timestamp,
	"periodEnd" timestamp,
	"cancelAtPeriodEnd" boolean,
	"seats" integer,
	"trialStart" timestamp,
	"trialEnd" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription" ADD CONSTRAINT "subscription_referenceId_workspace_publicId_fk" FOREIGN KEY ("referenceId") REFERENCES "public"."workspace"("publicId") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250907185512_AddUnlimitedSeatsToSubscription.sql
ALTER TABLE "subscription" ADD COLUMN "unlimitedSeats" boolean DEFAULT false NOT NULL;

-- Migration: 20250910195058_RemoveNotNullConstraintFromReferenceIdOnSubsriptions.sql
ALTER TABLE "subscription" ALTER COLUMN "referenceId" DROP NOT NULL;

-- Migration: 20250910200416_AddWorkspaceSlugChecks.sql
CREATE TABLE IF NOT EXISTS "workspace_slug_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"available" boolean NOT NULL,
	"reserved" boolean NOT NULL,
	"workspaceId" bigint,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_slug_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_slug_checks" ADD CONSTRAINT "workspace_slug_checks_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_slug_checks" ADD CONSTRAINT "workspace_slug_checks_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250910202358_AddCascadeSetNullToReferenceIdOnSubsriptions.sql
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_referenceId_workspace_publicId_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription" ADD CONSTRAINT "subscription_referenceId_workspace_publicId_fk" FOREIGN KEY ("referenceId") REFERENCES "public"."workspace"("publicId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20250918201751_AddPausedMemberStatus.sql
ALTER TYPE "public"."member_status" ADD VALUE 'paused';

-- Migration: 20250923211958_AddWorkspaceInviteLinks.sql
CREATE TYPE "public"."invite_link_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_invite_links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"code" varchar(12) NOT NULL,
	"status" "invite_link_status" DEFAULT 'active' NOT NULL,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" uuid,
	"updatedAt" timestamp,
	"updatedBy" uuid,
	CONSTRAINT "workspace_invite_links_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "workspace_invite_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "workspace_invite_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_invite_links" ADD CONSTRAINT "workspace_invite_links_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_invite_links" ADD CONSTRAINT "workspace_invite_links_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_invite_links" ADD CONSTRAINT "workspace_invite_links_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20251001220136_AddFuzzySearchSupport.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm; --> statement-breakpoint
CREATE INDEX IF NOT EXISTS boards_name_trgm_idx ON board USING gin (name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cards_title_trgm_idx ON card USING gin (title gin_trgm_ops);


-- Migration: 20251007204129_AddBoardTypeAndSourceIdColumns.sql
CREATE TYPE "public"."board_type" AS ENUM('regular', 'template');--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "type" "board_type" DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "sourceBoardId" bigint;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_type_idx" ON "board" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_source_idx" ON "board" USING btree ("sourceBoardId");

-- Migration: 20251009211316_AddBoardSourceIdToCardActivity.sql
ALTER TABLE "card_activity" ADD COLUMN "sourceBoardId" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_sourceBoardId_board_id_fk" FOREIGN KEY ("sourceBoardId") REFERENCES "public"."board"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20251110204423_AddCardAttachments.sql
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.attachment.added' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.attachment.removed' BEFORE 'card.archived';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_attachment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"cardId" bigint NOT NULL,
	"filename" varchar(255) NOT NULL,
	"originalFilename" varchar(255) NOT NULL,
	"contentType" varchar(100) NOT NULL,
	"size" bigint NOT NULL,
	"s3Key" varchar(500) NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "card_attachment_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card_attachment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_attachment" ADD CONSTRAINT "card_attachment_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_attachment" ADD CONSTRAINT "card_attachment_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20251201204335_AddCardDueDates.sql
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.dueDate.added' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.dueDate.updated' BEFORE 'card.archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.updated.dueDate.removed' BEFORE 'card.archived';--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "fromDueDate" timestamp;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "toDueDate" timestamp;--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "dueDate" timestamp;

-- Migration: 20251229220153_UpdateCardTitleFromVarcharToText.sql
ALTER TABLE "card_activity" ALTER COLUMN "fromTitle" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "card_activity" ALTER COLUMN "toTitle" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "card" ALTER COLUMN "title" SET DATA TYPE text;

-- Migration: 20260119164257_AddShowEmailsToMembersToWorkspace.sql
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "showEmailsToMembers" boolean NOT NULL DEFAULT true;


-- Migration: 20260126135909_AddWorkspaceRoles.sql
CREATE TABLE IF NOT EXISTS "workspace_member_permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	"permission" varchar(64) NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "workspace_member_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_role_permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspaceRoleId" bigint NOT NULL,
	"permission" varchar(64) NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" varchar(255),
	"hierarchyLevel" integer NOT NULL,
	"isSystem" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "workspace_roles_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "workspace_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "roleId" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_role_permissions" ADD CONSTRAINT "workspace_role_permissions_workspaceRoleId_workspace_roles_id_fk" FOREIGN KEY ("workspaceRoleId") REFERENCES "public"."workspace_roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_roles" ADD CONSTRAINT "workspace_roles_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_member_permission" ON "workspace_member_permissions" USING btree ("workspaceMemberId","permission");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permission_member_idx" ON "workspace_member_permissions" USING btree ("workspaceMemberId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_role_permission" ON "workspace_role_permissions" USING btree ("workspaceRoleId","permission");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permissions_role_idx" ON "workspace_role_permissions" USING btree ("workspaceRoleId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_role_per_workspace" ON "workspace_roles" USING btree ("workspaceId","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_roles_workspace_idx" ON "workspace_roles" USING btree ("workspaceId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_roleId_workspace_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."workspace_roles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Helper function to generate 12-character public IDs
CREATE OR REPLACE FUNCTION generate_public_id() RETURNS varchar(12) AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result varchar(12) := '';
  i integer;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Seed system roles for each existing workspace
INSERT INTO "workspace_roles" ("publicId", "workspaceId", "name", "description", "hierarchyLevel", "isSystem", "createdAt")
SELECT generate_public_id(), w.id, 'admin', 'Full access to all workspace features', 100, true, NOW()
FROM "workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_roles" wr 
  WHERE wr."workspaceId" = w.id AND wr."name" = 'admin'
);
--> statement-breakpoint
INSERT INTO "workspace_roles" ("publicId", "workspaceId", "name", "description", "hierarchyLevel", "isSystem", "createdAt")
SELECT generate_public_id(), w.id, 'member', 'Standard member with create and edit permissions', 50, true, NOW()
FROM "workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_roles" wr 
  WHERE wr."workspaceId" = w.id AND wr."name" = 'member'
);
--> statement-breakpoint
INSERT INTO "workspace_roles" ("publicId", "workspaceId", "name", "description", "hierarchyLevel", "isSystem", "createdAt")
SELECT generate_public_id(), w.id, 'guest', 'View-only access', 10, true, NOW()
FROM "workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_roles" wr 
  WHERE wr."workspaceId" = w.id AND wr."name" = 'guest'
);
--> statement-breakpoint

-- Seed admin role permissions (all permissions)
INSERT INTO "workspace_role_permissions" ("workspaceRoleId", "permission", "granted", "createdAt")
SELECT wr.id, p.permission, true, NOW()
FROM "workspace_roles" wr
CROSS JOIN (
  VALUES 
    ('workspace:view'), ('workspace:edit'), ('workspace:delete'), ('workspace:manage'),
    ('board:view'), ('board:create'), ('board:edit'), ('board:delete'),
    ('list:view'), ('list:create'), ('list:edit'), ('list:delete'),
    ('card:view'), ('card:create'), ('card:edit'), ('card:delete'),
    ('comment:view'), ('comment:create'), ('comment:edit'), ('comment:delete'),
    ('member:view'), ('member:invite'), ('member:edit'), ('member:remove')
) AS p(permission)
WHERE wr."name" = 'admin' AND wr."isSystem" = true
AND NOT EXISTS (
  SELECT 1 FROM "workspace_role_permissions" wrp 
  WHERE wrp."workspaceRoleId" = wr.id AND wrp."permission" = p.permission
);
--> statement-breakpoint

-- Seed member role permissions
INSERT INTO "workspace_role_permissions" ("workspaceRoleId", "permission", "granted", "createdAt")
SELECT wr.id, p.permission, true, NOW()
FROM "workspace_roles" wr
CROSS JOIN (
  VALUES 
    ('workspace:view'),
    ('board:view'), ('board:create'),
    ('list:view'), ('list:create'), ('list:edit'), ('list:delete'),
    ('card:view'), ('card:create'), ('card:edit'), ('card:delete'),
    ('comment:view'), ('comment:create'), ('comment:edit'), ('comment:delete'),
    ('member:view')
) AS p(permission)
WHERE wr."name" = 'member' AND wr."isSystem" = true
AND NOT EXISTS (
  SELECT 1 FROM "workspace_role_permissions" wrp 
  WHERE wrp."workspaceRoleId" = wr.id AND wrp."permission" = p.permission
);
--> statement-breakpoint

-- Seed guest role permissions (view only)
INSERT INTO "workspace_role_permissions" ("workspaceRoleId", "permission", "granted", "createdAt")
SELECT wr.id, p.permission, true, NOW()
FROM "workspace_roles" wr
CROSS JOIN (
  VALUES 
    ('workspace:view'),
    ('board:view'),
    ('list:view'),
    ('card:view'),
    ('comment:view'),
    ('member:view')
) AS p(permission)
WHERE wr."name" = 'guest' AND wr."isSystem" = true
AND NOT EXISTS (
  SELECT 1 FROM "workspace_role_permissions" wrp 
  WHERE wrp."workspaceRoleId" = wr.id AND wrp."permission" = p.permission
);
--> statement-breakpoint

-- Migrate existing workspace_members to use roleId
UPDATE "workspace_members" wm
SET "roleId" = wr.id
FROM "workspace_roles" wr
WHERE wm."workspaceId" = wr."workspaceId"
  AND wm."role"::text = wr."name"
  AND wm."roleId" IS NULL;
--> statement-breakpoint

-- Clean up helper function
DROP FUNCTION IF EXISTS generate_public_id();


-- Migration: 20260129210000_AddWorkspaceWebhooks.sql
CREATE TABLE IF NOT EXISTS "workspace_webhooks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"secret" text,
	"events" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "workspace_webhooks_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "workspace_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_webhooks_workspace_idx" ON "workspace_webhooks" USING btree ("workspaceId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20260201215958_AddUserBoardFavouritesTable.sql
CREATE TABLE IF NOT EXISTS "user_board_favorites" (
	"userId" uuid NOT NULL,
	"boardId" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_board_favorites_userId_boardId_pk" PRIMARY KEY("userId","boardId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_board_favorites" ADD CONSTRAINT "user_board_favorites_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_board_favorites" ADD CONSTRAINT "user_board_favorites_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_board_favorite_user_idx" ON "user_board_favorites" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_board_favorite_board_idx" ON "user_board_favorites" USING btree ("boardId");

-- Migration: 20260207214056_AddNotificationsTable.sql
CREATE TYPE "public"."notification_type" AS ENUM('mention', 'workspace.member.added', 'workspace.member.removed', 'workspace.role.changed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"type" "notification_type" NOT NULL,
	"userId" uuid NOT NULL,
	"cardId" bigint,
	"commentId" bigint,
	"workspaceId" bigint,
	"metadata" text,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "notification_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_commentId_card_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."card_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_deleted_idx" ON "notification" USING btree ("userId","deletedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_read_deleted_idx" ON "notification" USING btree ("userId","readAt","deletedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_type_card_idx" ON "notification" USING btree ("userId","type","cardId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_type_workspace_idx" ON "notification" USING btree ("userId","type","workspaceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_created_idx" ON "notification" USING btree ("userId","createdAt");

-- Migration: 20260208033314_AddAttachmentToActivity.sql
ALTER TABLE "card_activity" ADD COLUMN "attachmentId" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_attachmentId_card_attachment_id_fk" FOREIGN KEY ("attachmentId") REFERENCES "public"."card_attachment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20260224105235_AddGitHubIntegrationSupport.sql
ALTER TYPE "public"."source" ADD VALUE 'github';--> statement-breakpoint
ALTER TABLE "integration" ALTER COLUMN "accessToken" SET DATA TYPE text;--> statement-breakpoint

-- Migration: 20260225195947_AddIsArchivedToBoard.sql
ALTER TABLE "board" ADD COLUMN "isArchived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_is_archived_idx" ON "board" USING btree ("isArchived");

-- Migration: 20260311065722_AddWeekStartDay.sql
-- Migrations and snapshots seem to have become out of sync (this should fix that)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'source'
      AND e.enumlabel = 'github'
  ) THEN
    ALTER TYPE "public"."source" ADD VALUE 'github';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_webhooks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"secret" text,
	"events" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "workspace_webhooks_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "workspace_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integration" ALTER COLUMN "accessToken" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN IF NOT EXISTS "attachmentId" bigint;--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "weekStartDay" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_webhooks_workspace_idx" ON "workspace_webhooks" USING btree ("workspaceId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_attachmentId_card_attachment_id_fk" FOREIGN KEY ("attachmentId") REFERENCES "public"."card_attachment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20260402225628_AddTeamWorkspacePlan.sql
ALTER TYPE "public"."workspace_plan" ADD VALUE 'team' BEFORE 'pro';

-- Migration: 20260421220939_AddCardNumber.sql
ALTER TABLE "card" ADD COLUMN "cardNumber" integer;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "cardPrefix" varchar(10) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "cardCounter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_list_number_idx" ON "card" USING btree ("listId","cardNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_card_prefix_idx" ON "workspace" USING btree ("cardPrefix");--> statement-breakpoint

-- Populate cardPrefix for existing workspaces from their name
UPDATE "workspace"
SET "cardPrefix" = (
  SELECT CASE
    WHEN array_length(words, 1) = 1 THEN UPPER(LEFT(words[1], 3))
    ELSE UPPER(LEFT(array_to_string(ARRAY(
      SELECT LEFT(w, 1) FROM unnest(words) AS w WHERE w != ''
    ), ''), 4))
  END
  FROM (
    SELECT regexp_split_to_array(trim("name"), '\s+') AS words
  ) sub
)
WHERE "cardPrefix" = '';--> statement-breakpoint

-- Assign sequential cardNumber to existing cards (including soft-deleted),
-- ordered by createdAt, scoped to workspace. Deleted cards still receive a
-- number so future un-archive/restore flows can keep their ticket ID.
WITH numbered AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (PARTITION BY b."workspaceId" ORDER BY c."createdAt", c.id) AS rn
  FROM "card" c
  JOIN "list" l ON c."listId" = l.id
  JOIN "board" b ON l."boardId" = b.id
  WHERE c."cardNumber" IS NULL
)
UPDATE "card" c
SET "cardNumber" = n.rn
FROM numbered n
WHERE c.id = n.id;--> statement-breakpoint

-- Update cardCounter on each workspace to the max cardNumber assigned
UPDATE "workspace" w
SET "cardCounter" = COALESCE((
  SELECT MAX(c."cardNumber")
  FROM "card" c
  JOIN "list" l ON c."listId" = l.id
  JOIN "board" b ON l."boardId" = b.id
  WHERE b."workspaceId" = w.id AND c."cardNumber" IS NOT NULL
), 0);


-- Migration: 20260512203226_AddPartnerLicenseToSubscription.sql
ALTER TABLE "subscription" ADD COLUMN "partnerLicenseKey" varchar(255);--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "partnerTier" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_partner_license_key_idx" ON "subscription" USING btree ("partnerLicenseKey");

-- Migration: 20260529123231_DropPartnerLicenseKeyUniqueConstraint.sql
DROP INDEX IF EXISTS "subscription_partner_license_key_idx";

-- Migration: 20260805123151_AddApiKeysTable.sql
CREATE TABLE IF NOT EXISTS "apiKeys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" text,
	"keyHash" text NOT NULL,
	"keyPrefix" text NOT NULL,
	"userId" uuid NOT NULL,
	"rateLimitMax" integer DEFAULT 100 NOT NULL,
	"rateLimitWindowMs" integer DEFAULT 60000 NOT NULL,
	"revokedAt" timestamp,
	"expiresAt" timestamp,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "apiKeys_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "apiKeys_keyHash_unique" UNIQUE("keyHash")
);
--> statement-breakpoint
ALTER TABLE "apiKeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "apiKeys" ADD CONSTRAINT "apiKeys_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


-- Migration: 20260806120000_AddRealtimeBoardPolicies.sql
-- Enables Supabase Realtime for the Kanban board tables (board, list, card)
-- and adds the Row Level Security policies that Realtime needs in order to
-- authorize which rows a given browser client is allowed to receive change
-- events for.
--
-- Context: the application server connects as the `postgres` role and
-- bypasses RLS entirely — all authorization for tRPC requests happens in
-- application code (see packages/api/src/utils/permissions.ts), not via
-- these policies. These policies exist ONLY to gate direct
-- `postgres_changes` subscriptions made from the browser using the
-- Supabase anon/authenticated client. They intentionally mirror a coarser
-- version of the app's authorization model (workspace membership) rather
-- than the full permission system, since Realtime only needs a yes/no read
-- check, not the fine-grained action permissions used elsewhere.
--
-- A user may receive change events for a card/list/board row if either:
--   1. They are an active (non-removed, non-paused) member of the
--      workspace that owns the board, OR
--   2. The board is public (visibility = 'public').
--
-- Portability: this file is a no-op on plain PostgreSQL (self-hosted
-- `docker-compose.yml` with the vanilla `postgres:15` image, or the PGLite
-- fallback used in local dev without `POSTGRES_URL`). Every statement below
-- is guarded to only run when the `auth` schema (Supabase Auth) and/or the
-- `supabase_realtime` publication actually exist, so applying this
-- migration against a non-Supabase Postgres leaves the schema untouched
-- instead of failing on `auth.uid()` or `ALTER PUBLICATION`.
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE OR REPLACE FUNCTION public.is_active_workspace_member(target_workspace_id bigint)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, auth
    STABLE
    AS $func$
      SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_members."workspaceId" = target_workspace_id
          AND workspace_members."userId" = auth.uid()
          AND workspace_members.status = 'active'
          AND workspace_members."deletedAt" IS NULL
      );
    $func$;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'board' AND policyname = 'realtime_select_board'
    ) THEN
      CREATE POLICY "realtime_select_board" ON "board"
        FOR SELECT
        USING (
          visibility = 'public'
          OR public.is_active_workspace_member("workspaceId")
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list' AND policyname = 'realtime_select_list'
    ) THEN
      CREATE POLICY "realtime_select_list" ON "list"
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM board
            WHERE board.id = list."boardId"
              AND (
                board.visibility = 'public'
                OR public.is_active_workspace_member(board."workspaceId")
              )
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'card' AND policyname = 'realtime_select_card'
    ) THEN
      CREATE POLICY "realtime_select_card" ON "card"
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM list
            JOIN board ON board.id = list."boardId"
            WHERE list.id = card."listId"
              AND (
                board.visibility = 'public'
                OR public.is_active_workspace_member(board."workspaceId")
              )
          )
        );
    END IF;

    -- `replica identity full` is required so that UPDATE/DELETE change
    -- events carry the full previous row (not just the primary key), which
    -- the policies above need in order to evaluate `boardId`/`listId` for
    -- rows that no longer match after the change (e.g. a card moved out of
    -- a list the client can see).
    ALTER TABLE "board" REPLICA IDENTITY FULL;
    ALTER TABLE "list" REPLICA IDENTITY FULL;
    ALTER TABLE "card" REPLICA IDENTITY FULL;
  END IF;
END $$;
--> statement-breakpoint

-- Registers the tables with Supabase's realtime publication so that
-- `postgres_changes` subscriptions receive events for them at all. Without
-- this, the RLS policies above are irrelevant because no events are
-- published in the first place. Guarded separately from the block above
-- because the `supabase_realtime` publication is created by Supabase's own
-- bootstrapping and may not exist yet even on a Supabase-backed database
-- (e.g. Realtime disabled for the project).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'board'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "board";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'list'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "list";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'card'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "card";
    END IF;
  END IF;
END $$;


-- Migration: 20260809222002_AddCommentAndStatusChangedNotificationTypes.sql
ALTER TYPE "public"."notification_type" ADD VALUE 'comment' BEFORE 'workspace.member.added';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'card.status_changed' BEFORE 'workspace.member.added';
