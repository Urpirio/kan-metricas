import { createClient } from "@supabase/supabase-js";
import { env } from "next-runtime-env";

import { createLogger } from "@kan/logger";

const log = createLogger("supabase");

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export interface ResolvedSupabaseBrowserConfig {
  url: string;
  anonKey: string;
}

/**
 * Función pura: no crea ningún cliente, solo valida/resuelve la configuración
 * del Cliente_Supabase_JS para el contexto de navegador.
 *
 * Requiere `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 *
 * Si falta cualquiera de las variables requeridas, retorna `null` y registra
 * (`@kan/logger`) un error descriptivo indicando qué variable falta, en lugar
 * de fallar de forma silenciosa (Requisito 7.4, 7.5).
 */
export function resolveSupabaseBrowserConfig(env: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}): ResolvedSupabaseBrowserConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];

  if (!url) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!anonKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!url || !anonKey) {
    log.error(
      { missing },
      `Cannot resolve Supabase browser config: missing required environment variable(s): ${missing.join(
        ", ",
      )}`,
    );

    return null;
  }

  // Control-flow narrowing: the check above narrows both values to `string`.
  return { url, anonKey };
}

/**
 * Crea un Cliente_Supabase_JS para uso en el navegador utilizando la anon key
 * (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Seguro de importar en código de navegador.
 *
 * Lanza un error (en lugar de retornar un cliente parcialmente inicializado)
 * cuando `resolveSupabaseBrowserConfig` retorna `null` porque falta alguna
 * variable requerida (Requisito 7.6).
 */
export function createSupabaseBrowserClient(): SupabaseBrowserClient {
  const config = resolveSupabaseBrowserConfig({
    NEXT_PUBLIC_SUPABASE_URL: env("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  });

  if (!config) {
    throw new Error(
      "Cannot create Supabase browser client: required environment variables are missing. See the logged error for details.",
    );
  }

  return createClient(config.url, config.anonKey);
}
