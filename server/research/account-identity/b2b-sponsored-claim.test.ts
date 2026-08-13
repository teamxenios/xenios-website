import { describe, expect, it, vi } from "vitest";
import {
  prepareSponsoredB2BClaim,
  type ExactIdentitySnapshot,
  type SponsoredB2BClaim,
  type SponsoredB2BClaimDeps,
} from "./b2b-sponsored-claim";

const EMAIL = "info@romanhealthcollective.com";
const APPLICATION_ID = "10000000-0000-4000-8000-000000000001";
const SPONSORSHIP_ID = "20000000-0000-4000-8000-000000000002";

const input = {
  path: "new_sponsored_claim",
  email: ` ${EMAIL.toUpperCase()} `,
  firstName: "Kris",
  lastName: "Founder supplied",
  country: "Founder supplied",
  applicantType: "professional",
  businessKey: "roman-health-marketplace",
  businessDisplayName: "Roman Health Marketplace",
  roles: ["organization_owner", "business_buyer"],
  profileKey: "KRIS_VOLUME_PARTNER",
  profileVersion: 1,
  profileEffectiveAt: "2026-08-13T12:00:00.000Z",
} as const;

const empty: ExactIdentitySnapshot = {
  authUserIds: [], applicationIds: [], memberIds: [], sponsorshipIds: [],
};

function claim(state: SponsoredB2BClaim["state"]): SponsoredB2BClaim {
  return {
    sponsorshipId: SPONSORSHIP_ID,
    applicationId: APPLICATION_ID,
    normalizedEmail: EMAIL,
    businessKey: input.businessKey,
    businessDisplayName: input.businessDisplayName,
    state,
    profileKey: "KRIS_VOLUME_PARTNER",
    profileVersion: 1,
    profileEffectiveAt: input.profileEffectiveAt,
  };
}

function deps(overrides: Partial<SponsoredB2BClaimDeps> = {}): SponsoredB2BClaimDeps {
  return {
    inspectExactEmail: vi.fn(async () => empty),
    prepareSponsoredClaim: vi.fn(async () => claim("claim_prepared")),
    sendExistingAccountClaim: vi.fn(async () => true),
    markClaimSent: vi.fn(async () => claim("claim_sent")),
    ...overrides,
  };
}

describe("prepareSponsoredB2BClaim", () => {
  it("reuses the canonical claim delivery only after an exact empty identity preflight", async () => {
    const subject = deps();
    await expect(prepareSponsoredB2BClaim(subject, input)).resolves.toEqual({
      ok: true,
      state: "claim_sent",
      sponsorshipId: SPONSORSHIP_ID,
      applicationId: APPLICATION_ID,
      normalizedEmail: EMAIL,
      businessKey: "roman-health-marketplace",
    });
    expect(subject.inspectExactEmail).toHaveBeenCalledWith(EMAIL);
    expect(subject.prepareSponsoredClaim).toHaveBeenCalledWith(expect.objectContaining({
      email: EMAIL,
      businessDisplayName: "Roman Health Marketplace",
      roles: ["organization_owner", "business_buyer"],
      profileKey: "KRIS_VOLUME_PARTNER",
    }));
    expect(subject.sendExistingAccountClaim).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      normalizedEmail: EMAIL,
      firstName: "Kris",
    });
  });

  it("strictly refuses password material", async () => {
    const subject = deps();
    await expect(prepareSponsoredB2BClaim(subject, { ...input, password: "do-not-accept" }))
      .resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(subject.inspectExactEmail).not.toHaveBeenCalled();
  });

  it("fails closed if any identity appears since the read-only grid", async () => {
    const subject = deps({
      inspectExactEmail: vi.fn(async () => ({
        ...empty,
        applicationIds: [APPLICATION_ID],
      })),
    });
    await expect(prepareSponsoredB2BClaim(subject, input))
      .resolves.toEqual({ ok: false, code: "IDENTITY_APPEARED_STOP" });
    expect(subject.prepareSponsoredClaim).not.toHaveBeenCalled();
  });

  it("fails closed on duplicate or malformed identity evidence", async () => {
    const subject = deps({
      inspectExactEmail: vi.fn(async () => ({
        ...empty,
        authUserIds: [
          "30000000-0000-4000-8000-000000000003",
          "40000000-0000-4000-8000-000000000004",
        ],
      })),
    });
    await expect(prepareSponsoredB2BClaim(subject, input))
      .resolves.toEqual({ ok: false, code: "AMBIGUOUS_STOP" });
  });

  it("keeps prepared evidence and reports delivery failure without pretending the claim was sent", async () => {
    const subject = deps({ sendExistingAccountClaim: vi.fn(async () => false) });
    await expect(prepareSponsoredB2BClaim(subject, input)).resolves.toEqual({
      ok: false,
      code: "CLAIM_DELIVERY_FAILED",
      sponsorshipId: SPONSORSHIP_ID,
      applicationId: APPLICATION_ID,
    });
    expect(subject.markClaimSent).not.toHaveBeenCalled();
  });

  it("rejects a mismatched preparation projection", async () => {
    const subject = deps({
      prepareSponsoredClaim: vi.fn(async () => ({
        ...claim("claim_prepared"),
        businessKey: "different-buyer",
      })),
    });
    await expect(prepareSponsoredB2BClaim(subject, input))
      .resolves.toEqual({ ok: false, code: "PREPARATION_RESULT_INVALID" });
    expect(subject.sendExistingAccountClaim).not.toHaveBeenCalled();
  });

  it("does not report success when the post-delivery state cannot be proved", async () => {
    const subject = deps({ markClaimSent: vi.fn(async () => claim("claim_prepared")) });
    await expect(prepareSponsoredB2BClaim(subject, input)).resolves.toEqual({
      ok: false,
      code: "CLAIM_STATE_UNCERTAIN",
      sponsorshipId: SPONSORSHIP_ID,
      applicationId: APPLICATION_ID,
    });
  });
});
