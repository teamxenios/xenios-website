import { describe, expect, it, vi } from "vitest";
import {
  ROMAN_BUYER_ID,
  ROMAN_OPERATOR_EMAIL,
  activateRomanBusinessBuyer,
  type BusinessBuyerActivationDeps,
} from "./business-buyer-bridge";

const authUserId = "20ec822d-8123-4088-ac05-9c8f4b2da784";
const context = {
  buyerId: ROMAN_BUYER_ID,
  buyerSlug: "roman-health-marketplace",
  customerRef: `eac_${"a".repeat(32)}`,
  priceProfile: "KRIS_VOLUME_PARTNER" as const,
  roles: ["buyer_owner", "buyer_operator"] as const,
};

function deps(auth: unknown | null): BusinessBuyerActivationDeps {
  return {
    findAuthByEmail: vi.fn(async () => auth),
    inviteAuthUser: vi.fn(async () => ({ id: authUserId, email: ROMAN_OPERATOR_EMAIL, emailConfirmedAt: null })),
    finalizeClaim: vi.fn(async () => context),
  };
}

describe("Roman business buyer activation", () => {
  it("uses Supabase secure invite without creating a password or application", async () => {
    const subject = deps(null);
    await expect(activateRomanBusinessBuyer(subject, {
      siteUrl: "https://xeniostechnology.com",
      actorLabel: "authorized-operator",
    })).resolves.toEqual({ ok: true, state: "claim_sent", authUserId });
    expect(subject.inviteAuthUser).toHaveBeenCalledWith(
      ROMAN_OPERATOR_EMAIL,
      "https://xeniostechnology.com/research/reset-password",
    );
    expect(subject.finalizeClaim).not.toHaveBeenCalled();
  });

  it("waits for Kris to claim and confirm the identity", async () => {
    const subject = deps({ id: authUserId, email: ROMAN_OPERATOR_EMAIL, emailConfirmedAt: null });
    await expect(activateRomanBusinessBuyer(subject, {
      siteUrl: "https://xeniostechnology.com",
      actorLabel: "authorized-operator",
    })).resolves.toEqual({ ok: false, code: "CLAIM_PENDING" });
    expect(subject.finalizeClaim).not.toHaveBeenCalled();
  });

  it("binds the confirmed operator to Roman, its customer scope, and partner pricing", async () => {
    const subject = deps({
      id: authUserId,
      email: ROMAN_OPERATOR_EMAIL.toUpperCase(),
      emailConfirmedAt: "2026-08-13T12:00:00.000Z",
    });
    await expect(activateRomanBusinessBuyer(subject, {
      siteUrl: "https://xeniostechnology.com",
      actorLabel: "authorized-operator",
    })).resolves.toEqual({ ok: true, state: "ready", context });
    expect(subject.finalizeClaim).toHaveBeenCalledWith({
      buyerId: ROMAN_BUYER_ID,
      authUserId,
      email: ROMAN_OPERATOR_EMAIL,
      actorLabel: "authorized-operator",
    });
  });

  it("fails closed on identity mismatch or malformed storage output", async () => {
    await expect(activateRomanBusinessBuyer(deps({
      id: authUserId,
      email: "other@example.com",
      emailConfirmedAt: "2026-08-13T12:00:00.000Z",
    }), { siteUrl: "https://xeniostechnology.com", actorLabel: "authorized-operator" }))
      .resolves.toEqual({ ok: false, code: "AUTH_CONFLICT" });

    const subject = deps({
      id: authUserId,
      email: ROMAN_OPERATOR_EMAIL,
      emailConfirmedAt: "2026-08-13T12:00:00.000Z",
    });
    subject.finalizeClaim = vi.fn(async () => ({ ...context, priceProfile: "PUBLIC" }));
    await expect(activateRomanBusinessBuyer(subject, {
      siteUrl: "https://xeniostechnology.com",
      actorLabel: "authorized-operator",
    })).resolves.toEqual({ ok: false, code: "BINDING_FAILED" });
  });
});
