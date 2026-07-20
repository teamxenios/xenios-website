import { describe, expect, it } from "vitest";
import {
  AGREEMENT_KEYS,
  DEFAULT_PARTNER_REQUIREMENTS,
  PARTNER_STRUCTURE_FORBIDDEN_KEYS,
  TRAINING_MODULE_KEYS,
  createInMemoryPartnerRepository,
  createPartnerService,
  outstandingTrainingFor,
  partnerRecordCanBePaid,
  partnerRecordCanEarn,
  type PartnerDenial,
  type PartnerService,
  type PartnerStatsSource,
} from "./partners";
import { partnerCanBePaid, partnerCanEarn } from "@shared/research/distribution";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-01-02T00:00:00.000Z");
const T2 = new Date("2026-01-03T00:00:00.000Z");

interface Gates {
  identity?: boolean;
  tax?: boolean;
  payout?: boolean;
  agreements?: boolean;
  training?: boolean;
  certify?: boolean;
}

function newService(stats?: PartnerStatsSource): PartnerService {
  return createPartnerService({ repository: createInMemoryPartnerRepository(), stats });
}

async function onboard(service: PartnerService, gates: Gates = {}): Promise<string> {
  const applied = await service.apply(
    {
      partnerId: "p1",
      role: "affiliate",
      legalName: "Real Name",
      contactEmail: "partner@example.com",
    },
    T0,
  );
  if (!applied.ok) throw new Error("apply failed");

  if (gates.identity !== false) {
    await service.recordIdentityVerification("p1", { status: "verified", providerReference: "idv_1" }, T0);
  }
  if (gates.tax !== false) {
    await service.recordTaxStatus("p1", { status: "cleared", formType: "w9" }, T0);
  }
  if (gates.payout !== false) {
    await service.recordPayoutStatus("p1", { status: "cleared", methodReference: "dest_1" }, T0);
  }
  if (gates.agreements !== false) {
    for (const key of AGREEMENT_KEYS) {
      await service.acceptAgreement("p1", key, "1.0.0", `hash_${key}`, T0);
    }
  }
  if (gates.training !== false) {
    for (const key of TRAINING_MODULE_KEYS) {
      await service.completeTraining("p1", key, "1.0.0", T0);
    }
  }
  if (gates.certify !== false) {
    await service.certify("p1", "admin_1", T1);
  }
  return "p1";
}

function codes(denials: PartnerDenial[]): string[] {
  return denials.map((d) => d.code);
}

/** Recursively collects every key name in a JSON-serializable value. */
function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      out.push(key);
      collectKeys((value as Record<string, unknown>)[key], out);
    });
  }
  return out;
}

describe("partner application", () => {
  it("creates a partner in the application state", async () => {
    const service = newService();
    const result = await service.apply(
      { partnerId: "p1", role: "research_rep", legalName: "A", contactEmail: "a@example.com" },
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.partner.state).toBe("application");
    expect(result.partner.certifiedAt).toBeNull();
    expect(partnerCanEarn(result.partner.state)).toBe(false);
    expect(result.partner.history.map((e) => e.type)).toEqual(["applied"]);
  });

  it("refuses a duplicate partner id", async () => {
    const service = newService();
    await service.apply({ partnerId: "p1", role: "affiliate", legalName: "A", contactEmail: "a@x.com" }, T0);
    const again = await service.apply(
      { partnerId: "p1", role: "affiliate", legalName: "A", contactEmail: "a@x.com" },
      T0,
    );
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(codes(again.denials)).toEqual(["partner_already_exists"]);
  });

  it("advances the pending state to name the next unmet gate", async () => {
    const service = newService();
    await service.apply({ partnerId: "p1", role: "affiliate", legalName: "A", contactEmail: "a@x.com" }, T0);

    const afterIdentity = await service.recordIdentityVerification("p1", { status: "verified" }, T0);
    expect(afterIdentity.ok && afterIdentity.partner.state).toBe("tax_status_pending");

    const afterTax = await service.recordTaxStatus("p1", { status: "cleared", formType: "w9" }, T0);
    expect(afterTax.ok && afterTax.partner.state).toBe("payout_status_pending");

    const afterPayout = await service.recordPayoutStatus("p1", { status: "cleared" }, T0);
    expect(afterPayout.ok && afterPayout.partner.state).toBe("agreement_pending");
  });
});

