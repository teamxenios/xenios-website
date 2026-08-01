import { describe, expect, it } from "vitest";
import {
  availableServiceCategories,
  careHandoffFromEnv,
  selectCareReferralRouting,
  type CareReferralCoverage,
} from "./referral";
import {
  careReferralWriteAllowed,
  guardedCareReferralRepository,
  inMemoryCareReferralRepository,
} from "./referral-repository";
import { CARE_CLINICAL_CAPABILITIES_DISABLED } from "@shared/care/clinical-actions";

const COVERED: CareReferralCoverage = {
  stateCode: "IL",
  supportedStateActive: true,
  serviceCoverageActive: true,
  waitlistEnabled: true,
  activeClinicianCount: 2,
  supportedServiceCategories: ["general_consultation", "follow_up_visit"],
};

function route(overrides: Partial<Parameters<typeof selectCareReferralRouting>[0]> = {}) {
  return selectCareReferralRouting({
    careEnabled: true,
    stateCode: "IL",
    serviceCategory: "general_consultation",
    coverage: COVERED,
    ...overrides,
  });
}

const ENABLED_FLAGS = {
  ...CARE_CLINICAL_CAPABILITIES_DISABLED,
  real_patient_data: true,
};

describe("care referral state aware routing", () => {
  it("routes a covered state and service", () => {
    const decision = route();
    expect(decision.routable).toBe(true);
    if (decision.routable) expect(decision.stateCode).toBe("IL");
  });

  it("normalizes the state code before deciding", () => {
    expect(route({ stateCode: " il " }).routable).toBe(true);
  });

  it("refuses when care itself is off", () => {
    const decision = route({ careEnabled: false });
    expect(decision.routable).toBe(false);
    if (!decision.routable) expect(decision.reason).toBe("care_disabled");
  });

  it("refuses an unsupported state and offers the waitlist truthfully", () => {
    const decision = route({
      coverage: { ...COVERED, supportedStateActive: false },
    });
    expect(decision.routable).toBe(false);
    if (!decision.routable) {
      expect(decision.reason).toBe("state_not_supported");
      expect(decision.waitlistAvailable).toBe(true);
    }
  });

  it("refuses a state with no coverage row at all", () => {
    const decision = route({ coverage: null });
    expect(decision.routable).toBe(false);
    if (!decision.routable) {
      expect(decision.reason).toBe("state_not_supported");
      expect(decision.waitlistAvailable).toBe(false);
    }
  });

  it("refuses a coverage row for a different state", () => {
    const decision = route({ coverage: { ...COVERED, stateCode: "TX" } });
    expect(decision.routable).toBe(false);
    if (!decision.routable) expect(decision.reason).toBe("state_not_supported");
  });

  it("refuses a service the state does not cover", () => {
    const decision = route({ serviceCategory: "hormone_health" });
    expect(decision.routable).toBe(false);
    if (!decision.routable) {
      expect(decision.reason).toBe("service_not_available_in_state");
    }
  });

  it("refuses when no clinician covers the state", () => {
    const decision = route({ coverage: { ...COVERED, activeClinicianCount: 0 } });
    expect(decision.routable).toBe(false);
    if (!decision.routable) {
      expect(decision.reason).toBe("clinician_coverage_unavailable");
    }
  });

  it("refuses an unrecognized service rather than guessing one", () => {
    const decision = route({ serviceCategory: "botox" });
    expect(decision.routable).toBe(false);
    if (!decision.routable) expect(decision.reason).toBe("service_not_recognized");
  });

  it("offers only the categories a state actually covers", () => {
    expect(availableServiceCategories(COVERED)).toEqual([
      "general_consultation",
      "follow_up_visit",
    ]);
    expect(availableServiceCategories(null)).toEqual([]);
    expect(
      availableServiceCategories({ ...COVERED, activeClinicianCount: 0 }),
    ).toEqual([]);
  });

  it("reads the handoff from an injected record, never from ambient env", () => {
    expect(careHandoffFromEnv({}).mode).toBe("concierge");
  });
});

describe("the referral write chokepoint", () => {
  it("refuses every write while the real patient data capability is off", async () => {
    const inner = inMemoryCareReferralRepository();
    const repository = guardedCareReferralRepository(inner);
    expect(careReferralWriteAllowed(CARE_CLINICAL_CAPABILITIES_DISABLED)).toBe(
      false,
    );
    const result = await repository.saveGuarded({
      referralId: "ref-1",
      internalUserId: "user-1",
      emrVendor: "tebra",
      externalEmrId: null,
      serviceCategory: "general_consultation",
      stateCode: "IL",
      status: "draft",
      appointmentAt: null,
      operationsOwner: null,
      createdAt: "2026-08-01T15:00:00Z",
      updatedAt: "2026-08-01T15:00:00Z",
      synchronizedAt: null,
      errorCode: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("capability_disabled");
    expect(inner.rows).toHaveLength(0);
  });

  it("writes nothing when a clinical field is present, even with the flag on", async () => {
    const inner = inMemoryCareReferralRepository();
    const repository = guardedCareReferralRepository(inner, () => ENABLED_FLAGS);
    const result = await repository.saveGuarded({
      referralId: "ref-1",
      internalUserId: "user-1",
      emrVendor: "tebra",
      externalEmrId: null,
      serviceCategory: "general_consultation",
      stateCode: "IL",
      status: "draft",
      appointmentAt: null,
      operationsOwner: null,
      createdAt: "2026-08-01T15:00:00Z",
      updatedAt: "2026-08-01T15:00:00Z",
      synchronizedAt: null,
      errorCode: null,
      diagnosis: "REDACTED",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe("diagnosis");
    expect(inner.rows).toHaveLength(0);
  });

  it("writes a clean referral when the capability is on", async () => {
    const inner = inMemoryCareReferralRepository();
    const repository = guardedCareReferralRepository(inner, () => ENABLED_FLAGS);
    const result = await repository.saveGuarded({
      referralId: "ref-1",
      internalUserId: "user-1",
      emrVendor: "tebra",
      externalEmrId: null,
      serviceCategory: "general_consultation",
      stateCode: "IL",
      status: "draft",
      appointmentAt: null,
      operationsOwner: "care-ops",
      createdAt: "2026-08-01T15:00:00Z",
      updatedAt: "2026-08-01T15:00:00Z",
      synchronizedAt: null,
      errorCode: null,
    });
    expect(result.ok).toBe(true);
    expect(inner.rows).toHaveLength(1);
  });

  it("strips a clinical column out of a read rather than returning it", async () => {
    const inner = inMemoryCareReferralRepository();
    await inner.save({
      referralId: "ref-1",
      internalUserId: "user-1",
      emrVendor: "tebra",
      externalEmrId: null,
      serviceCategory: "general_consultation",
      stateCode: "IL",
      status: "draft",
      appointmentAt: null,
      operationsOwner: null,
      createdAt: "2026-08-01T15:00:00Z",
      updatedAt: "2026-08-01T15:00:00Z",
      synchronizedAt: null,
      errorCode: null,
      // A drifted row, as if the table had gained a column.
      diagnosis: "REDACTED",
    } as never);
    const repository = guardedCareReferralRepository(inner, () => ENABLED_FLAGS);
    const rows = await repository.listForUser("user-1");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("diagnosis");
  });
});
