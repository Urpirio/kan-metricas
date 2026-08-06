# Requirements Document

## Introduction

Este documento define los requisitos para migrar la base de datos PostgreSQL del proyecto Kan de Railway a Supabase (Supabase Postgres), desplegar la aplicación web Next.js (`apps/web`) en Vercel en lugar del pipeline actual basado en Docker/Railway, y adoptar Supabase como reemplazo integral del backend del proyecto: generación de scripts SQL para provisionar el esquema directamente en la plataforma Supabase, uso de la librería cliente `@supabase/supabase-js`, sustitución de Better Auth por Supabase Auth, y sustitución del almacenamiento S3 existente por Supabase Storage.

El alcance cubre: la configuración de la cadena de conexión a Supabase (incluyendo consideraciones de connection pooling/pgbouncer y SSL/TLS), la ejecución de las migraciones de esquema de Drizzle ORM contra la instancia de Supabase junto con un script SQL equivalente para ejecutar en el editor SQL de Supabase, las variables de entorno necesarias para el despliegue en Vercel y para la integración con Supabase Auth y Supabase Storage, la configuración de build/despliegue del monorepo (pnpm + Turborepo) en Vercel, la sustitución de Better Auth por Supabase Auth (incluyendo inicio de sesión con correo/contraseña, los proveedores OAuth actualmente configurados, gestión de sesión y eliminación de usuarios), la sustitución del almacenamiento S3 por Supabase Storage para avatares de usuario y adjuntos de tarjetas, y la reconstrucción sobre mecanismos compatibles con Supabase de dos capacidades actualmente provistas por plugins de Better Auth: la autenticación mediante Clave_API (plugin `apiKey`, usada para autenticación de API/administración) y las invitaciones de espacio de trabajo y el inicio de sesión sin contraseña basados en Enlace_Magico (plugin `magicLink`).

Fuera de alcance: no se elimina de forma unilateral la capacidad de auto-hospedaje existente vía Docker Compose (`docker-compose.yml`, `cloud/docker-compose.yml`) para otros usuarios del proyecto open-source; el impacto de sustituir Better Auth y S3 sobre dichos despliegues auto-hospedados se documenta como pregunta abierta (ver Requisito 10 y la sección "Preguntas Abiertas"), en lugar de resolverse silenciosamente en este documento. Asimismo, el plan de migración de datos de usuarios/archivos existentes hacia Supabase no se da por resuelto en este documento; se documenta explícitamente como pregunta abierta que requiere una decisión antes de iniciar la implementación. Respecto a los proveedores OAuth, se decide explícitamente que Kick, Dropbox, VK, Reddit y Roblox quedan excluidos de esta migración por no contar con soporte nativo en Supabase_Auth (ver Requisito 8, Criterio 6); el resto de los proveedores actualmente configurados se migra según lo descrito en el Requisito 8, Criterio 5. Explícitamente fuera de alcance queda la reconstrucción de la facturación de suscripciones de Stripe actualmente integrada mediante el plugin `stripe` de Better Auth (`@better-auth/stripe`, incluyendo períodos de prueba, planes de equipo/pro y webhooks de suscripción): esta migración no reconstruye dicha funcionalidad sobre Supabase_Auth ni sobre ningún otro mecanismo, dado que la gestión de suscripciones queda fuera del alcance decidido para este esfuerzo.

## Glossary