describe("activation fails closed", () => {
  it("activates only when every gate has passed", async () => {
    const service = newService();
    await onboard(service);
    const result = await service.activate("p1", "admin_1", T2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.partner.state).toBe("active");
    expect(result.partner.activatedByAdminId).toBe("admin_1");
    expect(partnerRecordCanEarn(result.partner)).toBe(true);
    expect(partnerRecordCanBePaid(result.partner)).toBe(true);
  });

  it("refuses activation with the identity gate missing", async () => {
    const service = newService();
    await onboard(service, { identity: false });
    const result = await service.activate("p1", "admin_1", T2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codes(result.denials)).toContain("identity_not_verified");
    expect(codes(result.denials)).toContain("not_certified");
  });

  it("refuses activation with the tax gate missing", async () => {
    const service = newService();
    await onboard(service, { tax: false });
    const result = await service.activate("p1", "admin_1", T2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codes(result.denials)).toContain("tax_not_cleared");
  });

  it("refuses activation with the payout gate missing", async () => {
    const service = newService();
    await onboard(service, { payout: false });
    const result = await service.activate("p1", "admin_1", T2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codes(result.denials)).toContain("payout_not_cleared");
  });

  it("refuses activation with each single agreement missing", async () => {
    for (const missing of AGREEMENT_KEYS) {
      const service = newService();
      await onboard(service, { agreements: false, certify: false });
      for (const key of AGREEMENT_KEYS) {
        if (key === missing) continue;
        await service.acceptAgreement("p1", key, "1.0.0", "h", T0);
      }
      await service.certify("p1", "admin_1", T1);
      const result = await service.activate("p1", "admin_1", T2);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const subjects = result.denials.filter((d) => d.code === "agreement_missing").map((d) => d.subject);
      expect(subjects).toEqual([missing]);
    }
  });

  it("refuses activation with each single training module missing", async () => {
    for (const missing of TRAINING_MODULE_KEYS) {
      const service = newService();
      await onboard(service, { training: false, certify: false });
      for (const key of TRAINING_MODULE_KEYS) {
        if (key === missing) continue;
        await service.completeTraining("p1", key, "1.0.0", T0);
      }
      await service.certify("p1", "admin_1", T1);
      const result = await service.activate("p1", "admin_1", T2);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const subjects = result.denials.filter((d) => d.code === "training_incomplete").map((d) => d.subject);
      expect(subjects).toEqual([missing]);
    }
  });

  it("refuses activation when certification is missing", async () => {
    const service = newService();
    await onboard(service, { certify: false });
    const result = await service.activate("p1", "admin_1", T2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codes(result.denials)).toEqual(["not_certified"]);
  });

  it("accumulates every unmet gate rather than returning on the first", async () => {
    const service = newService();
    await service.apply({ partnerId: "p1", role: "affiliate", legalName: "A", contactEmail: "a@x.com" }, T0);
    const result = await service.activate("p1", "admin_1", T2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // identity, tax, payout, every agreement, every module, certification
    expect(result.denials.length).toBe(3 + AGREEMENT_KEYS.length + TRAINING_MODULE_KEYS.length + 1);
  });

  it("refuses certification while any gate is unmet", async () => {
    const service = newService();
    await onboard(service, { training: false, certify: false });
    const result = await service.certify("p1", "admin_1", T1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codes(result.denials)).not.toContain("not_certified");
    expect(codes(result.denials)).toContain("training_incomplete");
  });

  it("refuses an unknown module and a stale version", async () => {
    const service = newService();
    await onboard(service, { training: false, certify: false });
    const unknown = await service.completeTraining("p1", "not_a_module" as never, "1.0.0", T0);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(codes(unknown.denials)).toEqual(["unknown_training_module"]);

    const stale = await service.completeTraining("p1", "fraud", "0.9.0", T0);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(codes(stale.denials)).toEqual(["stale_version"]);
  });
});

describe("recertification", () => {
  it("demotes an active partner who completed the old version", async () => {
    const service = newService();
    await onboard(service);
    const activated = await service.activate("p1", "admin_1", T2);
    expect(activated.ok && activated.partner.state).toBe("active");

    const affected = await service.requireRecertification("claims_restrictions", "2.0.0", T2);
    expect(affected.map((p) => p.partnerId)).toEqual(["p1"]);
    expect(affected[0].state).toBe("certification_pending");
    expect(affected[0].certifiedAt).toBeNull();
    expect(partnerCanEarn(affected[0].state)).toBe(false);
    expect(partnerCanBePaid(affected[0].state)).toBe(false);

    const outstanding = outstandingTrainingFor(affected[0], service.requirements());
    expect(outstanding).toEqual([{ moduleKey: "claims_restrictions", version: "2.0.0" }]);

    // The demotion is recorded, never silently applied.
    const types = affected[0].history.map((e) => e.type);
    expect(types).toContain("certification_revoked");
    expect(types).toContain("recertification_required");
  });

  it("lets the partner re-earn activation at the new version", async () => {
    const service = newService();
    await onboard(service);
    await service.activate("p1", "admin_1", T2);
    await service.requireRecertification("security", "2.0.0", T2);

    const refused = await service.activate("p1", "admin_1", T2);
    expect(refused.ok).toBe(false);

    await service.completeTraining("p1", "security", "2.0.0", T2);
    await service.certify("p1", "admin_1", T2);
    const again = await service.activate("p1", "admin_1", T2);
    expect(again.ok && again.partner.state).toBe("active");
  });

  it("leaves a terminated partner alone", async () => {
    const service = newService();
    await onboard(service);
    await service.activate("p1", "admin_1", T2);
    await service.terminate("p1", "admin_1", "policy breach", T2);
    const affected = await service.requireRecertification("fraud", "2.0.0", T2);
    expect(affected).toEqual([]);
  });
});

describe("suspension and termination", () => {
  it("a suspended partner cannot earn or be paid", async () => {
    const service = newService();
    await onboard(service);
    await service.activate("p1", "admin_1", T2);
    const suspended = await service.suspend("p1", "admin_1", "quality complaint", T2);
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) return;
    expect(suspended.partner.state).toBe("suspended");
    expect(partnerRecordCanEarn(suspended.partner)).toBe(false);
    expect(partnerRecordCanBePaid(suspended.partner)).toBe(false);
  });

  it("zeroes the payable balance for a suspended partner", async () => {
    const stats: PartnerStatsSource = {
      async statsFor() {
        return {
          leadCount: 4,
          conversionCount: 2,
          totalCommissionCents: 5000,
          payableCents: 5000,
          conversions: [],
        };
      },
    };
    const service = newService(stats);
    await onboard(service);
    await service.activate("p1", "admin_1", T2);

    const active = await service.dashboardFor("p1");
    expect(active.ok && active.dashboard.payableCents).toBe(5000);

    await service.suspend("p1", "admin_1", "review", T2);
    const suspended = await service.dashboardFor("p1");
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) return;
    expect(suspended.dashboard.payableCents).toBe(0);
    expect(suspended.dashboard.totalCommissionCents).toBe(5000);
  });

  it("reinstates from suspension only when the gates still hold", async () => {
    const service = newService();
    await onboard(service);
    await service.activate("p1", "admin_1", T2);
    await service.openQualityReview("p1", "admin_1", "claims complaint", T2);
    const reinstated = await service.reinstate("p1", "admin_1", T2);
    expect(reinstated.ok && reinstated.partner.state).toBe("active");
  });

  it("returns a reinstated partner to onboarding when a gate lapsed", async () => {
    const service = newService();
    await onboard(service);
    await service.activate("p1", "admin_1", T2);
    await service.suspend("p1", "admin_1", "review", T2);
    await service.requireRecertification("ftc_disclosures", "2.0.0", T2);

    const result = await service.reinstate("p1", "admin_1", T2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codes(result.denials)).toContain("training_incomplete");
    const dashboard = await service.dashboardFor("p1");
    expect(dashboard.ok && dashboard.dashboard.state).toBe("training_pending");
  });

  it("treats termination as final for every later action", async () => {
    const service = newService();
    await onboard(service);
    await service.activate("p1", "admin_1", T2);
    await service.terminate("p1", "admin_1", "fraud", T2);

    const reinstate = await service.reinstate("p1", "admin_1", T2);
    expect(reinstate.ok).toBe(false);
    if (!reinstate.ok) expect(codes(reinstate.denials)).toEqual(["partner_terminated"]);

    const activate = await service.activate("p1", "admin_1", T2);
    expect(activate.ok).toBe(false);
    if (!activate.ok) expect(codes(activate.denials)).toEqual(["partner_terminated"]);

    const training = await service.completeTraining("p1", "fraud", "1.0.0", T2);
    expect(training.ok).toBe(false);
  });
});

