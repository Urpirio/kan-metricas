import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import dns from "dns";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgLite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";

import { createLogger } from "@kan/logger";

import * as schema from "./schema";

// Force IPv4 DNS resolution to avoid ENETUNREACH on systems without IPv6 connectivity
dns.setDefaultResultOrder("ipv4first");

const log = createLogger("db");

export type dbClient = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "postgres"]);

export interface ResolvedDbConfig {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
}

/**
 * Resuelve la configuración de conexión (cadena + modo SSL) a partir de las
 * variables de entorno. No crea ningún recurso de red.
 *
 * Reglas:
 * - Si `POSTGRES_URL` no está definida:
 *   - y `NODE_ENV === "production"` → lanza un error descriptivo.
 *   - en cualquier otro caso → retorna `null` (el llamador cae a PGLite).
 * - Si `POSTGRES_URL` está definida:
 *   - Si la URL ya contiene el parámetro `sslmode`, o el host es
 *     `localhost`/`127.0.0.1`/`postgres`, `ssl` se resuelve en `false`.
 *   - En cualquier otro caso, `ssl` se resuelve en
 *     `{ rejectUnauthorized: false }`.
 */
export function resolveDbConfig(env: {
  POSTGRES_URL?: string;
  NODE_ENV?: string;
}): ResolvedDbConfig | null {
  const connectionString = env.POSTGRES_URL;

  if (!connectionString) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "POSTGRES_URL is not set. A POSTGRES_URL environment variable is required when NODE_ENV is production.",
      );
    }

    return null;
  }

  let host: string | null = null;
  let hasSslMode = false;

  try {
    const parsed = new URL(connectionString);
    host = parsed.hostname;
    hasSslMode = parsed.searchParams.has("sslmode");
  } catch {
    host = null;
    hasSslMode = false;
  }

  const isLocalHost = host !== null && LOCAL_HOSTS.has(host);

  const ssl: ResolvedDbConfig["ssl"] =
    hasSslMode || isLocalHost ? false : { rejectUnauthorized: false };

  return {
    connectionString,
    ssl,
  };
}

/**
 * Intenta obtener y liberar un cliente del `Pool` para verificar que la
 * conexión inicial es válida. Si el intento falla, registra un error
 * descriptivo mediante `@kan/logger` (incluyendo el error original) antes de
 * re-lanzarlo, de modo que el fallo de conexión nunca se descarte de forma
 * silenciosa (Requisito 1.3).
 */
export async function verifyInitialConnection(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    client.release();
  } catch (error) {
    log.error(
      { err: error },
      "Failed to establish initial database connection using POSTGRES_URL",
    );

    throw error;
  }
}

export const createDrizzleClient = (): dbClient => {
  const config = resolveDbConfig({
    POSTGRES_URL: process.env.POSTGRES_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!config) {
    log.warn("POSTGRES_URL not set, falling back to PGLite");

    const client = new PGlite({
      dataDir: "./pgdata",
      extensions: { uuid_ossp },
    });
    const db = drizzlePgLite(client, { schema });

    migrate(db, { migrationsFolder: "../../packages/db/migrations" });

    return db as unknown as dbClient;
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    ssl: config.ssl,
  });

  // `createDrizzleClient` is synchronous and its callers do not await this
  // check, so the rejection is caught here to avoid an unhandled promise
  // rejection. The error itself is already logged inside
  // `verifyInitialConnection` before it rejects.
  void verifyInitialConnection(pool).catch(() => undefined);

  return drizzlePg(pool, { schema }) as dbClient;
};