- **Sistema**: El proyecto Kan en su conjunto (monorepo pnpm/Turborepo), incluyendo `apps/web` y `packages/db`.
- **Aplicacion_Web**: La aplicación Next.js ubicada en `apps/web`.
- **Cliente_DB**: El módulo `packages/db/src/client.ts` que crea la conexión Drizzle/`pg` hacia PostgreSQL.
- **Ejecutor_De_Migraciones**: El proceso que ejecuta `drizzle-kit migrate` (localmente vía `pnpm db:migrate`, o en un contenedor/paso de CI) para aplicar las migraciones de `packages/db/migrations` contra la base de datos.
- **Supabase**: El proveedor de base de datos PostgreSQL administrada que sustituye a la instancia de PostgreSQL de Railway, y que además provee los servicios Supabase_Auth y Supabase_Storage.
- **Conexion_Directa**: La cadena de conexión de Supabase al puerto 5432 que se conecta directamente a Postgres, sin pooling de transacciones, apta para ejecutar migraciones de esquema.
- **Conexion_Pooled**: La cadena de conexión de Supabase que pasa por el pooler de conexiones (Supavisor/PgBouncer, modo transacción, puerto 6543), apta para el tráfico de la Aplicacion_Web en runtime.
- **Vercel**: La plataforma de hosting donde se desplegará la Aplicacion_Web.
- **Variable_De_Entorno**: Un valor de configuración leído por el Sistema desde el entorno de ejecución (por ejemplo `POSTGRES_URL`, `NEXT_PUBLIC_BASE_URL`).
- **Origen_Confiable**: Un dominio incluido en `BETTER_AUTH_TRUSTED_ORIGINS` que Better Auth acepta como origen válido para autenticación.
- **Script_SQL_Esquema**: Un archivo SQL (por ejemplo `schema.sql` o equivalente) que crea todas las tablas, tipos y restricciones del esquema de `packages/db/src/schema`, pensado para ejecutarse directamente en el editor SQL de Supabase o mediante la CLI de Supabase.
- **Cliente_Supabase_JS**: La instancia del cliente creada con la librería `@supabase/supabase-js`, utilizada para interactuar con Supabase_Auth y Supabase_Storage.
- **Supabase_Auth**: El servicio de autenticación de Supabase que sustituye a Better Auth como mecanismo de registro, inicio de sesión, gestión de sesión y eliminación de usuarios.
- **Supabase_Storage**: El servicio de almacenamiento de archivos de Supabase que sustituye a la configuración de almacenamiento S3 existente para avatares y adjuntos de tarjetas.
- **Bucket_Supabase**: Un contenedor de almacenamiento (bucket) dentro de Supabase_Storage utilizado para almacenar avatares o adjuntos de tarjetas.
- **Proveedor_OAuth**: Un proveedor de autenticación social (por ejemplo Google, Discord, GitHub, GitLab, Microsoft, Twitter, Kick, Zoom, Dropbox, VK, LinkedIn, Reddit, Roblox, Spotify, TikTok, Twitch, Apple) actualmente configurado en `packages/auth/src/providers.ts`. De estos, Kick, Dropbox, VK, Reddit y Roblox no cuentan con soporte nativo en Supabase_Auth y quedan explícitamente excluidos de esta migración (ver Requisito 8, Criterio 6): no estarán disponibles como opción de inicio de sesión después de la migración. El plugin `genericOAuth` de Better Auth (configurable hoy mediante las Variables_De_Entorno `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` y `OIDC_DISCOVERY_URL`, ver `packages/auth/src/plugins.ts`) deja de estar disponible al sustituirse Better Auth por Supabase_Auth; esta migración no reconstruye un puente OAuth/OIDC genérico equivalente sobre Supabase_Auth, por lo que dicho mecanismo no queda disponible como vía de reemplazo para los proveedores excluidos.
- **Clave_API**: Un token de autenticación equivalente al generado y validado actualmente por el plugin `apiKey` de Better Auth (`packages/auth/src/plugins.ts`), utilizado para autenticar solicitudes a la API mediante el encabezado `Authorization: Bearer <clave>` o el encabezado `x-api-key`, sujeto a límite de tasa (rate limiting).
- **Enlace_Magico**: Un enlace de inicio de sesión sin contraseña enviado por correo electrónico, equivalente al generado actualmente por el plugin `magicLink` de Better Auth (`packages/auth/src/plugins.ts`), utilizado tanto para el inicio de sesión sin contraseña como para completar una invitación pendiente a un espacio de trabajo mediante metadatos de la URL de retorno (por ejemplo `memberPublicId`).
- **Facturacion_Stripe_BetterAuth**: La integración de facturación de suscripciones actualmente provista por el plugin `stripe` de Better Auth (`@better-auth/stripe` en `packages/auth/src/plugins.ts`), incluyendo períodos de prueba, planes de equipo ("team") y profesional ("pro"), y webhooks de suscripción.

