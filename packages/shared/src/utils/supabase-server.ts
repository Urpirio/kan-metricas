import { createClient } from "@supabase/supabase-js";

import { createLogger } from "@kan/logger";

const log = createLogger("supabase-server");

type SupabaseServerClient = ReturnType<typeof createClient>;

export interface ResolvedSupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}

/**
 * Función pura: no crea ningún cliente, solo valida/resuelve la configuración
 * del Cliente_Supabase_JS para el contexto de servidor.
 *
 * Requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Si falta cualquiera de las variables requeridas, retorna `null` y registra
 * (`@kan/logger`) un error descriptivo indicando qué variable falta, en lugar
 * de fallar de forma silenciosa (Requisito 7.3, 7.5).
 *
 * IMPORTANTE: este módulo es server-only. `SUPABASE_SERVICE_ROLE_KEY` nunca
 * debe exponerse al navegador, por lo que este archivo NO se reexporta desde
 * el punto de entrada `.` ni `./utils` de `packages/shared` (consumidos por
 * código de navegador), de forma análoga a como `S3_SECRET_ACCESS_KEY` se
 * mantiene fuera del bundle del navegador. Solo se expone mediante el punto de
 * entrada dedicado `@kan/shared/utils/supabase-server`.
 */
export function resolveSupabaseServerConfig(env: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): ResolvedSupabaseServerConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];

  if (!url) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!url || !serviceRoleKey) {
    log.error(
      { missing },
      `Cannot resolve Supabase server config: missing required environment variable(s): ${missing.join(
        ", ",
      )}`,
    );

    return null;
  }

  // Control-flow narrowing: the check above narrows both values to `string`.
  return { url, serviceRoleKey };
}

/**
 * Crea un Cliente_Supabase_JS para uso en el servidor utilizando la service
 * role key (`SUPABASE_SERVICE_ROLE_KEY`). Solo debe importarse desde código de
 * servidor (procedimientos de tRPC, hooks de `packages/auth`, scripts).
 *
 * Lanza un error (en lugar de retornar un cliente parcialmente inicializado)
 * cuando `resolveSupabaseServerConfig` retorna `null` porque falta alguna
 * variable requerida (Requisito 7.6).
 */
export function createSupabaseServerClient(): SupabaseServerClient {
  const config = resolveSupabaseServerConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!config) {
    throw new Error(
      "Cannot create Supabase server client: required environment variables are missing. See the logged error for details.",
    );
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
