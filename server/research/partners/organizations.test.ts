import { describe, expect, it } from "vitest";
import { partnerCanBePaid, partnerCanEarn } from "@shared/research/distribution";
import {
  createInMemoryOrganizationRepository,
  createInMemoryPartnerDirectory,
  createOrganizationService,
  screenProhibitedClaims,
  type ContentAssetRecord,
  type OrganizationConversionRecord,
  type OrganizationRecord,
  type PartnerDirectoryEntry,
} from "./organizations";

const NOW = new Date("2026-03-01T12:00:00.000Z");
const LATER = new Date("2026-06-01T12:00:00.000Z");

function partner(partnerId: string, overrides: Partial<PartnerDirectoryEntry> = {}): PartnerDirectoryEntry {
  return {
    partnerId,
    role: "organization_partner",
    state: "active",
    ...overrides,
  };
}

function setup(seed: readonly PartnerDirectoryEntry[] = [partner("p_alpha"), partner("p_beta")]) {
  const repository = createInMemoryOrganizationRepository();
  const partners = createInMemoryPartnerDirectory(seed);
  const service = createOrganizationService({
    repository,
    partners,
    rsvpBaseUrl: "https://xenios.test/research/",
  });
  return { repository, partners, service };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; denials: string[]; message: string }): T {
  if (!result.ok) throw new Error(`expected ok, got denials ${result.denials.join(",")}`);
  return result.value;
}

function makeOrg(
  service: ReturnType<typeof setup>["service"],
  displayName: string,
  representatives: readonly string[],
): OrganizationRecord {
  const org = unwrap(
    service.createOrganization({ displayName, kind: "clinic", createdByAdminId: "admin_samuel" }, NOW),
  );
  representatives.forEach((partnerId) => {
    unwrap(service.addRepresentative(org.orgId, partnerId, NOW));
  });
  return org;
}

