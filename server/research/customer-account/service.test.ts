import { describe, expect, it } from "vitest";

import type {
  CareEnrollmentDto,
  CustomerOrdersDto,
  MembershipDto,
} from "@shared/research/customer-account/contract";
import {
  FIXTURE_CARE_ENROLLED,
  FIXTURE_CARE_UNAVAILABLE,
  FIXTURE_MEMBERSHIP_MANUAL,
} from "@shared/research/customer-account/fixtures";
import { accountStanding, createCustomerAccountService, nextAdministrativeAction } from "./service";

const membership = (overrides: Partial<MembershipDto> = {}): MembershipDto => ({
  ...FIXTURE_MEMBERSHIP_MANUAL,
  ...overrides,
});

const orders = (
  availability: "complete" | "partial" | "unavailable",
  research: CustomerOrdersDto["research"] = [],
  carePharmacyHistory: CustomerOrdersDto["carePharmacyHistory"] = {
    availability: "available",
    authoritativeRecordCount: 0,
  },
): CustomerOrdersDto => {
  const on = { connected: true, complete: true };
  const off = { connected: false, complete: false };
  return {
    research,
    carePharmacy: [],
    carePharmacyHistory,
    history: {
      availability,
      authoritativeRecordCount: availability === "complete" ? research.length : null,
      sources:
        availability === "complete"
          ? { commerce: on, xea: on, xec: on, xrr: on }
          : availability === "partial"
            ? { commerce: on, xea: on, xec: off, xrr: off }
            : { commerce: off, xea: off, xec: off, xrr: off },
    },
  };
};

describe("nextAdministrativeAction", () => {
  it("REPRO P1-C: a disputed billing fact demands attention", () => {
    const action = nextAdministrativeAction(
      membership({ billing: "disputed" }),
      FIXTURE_CARE_UNAVAILABLE,
      orders("complete"),
    );
    expect(action).toContain("disputed");
  });

  it("an unavailable Care source neither demands an intake nor hides billing prompts", () => {
    expect(
      nextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("complete")),
    ).toBeNull();
    const enrolledIntake: CareEnrollmentDto = {
      sourceState: "available",
      enrolled: true,
      status: { stage: "intake_needed", updatedAt: null, neutralSummary: null },
      pharmacyState: "none",
    };
    expect(
      nextAdministrativeAction(membership(), enrolledIntake, orders("complete")),
    ).toBe("Complete your Care intake.");
  });
});

describe("accountStanding — 'up to date' must be provable", () => {
  it("attention whenever an action is outstanding", () => {
    expect(
      accountStanding(membership({ billing: "past_due" }), FIXTURE_CARE_ENROLLED, orders("complete"), "pay"),
    ).toBe("attention");
  });

  it("current ONLY with settled billing, complete history, and authoritative Care sources", () => {
    expect(
      accountStanding(membership({ billing: "current" }), FIXTURE_CARE_ENROLLED, orders("complete"), null),
    ).toBe("current");
    expect(
      accountStanding(membership({ billing: "none" }), FIXTURE_CARE_ENROLLED, orders("complete"), null),
    ).toBe("current");
  });

  it("REPRO P1-B: partial or unavailable history can never be declared up to date", () => {
    expect(
      accountStanding(membership({ billing: "current" }), FIXTURE_CARE_ENROLLED, orders("partial"), null),
    ).toBe("indeterminate");
    expect(
      accountStanding(membership({ billing: "current" }), FIXTURE_CARE_ENROLLED, orders("unavailable"), null),
    ).toBe("indeterminate");
  });

  it("REPRO P1-C: unknown, cancelled, or refunded billing never yields the green all-clear", () => {
    for (const billing of ["unknown", "cancelled", "refunded"] as const) {
      expect(
        accountStanding(membership({ billing }), FIXTURE_CARE_ENROLLED, orders("complete"), null),
        billing,
      ).toBe("indeterminate");
    }
  });

  it("REPRO P1-D: an unavailable Care source blocks the all-clear too", () => {
    expect(
      accountStanding(membership({ billing: "current" }), FIXTURE_CARE_UNAVAILABLE, orders("complete"), null),
    ).toBe("indeterminate");
  });

  it("partial or unavailable Care/pharmacy history blocks the all-clear", () => {
    for (const carePharmacyHistory of [
      { availability: "partial" as const, authoritativeRecordCount: null },
      { availability: "unavailable" as const, authoritativeRecordCount: null },
    ]) {
      expect(
        accountStanding(
          membership({ billing: "current" }),
          FIXTURE_CARE_ENROLLED,
          orders("complete", [], carePharmacyHistory),
          null,
        ),
        carePharmacyHistory.availability,
      ).toBe("indeterminate");
    }
  });
});

describe("membership renewal producer boundary", () => {
  it("fails the whole overview closed when a producer contradicts the renewal mirror", async () => {
    const malformedMembership = {
      ...FIXTURE_MEMBERSHIP_MANUAL,
      renewal: { state: "scheduled", nextRenewalAt: "2026-10-01T00:00:00.000Z" },
      nextRenewalAt: "2026-11-01T00:00:00.000Z",
    } as unknown as MembershipDto;
    const service = createCustomerAccountService({
      identity: {
        async identityFor(memberKey) {
          return {
            memberKey,
            displayName: "Synthetic Member",
            email: "synthetic.member@example.invalid",
            accountStatus: "active",
            memberSince: null,
          };
        },
      },
      membership: { async membershipFor() { return malformedMembership; } },
      care: { async careFor() { return FIXTURE_CARE_UNAVAILABLE; } },
      orders: { async ordersFor() { return orders("unavailable"); } },
      interests: { async interestsFor() { return []; } },
      documents: { async documentsFor() { return []; } },
      support: {
        async casesFor() { return []; },
        async openCase() { throw new Error("not used"); },
      },
      attribution: { async attributionFor() { return null; } },
    });

    await expect(service.resolveOverview("member-synthetic", { staff: false })).resolves.toEqual({
      kind: "error",
    });
  });
});
