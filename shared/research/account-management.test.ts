import { describe, expect, it } from "vitest";
import { accountRegistrationSchema, accountSelfMutationSchema, accountIdentityReplySchema, accountManagementConfigSchema } from "./account-management";

const registration = { email: "person@example.invalid", password: "synthetic-password", captchaToken: "synthetic-captcha" };
describe("closed ordinary-account contracts", () => {
  it("normalizes ordinary presentation fields without accepting identity/role or redirect authority", () => {
    expect(accountRegistrationSchema.parse({ ...registration, email: " Person@Example.Invalid ", displayName: " Person " }))
      .toEqual({ ...registration, displayName: "Person" });
    for (const field of ["role", "memberId", "organizationId", "app_metadata", "data", "returnTo", "redirectTo", "email_confirm"]) {
      expect(accountRegistrationSchema.safeParse({ ...registration, [field]: "untrusted" }).success).toBe(false);
    }
  });
  it.each([{ password: "short" }, { password: "a".repeat(129) }, { displayName: "a".repeat(101) },
    { displayName: "bad\nname" }, { captchaToken: "" }, { captchaToken: "a".repeat(4097) }, { email: "not-an-email" }])("bounds registration %#", patch => {
    expect(accountRegistrationSchema.safeParse({ ...registration, ...patch }).success).toBe(false);
  });
  it("requires an explicit closed own-operation and provider nonce for password changes", () => {
    expect(accountSelfMutationSchema.parse({ operation: "email", email: " New@Example.Invalid " })).toEqual({ operation: "email", email: "new@example.invalid" });
    expect(accountSelfMutationSchema.safeParse({ operation: "password", password: registration.password }).success).toBe(false);
    expect(accountSelfMutationSchema.safeParse({ operation: "password", password: registration.password, nonce: "123456" }).success).toBe(true);
    for (const extra of [{ userId: "another" }, { app_metadata: { role: "admin" } }, { data: { role: "admin" } }]) {
      expect(accountSelfMutationSchema.safeParse({ operation: "profile", displayName: "Person", ...extra }).success).toBe(false);
    }
  });
  it("does not accept extra private authority in own identity or claim deletion availability", () => {
    const identity = { userId: "10000000-0000-4000-8000-000000000001", email: registration.email, emailVerified: true, displayName: "Person", pendingEmail: null };
    expect(accountIdentityReplySchema.safeParse({ ok: true, identity }).success).toBe(true);
    expect(accountIdentityReplySchema.safeParse({ ok: true, identity: { ...identity, roles: ["staff"] } }).success).toBe(false);
    expect(accountManagementConfigSchema.safeParse({ registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true, confirmationRedirect: "https://fixture.example.invalid/research/sign-in", deletion: "available" }).success).toBe(false);
  });
});
