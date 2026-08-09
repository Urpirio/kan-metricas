-- Enables Supabase Realtime for the Kanban board tables (board, list, card)
-- and adds the Row Level Security policies that Realtime needs in order to
-- authorize which rows a given browser client is allowed to receive change
-- events for.
--
-- Context: the application server connects as the `postgres` role and
-- bypasses RLS entirely — all authorization for tRPC requests happens in
-- application code (see packages/api/src/utils/permissions.ts), not via
-- these policies. These policies exist ONLY to gate direct
-- `postgres_changes` subscriptions made from the browser using the
-- Supabase anon/authenticated client. They intentionally mirror a coarser
-- version of the app's authorization model (workspace membership) rather
-- than the full permission system, since Realtime only needs a yes/no read
-- check, not the fine-grained action permissions used elsewhere.
--
-- A user may receive change events for a card/list/board row if either:
--   1. They are an active (non-removed, non-paused) member of the
--      workspace that owns the board, OR
--   2. The board is public (visibility = 'public').
--
-- Portability: this file is a no-op on plain PostgreSQL (self-hosted
-- `docker-compose.yml` with the vanilla `postgres:15` image, or the PGLite
-- fallback used in local dev without `POSTGRES_URL`). Every statement below
-- is guarded to only run when the `auth` schema (Supabase Auth) and/or the
-- `supabase_realtime` publication actually exist, so applying this
-- migration against a non-Supabase Postgres leaves the schema untouched
-- instead of failing on `auth.uid()` or `ALTER PUBLICATION`.
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE OR REPLACE FUNCTION public.is_active_workspace_member(target_workspace_id bigint)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public, auth
    STABLE
    AS $func$
      SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_members."workspaceId" = target_workspace_id
          AND workspace_members."userId" = auth.uid()
          AND workspace_members.status = 'active'
          AND workspace_members."deletedAt" IS NULL
      );
    $func$;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'board' AND policyname = 'realtime_select_board'
    ) THEN
      CREATE POLICY "realtime_select_board" ON "board"
        FOR SELECT
        USING (
          visibility = 'public'
          OR public.is_active_workspace_member("workspaceId")
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list' AND policyname = 'realtime_select_list'
    ) THEN
      CREATE POLICY "realtime_select_list" ON "list"
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM board
            WHERE board.id = list."boardId"
              AND (
                board.visibility = 'public'
                OR public.is_active_workspace_member(board."workspaceId")
              )
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'card' AND policyname = 'realtime_select_card'
    ) THEN
      CREATE POLICY "realtime_select_card" ON "card"
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM list
            JOIN board ON board.id = list."boardId"
            WHERE list.id = card."listId"
              AND (
                board.visibility = 'public'
                OR public.is_active_workspace_member(board."workspaceId")
              )
          )
        );
    END IF;

    -- `replica identity full` is required so that UPDATE/DELETE change
    -- events carry the full previous row (not just the primary key), which
    -- the policies above need in order to evaluate `boardId`/`listId` for
    -- rows that no longer match after the change (e.g. a card moved out of
    -- a list the client can see).
    ALTER TABLE "board" REPLICA IDENTITY FULL;
    ALTER TABLE "list" REPLICA IDENTITY FULL;
    ALTER TABLE "card" REPLICA IDENTITY FULL;
  END IF;
END $$;
--> statement-breakpoint

-- Registers the tables with Supabase's realtime publication so that
-- `postgres_changes` subscriptions receive events for them at all. Without
-- this, the RLS policies above are irrelevant because no events are
-- published in the first place. Guarded separately from the block above
-- because the `supabase_realtime` publication is created by Supabase's own
-- bootstrapping and may not exist yet even on a Supabase-backed database
-- (e.g. Realtime disabled for the project).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'board'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "board";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'list'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "list";
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'card'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "card";
    END IF;
  END IF;
END $$;