## Requirements

### Requisito 1: Conexión de la base de datos a Supabase

**Historia de Usuario:** Como operador del proyecto, quiero que el Sistema se conecte a una instancia de PostgreSQL alojada en Supabase en lugar de Railway, para dejar de depender de Railway para la base de datos.

#### Criterios de Aceptación

1. THE Cliente_DB SHALL establecer la conexión a PostgreSQL utilizando el valor configurado en la Variable_De_Entorno `POSTGRES_URL`, sin requerir cambios en el nombre de dicha variable.
2. WHERE la cadena de conexión de `POSTGRES_URL` corresponde a Supabase, THE Cliente_DB SHALL establecer la conexión utilizando cifrado SSL/TLS.
3. IF la conexión a la base de datos configurada en `POSTGRES_URL` falla al iniciar la Aplicacion_Web, THEN THE Aplicacion_Web SHALL registrar un error descriptivo mediante `@kan/logger` indicando el fallo de conexión.
4. IF `POSTGRES_URL` no está definida en un entorno donde `NODE_ENV` es `production`, THEN THE Cliente_DB SHALL rechazar el arranque con un error descriptivo en lugar de continuar de forma silenciosa con la base de datos local PGLite.

### Requisito 2: Uso de connection pooling de Supabase

**Historia de Usuario:** Como operador del proyecto, quiero que la Aplicacion_Web use el pooler de conexiones de Supabase en runtime, para evitar agotar el límite de conexiones concurrentes de la base de datos cuando la Aplicacion_Web corre en funciones serverless.

#### Criterios de Aceptación

1. WHERE la Aplicacion_Web está desplegada en Vercel, THE Aplicacion_Web SHALL utilizar la Conexion_Pooled de Supabase para las consultas realizadas en runtime.
2. WHEN el Ejecutor_De_Migraciones aplica migraciones de esquema, THE Ejecutor_De_Migraciones SHALL utilizar la Conexion_Directa de Supabase en lugar de la Conexion_Pooled.
3. THE Sistema SHALL permitir configurar la Conexion_Directa y la Conexion_Pooled mediante Variables_De_Entorno independientes, de forma que el mismo valor de `POSTGRES_URL` usado para migraciones no sea obligatoriamente el mismo usado en runtime.

### Requisito 3: Ejecución de migraciones de Drizzle contra Supabase

**Historia de Usuario:** Como desarrollador, quiero poder ejecutar las migraciones existentes de Drizzle ORM contra la instancia de Supabase, para mantener el esquema de base de datos sincronizado sin reescribir las migraciones actuales.

#### Criterios de Aceptación

1. WHEN se ejecuta `pnpm db:migrate` con `POSTGRES_URL` (o la variable de conexión directa definida en el Requisito 2.3) apuntando a Supabase, THE Ejecutor_De_Migraciones SHALL aplicar todas las migraciones pendientes de `packages/db/migrations` sin errores.
2. THE Ejecutor_De_Migraciones SHALL aplicar las migraciones existentes de `packages/db/migrations` contra Supabase sin requerir modificaciones en los archivos de migración ya generados.
3. IF una migración falla al ejecutarse contra Supabase, THEN THE Ejecutor_De_Migraciones SHALL finalizar con un código de salida distinto de cero y mostrar el mensaje de error original de la base de datos.
4. THE Sistema SHALL documentar el procedimiento para ejecutar migraciones contra Supabase como parte del proceso de despliegue, sin depender del contenedor `migrator` de `cloud/docker-compose.yml`.

### Requisito 4: Despliegue de la Aplicacion_Web en Vercel

**Historia de Usuario:** Como operador del proyecto, quiero desplegar `apps/web` en Vercel, para dejar de depender del pipeline de Docker/Railway para el frontend.

#### Criterios de Aceptación