describe("organization isolation", () => {
  it("refuses a cross-organization read", () => {
    const { service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    const beta = makeOrg(service, "Beta Gym", ["p_beta"]);

    const own = service.aggregateFor(alpha.orgId, { kind: "partner", partnerId: "p_alpha" });
    expect(own.ok).toBe(true);

    const cross = service.aggregateFor(beta.orgId, { kind: "partner", partnerId: "p_alpha" });
    expect(cross.ok).toBe(false);
    if (cross.ok) throw new Error("unreachable");
    expect(cross.denials).toContain("organization_forbidden");
  });

  it("refuses a read for an organization that does not exist", () => {
    const { service } = setup();
    const result = service.aggregateFor("org_missing", { kind: "admin", adminId: "admin_samuel" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("organization_not_found");
  });

  it("stops reading an organization once the representative is removed", () => {
    const { service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    expect(service.aggregateFor(alpha.orgId, { kind: "partner", partnerId: "p_alpha" }).ok).toBe(true);

    unwrap(service.removeRepresentative(alpha.orgId, "p_alpha", NOW));
    const after = service.aggregateFor(alpha.orgId, { kind: "partner", partnerId: "p_alpha" });
    expect(after.ok).toBe(false);
  });

  it("refuses a representative whose role is not organization eligible", () => {
    const { service } = setup([partner("p_affiliate", { role: "affiliate" })]);
    const org = unwrap(
      service.createOrganization({ displayName: "Alpha", kind: "gym", createdByAdminId: "admin_samuel" }, NOW),
    );
    const result = service.addRepresentative(org.orgId, "p_affiliate", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("partner_role_not_eligible");
  });

  it("accumulates every denial rather than returning on the first", () => {
    const { service } = setup([partner("p_bad", { role: "affiliate", state: "suspended" })]);
    const result = service.addRepresentative("org_missing", "p_bad", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("organization_not_found");
    expect(result.denials).toContain("partner_not_active");
    expect(result.denials).toContain("partner_role_not_eligible");
  });
});

describe("aggregates carry no member identity", () => {
  it("returns counts and totals only, with no member marker surviving serialization", () => {
    const { repository, service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);

    // The repository row deliberately carries member identity and health data. The
    // aggregate is built by explicit construction, so none of it may travel outward.
    const contaminated = {
      orgId: alpha.orgId,
      attributedAt: NOW.toISOString(),
      eligibleNetCents: 20_000,
      commissionCents: 2_000,
      state: "approved",
      memberId: "MARKER_MEMBER_ID",
      memberEmail: "MARKER_EMAIL@example.com",
      memberName: "MARKER_NAME",
      healthGoals: ["MARKER_HEALTH"],
      blueprint: "MARKER_BLUEPRINT",
      privateOrders: ["MARKER_ORDER"],
    } as unknown as OrganizationConversionRecord;
    repository.addConversion(contaminated);
    repository.addExpense({
      orgId: alpha.orgId,
      amountCents: 5_000,
      category: "event",
      incurredAt: NOW.toISOString(),
    });

    const aggregate = unwrap(service.aggregateFor(alpha.orgId, { kind: "partner", partnerId: "p_alpha" }));
    expect(aggregate.conversionCount).toBe(1);
    expect(aggregate.totalCommissionCents).toBe(2_000);
    expect(aggregate.expenseCents).toBe(5_000);

    const serialized = JSON.stringify(aggregate);
    ["MARKER_MEMBER_ID", "MARKER_EMAIL", "MARKER_NAME", "MARKER_HEALTH", "MARKER_BLUEPRINT", "MARKER_ORDER"].forEach(
      (marker) => {
        expect(serialized).not.toContain(marker);
      },
    );
    expect(Object.keys(aggregate).sort()).toEqual([
      "conversionCount",
      "expenseCents",
      "leadCount",
      "orgId",
      "totalCommissionCents",
    ]);
  });

  it("counts RSVPs as leads and never exposes the subject keys", () => {
    const { service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    const event = unwrap(
      service.createEvent(alpha.orgId, { name: "Open house", startsAt: "2026-04-01T18:00:00.000Z" }, NOW),
    );

    unwrap(service.recordRsvp(event.eventId, "subject-aaa", NOW));
    unwrap(service.recordRsvp(event.eventId, "subject-bbb", NOW));
    const duplicate = service.recordRsvp(event.eventId, "subject-aaa", NOW);
    expect(duplicate.ok).toBe(false);

    const aggregate = unwrap(service.aggregateFor(alpha.orgId, { kind: "partner", partnerId: "p_alpha" }));
    expect(aggregate.leadCount).toBe(2);
    expect(JSON.stringify(aggregate)).not.toContain("subject-aaa");
  });

  it("refuses an RSVP subject key that is a raw email address", () => {
    const { service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    const event = unwrap(
      service.createEvent(alpha.orgId, { name: "Open house", startsAt: "2026-04-01T18:00:00.000Z" }, NOW),
    );

    const result = service.recordRsvp(event.eventId, "person@example.com", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("rsvp_subject_not_opaque");
  });

  it("excludes reversed and forfeited commission from the total", () => {
    const { repository, service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    const base = { orgId: alpha.orgId, attributedAt: NOW.toISOString(), eligibleNetCents: 10_000 };
    repository.addConversion({ ...base, commissionCents: 1_000, state: "paid" });
    repository.addConversion({ ...base, commissionCents: 9_999, state: "reversed" });
    repository.addConversion({ ...base, commissionCents: 5_555, state: "forfeited" });

    const aggregate = unwrap(service.aggregateFor(alpha.orgId, { kind: "admin", adminId: "admin_samuel" }));
    expect(aggregate.conversionCount).toBe(1);
    expect(aggregate.totalCommissionCents).toBe(1_000);
  });

  it("does not read another organization's conversions or expenses", () => {
    const { repository, service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    const beta = makeOrg(service, "Beta Gym", ["p_beta"]);
    repository.addConversion({
      orgId: beta.orgId,
      attributedAt: NOW.toISOString(),
      eligibleNetCents: 50_000,
      commissionCents: 5_000,
      state: "paid",
    });

    const aggregate = unwrap(service.aggregateFor(alpha.orgId, { kind: "partner", partnerId: "p_alpha" }));
    expect(aggregate.conversionCount).toBe(0);
    expect(aggregate.totalCommissionCents).toBe(0);
  });

  it("rounds a fractional commission down so rounding never invents value", () => {
    const { repository, service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    repository.addConversion({
      orgId: alpha.orgId,
      attributedAt: NOW.toISOString(),
      eligibleNetCents: 10_000,
      commissionCents: 199.99,
      state: "approved",
    });

    const aggregate = unwrap(service.aggregateFor(alpha.orgId, { kind: "admin", adminId: "admin_samuel" }));
    expect(aggregate.totalCommissionCents).toBe(199);
  });
});

describe("approved content", () => {
  function approve(
    service: ReturnType<typeof setup>["service"],
    asset: ContentAssetRecord,
    expiresAt: Date,
  ): ContentAssetRecord {
    return unwrap(
      service.preapproveAsset(
        asset.assetId,
        "admin_samuel",
        ["Members report feeling more consistent."],
        [],
        "Paid partner of xenios.",
        expiresAt,
        NOW,
      ),
    );
  }

  it("rejects a submitted asset that contains a prohibited claim", () => {
    const { service } = setup();
    const result = service.submitContentAsset(
      "p_alpha",
      { kind: "social_post", body: "This protocol cures fatigue, guaranteed." },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("asset_prohibited_claim");
    expect(result.message).toContain("disease_claim");
    expect(result.message).toContain("guaranteed_outcome");
  });

  it("rejects a testimonial making a claim xenios could not make directly", () => {
    const { service } = setup();
    const result = service.submitContentAsset(
      "p_alpha",
      { kind: "testimonial", body: "I take 250mg every morning and it treated my condition." },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("asset_prohibited_claim");
  });

  it("screens a declared claim as strictly as the body", () => {
    const { service } = setup();
    const result = service.submitContentAsset(
      "p_alpha",
      { kind: "flyer", body: "Ask me about the research library.", declaredClaims: ["FDA-approved"] },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("asset_prohibited_claim");
  });

  it("accepts a clean asset but leaves it unusable until it is preapproved", () => {
    const { service } = setup();
    const asset = unwrap(
      service.submitContentAsset("p_alpha", { kind: "flyer", body: "Ask me about the research library." }, NOW),
    );
    expect(asset.state).toBe("submitted");
    expect(service.activeAssetsFor("p_alpha", NOW)).toHaveLength(0);

    approve(service, asset, LATER);
    expect(service.activeAssetsFor("p_alpha", NOW).map((a) => a.assetId)).toEqual([asset.assetId]);
  });

  it("treats an approved asset as inactive once it has expired", () => {
    const { service } = setup();
    const asset = unwrap(
      service.submitContentAsset("p_alpha", { kind: "flyer", body: "Ask me about the research library." }, NOW),
    );
    const approved = approve(service, asset, LATER);
    expect(approved.state).toBe("preapproved");

    const dayBeforeExpiry = new Date(LATER.getTime() - 24 * 60 * 60 * 1000);
    expect(service.activeAssetsFor("p_alpha", dayBeforeExpiry)).toHaveLength(1);

    const dayAfterExpiry = new Date(LATER.getTime() + 24 * 60 * 60 * 1000);
    expect(service.activeAssetsFor("p_alpha", dayAfterExpiry)).toHaveLength(0);
  });

  it("refuses an approval whose approved claims would not pass the screen", () => {
    const { service } = setup();
    const asset = unwrap(
      service.submitContentAsset("p_alpha", { kind: "email", body: "Ask me about the research library." }, NOW),
    );
    const result = service.preapproveAsset(
      asset.assetId,
      "admin_samuel",
      ["Clinically proven results"],
      [],
      "Paid partner of xenios.",
      LATER,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("asset_prohibited_claim");
    expect(service.activeAssetsFor("p_alpha", NOW)).toHaveLength(0);
  });

  it("refuses an approval with no disclosure and one that expires in the past", () => {
    const { service } = setup();
    const asset = unwrap(
      service.submitContentAsset("p_alpha", { kind: "email", body: "Ask me about the research library." }, NOW),
    );
    const result = service.preapproveAsset(asset.assetId, "admin_samuel", [], [], "  ", new Date("2026-01-01T00:00:00.000Z"), NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("asset_disclosure_required");
    expect(result.denials).toContain("asset_expiry_invalid");
  });

  it("passes a benign sentence through the screen unchanged", () => {
    expect(screenProhibitedClaims("Ask me about the research library.")).toEqual([]);
  });
});

describe("violations and suspension", () => {
  function cleanAsset(service: ReturnType<typeof setup>["service"]): ContentAssetRecord {
    const asset = unwrap(
      service.submitContentAsset("p_alpha", { kind: "flyer", body: "Ask me about the research library." }, NOW),
    );
    return unwrap(
      service.preapproveAsset(asset.assetId, "admin_samuel", [], [], "Paid partner of xenios.", LATER, NOW),
    );
  }

  it("escalates recorded, then correction required, then suspension", () => {
    const { partners, service } = setup();
    const asset = cleanAsset(service);
    const violation = unwrap(
      service.recordViolation("p_alpha", asset.assetId, "misrepresentation", "Overstated a result on a call.", "admin_samuel", NOW),
    );
    expect(violation.state).toBe("recorded");

    // A fixable violation may not skip straight to suspension.
    const premature = service.suspendForViolation(violation.violationId, "admin_samuel", NOW);
    expect(premature.ok).toBe(false);
    if (premature.ok) throw new Error("unreachable");
    expect(premature.denials).toContain("violation_state_invalid");

    const corrected = unwrap(service.requireCorrection(violation.violationId, "admin_samuel", NOW));
    expect(corrected.state).toBe("correction_required");

    const suspended = unwrap(service.suspendForViolation(violation.violationId, "admin_samuel", LATER));
    expect(suspended.state).toBe("suspended");
    expect(suspended.suspendedAt).toBe(LATER.toISOString());

    // Suspension flows through the partner state, so earning and payout both stop.
    const after = partners.getPartner("p_alpha");
    expect(after?.state).toBe("suspended");
    expect(partnerCanEarn(after!.state)).toBe(false);
    expect(partnerCanBePaid(after!.state)).toBe(false);
  });

  it("suspends immediately for a severe violation and withdraws the partner's active content", () => {
    const { partners, service } = setup();
    const asset = cleanAsset(service);
    expect(service.activeAssetsFor("p_alpha", NOW)).toHaveLength(1);

    const violation = unwrap(
      service.recordViolation("p_alpha", asset.assetId, "privacy_breach", "Shared a member detail publicly.", "admin_samuel", NOW),
    );
    unwrap(service.suspendForViolation(violation.violationId, "admin_samuel", NOW));

    expect(partners.getPartner("p_alpha")?.state).toBe("suspended");
    expect(service.activeAssetsFor("p_alpha", NOW)).toHaveLength(0);
  });

  it("refuses a violation against an unknown partner or asset", () => {
    const { service } = setup();
    const result = service.recordViolation("p_ghost", "asset_ghost", "unapproved_claim", "detail", "admin_samuel", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("partner_not_found");
    expect(result.denials).toContain("asset_not_found");
  });

  it("refuses a correction request on a violation that is already suspended", () => {
    const { service } = setup();
    const violation = unwrap(
      service.recordViolation("p_alpha", null, "prohibited_claim", "Used a dosing figure.", "admin_samuel", NOW),
    );
    unwrap(service.suspendForViolation(violation.violationId, "admin_samuel", NOW));

    const result = service.requireCorrection(violation.violationId, "admin_samuel", LATER);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("violation_state_invalid");
  });

  it("refuses a submission from a suspended partner", () => {
    const { service } = setup();
    const violation = unwrap(
      service.recordViolation("p_alpha", null, "prohibited_claim", "Used a dosing figure.", "admin_samuel", NOW),
    );
    unwrap(service.suspendForViolation(violation.violationId, "admin_samuel", NOW));

    const result = service.submitContentAsset("p_alpha", { kind: "flyer", body: "Clean copy." }, LATER);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("partner_not_active");
  });
});

describe("events and links", () => {
  it("builds an RSVP link with no member data in the URL", () => {
    const { service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    const campaign = unwrap(service.createCampaign(alpha.orgId, { name: "Spring", code: "SPRING" }, NOW));
    const event = unwrap(
      service.createEvent(
        alpha.orgId,
        { name: "Open house", startsAt: "2026-04-01T18:00:00.000Z", campaignId: campaign.campaignId },
        NOW,
      ),
    );

    const link = unwrap(service.rsvpLinkFor(event.eventId, { kind: "admin", adminId: "admin_samuel" }));
    expect(link.channel).toBe("event");
    expect(link.campaign).toBe(campaign.campaignId);
    expect(link.url).toBe(`https://xenios.test/research/rsvp/${event.eventId}`);
    expect(link.url).not.toContain("?");
  });

  it("refuses a link for an unknown event", () => {
    const { service } = setup();
    const result = service.rsvpLinkFor("evt_ghost", { kind: "admin", adminId: "admin_samuel" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("event_not_found");
  });

  it("refuses an event on an unknown organization and an invalid start time together", () => {
    const { service } = setup();
    const result = service.createEvent("org_ghost", { name: "  ", startsAt: "not-a-date" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.denials).toContain("organization_not_found");
    expect(result.denials).toContain("event_invalid");
  });
});

// ---------------------------------------------------------------------------
// Regressions: cross-organization event read, and the opaque RSVP key
// ---------------------------------------------------------------------------

describe("event link isolation", () => {
  it("refuses a partner an RSVP link for another organization's event", () => {
    const { service } = setup();
    const alpha = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    makeOrg(service, "Beta Gym", ["p_beta"]);

    const campaign = unwrap(service.createCampaign(alpha.orgId, { name: "Spring", code: "SPR" }, NOW));
    const event = unwrap(
      service.createEvent(alpha.orgId, { name: "Open house", startsAt: LATER.toISOString(), campaignId: campaign.campaignId }, NOW),
    );

    const foreign = service.rsvpLinkFor(event.eventId, { kind: "partner", partnerId: "p_beta" });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) throw new Error("unreachable");
    expect(foreign.denials).toContain("organization_forbidden");

    const own = unwrap(service.rsvpLinkFor(event.eventId, { kind: "partner", partnerId: "p_alpha" }));
    expect(own.campaign).toBe(campaign.campaignId);
  });
});

describe("RSVP subject key stays opaque", () => {
  function eventFor(service: ReturnType<typeof setup>["service"]) {
    const org = makeOrg(service, "Alpha Clinic", ["p_alpha"]);
    return unwrap(service.createEvent(org.orgId, { name: "Open house", startsAt: LATER.toISOString() }, NOW));
  }

  // A tab or a newline is whitespace too. A pasted name must not slip through a
  // check written for the literal space character alone.
  it("refuses a key bearing any whitespace, not just a space", () => {
    const { service } = setup();
    const event = eventFor(service);
    ["Jane\tDoe", "Jane\nDoe", "Jane Doe", "Jane Doe"].forEach((key) => {
      const result = service.recordRsvp(event.eventId, key, NOW);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.denials).toContain("rsvp_subject_not_opaque");
    });
  });

  it("refuses an address and accepts an opaque digest", () => {
    const { service } = setup();
    const event = eventFor(service);
    const address = service.recordRsvp(event.eventId, "jane@example.com", NOW);
    expect(address.ok).toBe(false);

    const opaque = unwrap(service.recordRsvp(event.eventId, "sk_9f2c1ab4", NOW));
    expect(opaque.subjectKey).toBe("sk_9f2c1ab4");
  });
});