describe("partner privacy", () => {
  it("leaks nothing from the source record or the stats snapshot", async () => {
    const MARKERS = [
      "MARKER_LEGAL_NAME",
      "MARKER_EMAIL",
      "MARKER_INTERNAL_NOTE",
      "MARKER_MEMBER_ID",
      "MARKER_MEMBER_EMAIL",
      "MARKER_HEALTH_GOAL",
      "MARKER_REJECTION_REASON",
      "MARKER_IDENTITY_DOCUMENT",
    ];
    const stats: PartnerStatsSource = {
      async statsFor() {
        return {
          leadCount: 1,
          conversionCount: 1,
          totalCommissionCents: 1234,
          payableCents: 1234,
          conversions: [
            {
              attributedAt: T1.toISOString(),
              eligibleNetCents: 10_000,
              commissionCents: 1234,
              state: "approved",
              // A richer conversion supplied upstream must still be narrowed.
              memberId: "MARKER_MEMBER_ID",
              memberEmail: "MARKER_MEMBER_EMAIL",
              healthGoals: ["MARKER_HEALTH_GOAL"],
            } as never,
          ],
        };
      },
    };
    const service = newService(stats);
    const applied = await service.apply(
      {
        partnerId: "p1",
        role: "affiliate",
        legalName: "MARKER_LEGAL_NAME",
        contactEmail: "MARKER_EMAIL",
        internalNotes: "MARKER_INTERNAL_NOTE MARKER_REJECTION_REASON",
      },
      T0,
    );
    expect(applied.ok).toBe(true);
    await service.recordIdentityVerification("p1", { status: "verified", providerReference: "MARKER_IDENTITY_DOCUMENT" }, T0);

    const dashboard = await service.dashboardFor("p1");
    expect(dashboard.ok).toBe(true);
    if (!dashboard.ok) return;

    const serialized = JSON.stringify(dashboard.dashboard);
    MARKERS.forEach((marker) => expect(serialized).not.toContain(marker));

    expect(Object.keys(dashboard.dashboard).sort()).toEqual(
      [
        "conversionCount",
        "conversions",
        "leadCount",
        "outstandingTraining",
        "partnerId",
        "payableCents",
        "role",
        "state",
        "totalCommissionCents",
      ].sort(),
    );
    expect(Object.keys(dashboard.dashboard.conversions[0]).sort()).toEqual(
      ["attributedAt", "commissionCents", "eligibleNetCents", "state"].sort(),
    );
    expect(dashboard.dashboard.outstandingTraining.length).toBe(TRAINING_MODULE_KEYS.length);
  });

  it("reports partner_not_found rather than an empty dashboard", async () => {
    const service = newService();
    const dashboard = await service.dashboardFor("nobody");
    expect(dashboard.ok).toBe(false);
    if (dashboard.ok) return;
    expect(codes(dashboard.denials)).toEqual(["partner_not_found"]);
  });
});