1. THE Sistema SHALL soportar la compilación de la Aplicacion_Web en Vercel utilizando el comando de build de Next.js dentro de la estructura de monorepo pnpm/Turborepo existente.
2. WHERE la Aplicacion_Web se despliega en Vercel, THE Sistema SHALL configurar el directorio raíz del proyecto de Vercel como `apps/web`.
3. WHERE la Aplicacion_Web se despliega en Vercel, THE Sistema SHALL utilizar el output de build nativo de Vercel para Next.js en lugar del output `standalone` usado por el Dockerfile.
4. WHEN se despliega un nuevo commit en la rama configurada para producción, THE Sistema SHALL permitir que Vercel construya y publique automáticamente la Aplicacion_Web sin pasos manuales adicionales de build.

### Requisito 5: Variables de entorno para el despliegue en Vercel

**Historia de Usuario:** Como operador del proyecto, quiero que todas las variables de entorno necesarias estén correctamente configuradas en Vercel, para que la Aplicacion_Web funcione de forma equivalente a su despliegue actual en Railway/Docker.

#### Criterios de Aceptación

1. THE Sistema SHALL definir en el proyecto de Vercel todas las Variables_De_Entorno marcadas como requeridas en `.env.example` (incluyendo `NEXT_PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET` y `POSTGRES_URL`).
2. WHEN el dominio público de la Aplicacion_Web cambia a un dominio de Vercel, THE Sistema SHALL actualizar `NEXT_PUBLIC_BASE_URL` y `BETTER_AUTH_TRUSTED_ORIGINS` para incluir dicho dominio como Origen_Confiable.
3. WHERE se agregue una Variable_De_Entorno nueva específica de Supabase (por ejemplo para la Conexion_Directa, o para el Cliente_Supabase_JS descrito en el Requisito 7), THE Sistema SHALL registrar dicha variable en `.env.example` y en `turbo.json` siguiendo el mismo procedimiento usado para el resto de variables del proyecto.
4. THE Sistema SHALL mantener funcionales las Variables_De_Entorno opcionales existentes que no son sustituidas por esta migración (Redis, SMTP) en el despliegue de Vercel sin requerir cambios en su formato o nombre.

### Requisito 6: Generación de scripts SQL para provisión de esquema en Supabase

**Historia de Usuario:** Como operador del proyecto, quiero contar con un script SQL que cree todas las tablas del esquema directamente en Supabase, para poder provisionar la base de datos desde el editor SQL de Supabase sin depender exclusivamente del Ejecutor_De_Migraciones.

#### Criterios de Aceptación

1. THE Sistema SHALL proveer un Script_SQL_Esquema que defina, para cada tabla del esquema definido en `packages/db/src/schema`, los siguientes elementos equivalentes: (a) columnas con sus tipos de datos y nulabilidad; (b) claves primarias; (c) claves foráneas junto con sus acciones referenciales (`ON DELETE`/`ON UPDATE`); (d) restricciones de unicidad; (e) índices, incluyendo índices únicos; (f) tipos enumerados con su conjunto completo y ordenado de valores; y (g) valores por defecto de columna.
2. WHEN el Script_SQL_Esquema se ejecuta contra una instancia nueva y vacía de Supabase mediante el editor SQL de Supabase, THE Script_SQL_Esquema SHALL crear todos los elementos listados en el Criterio 1 sin que el editor SQL de Supabase reporte ningún error de ejecución.
3. THE Script_SQL_Esquema SHALL producir un esquema de base de datos idéntico en nombres de tablas, nombres y tipos de columnas, claves primarias, claves foráneas, restricciones de unicidad, índices y tipos enumerados al esquema generado por las migraciones existentes de `packages/db/migrations`, de forma que toda operación de lectura o escritura de `packages/db/src/repository` que se ejecute exitosamente contra el esquema generado por las migraciones también se ejecute exitosamente, sin modificaciones de código, contra el esquema generado por el Script_SQL_Esquema.
4. THE Sistema SHALL mantener el Script_SQL_Esquema como un artefacto adicional a las migraciones de Drizzle existentes, sin reemplazar ni eliminar `packages/db/migrations` ni el Ejecutor_De_Migraciones.
5. THE Sistema SHALL mantener documentado el procedimiento para actualizar el Script_SQL_Esquema cada vez que se agregue una nueva migración de Drizzle al esquema de `packages/db/src/schema`, de forma que el Script_SQL_Esquema permanezca consistente con dicho esquema.

