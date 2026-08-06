import { type Config } from "drizzle-kit";

import { resolveMigrationUrl } from "./src/migration-url";

export default {
  schema: "./src/schema",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveMigrationUrl(process.env),
    ssl: process.env.NODE_ENV === "production" ? true : false,
  },
  migrations: {
    prefix: "timestamp",
  },
} satisfies Config;
