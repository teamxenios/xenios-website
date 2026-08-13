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
  firstName: "Kristopher",
  lastName: "Lopez",
  country: "USA",
  stateOrRegion: "Texas",
  businessKey: "roman-health",
  businessDisplayName: "Roman Health",
  roles: ["organization_owner", "business_buyer"],
} as const;

const pricing = {
  profileKey: "KRIS_VOLUME_PARTNER",
  profileVersion: 1,
  profileEffectiveAt: "2026-08-13T21:47:34.813Z",
  sourceSha: "e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4",
} as const;

const empty: ExactIdentitySnapshot = {
  authUserIds: [], applicationIds: [], memberIds: [], sponsorshipIds: [],
};
const afterPrepare: ExactIdentitySnapshot = {
  authUserIds: [],
  applicationIds: [APPLICATION_ID],
  memberIds: [],
  sponsorshipIds: [SPONSORSHIP_ID],
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
    profileVersion: pricing.profileVersion,
    profileEffectiveAt: pricing.profileEffectiveAt,
  };
}

function deps(overrides: Partial<SponsoredB2BClaimDeps> = {}): SponsoredB2BClaimDeps {
  return {
    inspectExactEmail: vi.fn()
      .mockResolvedValueOnce(empty)
      .mockResolvedValue(afterPrepare),
    resolvePricingAuthority: vi.fn(async () => pricing),
    prepareSponsoredClaim: vi.fn(async () => claim("claim_queued")),
    kickNotificationOutbox: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("prepareSponsoredB2BClaim", () => {
  it("returns queued only after exact pre- and post-preparation identity evidence", async () => {
    const subject = deps();
    await expect(prepareSponsoredB2BClaim(subject, input)).resolves.toEqual({
      ok: true,
      state: "claim_queued",
      sponsorshipId: SPONSORSHIP_ID,
      applicationId: APPLICATION_ID,
      normalizedEmail: EMAIL,
      businessKey: "roman-health",
    });
    expect(subject.inspectExactEmail).toHaveBeenCalledTimes(2);
    expect(subject.prepareSponsoredClaim).toHaveBeenCalledWith(expect.objectContaining({
      email: EMAIL,
      businessDisplayName: "Roman Health",
      roles: ["organization_owner", "business_buyer"],
      profileKey: "KRIS_VOLUME_PARTNER",
      profileVersion: 1,
      sourceSha: pricing.sourceSha,
    }));
    expect(subject.kickNotificationOutbox).toHaveBeenCalledOnce();
  });

  it("strictly refuses password material", async () => {
    const subject = deps();
    await expect(prepareSponsoredB2BClaim(subject, { ...input, password: "do-not-accept" }))
      .resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(subject.inspectExactEmail).not.toHaveBeenCalled();
  });

  it("fails closed if any identity appears since the read-only grid", async () => {
    const subject = deps({
      inspectExactEmail: vi.fn(async () => ({ ...empty, applicationIds: [APPLICATION_ID] })),
    });
    await expect(prepareSponsoredB2BClaim(subject, input))
      .resolves.toEqual({ ok: false, code: "IDENTITY_APPEARED_STOP" });
    expect(subject.prepareSponsoredClaim).not.toHaveBeenCalled();
  });

  it("fails closed rather than guessing unavailable pricing authority", async () => {
    const subject = deps({ resolvePricingAuthority: vi.fn(async () => { throw new Error("missing"); }) });
    await expect(prepareSponsoredB2BClaim(subject, input))
      .resolves.toEqual({ ok: false, code: "PRICING_AUTHORITY_UNAVAILABLE" });
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

  it("fails closed if an Auth identity appears after durable preparation", async () => {
    const subject = deps({
      inspectExactEmail: vi.fn()
        .mockResolvedValueOnce(empty)
        .mockResolvedValueOnce({
          ...afterPrepare,
          authUserIds: ["30000000-0000-4000-8000-000000000003"],
        }),
    });
    await expect(prepareSponsoredB2BClaim(subject, input)).resolves.toEqual({
      ok: false,
      code: "POST_PREPARE_IDENTITY_CONFLICT",
      sponsorshipId: SPONSORSHIP_ID,
      applicationId: APPLICATION_ID,
    });
    expect(subject.kickNotificationOutbox).not.toHaveBeenCalled();
  });

  it("rejects a mismatched preparation projection", async () => {
    const subject = deps({
      prepareSponsoredClaim: vi.fn(async () => ({
        ...claim("claim_queued"),
        businessKey: "different-buyer",
      })),
    });
    await expect(prepareSponsoredB2BClaim(subject, input))
      .resolves.toEqual({ ok: false, code: "PREPARATION_RESULT_INVALID" });
    expect(subject.kickNotificationOutbox).not.toHaveBeenCalled();
  });

  it("remains truthfully queued when an immediate outbox wakeup fails", async () => {
    const subject = deps({ kickNotificationOutbox: vi.fn(async () => { throw new Error("later"); }) });
    await expect(prepareSponsoredB2BClaim(subject, input)).resolves.toMatchObject({
      ok: true,
      state: "claim_queued",
    });
  });
});
