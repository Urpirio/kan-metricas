# Documento de Diseño

## Overview

Este diseño cubre dos cambios de infraestructura relacionados pero independientes en el monorepo Kan:

1. **Migración de base de datos**: sustituir la instancia de PostgreSQL de Railway por una instancia de Supabase Postgres, manteniendo intacto el esquema y las migraciones de Drizzle ORM existentes en `packages/db`.
2. **Migración de despliegue del frontend**: desplegar `apps/web` en Vercel en lugar del pipeline actual basado en `apps/web/Dockerfile` + Railway/Docker Compose.

Ambos cambios se apoyan en la infraestructura de configuración ya existente en el proyecto (`POSTGRES_URL`, `.env.example`, `turbo.json`), por lo que el diseño se centra en:

- Cómo se resuelve la cadena de conexión y el modo SSL en `packages/db/src/client.ts` para que funcione tanto con Postgres estándar (self-hosted) como con Supabase.
- Cómo se distingue la conexión directa (para migraciones) de la conexión pooled (para runtime en funciones serverless de Vercel).
- Cómo se configura el proyecto de Vercel para construir `apps/web` dentro del monorepo pnpm/Turborepo.
- Qué variables de entorno nuevas se necesitan y cómo se documentan.

El Dockerfile, `docker-compose.yml` y `cloud/docker-compose.yml` existentes **no se eliminan**: siguen siendo la ruta de auto-hospedaje para otros usuarios del proyecto open-source. Este trabajo añade una ruta alternativa (Supabase + Vercel) sin romper la existente.

### Ampliación de alcance: Requisitos 6-10 (Supabase como backend integral)

Este diseño se amplía para cubrir cinco requisitos adicionales, más allá de la conexión a la base de datos y el despliegue del frontend:

