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
