import { randomUUID } from "crypto";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import type { NextApiRequest, NextApiResponse } from "next";
import type { OpenApiMeta } from "trpc-to-openapi";
import { initTRPC, TRPCError } from "@trpc/server";
import { env } from "next-runtime-env";
import superjson from "superjson";
import { ZodError } from "zod";

import type { dbClient } from "@kan/db/client";
import { getSession, signInWithPassword, setUserPassword } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";
import * as userRepo from "@kan/db/repository/user.repo";
import { createLogger } from "@kan/logger";
import { createSupabaseServerClient } from "@kan/shared/utils/supabase-server";

const log = createLogger("api");

/**
 * Provisions the application `user` row for a Supabase Auth session.
 *
 * Supabase Auth stores identities in its own `auth.users` table, so the first
 * authenticated request for a user must create the matching application row
 * before any entity referencing `user.id` can be inserted. This runs on every
 * authenticated request and is a cheap no-op once the row exists.
 *
 * A failure here is logged rather than thrown so that the request proceeds and
 * surfaces its own error, instead of masking it with a context-creation error.
 */
async function syncUser(db: dbClient, user: User | null | undefined) {
  if (!user?.id || !user.email) return;

  try {
    await userRepo.ensureExists(db, {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
    });
  } catch (error) {
    log.error(
      { err: error, userId: user.id },
      "Failed to provision application user row for Supabase Auth user",
    );
  }
}

const TRPC_STATUS_MAP: Partial<Record<TRPCError["code"], number>> = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null | undefined;
  stripeCustomerId?: string | null | undefined;
}

export interface AuthApi {
  getSession: () => Promise<{ user: User } | null>;
  signInMagicLink: (input: { email: string; callbackURL: string }) => Promise<{ status: boolean }>;
  setPassword: (input: { newPassword: string }) => Promise<void>;
}

interface CreateContextOptions {
  user: User | null | undefined;
  db: dbClient;
  auth: { api: AuthApi };
  headers: Headers;
  transport?: "trpc" | "rest";
}

export const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    user: opts.user,
    db: opts.db,
    auth: opts.auth,
    headers: opts.headers,
    transport: opts.transport ?? "trpc",
    requestId: randomUUID(),
  };
};

/**
 * Creates an auth API wrapper compatible with the previous interface.
 * Uses Supabase Auth via `@kan/auth/server` getSession.
 */
function createAuthApi(req: NextApiRequest, res: NextApiResponse): AuthApi {
  return {
    getSession: () => getSession(req, res) as Promise<{ user: User } | null>,
    signInMagicLink: async (input: { email: string; callbackURL: string }) => {
      const supabase = createSupabaseServerClient();
      const baseUrl = env("NEXT_PUBLIC_BASE_URL") ?? "";
      const { error } = await supabase.auth.signInWithOtp({
        email: input.email,
        options: {
          emailRedirectTo: `${baseUrl}${input.callbackURL}`,
        },
      });
      return { status: !error };
    },
    setPassword: async (input: { newPassword: string }) => {
      // This requires knowing the userId from the current session.
      // The session is already resolved in the context; we use the admin API.
      const session = await getSession(req, res);
      if (!session?.user?.id) {
        throw new Error("No authenticated user to set password for");
      }
      await setUserPassword(session.user.id, input.newPassword);
    },
  };
}

export const createTRPCContext = async ({ req, res }: CreateNextContextOptions) => {
  const db = createDrizzleClient();
  const auth = { api: createAuthApi(req, res) };

  const session = await auth.api.getSession();
  await syncUser(db, session?.user);

  return createInnerTRPCContext({
    db,
    user: session?.user,
    auth,
    headers: new Headers(req.headers as Record<string, string>),
    transport: "trpc",
  });
};

export const createNextApiContext = async (req: NextApiRequest, res?: NextApiResponse) => {
  const db = createDrizzleClient();
  // If no res is provided, create a minimal no-op response object for cookie reading.
  // Session will still be read from cookies, but any refreshed tokens won't be persisted.
  const dummyRes = res ?? ({
    appendHeader: () => undefined,
  } as unknown as NextApiResponse);
  const auth = { api: createAuthApi(req, dummyRes) };

  const session = await auth.api.getSession();
  await syncUser(db, session?.user);

  return createInnerTRPCContext({
    db,
    user: session?.user,
    auth,
    headers: new Headers(req.headers as Record<string, string>),
    transport: "trpc",
  });
};

export const createRESTContext = async ({ req, res }: CreateNextContextOptions) => {
  const db = createDrizzleClient();
  const auth = { api: createAuthApi(req, res) };

  let session;
  try {
    session = await auth.api.getSession();
  } catch (error) {
    log.warn({ err: error }, "Failed to get session, treating as unauthenticated");
  }

  await syncUser(db, session?.user);

  // If no session, try API key authentication
  let user = session?.user;
  if (!user) {
    const { authenticateApiKey } = await import("./utils/apiKeyMiddleware");
    const apiKeyResult = await authenticateApiKey({ db, headers: new Headers(req.headers as Record<string, string>) });
    if (apiKeyResult) {
      user = { id: apiKeyResult.userId } as User;
    }
  }

  return createInnerTRPCContext({
    db,
    user,
    auth,
    headers: new Headers(req.headers as Record<string, string>),
    transport: "rest",
  });
};

const t = initTRPC
  .context<typeof createTRPCContext>()
  .meta<OpenApiMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });

export const createTRPCRouter = t.router;

export const createCallerFactory = t.createCallerFactory;

const loggingMiddleware = t.middleware(async ({ path, type, next, ctx, getRawInput }) => {
  const start = Date.now();
  const [result, input] = await Promise.all([next(), getRawInput().catch(() => undefined)]);
  const duration = Date.now() - start;

  const { user, transport, requestId } = ctx as {
    user?: { id: string; email: string };
    transport?: string;
    requestId?: string;
  };
  const isCloud = process.env.NEXT_PUBLIC_KAN_ENV === "cloud";
  const meta = {
    requestId,
    procedure: path,
    type,
    transport,
    duration,
    userId: user?.id,
    ...(isCloud && { email: user?.email }),
    input,
  };

  const label = transport === "rest" ? "REST" : "tRPC";

  if (result.ok) {
    log.info({ ...meta, status: 200 }, `${label} OK`);
  } else {
    const status = TRPC_STATUS_MAP[result.error.code] ?? 500;
    const errorCode = result.error.code;
    log.error(
      { ...meta, status, errorCode, err: result.error },
      `${label} error`,
    );
  }

  return result;
});

export const publicProcedure = t.procedure.use(loggingMiddleware);

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx,
  });
});

const enforceUserIsAdmin = t.middleware(async ({ ctx, next }) => {
  if (ctx.headers.get("x-admin-api-key") !== env("KAN_ADMIN_API_KEY")) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx,
  });
});

export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(enforceUserIsAuthed);

const enforceApiKeyAuth = t.middleware(async ({ ctx, next }) => {
  const { authenticateApiKey } = await import("./utils/apiKeyMiddleware");
  const apiKeyResult = await authenticateApiKey({
    db: ctx.db,
    headers: ctx.headers,
  });

  if (!apiKeyResult) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "API key required" });
  }

  return next({
    ctx: {
      ...ctx,
      user: { id: apiKeyResult.userId } as User,
      apiKeyPublicId: apiKeyResult.publicId,
    },
  });
});

export const apiKeyProtectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(enforceApiKeyAuth);

export const adminProtectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(enforceUserIsAdmin)
  .meta({
    openapi: {
      method: "GET",
      path: "/admin/protected",
    },
  });
