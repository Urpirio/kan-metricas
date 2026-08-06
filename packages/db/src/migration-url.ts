/**
 * Resuelve la cadena de conexión que el Ejecutor_De_Migraciones debe usar para
 * aplicar las migraciones de Drizzle.
 *
 * Las migraciones de esquema deben ejecutarse contra la Conexion_Directa de
 * Supabase (puerto 5432), no contra la Conexion_Pooled, porque el modo
 * transacción del pooler (Supavisor/PgBouncer) no soporta bien las sentencias
 * usadas por las herramientas de migración (Requisito 2.2).
 *
 * Reglas de resolución (Requisitos 2.2, 2.3, 3.1, 3.2):
 * - Si `POSTGRES_URL_NON_POOLING` está definida y no vacía, se usa esa cadena
 *   (la Conexion_Directa) con prioridad sobre `POSTGRES_URL`.
 * - En caso contrario, se cae de vuelta a `POSTGRES_URL` (comportamiento de
 *   auto-hospedaje, donde existe una única URL de conexión).
 * - Si ninguna está definida, se retorna la cadena vacía `""`, preservando el
 *   comportamiento previo de `drizzle.config.ts`.
 *
 * Es una función pura: no lee `process.env` ni crea ningún recurso de red, de
 * forma que pueda importarse y testearse de forma aislada.
 */
export function resolveMigrationUrl(env: {
  POSTGRES_URL_NON_POOLING?: string;
  POSTGRES_URL?: string;
}): string {
  const direct = env.POSTGRES_URL_NON_POOLING;
  if (direct !== undefined && direct !== "") {
    return direct;
  }

  const pooled = env.POSTGRES_URL;
  if (pooled !== undefined && pooled !== "") {
    return pooled;
  }

  return "";
}
