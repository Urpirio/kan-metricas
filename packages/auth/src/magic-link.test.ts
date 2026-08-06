import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { parseInviteCallbackParams, completeInvite } from "./magic-link";

/**
 * **Property 10: La finalización de invitación por Enlace_Magico depende únicamente del estado del miembro referenciado**
 * **Validates: Requirements 8.19, 8.20**
 *
 * Tag: Feature: migrate-supabase-vercel, Property 10
 */
describe("completeInvite - Property 10", () => {
  it("succeeds only when member exists with status 'invited'", () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        fc.option(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            status: fc.oneof(
              fc.constant("invited"),
              fc.constant("active"),
              fc.constant("paused"),
              fc.constant("removed"),
              fc.string({ minLength: 1, maxLength: 20 }),
            ),
          }),
          { nil: null },
        ),
        async (memberPublicId, userId, memberState) => {
          let acceptInviteCalled = false;
          let acceptInviteArgs: { memberId: number; userId: string } | null =
            null;

          const memberLookup = async (
            _publicId: string,
          ): Promise<{ id: number; status: string } | null> => {
            return memberState;
          };

          const acceptInvite = async (
            memberId: number,
            uId: string,
          ): Promise<void> => {
            acceptInviteCalled = true;
            acceptInviteArgs = { memberId, userId: uId };
          };

          const result = await completeInvite(
            memberPublicId,
            userId,
            memberLookup,
            acceptInvite,
          );

          if (memberState === null) {
            // Member doesn't exist → invite_not_found
            expect(result).toEqual({
              success: false,
              reason: "invite_not_found",
            });
            expect(acceptInviteCalled).toBe(false);
          } else if (memberState.status !== "invited") {
            // Member exists but not in "invited" status → invite_already_completed
            expect(result).toEqual({
              success: false,
              reason: "invite_already_completed",
            });
            expect(acceptInviteCalled).toBe(false);
          } else {
            // Member exists and status is "invited" → success
            expect(result).toEqual({ success: true });
            expect(acceptInviteCalled).toBe(true);
            expect(acceptInviteArgs).toEqual({
              memberId: memberState.id,
              userId,
            });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Integration test for the invite flow.
 * **Validates: Requirements 8.18, 8.19**
 */
describe("completeInvite - integration", () => {
  it("invokes acceptInvite exactly once when member status is 'invited'", async () => {
    let acceptInviteCallCount = 0;

    const memberLookup = async (
      _publicId: string,
    ): Promise<{ id: number; status: string } | null> => {
      return { id: 42, status: "invited" };
    };

    const acceptInvite = async (
      _memberId: number,
      _userId: string,
    ): Promise<void> => {
      acceptInviteCallCount++;
    };

    const result = await completeInvite(
      "abc123publicId",
      "user-uuid-123",
      memberLookup,
      acceptInvite,
    );

    expect(result).toEqual({ success: true });
    expect(acceptInviteCallCount).toBe(1);
  });

  it("does not invoke acceptInvite when member does not exist", async () => {
    let acceptInviteCallCount = 0;

    const memberLookup = async (
      _publicId: string,
    ): Promise<{ id: number; status: string } | null> => {
      return null;
    };

    const acceptInvite = async (
      _memberId: number,
      _userId: string,
    ): Promise<void> => {
      acceptInviteCallCount++;
    };

    const result = await completeInvite(
      "nonexistent",
      "user-uuid-123",
      memberLookup,
      acceptInvite,
    );

    expect(result).toEqual({ success: false, reason: "invite_not_found" });
    expect(acceptInviteCallCount).toBe(0);
  });

  it("does not invoke acceptInvite when member status is 'active'", async () => {
    let acceptInviteCallCount = 0;

    const memberLookup = async (
      _publicId: string,
    ): Promise<{ id: number; status: string } | null> => {
      return { id: 99, status: "active" };
    };

    const acceptInvite = async (
      _memberId: number,
      _userId: string,
    ): Promise<void> => {
      acceptInviteCallCount++;
    };

    const result = await completeInvite(
      "abc123publicId",
      "user-uuid-123",
      memberLookup,
      acceptInvite,
    );

    expect(result).toEqual({
      success: false,
      reason: "invite_already_completed",
    });
    expect(acceptInviteCallCount).toBe(0);
  });
});

describe("parseInviteCallbackParams", () => {
  it("returns memberPublicId when type is 'invite' and memberPublicId is present", () => {
    const result = parseInviteCallbackParams({
      type: "invite",
      memberPublicId: "abc123",
    });
    expect(result).toEqual({ memberPublicId: "abc123" });
  });

  it("returns null when type is not 'invite'", () => {
    expect(parseInviteCallbackParams({ type: "login" })).toBeNull();
    expect(parseInviteCallbackParams({ type: undefined })).toBeNull();
    expect(parseInviteCallbackParams({})).toBeNull();
  });

  it("returns null when type is 'invite' but memberPublicId is missing", () => {
    expect(
      parseInviteCallbackParams({ type: "invite", memberPublicId: undefined }),
    ).toBeNull();
    expect(
      parseInviteCallbackParams({ type: "invite", memberPublicId: "" }),
    ).toBeNull();
    expect(
      parseInviteCallbackParams({ type: "invite", memberPublicId: "   " }),
    ).toBeNull();
  });
});