describe("no recursive downline", () => {
  it("has no parent, sponsor, upline, downline, tier, or level field anywhere", async () => {
    const service = newService();
    await onboard(service);
    const activated = await service.activate("p1", "admin_1", T2);
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    const dashboard = await service.dashboardFor("p1");
    expect(dashboard.ok).toBe(true);
    if (!dashboard.ok) return;

    const keys = collectKeys(JSON.parse(JSON.stringify(activated.partner)))
      .concat(collectKeys(JSON.parse(JSON.stringify(dashboard.dashboard))))
      .map((k) => k.toLowerCase());

    PARTNER_STRUCTURE_FORBIDDEN_KEYS.forEach((forbidden) => {
      const offenders = keys.filter((k) => k.includes(forbidden));
      expect(offenders).toEqual([]);
    });
  });

  it("exposes no recruitment event and no signup reward", async () => {
    const service = newService();
    await onboard(service);
    const activated = await service.activate("p1", "admin_1", T2);
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    const serialized = JSON.stringify(activated.partner).toLowerCase();
    expect(serialized).not.toContain("recruit");
    expect(serialized).not.toContain("bonus");
    // Onboarding produces state, never money.
    expect(serialized).not.toContain("amountcents");
  });

  it("ships the full required module set", () => {
    expect(DEFAULT_PARTNER_REQUIREMENTS.trainingModules.length).toBe(14);
    expect(DEFAULT_PARTNER_REQUIREMENTS.agreements.length).toBe(AGREEMENT_KEYS.length);
  });
});
