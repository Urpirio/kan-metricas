import { describe, it, expect } from "vitest";

import { isSignUpAllowed } from "./hooks";

describe("isSignUpAllowed", () => {
  it("allows sign-up when disableSignUp is false and no domain restriction", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: false,
      hasPendingInvitation: false,
      allowedDomains: [],
    });
    expect(result).toBe(true);
  });

  it("allows sign-up when disableSignUp is false regardless of invitation", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: false,
      hasPendingInvitation: true,
      allowedDomains: [],
    });
    expect(result).toBe(true);
  });

  it("blocks sign-up when disabled and user has no pending invitation", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: true,
      hasPendingInvitation: false,
      allowedDomains: [],
    });
    expect(result).toBe(false);
  });

  it("allows sign-up when disabled but user has a pending invitation", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: true,
      hasPendingInvitation: true,
      allowedDomains: [],
    });
    expect(result).toBe(true);
  });

  it("blocks sign-up when domain is not in allowed list", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: false,
      hasPendingInvitation: false,
      allowedDomains: ["acme.com"],
    });
    expect(result).toBe(false);
  });

  it("allows sign-up when domain is in allowed list", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: false,
      hasPendingInvitation: false,
      allowedDomains: ["example.com"],
    });
    expect(result).toBe(true);
  });

  it("blocks sign-up when disabled, invitation exists, but domain is not allowed", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: true,
      hasPendingInvitation: true,
      allowedDomains: ["acme.com"],
    });
    expect(result).toBe(false);
  });

  it("allows sign-up when disabled, invitation exists, and domain is allowed", () => {
    const result = isSignUpAllowed({
      email: "test@example.com",
      disableSignUp: true,
      hasPendingInvitation: true,
      allowedDomains: ["example.com"],
    });
    expect(result).toBe(true);
  });

  it("handles email without domain part", () => {
    const result = isSignUpAllowed({
      email: "nodomain",
      disableSignUp: false,
      hasPendingInvitation: false,
      allowedDomains: ["example.com"],
    });
    expect(result).toBe(false);
  });

  it("handles case-insensitive domain matching", () => {
    const result = isSignUpAllowed({
      email: "test@Example.COM",
      disableSignUp: false,
      hasPendingInvitation: false,
      allowedDomains: ["example.com"],
    });
    expect(result).toBe(true);
  });
});
