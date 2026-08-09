import { useEffect, useRef } from "react";

import { getSupabaseBrowserClient } from "@kan/auth/client";

/**
 * Subscribes to live Postgres changes on `card` and `list` for a single
 * board, so that edits made by other users viewing the same board appear
 * without a manual refresh.
 *
 * This intentionally does NOT replace tRPC as the source of truth for board
 * data — it only tells the client *when* to refetch (via `onChange`), using
 * Supabase Realtime purely as a change notification channel. The actual
 * data still comes from `board.byId`, which enforces the app's full
 * permission model. Realtime's own authorization (see the
 * `realtime_select_card`/`realtime_select_list` RLS policies added in
 * `packages/db/migrations/20260806120000_AddRealtimeBoardPolicies.sql`) only
 * needs to answer "can this user see this board at all", so it's safe for
 * it to be coarser than tRPC's per-action permission checks.
 *
 * `boardId` is the board's *internal* numeric id (not `publicId`) because
 * Realtime's `postgres_changes` filter matches raw column values on the
 * subscribed table, and `list` carries `boardId` directly.
 *
 * KNOWN IMPRECISION: `card` has no `boardId` column (only `listId`), and
 * Supabase Realtime filters don't support an `in` operator for "listId is
 * one of these" — only single-value equality (optionally ANDed with other
 * columns). So card changes are subscribed to WITHOUT a filter, gated only
 * by the `realtime_select_card` RLS policy. This means a client viewing
 * board A will also trigger a refetch when a card changes on board B in a
 * workspace it belongs to — a harmless extra refetch, not a data leak,
 * since `onChange` only re-runs `board.byId` for the currently open board
 * and RLS still governs what Realtime itself will deliver. Precisely
 * scoping this would require denormalizing `boardId` onto `card`, which is
 * a larger schema change out of scope here.
 *
 * No-ops when Supabase isn't configured (self-hosted deployments without
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`), so boards
 * still work without realtime updates — refetching stays manual/on-mutation
 * in that case, same as before this feature existed.
 *
 * Uses the cookie-backed Supabase browser client singleton from
 * `@kan/auth/client` (the same one used for sign-in/session state) rather
 * than constructing a fresh client. The RLS policies above key off
 * `auth.uid()`, so the client used here must actually carry the logged-in
 * user's session — a client created via `createClient` from
 * `@supabase/supabase-js` has no session at all and would connect to
 * Realtime as anonymous, causing every policy to reject and no events to
 * ever be delivered (silently — `.subscribe()` still "succeeds").
 */
export function useBoardRealtime(
  boardId: number | undefined,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!boardId) return;

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      // Supabase env vars missing — realtime is simply unavailable.
      return;
    }

    const channel = supabase
      .channel(`board-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card" },
        () => onChangeRef.current(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list",
          filter: `boardId=eq.${boardId}`,
        },
        () => onChangeRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [boardId]);
}
