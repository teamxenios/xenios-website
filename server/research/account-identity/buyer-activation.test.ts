import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateBuyerAccount,
  type BuyerActivationDeps,
  type BuyerAuthIdentity,
  type BuyerMemberBinding,
} from "./buyer-activation";

const applicationId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const invitedAuthUserId = "33333333-3333-4333-8333-333333333333";
const canonicalEmail = "verified.buyer@example.com";

const auth: BuyerAuthIdentity = {
  id: authUserId,
  email: canonicalEmail,
  emailConfirmedAt: "2026-08-13T12:00:00.000Z",
};

const binding: BuyerMemberBinding = {
  memberId: "44444444-4444-4444-8444-444444444444",
  applicationId,
  authUserId,
  email: canonicalEmail,
  status: "active",
};

function deps(): BuyerActivationDeps {
  return {
    findApplication: vi.fn(async () => ({
      id: applicationId,
      email: canonicalEmail,
      firstName: "Verified",
      status: "active",
    })),
    findAuthUserById: vi.fn(async () => auth),
    findAuthUserByEmail: vi.fn(async () => null),
    findMemberByApplicationId: vi.fn(async () => null),
    findMemberByAuthUserId: vi.fn(async () => null),
    bindActiveMember: vi.fn(async (input) => ({
      ...binding,
      applicationId: input.applicationId,
      authUserId: input.authUserId,
      email: input.normalizedEmail,
    })),
    sendExistingUserAccessEmail: vi.fn(async () => true),
    resendPendingAuthAccessEmail: vi.fn(async () => true),
    inviteAuthUser: vi.fn(async (input) => ({
      id: invitedAuthUserId,
      email: input.normalizedEmail,
      emailConfirmedAt: null,
    })),
  };
}

