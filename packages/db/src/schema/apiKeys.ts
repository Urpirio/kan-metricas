import { relations } from "drizzle-orm";
import {
  bigserial,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const apiKeys = pgTable("apiKeys", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  name: text("name"),
  keyHash: text("keyHash").notNull().unique(),
  keyPrefix: text("keyPrefix").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rateLimitMax: integer("rateLimitMax").notNull().default(100),
  rateLimitWindowMs: integer("rateLimitWindowMs").notNull().default(60_000),
  revokedAt: timestamp("revokedAt"),
  expiresAt: timestamp("expiresAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}).enableRLS();

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
    relationName: "apiKeysUser",
  }),
}));
