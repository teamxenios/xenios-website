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
import { accountStanding, nextAdministrativeAction } from "./service";

const membership = (overrides: Partial<MembershipDto> = {}): MembershipDto => ({
  ...FIXTURE_MEMBERSHIP_MANUAL,
  ...overrides,
});

const orders = (
  availability: "complete" | "partial" | "unavailable",
  research: CustomerOrdersDto["research"] = [],
): CustomerOrdersDto => {
  const on = { connected: true, complete: true };
  const off = { connected: false, complete: false };
  return {
    research,
    carePharmacy: [],
    history: {
      availability,
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

  it("current ONLY with settled billing, complete history, and a knowable Care source", () => {
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
});
