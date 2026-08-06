import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  concatenateMigrations,
  InvalidMigrationFilenameError,
  type MigrationFile,
} from "./schema-sql";

/**
 * Arbitrary para un timestamp numérico como el prefijo generado por
 * `drizzle-kit` con `migrations.prefix: "timestamp"` (por ejemplo
 * `20250508083758`). Se generan valores de 14 dígitos para imitar el formato
 * `YYYYMMDDHHmmss` real.
 */
const timestampArbitrary = fc
  .integer({ min: 0, max: 99_999_999_999_999 })
  .map((n) => n.toString().padStart(14, "0"));

/** Contenido SQL arbitrario, posiblemente multilínea, posiblemente vacío. */
const contentsArbitrary = fc.string({ maxLength: 200 });

/**
 * Genera una lista de archivos de migración con timestamps únicos (para evitar
 * ambigüedad de orden entre timestamps iguales) y nombres de archivo válidos.
 */
const migrationFilesArbitrary = fc
  .uniqueArray(
    fc.record({
      timestamp: timestampArbitrary,
      name: fc
        .string({ minLength: 1, maxLength: 20 })
        .map((s) => s.replace(/[^A-Za-z0-9]/g, "") || "Migration"),
      contents: contentsArbitrary,
    }),
    {
      minLength: 0,
      maxLength: 20,
      selector: (item) => item.timestamp,
    },
  )
  .map((items) =>
    items.map<MigrationFile>((item) => ({
      filename: `${item.timestamp}_${item.name}.sql`,
      contents: item.contents,
    })),
  );

describe("concatenateMigrations", () => {
  describe("Property 3: La concatenación de migraciones preserva orden cronológico y contenido íntegro", () => {
    // Feature: migrate-supabase-vercel, Property 3
    // Validates: Requirements 6.5
    it("emits migrations in chronological timestamp order and preserves each migration's full contents, regardless of input order", () => {
      fc.assert(
        fc.property(migrationFilesArbitrary, (files) => {
          // Barajar el orden de entrada para comprobar que el resultado no
          // depende del orden en que se pasan los archivos.
          const shuffled = [...files].sort(() => Math.random() - 0.5);

          const output = concatenateMigrations(shuffled);

          const expectedOrder = [...files].sort((a, b) =>
            a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0,
          );

          // 1. Orden cronológico: la posición del comentario de cada migración
          //    en la salida respeta el orden de los timestamps.
          const markerPositions = expectedOrder.map((file) =>
            output.indexOf(`-- Migration: ${file.filename}`),
          );
          for (const pos of markerPositions) {
            expect(pos).toBeGreaterThanOrEqual(0);
          }
          const sortedPositions = [...markerPositions].sort((a, b) => a - b);
          expect(markerPositions).toEqual(sortedPositions);

          // 2. Contenido íntegro: el contenido de cada migración aparece
          //    completo e inmediatamente tras su comentario de migración.
          for (const file of files) {
            expect(output).toContain(
              `-- Migration: ${file.filename}\n${file.contents}`,
            );
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("unit cases", () => {
    // _Requirements: 6.5_
    it("returns an empty string for an empty list", () => {
      expect(concatenateMigrations([])).toBe("");
    });

    it("returns a single file's full contents (with its migration marker)", () => {
      const file: MigrationFile = {
        filename: "20250508083758_SetupTables.sql",
        contents: 'CREATE TABLE "user" ("id" text PRIMARY KEY);',
      };

      expect(concatenateMigrations([file])).toBe(
        `-- Migration: ${file.filename}\n${file.contents}`,
      );
    });

    it("orders two out-of-order migrations chronologically", () => {
      const older: MigrationFile = {
        filename: "20250508083758_First.sql",
        contents: "SELECT 1;",
      };
      const newer: MigrationFile = {
        filename: "20250522083748_Second.sql",
        contents: "SELECT 2;",
      };

      expect(concatenateMigrations([newer, older])).toBe(
        `-- Migration: ${older.filename}\n${older.contents}\n\n` +
          `-- Migration: ${newer.filename}\n${newer.contents}`,
      );
    });

    it("throws InvalidMigrationFilenameError for a filename without a timestamp prefix", () => {
      expect(() =>
        concatenateMigrations([
          { filename: "not-a-migration.sql", contents: "SELECT 1;" },
        ]),
      ).toThrow(InvalidMigrationFilenameError);
    });
  });
});