### Requisito 7: Uso de la librería cliente Supabase JS

**Historia de Usuario:** Como desarrollador, quiero usar `@supabase/supabase-js` como Cliente_Supabase_JS para simplificar la integración con Supabase, para reducir la complejidad de interactuar con Supabase_Auth y Supabase_Storage.

#### Criterios de Aceptación

1. THE Sistema SHALL incluir la dependencia `@supabase/supabase-js` en el `package.json` de todo paquete o aplicación del monorepo cuyo código importe funcionalidad de Supabase_Auth o Supabase_Storage.
2. THE Sistema SHALL inicializar el Cliente_Supabase_JS utilizando las Variables_De_Entorno `NEXT_PUBLIC_SUPABASE_URL` (URL del proyecto de Supabase), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key) y `SUPABASE_SERVICE_ROLE_KEY` (service role key), sin reutilizar `POSTGRES_URL` para este propósito.
3. WHILE el Cliente_Supabase_JS se utiliza en código ejecutado en el servidor (por ejemplo procedimientos de tRPC), THE Sistema SHALL utilizar la Variable_De_Entorno `SUPABASE_SERVICE_ROLE_KEY`, sin incluir dicha variable en ninguna Variable_De_Entorno con prefijo `NEXT_PUBLIC_` ni en el código o los bundles ejecutados en el navegador.
4. WHILE el Cliente_Supabase_JS se utiliza en código ejecutado en el navegador, THE Sistema SHALL utilizar únicamente las Variables_De_Entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, sin utilizar `SUPABASE_SERVICE_ROLE_KEY` en dicho código.
5. IF alguna de las Variables_De_Entorno `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `SUPABASE_SERVICE_ROLE_KEY` requerida para inicializar el Cliente_Supabase_JS no está definida, THEN THE Sistema SHALL registrar un error descriptivo mediante `@kan/logger` en lugar de fallar de forma silenciosa.
6. IF alguna de las Variables_De_Entorno requeridas para inicializar el Cliente_Supabase_JS no está definida, THEN THE Sistema SHALL impedir la creación del Cliente_Supabase_JS y SHALL rechazar con un error toda operación que dependa de Supabase_Auth o Supabase_Storage, en lugar de continuar con un Cliente_Supabase_JS parcialmente inicializado.

### Requisito 8: Sustitución de Better Auth por Supabase Auth

**Historia de Usuario:** Como operador del proyecto, quiero sustituir Better Auth por Supabase_Auth como mecanismo de autenticación, para centralizar la gestión de usuarios y sesiones en Supabase.

#### Criterios de Aceptación

1. THE Sistema SHALL utilizar Supabase_Auth para el registro e inicio de sesión de usuarios mediante correo electrónico y contraseña, sustituyendo la configuración equivalente de Better Auth (`emailAndPassword`).
2. WHEN un usuario restablece su contraseña, THE Sistema SHALL utilizar el flujo de recuperación de contraseña de Supabase_Auth en lugar del flujo `sendResetPassword` de Better Auth.
3. WHEN un usuario elimina su cuenta, THE Sistema SHALL eliminar al usuario correspondiente en Supabase_Auth y los registros asociados en `packages/db` como una operación atómica, de forma que si alguna de las dos eliminaciones falla, ninguna de ellas se aplique de forma parcial.
4. THE Sistema SHALL gestionar la sesión del usuario autenticado utilizando los mecanismos de sesión de Supabase_Auth, configurando la duración de sesión y el intervalo de renovación con valores equivalentes a los definidos actualmente en `session.expiresIn` y `session.updateAge` en `packages/auth/src/auth.ts`.
5. WHERE un Proveedor_OAuth actualmente configurado en `packages/auth/src/providers.ts` cuenta con soporte nativo equivalente en Supabase_Auth, THE Sistema SHALL migrar dicho proveedor a la configuración de proveedores OAuth de Supabase_Auth sin remover la Variable_De_Entorno de client id/secret correspondiente.
6. THE Sistema SHALL excluir de la configuración de proveedores OAuth de Supabase_Auth a los Proveedores_OAuth que no cuentan con soporte nativo en Supabase_Auth (Kick, Dropbox, VK, Reddit y Roblox), y SHALL eliminar o dejar de ofrecer sus puntos de entrada de inicio de sesión en la interfaz de usuario y el uso de sus Variables_De_Entorno de client id/secret asociadas, en lugar de intentar reconstruir soporte para ellos mediante un proveedor OAuth/OIDC genérico.
7. THE Sistema SHALL preservar el comportamiento existente de restricción de registro (`NEXT_PUBLIC_DISABLE_SIGN_UP`, invitaciones pendientes) y de restricción de dominios permitidos (`BETTER_AUTH_ALLOWED_DOMAINS`) al migrar a Supabase_Auth, de forma que un intento de registro que actualmente sería rechazado por estas reglas continúe siendo rechazado tras la migración.
8. WHEN un usuario se autentica por primera vez mediante un Proveedor_OAuth en Supabase_Auth, THE Sistema SHALL continuar generando y almacenando la clave del avatar del usuario de forma equivalente al hook `user.create.after` actual, utilizando Supabase_Storage según lo definido en el Requisito 9.
9. THE Sistema SHALL documentar como pregunta abierta el plan de migración de los usuarios, cuentas y sesiones existentes almacenados en las tablas de Better Auth (`packages/db/src/schema/auth.ts`) hacia Supabase_Auth, sin asumir de forma implícita que los usuarios existentes conservarán acceso sin una migración de datos explícita.
10. IF la autenticación mediante Supabase_Auth falla al iniciar la Aplicacion_Web (por ejemplo credenciales de proyecto inválidas), THEN THE Aplicacion_Web SHALL registrar un error descriptivo mediante `@kan/logger`.
11. IF un usuario intenta iniciar sesión mediante Supabase_Auth con credenciales inválidas, THEN THE Sistema SHALL rechazar el inicio de sesión, no crear una sesión activa, y presentar al usuario un mensaje de error indicando que las credenciales son inválidas.
12. IF la eliminación del usuario en Supabase_Auth falla durante el proceso de eliminación de cuenta descrito en el criterio 3, THEN THE Sistema SHALL conservar tanto el usuario en Supabase_Auth como los registros asociados en `packages/db` sin aplicar ninguna eliminación parcial, y SHALL presentar al usuario un mensaje de error indicando que la eliminación de la cuenta no se completó.
13. IF un intento de registro es rechazado por `NEXT_PUBLIC_DISABLE_SIGN_UP` sin una invitación pendiente asociada, o porque el dominio del correo electrónico no está incluido en `BETTER_AUTH_ALLOWED_DOMAINS`, THEN THE Sistema SHALL rechazar el registro mediante Supabase_Auth, no crear una cuenta de usuario, y presentar al usuario un mensaje de error indicando el motivo del rechazo.
14. THE Sistema SHALL excluir explícitamente de esta migración la reconstrucción de la Facturacion_Stripe_BetterAuth sobre Supabase_Auth o sobre cualquier otro mecanismo, sin sustituir, reimplementar ni preservar los períodos de prueba, los planes de equipo/pro, la autorización de referencia de espacio de trabajo (`authorizeReference`) ni los webhooks de suscripción actualmente provistos por el plugin `stripe` de Better Auth.
15. THE Sistema SHALL reconstruir la autenticación mediante Clave_API utilizando un mecanismo compatible con Supabase (por ejemplo una tabla dedicada consultada mediante el Cliente_Supabase_JS o `packages/db`), de forma que una solicitud a la API que incluya una Clave_API válida en el encabezado `Authorization: Bearer <clave>` o en el encabezado `x-api-key` sea autenticada y asociada al usuario propietario de dicha Clave_API, de forma equivalente al comportamiento actual del plugin `apiKey` de Better Auth.
16. THE Sistema SHALL aplicar un límite de tasa (rate limiting) a las solicitudes autenticadas mediante Clave_API equivalente al configurado actualmente en el plugin `apiKey` de Better Auth (100 solicitudes por ventana de 1 minuto por Clave_API), rechazando las solicitudes que excedan dicho límite.
17. IF una solicitud a la API incluye una Clave_API inválida, revocada o inexistente en el encabezado `Authorization: Bearer <clave>` o `x-api-key`, THEN THE Sistema SHALL rechazar la solicitud sin autenticar al usuario.
18. THE Sistema SHALL reconstruir el envío de Enlace_Magico para inicio de sesión sin contraseña utilizando la capacidad de OTP/enlace mágico de Supabase_Auth, de forma que un usuario que solicite iniciar sesión sin contraseña reciba un correo electrónico con un Enlace_Magico que, al abrirse, complete el inicio de sesión sin requerir contraseña.
19. THE Sistema SHALL reconstruir las invitaciones a espacios de trabajo basadas en Enlace_Magico utilizando la capacidad de OTP/enlace mágico de Supabase_Auth, de forma que al abrir el Enlace_Magico de una invitación se complete la invitación pendiente asociada al `memberPublicId` correspondiente, de forma equivalente al comportamiento actual de `sendMagicLink` en `packages/auth/src/plugins.ts` cuando la URL contiene `type=invite`.
20. IF el Enlace_Magico de una invitación a espacio de trabajo es abierto después de que la invitación pendiente asociada al `memberPublicId` correspondiente ya no existe o ya fue completada, THEN THE Sistema SHALL rechazar la finalización de dicha invitación y SHALL presentar al usuario un mensaje de error indicando que la invitación ya no es válida.

### Requisito 9: Sustitución del almacenamiento S3 por Supabase Storage

**Historia de Usuario:** Como operador del proyecto, quiero sustituir el almacenamiento S3 existente por Supabase_Storage para avatares y adjuntos de tarjetas, para consolidar el almacenamiento de archivos dentro de Supabase.

#### Criterios de Aceptación

1. THE Sistema SHALL almacenar las imágenes de avatar de usuario en un Bucket_Supabase de Supabase_Storage, sustituyendo el bucket S3 configurado mediante `NEXT_PUBLIC_AVATAR_BUCKET_NAME`.
2. THE Sistema SHALL almacenar los adjuntos de tarjetas (card attachments) en un Bucket_Supabase de Supabase_Storage, sustituyendo el bucket S3 configurado mediante `NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME`.
3. WHEN se solicita subir un archivo (avatar o adjunto), THE Sistema SHALL generar una URL de carga firmada utilizando Supabase_Storage en lugar de `generateUploadUrl` basado en `@aws-sdk/client-s3`, con una expiración máxima de 60 segundos.
4. WHEN se solicita descargar o visualizar un archivo (avatar o adjunto), THE Sistema SHALL generar una URL de descarga mediante Supabase_Storage en lugar de `generateDownloadUrl` basado en `@aws-sdk/client-s3`, con una expiración máxima de 3600 segundos.
5. WHEN se elimina un adjunto o un avatar, THE Sistema SHALL eliminar el objeto correspondiente del Bucket_Supabase en lugar de invocar `deleteObject` basado en `@aws-sdk/client-s3`.
6. IF la clave de imagen de avatar corresponde a una URL externa completa (por ejemplo un avatar de un Proveedor_OAuth), THEN THE Sistema SHALL retornar dicha URL sin intentar resolverla contra Supabase_Storage, preservando el comportamiento actual de `generateAvatarUrl`.
7. WHEN se ejecuta la verificación de salud del sistema (health check), THE Sistema SHALL verificar la conectividad con Supabase_Storage y SHALL reportar uno de los tres estados: `ok`, `error`, o `not_configured`, en lugar de verificar la conectividad con el cliente S3 actual en `packages/api/src/routers/health.ts`.
8. IF una solicitud de carga de archivo excede el límite de tamaño configurado o utiliza un tipo de contenido no permitido, THEN THE Sistema SHALL rechazar la generación de la URL de carga y SHALL presentar un mensaje de error indicando el motivo del rechazo.
9. IF la eliminación de un objeto en Supabase_Storage falla, THEN THE Sistema SHALL registrar el error mediante `@kan/logger` y SHALL continuar con la eliminación (soft delete) del registro asociado en `packages/db` sin bloquear la operación.
10. THE Sistema SHALL documentar como pregunta abierta el plan de migración de los archivos existentes almacenados en los buckets S3 actuales hacia los Buckets_Supabase, sin asumir de forma implícita que los archivos existentes estarán disponibles sin una migración de datos explícita.

### Requisito 10: Compatibilidad con el despliegue de auto-hospedaje existente

**Historia de Usuario:** Como mantenedor del proyecto open-source, quiero entender y documentar el impacto de sustituir Better Auth y S3 por Supabase_Auth y Supabase_Storage sobre los usuarios que auto-hospedan Kan con Docker Compose y su propia base de datos PostgreSQL, para evitar romper la compatibilidad con despliegues existentes sin una decisión explícita.

#### Criterios de Aceptación

1. THE Sistema SHALL documentar en la sección "Preguntas Abiertas" del documento de diseño si los despliegues auto-hospedados mediante `docker-compose.yml` y `cloud/docker-compose.yml` requerirán una cuenta de Supabase para Supabase_Auth y Supabase_Storage tras esta migración, dado que dichos servicios sustituyen a Better Auth y S3 respectivamente.
2. THE Sistema SHALL requerir que la pregunta abierta descrita en el criterio 1 quede resuelta y registrada en el documento de diseño antes de iniciar la implementación de los Requisitos 8 y 9.
3. IF se decide que los despliegues auto-hospedados deben seguir funcionando sin una cuenta de Supabase, THEN THE Sistema SHALL definir en el diseño un mecanismo de configuración que permita dicha compatibilidad, en lugar de asumir Supabase_Auth y Supabase_Storage como dependencias obligatorias para todos los despliegues.
4. IF se decide que los despliegues auto-hospedados requerirán obligatoriamente una cuenta de Supabase, THEN THE Sistema SHALL documentar en la guía de auto-hospedaje los pasos de configuración necesarios para dicha cuenta.
5. THE Cliente_DB SHALL conectarse y ejecutar consultas sin errores de conexión tanto contra instancias de PostgreSQL estándar (auto-hospedadas) como contra instancias de Supabase, utilizando la misma interfaz de configuración basada en `POSTGRES_URL` sin requerir Variables_De_Entorno adicionales para diferenciar el tipo de instancia, independientemente de la decisión tomada sobre Supabase_Auth y Supabase_Storage.

## Preguntas Abiertas

Las siguientes preguntas quedan explícitamente abiertas y requieren una decisión antes de completar el diseño e iniciar la implementación. No deben resolverse de forma implícita ni silenciosa durante el desarrollo:

1. **Migración de usuarios y sesiones existentes**: ¿Se requiere migrar los usuarios, cuentas y sesiones existentes de las tablas de Better Auth hacia Supabase_Auth (por ejemplo mediante un script de migración de contraseñas/identidades), o esta migración solo aplica a instalaciones nuevas sin datos previos?
2. **Migración de archivos existentes**: ¿Se requiere migrar los archivos existentes (avatares, adjuntos de tarjetas) desde los buckets S3 actuales hacia los Buckets_Supabase, o se asume que solo los archivos nuevos usarán Supabase_Storage?
3. **Auto-hospedaje sin Supabase**: ¿Los usuarios que auto-hospedan Kan mediante Docker Compose deberán crear obligatoriamente una cuenta de Supabase para Auth y Storage, o el proyecto debe mantener una vía de configuración alternativa (por ejemplo Better Auth + S3) para dichos despliegues?
4. **Mantenimiento del Script_SQL_Esquema**: ¿El Script_SQL_Esquema debe generarse/actualizarse automáticamente a partir de las migraciones de Drizzle, o se mantiene y actualiza manualmente cada vez que se agrega una migración nueva?
