/**
 * Lógica pura para generar el Script_SQL_Esquema
 * (`packages/db/supabase/schema.sql`) a partir de las migraciones de Drizzle.
 *
 * El enfoque es concatenar el contenido íntegro de las migraciones de
 * `packages/db/migrations/*.sql` en orden cronológico. Como es literalmente el
 * mismo SQL que aplica el Ejecutor_De_Migraciones, en el mismo orden, el
 * esquema resultante es idéntico por construcción (Requisito 6.3), sin
 * introducir una segunda fuente de verdad del esquema.
 *
 * Este módulo vive bajo `src/` (en lugar de `scripts/`) para que su test
 * (`schema-sql.test.ts`) sea recogido por la configuración de vitest, que solo
 * incluye `src/**\/*.test.ts`. La E/S de sistema de archivos (leer migraciones,
 * escribir `schema.sql`) vive en `scripts/generate-schema-sql.ts`, que importa
 * las funciones puras de aquí.
 */

/** Un archivo de migración: su nombre de archivo y su contenido SQL íntegro. */
export interface MigrationFile {
  filename: string;
  contents: string;
}

/**
 * Formato de nombre de archivo esperado para las migraciones de Drizzle
 * generadas con `migrations.prefix: "timestamp"`: `<timestamp>_<Nombre>.sql`,
 * donde `<timestamp>` es una secuencia de dígitos (por ejemplo
 * `20250508083758`). El resto del nombre es libre siempre que termine en
 * `.sql`.
 */
const MIGRATION_FILENAME_PATTERN = /^(\d+)_.+\.sql$/;

/**
 * Error lanzado cuando un nombre de archivo de migración no sigue el formato
 * `<timestamp>_<Nombre>.sql` esperado.
 */
export class InvalidMigrationFilenameError extends Error {
  constructor(filename: string) {
    super(
      `El archivo de migración "${filename}" no sigue el formato esperado ` +
        `"<timestamp>_<Nombre>.sql" (por ejemplo "20250508083758_SetupTables.sql"). ` +
        `Renómbralo o exclúyelo antes de generar el Script_SQL_Esquema.`,
    );
    this.name = "InvalidMigrationFilenameError";
  }
}

/**
 * Extrae el prefijo de timestamp numérico del nombre de un archivo de
 * migración. Lanza `InvalidMigrationFilenameError` si el nombre no sigue el
 * formato `<timestamp>_<Nombre>.sql`.
 */
export function parseMigrationTimestamp(filename: string): bigint {
  const match = MIGRATION_FILENAME_PATTERN.exec(filename);

  if (!match?.[1]) {
    throw new InvalidMigrationFilenameError(filename);
  }

  // Se usa BigInt para comparar timestamps de forma numérica sin riesgo de
  // pérdida de precisión y sin depender del orden lexicográfico (que sería
  // frágil si los prefijos tuvieran longitudes distintas).
  return BigInt(match[1]);
}

/**
 * Concatena el contenido íntegro de un conjunto de archivos de migración,
 * ordenados cronológicamente por el prefijo de timestamp de su nombre, en un
 * único texto SQL.
 *
 * Cada migración va precedida por un comentario `-- Migration: <filename>`
 * para trazabilidad. El contenido de cada migración se incluye sin
 * modificaciones (Requisito 6.5): el orden de aparición respeta el orden
 * cronológico de los timestamps y el contenido de cada migración aparece
 * íntegro.
 *
 * Es una función pura: no lee el sistema de archivos ni depende del orden en
 * que se le pasen los archivos.
 *
 * @throws {InvalidMigrationFilenameError} si algún nombre de archivo no sigue
 * el formato `<timestamp>_<Nombre>.sql`.
 */
export function concatenateMigrations(files: MigrationFile[]): string {
  // Se valida y parsea el timestamp de cada archivo por adelantado (no dentro
  // del comparador de `sort`), para que un nombre inválido se detecte siempre,
  // incluso con listas de 0 o 1 elemento donde el comparador no se invoca.
  const withTimestamp = files.map((file) => ({
    file,
    timestamp: parseMigrationTimestamp(file.filename),
  }));

  const sorted = withTimestamp.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    // Desempate estable y determinista por nombre de archivo cuando dos
    // migraciones comparten el mismo timestamp exacto.
    return a.file.filename < b.file.filename
      ? -1
      : a.file.filename > b.file.filename
        ? 1
        : 0;
  });

  return sorted
    .map(({ file }) => `-- Migration: ${file.filename}\n${file.contents}`)
    .join("\n\n");
}