describe("canonical buyer account activation", () => {
  let subject: BuyerActivationDeps;

  beforeEach(() => {
    subject = deps();
  });

  it("attaches one exact confirmed existing Supabase identity and sends recovery access", async () => {
    const result = await activateBuyerAccount(subject, {
      path: "existing_auth",
      applicationId,
      canonicalEmail: canonicalEmail.toUpperCase(),
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com");

    expect(result).toMatchObject({
      ok: true,
      path: "existing_user_attached",
      authUserId,
      canonicalEmail,
      accessEmailAccepted: true,
    });
    expect(subject.bindActiveMember).toHaveBeenCalledWith({
      applicationId,
      authUserId,
      normalizedEmail: canonicalEmail,
      firstName: "Verified",
      actorLabel: "authorized-operator",
      path: "existing_user_attached",
    });
    expect(subject.sendExistingUserAccessEmail).toHaveBeenCalledWith({
      normalizedEmail: canonicalEmail,
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    });
    expect(subject.inviteAuthUser).not.toHaveBeenCalled();
  });

  it("is idempotent for the exact active member binding", async () => {
    subject.findMemberByApplicationId = vi.fn(async () => binding);
    subject.findMemberByAuthUserId = vi.fn(async () => binding);

    const result = await activateBuyerAccount(subject, {
      path: "existing_auth",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com");

    expect(result).toMatchObject({ ok: true, path: "existing_user_ready" });
    expect(subject.bindActiveMember).not.toHaveBeenCalled();
  });

  it.each([
    ["missing user", null, "AUTH_USER_NOT_FOUND"],
    ["unconfirmed user", { ...auth, emailConfirmedAt: null }, "AUTH_EMAIL_NOT_VERIFIED"],
    ["different email", { ...auth, email: "someone-else@example.com" }, "AUTH_EMAIL_MISMATCH"],
  ] as const)("fails closed for an existing-auth %s", async (_label, found, code) => {
    subject.findAuthUserById = vi.fn(async () => found);
    const result = await activateBuyerAccount(subject, {
      path: "existing_auth",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com");
    expect(result).toEqual({ ok: false, code });
    expect(subject.bindActiveMember).not.toHaveBeenCalled();
  });

  it("refuses inactive or mismatched canonical applications", async () => {
    subject.findApplication = vi.fn(async () => ({
      id: applicationId,
      email: canonicalEmail,
      firstName: "Verified",
      status: "pending",
    }));
    await expect(activateBuyerAccount(subject, {
      path: "existing_auth",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com")).resolves.toEqual({
      ok: false,
      code: "APPLICATION_NOT_ACTIVE",
    });

    subject.findApplication = vi.fn(async () => ({
      id: applicationId,
      email: "different@example.com",
      firstName: "Verified",
      status: "active",
    }));
    await expect(activateBuyerAccount(subject, {
      path: "existing_auth",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com")).resolves.toEqual({
      ok: false,
      code: "APPLICATION_EMAIL_MISMATCH",
    });
  });

  it("never invites when an Auth identity already exists for the email", async () => {
    subject.findAuthUserByEmail = vi.fn(async () => auth);
    const result = await activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
    }, "https://xeniostechnology.com");
    expect(result).toEqual({ ok: false, code: "EXISTING_AUTH_REQUIRES_UID" });
    expect(subject.inviteAuthUser).not.toHaveBeenCalled();
  });

  it("uses the sole Supabase secure-invite path when read-only evidence proves absence", async () => {
    const result = await activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
    }, "https://xeniostechnology.com");

    expect(result).toMatchObject({
      ok: true,
      path: "new_user_invited",
      authUserId: invitedAuthUserId,
      canonicalEmail,
    });
    expect(subject.inviteAuthUser).toHaveBeenCalledWith({
      normalizedEmail: canonicalEmail,
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    });
    expect(subject.bindActiveMember).toHaveBeenCalledWith(expect.objectContaining({
      authUserId: invitedAuthUserId,
    }));
    expect(subject.sendExistingUserAccessEmail).not.toHaveBeenCalled();
  });

  it("returns an uncertain outcome without deleting Auth after an ambiguous binding failure", async () => {
    subject.bindActiveMember = vi.fn(async () => { throw new Error("binding refused"); });
    const result = await activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
    }, "https://xeniostechnology.com");
    expect(result).toEqual({ ok: false, code: "BINDING_OUTCOME_UNCERTAIN" });
  });

  it("recovers an exact atomically audited binding after a transport error", async () => {
    subject.bindActiveMember = vi.fn(async () => { throw new Error("transport lost after commit"); });
    subject.findMemberByApplicationId = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...binding, authUserId: invitedAuthUserId });
    subject.findMemberByAuthUserId = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...binding, authUserId: invitedAuthUserId });
    const result = await activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
    }, "https://xeniostechnology.com");
    expect(result).toMatchObject({ ok: true, path: "new_user_invited" });
  });

  it("reports an existing-user access-email failure without duplicating or undoing identity", async () => {
    subject.sendExistingUserAccessEmail = vi.fn(async () => { throw new Error("email unavailable"); });
    const result = await activateBuyerAccount(subject, {
      path: "existing_auth",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com");
    expect(result).toMatchObject({ ok: true, accessEmailAccepted: false });
    expect(subject.inviteAuthUser).not.toHaveBeenCalled();
  });

  it("rejects invalid inputs and unsafe redirect origins before touching identity stores", async () => {
    await expect(activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail: "not-an-email",
      actorLabel: "authorized-operator",
    }, "https://xeniostechnology.com")).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(subject.findApplication).not.toHaveBeenCalled();

    await expect(activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      password: "must-never-be-accepted",
    }, "https://xeniostechnology.com")).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });

    await expect(activateBuyerAccount(subject, {
      path: "new_secure_invite",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
    }, "http://xeniostechnology.com")).rejects.toThrow("HTTPS");
    expect(subject.findApplication).not.toHaveBeenCalled();
  });

  it("requires exact lookup IDs and validates the binding returned by storage", async () => {
    subject.findApplication = vi.fn(async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: canonicalEmail,
      firstName: "Verified",
      status: "active",
    }));
    await expect(activateBuyerAccount(subject, {
      path: "existing_auth", applicationId, canonicalEmail,
      actorLabel: "authorized-operator", authUserId,
    }, "https://xeniostechnology.com")).resolves.toEqual({ ok: false, code: "APPLICATION_NOT_FOUND" });

    subject = deps();
    subject.findAuthUserById = vi.fn(async () => ({ ...auth, id: invitedAuthUserId }));
    await expect(activateBuyerAccount(subject, {
      path: "existing_auth", applicationId, canonicalEmail,
      actorLabel: "authorized-operator", authUserId,
    }, "https://xeniostechnology.com")).resolves.toEqual({ ok: false, code: "AUTH_USER_NOT_FOUND" });

    subject = deps();
    subject.bindActiveMember = vi.fn(async () => ({ ...binding, authUserId: invitedAuthUserId }));
    await expect(activateBuyerAccount(subject, {
      path: "existing_auth", applicationId, canonicalEmail,
      actorLabel: "authorized-operator", authUserId,
    }, "https://xeniostechnology.com")).resolves.toEqual({ ok: false, code: "BINDING_RESULT_INVALID" });
  });

  it("securely resends an expired pending invitation to the exact unconfirmed Auth identity", async () => {
    subject.findAuthUserById = vi.fn(async () => ({ ...auth, emailConfirmedAt: null }));
    const result = await activateBuyerAccount(subject, {
      path: "existing_unconfirmed_resend",
      applicationId,
      canonicalEmail,
      actorLabel: "authorized-operator",
      authUserId,
    }, "https://xeniostechnology.com");
    expect(result).toMatchObject({ ok: true, path: "existing_invite_resent" });
    expect(subject.resendPendingAuthAccessEmail).toHaveBeenCalledWith({
      authUserId,
      normalizedEmail: canonicalEmail,
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    });
    expect(subject.bindActiveMember).toHaveBeenCalledWith(expect.objectContaining({
      authUserId,
      path: "existing_invite_resent",
    }));
    expect(subject.inviteAuthUser).not.toHaveBeenCalled();
  });
});