- **Requisito 6**: generación y mantenimiento de un `Script_SQL_Esquema` (`packages/db/supabase/schema.sql`) para provisionar el esquema directamente en el editor SQL de Supabase.
- **Requisito 7**: introducción de un `Cliente_Supabase_JS` (`@supabase/supabase-js`) con variantes de servidor y navegador.
- **Requisito 8**: sustitución completa de Better Auth por Supabase_Auth, incluyendo proveedores OAuth, eliminación de usuarios, y la reconstrucción de dos capacidades hoy provistas por plugins de Better Auth (Clave_API y Enlace_Magico).
- **Requisito 9**: sustitución del almacenamiento S3 por Supabase_Storage para avatares y adjuntos de tarjetas.
- **Requisito 10**: decisión de diseño sobre el impacto de lo anterior en el auto-hospedaje existente (Docker Compose), resuelta explícitamente en la sección [Preguntas Abiertas y Decisiones de Diseño](#preguntas-abiertas-y-decisiones-de-diseño) de este documento, tal como exige el Requisito 10.2 antes de iniciar la implementación de los Requisitos 8 y 9.

Los Requisitos 8 y 9 son los cambios de mayor alcance: sustituyen dos subsistemas completos (`packages/auth` y `packages/shared/src/utils/s3.ts`) por sus equivalentes en Supabase, preservando en la medida de lo posible las firmas de función y los puntos de integración existentes (`packages/api/src/routers/*`, `packages/auth/src/hooks.ts`) para minimizar el radio de cambio.

## Research Summary

**Supabase connection pooling (Supavisor)**: Supabase expone dos formas de conexión ([Supabase Docs](https://supabase.com/docs/guides/database/connecting-to-postgres)):
- **Conexión directa** (puerto 5432, host `db.<project>.supabase.co`): sesión dedicada, apta para migraciones, `pg_dump`, herramientas administrativas. No apta para entornos serverless con muchas instancias concurrentes porque agota el límite de conexiones de Postgres.
- **Conexión pooled vía Supavisor** (host `aws-0-<region>.pooler.supabase.com`, puerto 6543 en modo transacción): comparte un pool reducido de conexiones reales entre muchos clientes lógicos. Es el modo recomendado para funciones serverless (Vercel). Desde el 28 de febrero de 2025, el puerto 6543 solo soporta modo transacción (el modo sesión se depreció en ese puerto); el puerto 5432 del pooler sigue soportando modo sesión ([GitHub Discussion #32755](https://github.com/orgs/supabase/discussions/32755)).
- El modo transacción de Supavisor no soporta bien `PREPARE`/locks de sesión avanzados usados por algunas herramientas de migración corriendo por el pooler ([reporte en Stack Overflow sobre Prisma con puerto 6543](https://stackoverflow.com/questions/79888371)). Por eso las migraciones deben ejecutarse contra la conexión directa, no la pooled.

**SSL con `pg`/node-postgres**: Supabase permite conectar sin SSL para máxima compatibilidad, pero soporta forzar SSL ([Supabase SSL Enforcement docs](https://supabase.com/docs/guides/platform/ssl-enforcement)). `node-postgres` acepta un objeto `ssl` en la configuración del `Pool`, pero ese objeto es ignorado si la cadena de conexión ya incluye el parámetro `sslmode` ([node-postgres SSL docs](https://node-postgres.com/features/ssl)). Para evitar ese conflicto, el diseño detecta si la URL ya contiene `sslmode` y, si no, decide el valor de `ssl` explícitamente según el host.

**Vercel + monorepo pnpm/Turborepo**: Vercel soporta desplegar un sub-paquete de un monorepo configurando el "Root Directory" del proyecto a `apps/web`, e infiere automáticamente el comando de build usando Turborepo ([Vercel Turborepo docs](https://vercel.com/docs/monorepos/turborepo), [Vercel Monorepos docs](https://vercel.com/docs/concepts/git/monorepos)). Vercel usa su propio empaquetado de Next.js (no necesita `output: "standalone"`, que es específico para el `Dockerfile`). Las variables de entorno que afectan el build (como `NEXT_PUBLIC_*`) deben declararse explícitamente si Turborepo no las detecta automáticamente.

**`apps/web` usa el Pages Router, no el App Router**: se verificó `apps/web/src/pages/` (contiene `_app.tsx`, `[workspaceSlug]/`, `invite/[code].tsx`, `login/`, `signup/`, etc.), no un directorio `app/`. Esto es relevante porque la mayoría de la documentación oficial de `@supabase/ssr` está escrita para App Router ([Supabase SSR docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client)). `@supabase/ssr` también soporta Pages Router mediante `createPagesServerClient`/manejo manual de cookies en `getServerSideProps` y en handlers de `pages/api/*`; el diseño de este documento asume el patrón de Pages Router (lectura/escritura de cookies vía el objeto `req`/`res` de Next.js), no el patrón de Server Components de App Router.

**Supabase Storage: signed URLs**: `createSignedUploadUrl(path, { expiresIn })` genera una URL de carga firmada de un solo uso; `createSignedUrl(path, expiresIn)` genera una URL de descarga firmada; ambas aceptan `expiresIn` en segundos ([Supabase Storage signed URL docs](https://supabase.com/docs/reference/python/storage-from-createsignedurl), aplicable de forma equivalente al cliente JS). El diseño acota estos valores del lado del servidor (60s para carga, 3600s para descarga) en lugar de confiar en que el llamador siempre pase un valor correcto, igual que hace hoy `generateUploadUrl`/`generateDownloadUrl` con el parámetro `expiresIn` de `getSignedUrl` de AWS.

**Supabase Auth: OTP / magic link**: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` envía un correo con un enlace que, al abrirse, autentica al usuario y lo redirige a `emailRedirectTo` con los parámetros de sesión en el fragmento/query de la URL ([Supabase Auth docs](https://supabase.com/docs/guides/auth)). Esto es funcionalmente equivalente al `magicLink` de Better Auth: se puede usar `emailRedirectTo` para llevar metadatos propios de la aplicación (por ejemplo `memberPublicId`) del mismo modo que hoy se usa `callbackURL` en `packages/api/src/routers/member.ts`.

## Architecture

```mermaid
graph TB
    subgraph "Antes (Railway)"
        A1[apps/web Docker image] -->|POSTGRES_URL directo| A2[(Postgres en Railway)]
        A3[migrator container] -->|drizzle-kit migrate| A2
    end

    subgraph "Después (Supabase + Vercel)"
        B1[apps/web en Vercel<br/>Serverless Functions] -->|POSTGRES_URL<br/>Conexion_Pooled :6543| B2[Supavisor Pooler]
        B2 --> B3[(Supabase Postgres)]
        B4[Ejecutor_De_Migraciones<br/>pnpm db:migrate] -->|POSTGRES_URL_NON_POOLING<br/>Conexion_Directa :5432| B3
    end
```

```mermaid
sequenceDiagram
    participant Dev as Desarrollador
    participant CI as CI / Local
    participant Direct as Supabase (5432, directo)
    participant Vercel as Vercel Build/Deploy
    participant Pooled as Supabase Pooler (6543)

    Dev->>CI: pnpm db:migrate (usa POSTGRES_URL_NON_POOLING)
    CI->>Direct: drizzle-kit migrate
    Direct-->>CI: OK (tablas creadas/actualizadas)

    Dev->>Vercel: git push a rama de producción
    Vercel->>Vercel: pnpm install && turbo build --filter=@kan/web
    Vercel->>Vercel: Deploy Serverless Functions
    Vercel->>Pooled: runtime queries usando POSTGRES_URL (pooled)
    Pooled-->>Vercel: resultados de consultas
```

```mermaid
graph TB
    subgraph "Cliente_Supabase_JS"
        SC1[createSupabaseServerClient<br/>SUPABASE_SERVICE_ROLE_KEY]
        SC2[createSupabaseBrowserClient<br/>NEXT_PUBLIC_SUPABASE_ANON_KEY]
    end

    subgraph "Supabase_Auth"
        AU1[Email/Password]
        AU2[Proveedores OAuth]
        AU3[OTP / Magic Link]
        AU4[Admin API: deleteUser]
    end

    subgraph "Supabase_Storage"
        ST1[Bucket avatares]
        ST2[Bucket adjuntos]
    end

    subgraph "packages/db (sin cambios de motor)"
        DB1[(Postgres / Supabase)]
        DB2[tabla apiKeys nueva]
    end

    Web[apps/web tRPC procedures] --> SC1
    Browser[apps/web client components] --> SC2
    SC1 --> AU1
    SC1 --> AU2
    SC1 --> AU3
    SC1 --> AU4
    SC1 --> ST1
    SC1 --> ST2
    Web --> DB1
    Web --> DB2
    ApiKeyMw[tRPC middleware Clave_API] --> DB2
```

## Components and Interfaces

### 1. `packages/db/src/client.ts` (modificado)

Responsable de crear el cliente Drizzle/`pg`. Se introduce una función pura de resolución de configuración, separada de la creación del `Pool`, para que sea testeable de forma aislada:

```ts
export interface ResolvedDbConfig {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
}

/**
 * Resuelve la configuración de conexión (cadena + modo SSL) a partir de las
 * variables de entorno. No crea ningún recurso de red.
 */
export function resolveDbConfig(env: {
  POSTGRES_URL?: string;
  NODE_ENV?: string;
}): ResolvedDbConfig | null;
```

Reglas de `resolveDbConfig`:
- Si `POSTGRES_URL` no está definida:
  - y `NODE_ENV === "production"` → lanza un error descriptivo (Requisito 1.4).
  - en cualquier otro caso → retorna `null` (el llamador cae a PGLite, comportamiento actual).
- Si `POSTGRES_URL` está definida:
  - Si la URL ya contiene el parámetro `sslmode`, `ssl` se deja en `false` a nivel de objeto de configuración de `pg` (para no pisar el `sslmode` de la cadena, según el comportamiento documentado de `node-postgres`).
  - Si la URL no contiene `sslmode` y el host no es `localhost`/`127.0.0.1`/un host de la red interna de Docker Compose (`postgres`), se activa `ssl: { rejectUnauthorized: false }` — esto cubre Supabase y otros proveedores administrados sin exigir que el operador añada `sslmode` manualmente.
  - Si el host es `localhost`, `127.0.0.1` o `postgres` (nombre del servicio en `docker-compose.yml`), `ssl` permanece en `false`.

`createDrizzleClient` pasa a usar `resolveDbConfig(process.env)` y registra (`@kan/logger`) un error descriptivo si la conexión falla al primer query de verificación (Requisito 1.3), en lugar de solo fallar silenciosamente en el primer uso.

### 2. Variable de entorno `POSTGRES_URL_NON_POOLING` (nueva)

- Usada exclusivamente por el Ejecutor_De_Migraciones (`packages/db/package.json` script `migrate`, y `drizzle.config.ts`).
- Si no está definida, el Ejecutor_De_Migraciones cae de vuelta a `POSTGRES_URL` (comportamiento actual, compatible con self-hosting donde solo existe una URL).
- `drizzle.config.ts` se actualiza para usar `process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL`.

### 3. `apps/web` en Vercel

- Se añade un archivo `apps/web/vercel.json` (o configuración equivalente en el dashboard de Vercel) que:
  - No fuerza `NEXT_PUBLIC_USE_STANDALONE_OUTPUT=true` (a diferencia del `Dockerfile`), dejando que Vercel use su propio empaquetado de Next.js.
  - Declara el comando de instalación (`pnpm install --frozen-lockfile` desde la raíz del monorepo) y el comando de build (`turbo run build --filter=@kan/web`).
- Root Directory del proyecto de Vercel: `apps/web`.
- No se modifica `apps/web/Dockerfile`, `docker-compose.yml` ni `cloud/docker-compose.yml` — siguen usándose para self-hosting.

### 4. Documentación

- `.env.example`: se añade `POSTGRES_URL_NON_POOLING` con comentario explicativo.
- `turbo.json`: se añade `POSTGRES_URL_NON_POOLING` a `globalEnv`.
- `README.md`: se añade una fila a la tabla de variables de entorno.
- Se añade una guía breve (`apps/docs/guides/self-hosting/` o similar, o una sección nueva) explicando el flujo Supabase + Vercel, incluyendo cómo obtener ambas cadenas de conexión desde el dashboard de Supabase.

### 5. `packages/db/supabase/schema.sql` (nuevo) — Script_SQL_Esquema

Artefacto SQL generado, pensado para pegarse en el editor SQL de Supabase y provisionar el esquema completo (tablas de `auth`, `boards`, `cards`, `checklists`, `feedback`, `imports`, `integrations`, `labels`, `lists`, `notifications`, `permissions`, `subscriptions`, `users`, `webhooks`, `workspaceInviteLinks`, `workspaces`, más la nueva tabla `apiKeys` del Requisito 8) sin depender del Ejecutor_De_Migraciones.

**Enfoque de generación** (Requisito 6.1-6.3): se descartan dos alternativas antes de elegir la definitiva:
- *Introspección de `drizzle-kit`*: `drizzle-kit` no tiene un comando estable para volcar SQL DDL puro de todas las migraciones aplicadas en un único archivo (su función es generar migraciones incrementales, no un snapshot).
- *`pg_dump --schema-only` contra una base de datos recién migrada*: produce un SQL válido pero incluye ruido específico de la instancia (comentarios `SET`, `OWNER TO`, extensiones específicas del proveedor) que no es idempotente entre entornos y requiere post-procesamiento manual.

**Enfoque elegido**: un script de concatenación de migraciones (`packages/db/scripts/generate-schema-sql.ts`, invocado como `pnpm db:generate-schema-sql`) que:
1. Lee todos los archivos `packages/db/migrations/*.sql` (excluyendo el directorio `meta/`).
2. Los ordena por su prefijo de timestamp (formato `YYYYMMDDHHmmss_Nombre.sql`, ya usado por `drizzle.config.ts` con `migrations.prefix: "timestamp"`).
3. Concatena su contenido en ese orden, separando cada migración con un comentario `-- Migration: <nombre de archivo>` para trazabilidad.
4. Escribe el resultado en `packages/db/supabase/schema.sql`.

Esto garantiza por construcción (Requisito 6.3) que el SQL resultante define exactamente las mismas tablas, columnas, tipos, claves, restricciones e índices que el Ejecutor_De_Migraciones aplicaría, porque es literalmente el mismo SQL en el mismo orden — sin reintroducir una segunda fuente de verdad del esquema.

```ts
export function concatenateMigrations(
  files: { filename: string; contents: string }[],
): string;
```

Esta es la función pura descrita en la Propiedad 3 más abajo: dado un conjunto de archivos de migración (nombre + contenido), produce un único texto donde el orden de aparición respeta el orden cronológico de los timestamps de los nombres de archivo, y el contenido de cada migración aparece íntegro.

**Mantenimiento (Requisito 6.5)**: cada vez que se genera una nueva migración con `drizzle-kit generate`, se documenta como paso obligatorio del flujo de "Adding a New Environment Variable"/"Database Changes" (ver `AGENTS.md`) ejecutar `pnpm db:generate-schema-sql` antes de hacer commit, y se añade una verificación de CI (fuera de alcance de este documento de diseño, mencionada como recomendación) que falle si `schema.sql` está desactualizado respecto a `packages/db/migrations/`.

### 6. Cliente_Supabase_JS (`packages/shared/src/utils/supabase.ts`, nuevo)

Se añade `@supabase/supabase-js` como dependencia de `packages/shared` (paquete ya usado hoy por `s3.ts`, `packages/auth`, y varios routers de `packages/api`), siguiendo el mismo patrón de "utilidad exportada desde `packages/shared/src/utils`" usado por `s3.ts`.

```ts
export interface ResolvedSupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}

export interface ResolvedSupabaseBrowserConfig {
  url: string;
  anonKey: string;
}

/** Función pura: no crea ningún cliente, solo valida/resuelve config. */
export function resolveSupabaseServerConfig(env: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): ResolvedSupabaseServerConfig | null;

export function resolveSupabaseBrowserConfig(env: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}): ResolvedSupabaseBrowserConfig | null;

/** Usa SUPABASE_SERVICE_ROLE_KEY. Solo debe importarse desde código de servidor
 *  (procedimientos de tRPC, hooks de packages/auth, scripts). */
export function createSupabaseServerClient(): SupabaseClient;

/** Usa NEXT_PUBLIC_SUPABASE_ANON_KEY. Seguro de importar en código de navegador. */
export function createSupabaseBrowserClient(): SupabaseClient;
```

Reglas (Requisito 7.2-7.6), simétricas a `resolveDbConfig`:
- `resolveSupabaseServerConfig`/`resolveSupabaseBrowserConfig` retornan `null` si falta cualquiera de las variables requeridas para ese contexto, y registran (`@kan/logger`) un error descriptivo indicando qué variable falta.
- `createSupabaseServerClient`/`createSupabaseBrowserClient` lanzan un error (en lugar de retornar un cliente parcialmente inicializado) cuando la función de resolución correspondiente retorna `null`; no existe una ruta donde el llamador reciba un `SupabaseClient` construido con una config incompleta.
- `resolveSupabaseServerConfig` nunca es importado por código empaquetado para el navegador: se aplica la misma convención ya usada en el proyecto de sufijar utilidades server-only y de no reexportarlas desde el punto de entrada `"."` de `packages/shared` usado por componentes de cliente (revisar `packages/shared/package.json` al implementar para mantener `SUPABASE_SERVICE_ROLE_KEY` fuera del bundle del navegador, análogo a como hoy `S3_SECRET_ACCESS_KEY` solo se lee desde utilidades usadas en servidor).

Para la integración con el Pages Router de `apps/web` (necesaria para leer la sesión de Supabase Auth en `getServerSideProps` y en el contexto de tRPC), se usa `@supabase/ssr`, que soporta pasar un adaptador de cookies compatible con el objeto `req`/`res` de Next.js Pages Router. Esta pieza es infraestructura de sesión (Requisito 8.4) y se documenta en el componente 7 más abajo.

### 7. Sustitución de `packages/auth` (Better Auth → Supabase_Auth)

Cambios en los archivos existentes de `packages/auth/src`:

- **`auth.ts`**: se elimina la llamada a `betterAuth(...)`. En su lugar, `packages/auth` exporta funciones delgadas que envuelven al `Cliente_Supabase_JS`:
  - `signUpWithPassword({ email, password })`, `signInWithPassword({ email, password })`, `resetPasswordForEmail(email)`, `signOut()`: delegan directamente a `supabase.auth.signUp`/`signInWithPassword`/`resetPasswordForEmail`/`signOut` del cliente de servidor.
  - `getSession(req, res)`: usa `@supabase/ssr` para leer la sesión desde las cookies de la petición, reemplazando los usos actuales de `auth.api.getSession` en el contexto de tRPC.
  - La configuración de duración de sesión (`session.expiresIn` = 30 días, `session.updateAge` = 48 horas) se traslada a la configuración del proyecto de Supabase Auth (JWT expiry / refresh token reuse interval en el dashboard de Supabase), documentada en la guía de despliegue como paso de configuración manual — Supabase_Auth no expone estos valores como parámetros del SDK cliente.
- **`providers.ts`**: se elimina `socialProvidersPlugin`/`configuredProviders` basado en `better-auth/social-providers`. Se añade una función pura `getSupportedOAuthProviders(configuredEnvProviders: string[]): string[]` que filtra la lista de proveedores configurados (aquellos con client id/secret no vacíos en `.env`) excluyendo los cinco sin soporte nativo en Supabase Auth (`kick`, `dropbox`, `vk`, `reddit`, `roblox`). La configuración real de client id/secret por proveedor se realiza en el dashboard de Supabase (o vía la Management API de Supabase, fuera de alcance de este código); esta función solo determina qué botones de inicio de sesión social mostrar en la UI de `apps/web`. El plugin `genericOAuth` (OIDC genérico) se elimina sin reemplazo, según lo decidido en el Requisito 8.6 y el Glosario.
- **`hooks.ts`**: la lógica de `user.create.before` (restricción de `NEXT_PUBLIC_DISABLE_SIGN_UP` + invitación pendiente, y `BETTER_AUTH_ALLOWED_DOMAINS`) se extrae a una función pura reutilizable:

  ```ts
  export function isSignUpAllowed(input: {
    email: string;
    disableSignUp: boolean;
    hasPendingInvitation: boolean;
    allowedDomains: string[]; // vacío = sin restricción
  }): boolean;
  ```

  Esta función se invoca **antes** de llamar a `supabase.auth.signUp`, dentro del procedimiento de tRPC/handler de registro de `apps/web`; si retorna `false`, se rechaza la solicitud con un mensaje de error sin invocar a Supabase Auth (Requisitos 8.7, 8.13). La lógica de subida de avatar en `user.create.after` (descarga de imagen del proveedor OAuth + subida) se mantiene con la misma estructura, sustituyendo `createS3Client`/`PutObjectCommand` por `createSupabaseServerClient().storage.from(bucket).upload(...)` (Requisito 8.8), invocada desde un callback post-registro equivalente (implementado como parte del flujo de `signUpWithPassword`/callback de OAuth en lugar de un hook de Better Auth, ya que Supabase Auth no expone hooks `databaseHooks` equivalentes del lado del cliente/servidor de la aplicación).
- **`plugins.ts`**: se elimina por completo. El bloque `stripe(...)` se borra sin reemplazo (Requisito 8.14, fuera de alcance explícito). El plugin `apiKey` y el plugin `magicLink` se reconstruyen como código propio, no como plugins de Better Auth (ver componentes 8 y 9 más abajo). El bloque `genericOAuth` se elimina (ver arriba).

**Eliminación de usuario como operación de dos fases (Requisito 8.3, 8.12)**: dado que la eliminación de un usuario en Supabase Auth (`supabase.auth.admin.deleteUser(userId)`) y la eliminación/anonimización de sus registros en `packages/db` son dos sistemas de persistencia distintos, no existe una transacción nativa que abarque ambos. El diseño define un procedimiento de **dos fases con orden fijo y sin aplicar cambios parciales visibles**:

1. Ejecutar la eliminación de los registros de `packages/db` dentro de una transacción de Postgres (`db.transaction(...)`), pero **sin hacer commit todavía** — Drizzle no soporta "preparar" una transacción y confirmarla en un paso separado con un callback async intermedio, así que en la práctica esto se implementa como: ejecutar todos los `DELETE`/anonimizaciones necesarios y, como último paso *dentro* del callback de la transacción, invocar `supabase.auth.admin.deleteUser(userId)`. Si esa llamada lanza, se relanza el error dentro del callback de la transacción, lo que provoca el `ROLLBACK` automático de todos los cambios de `packages/db` hechos hasta ese punto.
2. Si `supabase.auth.admin.deleteUser` tiene éxito, la transacción de `packages/db` hace `COMMIT` de forma normal al retornar el callback sin error.
3. Si la transacción de `packages/db` falla por una razón *propia* (no relacionada con Supabase Auth) antes de llegar al paso de eliminación en Supabase Auth, dicha llamada nunca se ejecuta, y el usuario permanece intacto en ambos sistemas.

Este orden (DB primero, Supabase Auth al final, dentro del mismo callback transaccional) garantiza que el único estado final observable es "ambos eliminados" o "ninguno eliminado": nunca queda un usuario eliminado en Supabase Auth con registros huérfanos en `packages/db` (que sería el caso peligroso, dado que estos registros referencian `userId`), y nunca queda una eliminación de DB confirmada con el usuario de Auth aún activo. El único caso residual no cubierto por esta garantía es un fallo de red/proceso *después* de que Supabase Auth confirme la eliminación pero *antes* de que el `COMMIT` de Postgres se confirme localmente (ventana muy pequeña, inherente a cualquier operación de dos sistemas); se documenta como limitación conocida y best-effort, no como atomicidad estricta, tal como anticipa el Requisito 8.3 al pedir "como una operación atómica" sobre dos sistemas independientes.

### 8. Reconstrucción de Clave_API (`packages/db/src/schema/apiKeys.ts`, nuevo)

Nueva tabla Drizzle, reemplazando la dependencia del plugin `apiKey` de Better Auth (que usaba la tabla `apikey` de `packages/db/src/schema/auth.ts`, la cual se elimina junto con las demás tablas de Better Auth — ver pregunta abierta sobre migración de datos):

```ts
export const apiKeys = pgTable("apiKeys", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  publicId: varchar("publicId", { length: 12 }).notNull().unique(),
  name: text("name"),
  keyHash: text("keyHash").notNull().unique(), // SHA-256 hex del secreto, nunca el texto plano
  keyPrefix: text("keyPrefix").notNull(), // primeros caracteres, solo para UI ("kan_ab12...")
  userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  rateLimitMax: integer("rateLimitMax").notNull().default(100),
  rateLimitWindowMs: integer("rateLimitWindowMs").notNull().default(60_000),
  revokedAt: timestamp("revokedAt"),
  expiresAt: timestamp("expiresAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}).enableRLS();
```

Al generar una Clave_API se produce un secreto aleatorio (por ejemplo `kan_` + 32 bytes aleatorios en base62), se muestra una única vez al usuario, y solo se persiste `sha256(secreto)` en `keyHash` — nunca el texto plano, siguiendo la práctica estándar de tokens de API.

**Validación (middleware/procedimiento de tRPC)**: se añade una función pura de validación, independiente de la capa HTTP para poder testearla con PBT:

```ts
export function extractApiKeyFromHeaders(headers: {
  authorization?: string;
  "x-api-key"?: string;
}): string | null;

export function hashApiKey(plaintext: string): string; // sha256 hex

export function findMatchingApiKey(
  hash: string,
  storedKeys: { keyHash: string; userId: string; revokedAt: Date | null; expiresAt: Date | null }[],
  now: Date,
): { userId: string } | null;
```

`extractApiKeyFromHeaders` replica la lógica actual de `customAPIKeyGetter` (prioriza `Authorization: Bearer <clave>`, luego `x-api-key`). El middleware de tRPC llama `hashApiKey` sobre el valor extraído y busca coincidencia en `packages/db` (consulta por `keyHash`, no un escaneo de `findMatchingApiKey` sobre todas las claves — la firma de `findMatchingApiKey` de arriba es la forma testeable en memoria de esa misma regla, útil para la property de abajo). Una clave coincide si y solo si su hash coincide exactamente, `revokedAt` es `null`, y (`expiresAt` es `null` o es posterior a `now`).

**Rate limiting (Requisito 8.16)**: se reutiliza `packages/db/src/redis.ts` (`getRedisClient`), aplicando un contador de ventana deslizante por `publicId` de la Clave_API (por ejemplo `INCR`/`EXPIRE` sobre una clave Redis `apikey:ratelimit:<publicId>:<minuto actual>`, o un sorted set con timestamps si se requiere una ventana deslizante exacta en lugar de ventanas fijas de 60s). Si Redis no está configurado (`REDIS_URL` ausente), se cae a un contador en memoria por proceso, igual que hace hoy el rate limiting existente del proyecto quado Redis no está disponible.

### 9. Reconstrucción de Enlace_Magico (invitaciones y login sin contraseña)

- **Login sin contraseña**: se reemplaza la llamada a `auth.api.signInMagicLink` por `createSupabaseServerClient().auth.signInWithOtp({ email, options: { emailRedirectTo: \`${baseUrl}/auth/callback\` } })`, invocada desde el mismo punto de entrada de tRPC/handler que hoy expone el login sin contraseña.
- **Invitaciones a espacio de trabajo** (`packages/api/src/routers/member.ts`): el mismo mecanismo de OTP se usa para invitaciones, pasando `emailRedirectTo: \`${baseUrl}/auth/callback?type=invite&memberPublicId=${invite.publicId}\`` en lugar de construir un `callbackURL` de Better Auth.
- **Ruta de callback nueva** (`apps/web/src/pages/auth/callback.tsx` o equivalente en `pages/api/auth/callback.ts` si se prefiere un handler puro sin UI): lee `type` y `memberPublicId` de los query params una vez Supabase Auth completa el intercambio de sesión, y si `type=invite`, invoca la misma lógica hoy presente en `createMiddlewareHooks` de `packages/auth/src/hooks.ts` (`memberRepo.getByPublicId` + `memberRepo.acceptInvite`).
- Se extrae la lógica de decisión a una función pura para poder testearla sin URLs reales ni sesión real:

  ```ts
  export function parseInviteCallbackParams(query: {
    type?: string;
    memberPublicId?: string;
  }): { memberPublicId: string } | null;

  export async function completeInvite(
    memberPublicId: string,
    userId: string,
    memberLookup: (publicId: string) => Promise<{ id: number; status: string } | null>,
    acceptInvite: (memberId: number, userId: string) => Promise<void>,
  ): Promise<{ success: true } | { success: false; reason: "invite_not_found" | "invite_already_completed" }>;
  ```

  `completeInvite` rechaza (Requisito 8.20) cuando `memberLookup` retorna `null` (invitación inexistente) o cuando el `status` del miembro ya no es `"invited"` (ya fue completada), presentando el mensaje de error correspondiente en la UI de callback en lugar de completar silenciosamente.

### 10. Sustitución de S3 por Supabase_Storage (`packages/shared/src/utils/storage.ts`, reemplaza `s3.ts`)

Se preservan las firmas de función existentes para minimizar cambios en los llamadores (`packages/api/src/routers/attachment.ts`, `packages/auth/src/hooks.ts`, `packages/api/src/routers/health.ts`):

```ts
export async function generateUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn?: number,
): Promise<string>; // usa supabase.storage.from(bucket).createSignedUploadUrl(key), expiresIn acotado a 60s máx

export async function generateDownloadUrl(
  bucket: string,
  key: string,
  expiresIn?: number,
): Promise<string>; // usa supabase.storage.from(bucket).createSignedUrl(key, expiresIn), acotado a 3600s máx

export async function deleteObject(bucket: string, key: string): Promise<void>;
// usa supabase.storage.from(bucket).remove([key])

export async function generateAvatarUrl(
  imageKey: string | null | undefined,
  expiresIn?: number,
): Promise<string | null>;

export async function generateAttachmentUrl(
  attachmentKey: string | null | undefined,
  expiresIn?: number,
): Promise<string | null>;
```

Se introduce una función pura de acotamiento de expiración, compartida por `generateUploadUrl` y `generateDownloadUrl`:

```ts
export function clampExpiresIn(
  requested: number | undefined,
  operation: "upload" | "download",
): number; // upload → min(max(requested ?? default, 1), 60); download → min(max(requested ?? default, 1), 3600)
```

**Validación de carga (Requisito 9.8)**: hoy `packages/api/src/routers/attachment.ts` valida `size` (máx. 50MB) y no valida `contentType` más allá del esquema Zod de tipo `string()`. Se añade una función pura de validación server-side, invocada antes de llamar a `generateUploadUrl`, para no depender únicamente de la validación de esquema Zod (que valida forma, no reglas de negocio como "tipo de contenido permitido"):

```ts
export function validateUploadRequest(
  input: { size: number; contentType: string },
  limits: { maxSizeBytes: number; allowedContentTypes: string[] },
): { valid: true } | { valid: false; reason: string };
```

**Fallo de eliminación no bloqueante (Requisito 9.9)**: `packages/api/src/routers/attachment.ts` ya envuelve `deleteObject` en un `try/catch` que solo hace `console.error` y continúa con el soft-delete; se cambia el `console.error` por `@kan/logger` (`log.error`) para cumplir con la convención del proyecto, preservando el comportamiento de no bloquear el soft-delete cuando falla la eliminación remota.

**Health check (Requisito 9.7)**: `checkS3Connection` en `packages/api/src/routers/health.ts` se reemplaza por `checkSupabaseStorageConnection`, que verifica configuración (`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` presentes) y luego intenta `supabase.storage.getBucket(avatarBucket)`/`getBucket(attachmentsBucket)`, preservando el mismo mapeo a tres estados (`ok`/`error`/`not_configured`) que ya implementa `healthRouter.health`.

## Data Models

No se introducen nuevas entidades de dominio de negocio (cards, boards, etc.) ni cambios de esquema para los Requisitos 1-5. El esquema de Drizzle en `packages/db/src/schema/` y las migraciones existentes en `packages/db/migrations/` se aplican sin modificaciones contra Supabase.

Para los Requisitos 6-9 se introducen los siguientes tipos y una tabla nueva:

- `ResolvedDbConfig` (existente, sin cambios) — usado solo dentro de `packages/db/src/client.ts`.
- `ResolvedSupabaseServerConfig` / `ResolvedSupabaseBrowserConfig` — usados solo dentro de `packages/shared/src/utils/supabase.ts`.
- Tabla Drizzle `apiKeys` (`packages/db/src/schema/apiKeys.ts`, descrita en el componente 8) — reemplaza el uso de la tabla `apikey` de Better Auth.
- Las tablas `session`, `account`, `verification` y `apikey` de `packages/db/src/schema/auth.ts` (actuales, de Better Auth) quedan obsoletas tras completar la migración a Supabase_Auth. Este diseño **no** elimina dichas tablas ni genera la migración de borrado como parte de este documento: su eliminación depende de resolver primero la pregunta abierta sobre migración de usuarios/sesiones existentes (ver [Preguntas Abiertas](#preguntas-abiertas-y-decisiones-de-diseño)), para evitar perder datos de producción antes de que exista un plan de migración explícito.

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas de un sistema; es básicamente una afirmación formal sobre lo que el sistema debe hacer. Las propiedades sirven de puente entre especificaciones legibles por humanos y garantías de corrección verificables por máquina.*

La mayor parte de este feature es configuración de infraestructura (proyecto de Vercel, variables de entorno, Docker Compose), lo cual no es apto para property-based testing (ver criterios 2.1, 3.1–3.4, 4.1–4.4, 5.1–5.4, 6.1–6.3, 7.1, clasificados como no testables automáticamente o como configuración/documentación). Sin embargo, la función `resolveDbConfig` y la lógica de resolución de la URL de migraciones son lógica pura con comportamiento que varía según el input (distintas cadenas de conexión, distintos hosts, presencia/ausencia de `NODE_ENV`, presencia/ausencia de `POSTGRES_URL_NON_POOLING`), por lo que sí son aptas para PBT.

**Reflexión sobre redundancia**: los criterios 1.1 (usar `POSTGRES_URL`), 1.2 (activar SSL para hosts remotos como Supabase), 1.4 (rechazar arranque sin `POSTGRES_URL` en producción) y 7.2 (misma interfaz para Postgres estándar y Supabase) describen todos el mismo comportamiento de la misma función pura `resolveDbConfig` vista desde distintos ángulos de sus ramas internas. Se combinan en la Propiedad 1, que cubre las cuatro ramas mediante una única propiedad universalmente cuantificada sobre el espacio de entradas (URL, host, `NODE_ENV`). Los criterios 2.2 y 2.3 describen el mismo comportamiento de fallback entre `POSTGRES_URL_NON_POOLING` y `POSTGRES_URL`, y se combinan en la Propiedad 2.

### Property 1: Resolución de configuración de base de datos es coherente con el host y el entorno

*Para cualquier* combinación de `POSTGRES_URL` (ausente, o una URL válida con host local/docker conocido, o una URL válida con host remoto arbitrario y opcionalmente con `sslmode` ya presente) y `NODE_ENV` (`production` o cualquier otro valor), `resolveDbConfig` SHALL:
- retornar `null` si `POSTGRES_URL` está ausente y `NODE_ENV` no es `production`;
- lanzar un error si `POSTGRES_URL` está ausente y `NODE_ENV` es `production`;
- en cualquier otro caso, retornar un `ResolvedDbConfig` cuyo `connectionString` sea exactamente igual a `POSTGRES_URL`, y cuyo campo `ssl` sea `false` si el host es `localhost`, `127.0.0.1`, `postgres`, o si la URL ya contiene `sslmode`, y sea un objeto `{ rejectUnauthorized: false }` en cualquier otro host.

**Validates: Requirements 1.1, 1.2, 1.4, 7.2, 10.5**

### Property 2: La URL de migración prioriza la conexión directa sobre la pooled

*Para cualquier* combinación de `POSTGRES_URL_NON_POOLING` y `POSTGRES_URL` (cada una presente o ausente, con valores de cadena arbitrarios no vacíos cuando están presentes), la función que resuelve la URL usada por el Ejecutor_De_Migraciones SHALL retornar el valor de `POSTGRES_URL_NON_POOLING` cuando esté presente, y SHALL retornar el valor de `POSTGRES_URL` cuando `POSTGRES_URL_NON_POOLING` esté ausente.

**Validates: Requirements 2.2, 2.3**

**Reflexión sobre redundancia (Requisitos 6-9)**: los criterios 7.2, 7.3, 7.4, 7.5 y 7.6 describen el mismo par de funciones puras de resolución de configuración (servidor vs. navegador) vistas desde distintas ramas de sus entradas; se combinan en la Propiedad 4. Los criterios 8.3 y 8.12 describen la misma lógica de compensación de eliminación de usuario vista desde sus ramas de éxito y de fallo; se combinan en la Propiedad 5. Los criterios 8.7 y 8.13 describen el mismo predicado de autorización de registro visto desde sus ramas de permitir/rechazar; se combinan en la Propiedad 7. Los criterios 8.15 y 8.17 describen la misma función de validación de Clave_API vista desde sus ramas válida/invalida; se combinan en la Propiedad 8. Los criterios 8.19 y 8.20 describen la misma lógica de finalización de invitación vista desde sus ramas de éxito y de invitación obsoleta; se combinan en la Propiedad 10. Los criterios 9.3 y 9.4 describen la misma lógica de acotamiento de expiración, parametrizada por tipo de operación; se combinan en la Propiedad 11. El criterio 10.5 describe el mismo comportamiento que la Propiedad 1 ya existente (por eso se añadió como referencia adicional en dicha propiedad, sin crear una propiedad nueva). Los criterios 6.1, 6.2 y 6.3 no son aptos para PBT (requieren una instancia real de Postgres para verificar equivalencia de esquema) y se cubren como tests de integración en la sección de Testing Strategy.

### Property 3: La concatenación de migraciones preserva orden cronológico y contenido íntegro

*Para cualquier* conjunto de archivos de migración con nombres de la forma `<timestamp>_<Nombre>.sql` (timestamps arbitrarios no necesariamente en orden de entrada, contenido SQL arbitrario no vacío), la función `concatenateMigrations` SHALL producir un texto único en el que (a) el contenido de cada archivo aparece antes que el contenido de todo archivo con un timestamp mayor, y (b) el contenido de cada archivo aparece íntegro y sin alteraciones en la salida.

**Validates: Requirements 6.5**

### Property 4: La resolución de configuración de Supabase respeta el aislamiento servidor/navegador

*Para cualquier* combinación de presencia/ausencia de `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, `resolveSupabaseServerConfig` SHALL retornar un objeto no nulo si y solo si `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` están ambas presentes, y `resolveSupabaseBrowserConfig` SHALL retornar un objeto no nulo si y solo si `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están ambas presentes; en cualquier caso donde falte una variable requerida para el contexto correspondiente, la función SHALL invocar el logger de error exactamente una vez y SHALL retornar `null` en lugar de un objeto de configuración parcial; y el objeto retornado por `resolveSupabaseBrowserConfig` nunca SHALL contener el valor de `SUPABASE_SERVICE_ROLE_KEY`, sin importar los valores de entrada.

**Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6**

### Property 5: La eliminación de usuario nunca deja un estado parcial entre Supabase_Auth y packages/db

*Para cualquier* secuencia de resultados simulados (éxito o fallo, y en qué paso ocurre el fallo) para la eliminación de registros en `packages/db` y para la llamada `supabase.auth.admin.deleteUser`, el procedimiento de eliminación de cuenta SHALL alcanzar exactamente uno de dos estados finales observables: ambos sistemas reflejan al usuario como eliminado, o ambos sistemas conservan al usuario intacto; nunca un estado donde uno de los dos sistemas eliminó al usuario y el otro lo conserva.

**Validates: Requirements 8.3, 8.12**

### Property 6: El filtrado de proveedores OAuth excluye siempre a los proveedores sin soporte nativo

*Para cualquier* subconjunto arbitrario de identificadores de Proveedor_OAuth configurados (incluyendo cualquier combinación de proveedores soportados y no soportados), `getSupportedOAuthProviders` SHALL retornar un subconjunto que nunca contiene `kick`, `dropbox`, `vk`, `reddit` ni `roblox`, y que contiene exactamente los demás identificadores presentes en la entrada.

**Validates: Requirements 8.5, 8.6**

### Property 7: La autorización de registro es coherente con las reglas de invitación y dominio permitido

*Para cualquier* combinación de correo electrónico, valor de `disableSignUp`, presencia/ausencia de invitación pendiente, y lista de dominios permitidos (incluyendo lista vacía), `isSignUpAllowed` SHALL retornar `true` si y solo si (`disableSignUp` es `false` o existe una invitación pendiente) y (la lista de dominios permitidos está vacía o el dominio del correo electrónico está contenido en dicha lista).

**Validates: Requirements 8.7, 8.13**

### Property 8: La validación de Clave_API acepta únicamente coincidencias de hash activas y vigentes

*Para cualquier* conjunto de Claves_API almacenadas (cada una con su hash, estado de revocación y fecha de expiración arbitrarios) y cualquier valor de clave en texto plano proporcionado en la solicitud, `findMatchingApiKey` SHALL retornar el propietario de una Clave_API almacenada si y solo si existe una Clave_API en el conjunto cuyo hash coincide exactamente con el hash del valor proporcionado, cuyo `revokedAt` es `null`, y cuyo `expiresAt` es `null` o posterior al instante evaluado; SHALL retornar `null` para cualquier clave en texto plano que no coincida exactamente con ninguna Clave_API almacenada (incluyendo claves que difieren en un solo carácter).

**Validates: Requirements 8.15, 8.17**

### Property 9: El límite de tasa de Clave_API nunca permite más de 100 solicitudes por ventana de 60 segundos

*Para cualquier* secuencia arbitraria de marcas de tiempo de solicitud (ordenadas o no, con separaciones arbitrarias) asociadas a una misma Clave_API, la función de conteo de ventana deslizante SHALL rechazar toda solicitud que, de aceptarse, resultaría en más de 100 solicitudes aceptadas dentro de cualquier intervalo de 60 segundos consecutivos, y SHALL aceptar toda solicitud para la cual dicho conteo sea menor a 100 en ese intervalo.

**Validates: Requirements 8.16**

### Property 10: La finalización de invitación por Enlace_Magico depende únicamente del estado del miembro referenciado

*Para cualquier* valor de `memberPublicId` extraído de la URL de retorno y cualquier estado simulado del miembro correspondiente (inexistente, con estado `"invited"`, o con cualquier otro estado que indique que ya fue completada), `completeInvite` SHALL retornar éxito si y solo si el miembro existe y su estado es `"invited"`, y SHALL retornar el motivo de rechazo `"invite_not_found"` cuando el miembro no exista, o `"invite_already_completed"` cuando exista con un estado distinto de `"invited"`.

**Validates: Requirements 8.19, 8.20**

### Property 11: La expiración de URLs firmadas de Supabase_Storage siempre respeta el máximo por tipo de operación

*Para cualquier* valor solicitado de `expiresIn` (incluyendo valores negativos, cero, el máximo exacto, y valores mayores al máximo) y cualquier tipo de operación (`"upload"` o `"download"`), `clampExpiresIn` SHALL retornar un valor mayor o igual a 1 y SHALL retornar un valor que nunca exceda 60 cuando la operación es `"upload"`, ni 3600 cuando la operación es `"download"`.

**Validates: Requirements 9.3, 9.4**

### Property 12: La URL de avatar externa se retorna sin resolución contra Supabase_Storage

*Para cualquier* valor de `imageKey` (una URL `http://`/`https://` arbitraria, una clave relativa arbitraria no vacía, `null`, `undefined`, o cadena vacía), `generateAvatarUrl` SHALL retornar el valor de entrada sin modificaciones y sin invocar al cliente de Supabase_Storage cuando dicho valor comienza con `http://` o `https://`, y SHALL invocar la generación de una URL firmada contra Supabase_Storage en cualquier otro caso donde el valor sea una cadena no vacía.

**Validates: Requirements 9.6**

### Property 13: El fallo de eliminación en Supabase_Storage nunca bloquea el soft-delete en packages/db

*Para cualquier* resultado simulado (éxito o fallo) de la llamada de eliminación contra Supabase_Storage, el flujo de eliminación de adjunto/avatar SHALL ejecutar siempre el soft-delete correspondiente en `packages/db`, y SHALL invocar el logger de error si y solo si la llamada a Supabase_Storage falló.

**Validates: Requirements 9.9**

### Property 14: La validación de solicitudes de carga rechaza tamaños y tipos de contenido no permitidos

*Para cualquier* tamaño de archivo arbitrario (incluyendo valores negativos, cero, exactamente el límite configurado, y valores mayores al límite) y cualquier tipo de contenido arbitrario, `validateUploadRequest` SHALL retornar un resultado inválido si y solo si el tamaño excede `limits.maxSizeBytes` o el tipo de contenido no está contenido en `limits.allowedContentTypes`, y SHALL retornar un resultado válido en cualquier otro caso.

**Validates: Requirements 9.8**

## Error Handling

| Escenario | Comportamiento |
|---|---|
| `POSTGRES_URL` ausente y `NODE_ENV=production` | `resolveDbConfig` lanza un `Error` con mensaje descriptivo (`"POSTGRES_URL is required in production"`). `createDrizzleClient` propaga el error, deteniendo el arranque de la Aplicacion_Web. |
| `POSTGRES_URL` ausente y `NODE_ENV` distinto de `production` | Se usa PGLite local (comportamiento actual sin cambios). |
| Falla la conexión inicial a Supabase (credenciales inválidas, red, SSL rechazado) | `createDrizzleClient` captura el error del primer intento de conexión del `Pool` y lo registra con `@kan/logger` (`log.error`) incluyendo el mensaje original de `pg`, antes de re-lanzar el error. |
| Migración falla contra Supabase (por ejemplo, tabla ya existe, permisos insuficientes) | `drizzle-kit migrate` termina con código de salida distinto de cero y muestra el error original de Postgres en `stdout`/`stderr`; no se captura ni se enmascara ese error en el script `migrate` de `packages/db/package.json`. |
| `POSTGRES_URL` apunta a un host remoto pero ya incluye `sslmode` en la cadena | `resolveDbConfig` no añade su propio objeto `ssl` (deja `ssl: false` a nivel de config de `pg`) para no entrar en conflicto con el `sslmode` de la cadena, tal como documenta `node-postgres`. |
| Se despliega en Vercel sin haber configurado `POSTGRES_URL` (o `POSTGRES_URL_NON_POOLING`) en el dashboard | El build de Next.js no falla (las variables de runtime no se validan en build time), pero cualquier función serverless que use el Cliente_DB fallará al primer request con el error descriptivo del primer punto de esta tabla, visible en los logs de Vercel. |
| Falta `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `SUPABASE_SERVICE_ROLE_KEY` (Requisito 7.5, 7.6) | `resolveSupabaseServerConfig`/`resolveSupabaseBrowserConfig` registran un `log.error` con el nombre de la variable faltante y retornan `null`; `createSupabaseServerClient`/`createSupabaseBrowserClient` lanzan un error en lugar de retornar un cliente parcial; toda operación que dependa de Supabase_Auth o Supabase_Storage falla con ese error propagado. |
| Falla la inicialización de Supabase_Auth al arrancar la Aplicacion_Web (Requisito 8.10) | Se registra un `log.error` con el mensaje original antes de que la petición falle; equivalente al tratamiento de fallo de conexión a DB (Requisito 1.3). |
| Credenciales inválidas en inicio de sesión con Supabase_Auth (Requisito 8.11) | Se rechaza el inicio de sesión, no se crea sesión, y se retorna un mensaje de error genérico ("Credenciales inválidas") sin revelar si el correo existe. |
| Falla `supabase.auth.admin.deleteUser` durante la eliminación de cuenta (Requisito 8.12) | La transacción de `packages/db` hace `ROLLBACK` (ver componente 7); se conservan intactos tanto el usuario en Supabase_Auth como los registros en `packages/db`; se presenta al usuario un mensaje indicando que la eliminación no se completó. |
| Registro rechazado por `NEXT_PUBLIC_DISABLE_SIGN_UP` sin invitación, o por dominio no permitido (Requisito 8.13) | `isSignUpAllowed` retorna `false` antes de llamar a `supabase.auth.signUp`; no se crea ninguna cuenta; se presenta un mensaje de error indicando el motivo del rechazo. |
| Clave_API inválida, revocada, expirada o inexistente en el header (Requisito 8.17) | `findMatchingApiKey` retorna `null`; el middleware de tRPC rechaza la solicitud con `UNAUTHORIZED` sin asociarla a ningún usuario. |
| Se excede el límite de 100 solicitudes/minuto de una Clave_API (Requisito 8.16) | El middleware rechaza la solicitud con un `TRPCError` (`TOO_MANY_REQUESTS`) sin ejecutar el procedimiento subyacente. |
| Enlace_Magico de invitación abierto con `memberPublicId` inexistente o invitación ya completada (Requisito 8.20) | `completeInvite` retorna `{ success: false, reason: "invite_not_found" \| "invite_already_completed" }`; la ruta de callback presenta un mensaje indicando que la invitación ya no es válida, sin crear ni modificar membresías. |
| Carga de archivo excede tamaño máximo o usa tipo de contenido no permitido (Requisito 9.8) | `validateUploadRequest` retorna inválido antes de llamar a `generateUploadUrl`; se rechaza la generación de la URL de carga con un mensaje indicando el motivo. |
| Falla `deleteObject` contra Supabase_Storage al eliminar un adjunto/avatar (Requisito 9.9) | Se registra `log.error` con el error original; el soft-delete del registro en `packages/db` se ejecuta de todos modos; la operación no se bloquea ni se revierte. |
| Supabase_Storage no está configurado o falla la verificación de buckets en el health check (Requisito 9.7) | `checkSupabaseStorageConnection` reporta `not_configured` si faltan las variables de Supabase, o `error` si la verificación de buckets falla; el estado global (`status`) refleja `error` solo si el almacenamiento está configurado y falló. |
| `packages/db/migrations/*.sql` contiene un archivo cuyo nombre no sigue el formato `<timestamp>_<Nombre>.sql` esperado (Requisito 6.5) | `concatenateMigrations` (o el script que la invoca) falla explícitamente indicando el nombre de archivo no reconocido, en lugar de generar un `schema.sql` con orden indeterminado. |

## Testing Strategy

**Enfoque dual**: se usan tests unitarios/de integración para configuración específica (Docker Compose, Vercel, documentación) y property-based tests para la lógica pura de resolución de configuración de base de datos (`resolveDbConfig` y la resolución de la URL de migración).

**Librería de property-based testing**: dado que el proyecto usa TypeScript/Node, se usa `fast-check` (ya sea añadida como dependencia de desarrollo de `packages/db` si no está presente, sin implementar generadores desde cero).

**Tests unitarios** (`packages/db/src/client.test.ts` o similar):
- `resolveDbConfig` retorna `null` cuando `POSTGRES_URL` está ausente y `NODE_ENV` es `"development"`.
- `resolveDbConfig` lanza un error cuando `POSTGRES_URL` está ausente y `NODE_ENV` es `"production"`.
- `resolveDbConfig` retorna `ssl: false` para `postgresql://user:pass@postgres:5432/kan` (host del servicio de `docker-compose.yml`).
- `resolveDbConfig` retorna `ssl: { rejectUnauthorized: false }` para una URL con host `db.abcxyz.supabase.co`.
- `createDrizzleClient` registra un error vía `@kan/logger` cuando el `Pool` mockeado rechaza la conexión inicial.
- La resolución de la URL de migración usa `POSTGRES_URL` cuando `POSTGRES_URL_NON_POOLING` no está definida (caso concreto de auto-hospedaje con una sola URL).

**Property tests**:

- [ ] **Property 1: Resolución de configuración de base de datos es coherente con el host y el entorno**
  - **Feature: migrate-supabase-vercel, Property 1**: para URLs generadas con hosts aleatorios (incluyendo los hosts locales conocidos `localhost`, `127.0.0.1`, `postgres`, y hosts remotos arbitrarios con y sin `sslmode` en la query string) y valores aleatorios de `NODE_ENV`, verificar las tres ramas descritas en la Propiedad 1. Mínimo 100 iteraciones.
- [ ] **Property 2: La URL de migración prioriza la conexión directa sobre la pooled**
  - **Feature: migrate-supabase-vercel, Property 2**: para combinaciones aleatorias de presencia/ausencia y valor de `POSTGRES_URL_NON_POOLING` y `POSTGRES_URL`, verificar la regla de prioridad descrita. Mínimo 100 iteraciones.

**Tests de integración** (no PBT, 1-3 ejemplos):
- Verificar que `pnpm db:migrate` aplica correctamente las migraciones existentes contra una instancia real (o contenedor local) de Postgres 15+ configurada con SSL, como aproximación al comportamiento contra Supabase.
- Verificar que `docker-compose.yml` y `cloud/docker-compose.yml` siguen siendo válidos (`docker compose config`) tras cualquier cambio en variables de entorno documentado en este feature.

**Fuera del alcance de testing automatizado** (configuración de plataforma, ver prework): configuración del proyecto de Vercel (root directory, build command), sincronización de variables de entorno en el dashboard de Vercel, y la ejecución real de migraciones contra el proyecto de Supabase de producción.

### Testing Strategy — Requisitos 6-9

**Librería de property-based testing**: se mantiene `fast-check`, ya introducida para los Requisitos 1-2, evitando añadir una segunda librería de PBT al monorepo.

**Tests unitarios** (adicionales a los ya listados arriba):
- `packages/db/scripts/generate-schema-sql.test.ts`: `concatenateMigrations` produce una salida vacía para una lista vacía; produce exactamente el contenido de un único archivo cuando solo hay uno.
- `packages/shared/src/utils/supabase.test.ts`: casos concretos de `resolveSupabaseServerConfig`/`resolveSupabaseBrowserConfig` con todas las variables presentes, y con cada variable individual ausente.
- `packages/auth/src/hooks.test.ts`: `isSignUpAllowed` con `disableSignUp: false` y sin restricciones de dominio retorna `true` para cualquier correo (caso base sin restricciones).
- `packages/auth/src/apiKey.test.ts`: `extractApiKeyFromHeaders` prioriza `Authorization: Bearer` sobre `x-api-key` cuando ambos están presentes; retorna `null` cuando ninguno está presente.
- `packages/api/src/routers/health.test.ts`: `checkSupabaseStorageConnection` retorna `not_configured` cuando faltan las variables de Supabase (caso concreto, mock).
- `packages/shared/src/utils/storage.test.ts`: `generateAvatarUrl` retorna `null` cuando `imageKey` es `null`/`undefined` (caso concreto, no cubierto por la Propiedad 12 que asume cadena no vacía).
- Integración de invitación: `completeInvite` con un `memberLookup` mockeado que retorna un miembro con estado `"invited"` completa la invitación e invoca `acceptInvite` exactamente una vez (test de integración entre las dos funciones puras, 1-2 ejemplos).

**Property tests**:

- [ ] **Property 3: La concatenación de migraciones preserva orden cronológico y contenido íntegro**
  - **Feature: migrate-supabase-vercel, Property 3**: para listas generadas de archivos `(timestamp, contenido)` en orden de entrada aleatorio, verificar que la salida concatenada preserva el orden cronológico y el contenido íntegro de cada archivo. Mínimo 100 iteraciones.
- [ ] **Property 4: La resolución de configuración de Supabase respeta el aislamiento servidor/navegador**
  - **Feature: migrate-supabase-vercel, Property 4**: para combinaciones aleatorias de presencia/ausencia de las 3 variables de entorno relevantes, verificar la Propiedad 4 completa, incluyendo que `SUPABASE_SERVICE_ROLE_KEY` nunca aparece en la config de navegador. Mínimo 100 iteraciones.
- [ ] **Property 5: La eliminación de usuario nunca deja un estado parcial entre Supabase_Auth y packages/db**
  - **Feature: migrate-supabase-vercel, Property 5**: usando mocks del cliente de Supabase Auth y de la conexión de `packages/db` que fallan/tienen éxito según parámetros generados aleatoriamente, verificar que el estado final observado por ambos mocks es siempre consistente (ambos eliminados o ninguno). Mínimo 100 iteraciones.
- [ ] **Property 6: El filtrado de proveedores OAuth excluye siempre a los proveedores sin soporte nativo**
  - **Feature: migrate-supabase-vercel, Property 6**: para subconjuntos aleatorios de la lista completa de identificadores de proveedor, verificar que el resultado nunca incluye los 5 excluidos. Mínimo 100 iteraciones.
- [ ] **Property 7: La autorización de registro es coherente con las reglas de invitación y dominio permitido**
  - **Feature: migrate-supabase-vercel, Property 7**: para combinaciones aleatorias de correo, `disableSignUp`, presencia de invitación, y listas de dominios permitidos (incluyendo vacía), verificar la Propiedad 7. Mínimo 100 iteraciones.
- [ ] **Property 8: La validación de Clave_API acepta únicamente coincidencias de hash activas y vigentes**
  - **Feature: migrate-supabase-vercel, Property 8**: para conjuntos aleatorios de claves almacenadas (con estados de revocación/expiración aleatorios) y claves en texto plano aleatorias (incluyendo variaciones de un carácter de claves válidas), verificar la Propiedad 8. Mínimo 100 iteraciones.
- [ ] **Property 9: El límite de tasa de Clave_API nunca permite más de 100 solicitudes por ventana de 60 segundos**
  - **Feature: migrate-supabase-vercel, Property 9**: para secuencias aleatorias de marcas de tiempo de solicitud, verificar que el conteo de ventana deslizante nunca excede 100 aceptaciones en ningún intervalo de 60 segundos. Mínimo 100 iteraciones.
- [ ] **Property 10: La finalización de invitación por Enlace_Magico depende únicamente del estado del miembro referenciado**
  - **Feature: migrate-supabase-vercel, Property 10**: para valores aleatorios de `memberPublicId` y estados simulados aleatorios del miembro (inexistente, `"invited"`, otro estado), verificar la Propiedad 10. Mínimo 100 iteraciones.
- [ ] **Property 11: La expiración de URLs firmadas de Supabase_Storage siempre respeta el máximo por tipo de operación**
  - **Feature: migrate-supabase-vercel, Property 11**: para valores aleatorios de `expiresIn` (incluyendo negativos, cero, límites exactos y excesos) y ambos tipos de operación, verificar la Propiedad 11. Mínimo 100 iteraciones.
- [ ] **Property 12: La URL de avatar externa se retorna sin resolución contra Supabase_Storage**
  - **Feature: migrate-supabase-vercel, Property 12**: para valores aleatorios de `imageKey` (URLs completas, claves relativas, `null`, `undefined`, cadena vacía), verificar la Propiedad 12 usando un mock del cliente de Storage que registra si fue invocado. Mínimo 100 iteraciones.
- [ ] **Property 13: El fallo de eliminación en Supabase_Storage nunca bloquea el soft-delete en packages/db**
  - **Feature: migrate-supabase-vercel, Property 13**: para resultados aleatorios (éxito/fallo) de un mock de eliminación de Storage, verificar que el soft-delete de `packages/db` siempre se invoca y que el logger de error se invoca únicamente en el caso de fallo. Mínimo 100 iteraciones.
- [ ] **Property 14: La validación de solicitudes de carga rechaza tamaños y tipos de contenido no permitidos**
  - **Feature: migrate-supabase-vercel, Property 14**: para tamaños aleatorios (incluyendo negativos, cero, el límite exacto, y excesos) y tipos de contenido aleatorios (dentro y fuera de la lista permitida), verificar la Propiedad 14. Mínimo 100 iteraciones.

**Tests de integración** (no PBT, 1-3 ejemplos, requieren una instancia real o efímera de Postgres/Supabase):
- Ejecutar `packages/db/supabase/schema.sql` contra una instancia nueva y vacía de Postgres (por ejemplo vía Testcontainers) y verificar código de salida 0 y presencia de todas las tablas esperadas (Requisito 6.2).
- Levantar dos instancias efímeras de Postgres — una vía `pnpm db:migrate`, otra vía `packages/db/supabase/schema.sql` — y ejecutar una muestra representativa de funciones de `packages/db/src/repository` contra ambas, comparando resultados (Requisito 6.3).
- Verificar que `supabase.auth.signUp`/`signInWithPassword`/`resetPasswordForEmail` se invocan con los parámetros esperados contra un mock/cliente de prueba de Supabase Auth (Requisito 8.1, 8.2).
- Verificar que `supabase.auth.signInWithOtp` se invoca con el `emailRedirectTo` correcto para login sin contraseña y para invitaciones (Requisito 8.18, 8.19).
- Verificar el mapeo de tres estados (`ok`/`error`/`not_configured`) del health check de Supabase_Storage con configuración presente/ausente y con la llamada de verificación simulando éxito/fallo (Requisito 9.7).

**Fuera del alcance de testing automatizado**: configuración de proveedores OAuth en el dashboard/Management API de Supabase, configuración de duración de sesión JWT en el dashboard de Supabase, y cualquier plan de migración de datos existentes (usuarios, archivos) hacia Supabase, dado que dichos planes quedan como pregunta abierta sin resolver en este documento.

## Preguntas Abiertas y Decisiones de Diseño

### Decisión resuelta en este diseño: Requisito 10 (compatibilidad con auto-hospedaje)

El Requisito 10.2 exige que la pregunta sobre el impacto de los Requisitos 8 y 9 en los despliegues auto-hospedados quede **resuelta y registrada aquí antes de iniciar la implementación** de dichos requisitos. Esta sección documenta esa decisión.

**Decisión**: los despliegues auto-hospedados mediante `docker-compose.yml` y `cloud/docker-compose.yml` **requerirán obligatoriamente una cuenta de Supabase** (cloud o auto-hospedada por el propio operador vía el `docker-compose.yml` que publica el proyecto Supabase) para usar Supabase_Auth y Supabase_Storage tras completar esta migración. No se mantiene una vía de configuración alternativa que preserve Better Auth + S3 en paralelo.

**Justificación**: el alcance decidido para esta migración (ver Introducción de `requirements.md` y Requisito 8/9) es sustituir integralmente Better Auth y S3, no mantener ambos mecanismos en paralelo de forma indefinida. Mantener dos implementaciones completas de autenticación y almacenamiento (Better Auth+S3 y Supabase_Auth+Supabase_Storage) seleccionables por configuración duplicaría permanentemente la superficie de código de dos de los subsistemas más sensibles del proyecto (autenticación y almacenamiento de archivos), lo cual contradice el objetivo de "sustitución" expresado en los Requisitos 8 y 9. La alternativa de exigir Supabase también para auto-hospedaje es consistente con que Supabase ofrece una imagen de auto-hospedaje propia (`supabase/docker`), por lo que un operador que no quiera depender del Supabase Cloud puede, en su lugar, ejecutar su propia instancia de Supabase (incluyendo Auth y Storage) en su infraestructura — a costa de una instalación más pesada que la actual (un contenedor Postgres simple), pero sin bifurcar el código de la aplicación.

**Consecuencias concretas de la decisión** (satisface Requisito 10.1, resuelve la condición del Requisito 10.2, y activa el Requisito 10.4 en lugar del 10.3):
- `docker-compose.yml` y `cloud/docker-compose.yml` deberán declarar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` como variables requeridas para el servicio `web`, del mismo modo que hoy declaran `BETTER_AUTH_SECRET`.
- La guía de auto-hospedaje (`apps/docs/guides/self-hosting/introduction.mdx`, y una nueva página equivalente a `apps/docs/guides/self-hosting/s3.mdx` pero para Supabase) documentará los pasos para crear un proyecto de Supabase (cloud o auto-hospedado) y obtener dichas credenciales, como parte de los requisitos previos de instalación (Requisito 10.4).
- El Requisito 10.3 (mecanismo de compatibilidad sin cuenta de Supabase) **no se activa** con esta decisión: no se implementa un mecanismo de configuración alternativo que permita omitir Supabase_Auth/Supabase_Storage.
- El Requisito 10.5 (el Cliente_DB debe seguir funcionando igual con Postgres estándar o Supabase vía `POSTGRES_URL`) **no se ve afectado** por esta decisión: la conexión a la base de datos permanece independiente de Supabase_Auth/Supabase_Storage y sigue funcionando contra cualquier Postgres estándar, tal como ya garantiza la Propiedad 1.

Esta decisión se limita al alcance de este documento de diseño; no determina por sí sola el momento ni el mecanismo exacto de comunicación a los usuarios existentes del proyecto open-source (por ejemplo, notas de actualización o un período de transición), lo cual queda fuera del alcance de un documento de diseño técnico.

### Preguntas abiertas que permanecen sin resolver (no bloquean este diseño)

Las siguientes preguntas, heredadas de la sección "Preguntas Abiertas" de `requirements.md`, requieren una decisión de producto/negocio antes de iniciar la implementación de las partes correspondientes de los Requisitos 8 y 9, pero **no bloquean la implementación de las partes de este diseño que no dependen de ellas** (por ejemplo, la reconstrucción de Clave_API o Enlace_Magico para usuarios nuevos no requiere resolver la migración de usuarios existentes):

1. **Migración de usuarios y sesiones existentes** (Requisito 8.9): ¿se requiere migrar los usuarios, cuentas y sesiones existentes de las tablas de Better Auth (`packages/db/src/schema/auth.ts`) hacia Supabase_Auth, o esta migración solo aplica a instalaciones nuevas sin datos previos? Esta decisión determina si las tablas `session`, `account`, `verification` y `apikey` de Better Auth pueden eliminarse inmediatamente tras completar la implementación, o si deben conservarse temporalmente como fuente de un script de migración de datos. Este diseño no elimina dichas tablas (ver sección Data Models) precisamente para no cerrar esta pregunta de forma implícita.
2. **Migración de archivos existentes** (Requisito 9.10): ¿se requiere migrar los archivos existentes (avatares, adjuntos de tarjetas) desde los buckets S3 actuales hacia los Buckets_Supabase, o se asume que solo los archivos nuevos usarán Supabase_Storage? Este diseño no incluye un mecanismo de migración de archivos ni asume que los archivos S3 existentes estarán disponibles vía Supabase_Storage sin dicha migración.
3. **Mantenimiento automático del Script_SQL_Esquema** (Requisito 6.5): este diseño define el mecanismo (`pnpm db:generate-schema-sql`, ejecución manual documentada), pero queda abierto si se debe añadir además una verificación automática de CI que bloquee un pull request cuando `packages/db/supabase/schema.sql` esté desactualizado respecto a `packages/db/migrations/`. Se recomienda como mejora futura, pero no es parte del alcance de tareas de este documento de diseño.

La pregunta 3 original de `requirements.md` ("Auto-hospedaje sin Supabase") queda resuelta en la subsección anterior y por lo tanto no se repite aquí como pregunta abierta.
