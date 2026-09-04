import { describe, expect, it } from "vitest";

import type {
  CareEnrollmentDto,
  CustomerOrdersDto,
  MembershipDto,
  OrderSummaryDto,
} from "@shared/research/customer-account/contract";
import {
  FIXTURE_CARE_ENROLLED,
  FIXTURE_CARE_UNAVAILABLE,
  FIXTURE_MEMBERSHIP_MANUAL,
  FIXTURE_ORDERS,
  FIXTURE_SUPPORT_CASES,
} from "@shared/research/customer-account/fixtures";
import { accountStanding, createCustomerAccountService, nextAdministrativeAction, resolveNextAdministrativeAction } from "./service";
import { createMemoryCustomerAccountPorts, defaultMemorySeeds } from "./memory-adapters";

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
    ).toBe("Your Care intake needs attention.");
  });
});

describe("structured next administrative action", () => {
  const order = (overrides: Partial<OrderSummaryDto> = {}): OrderSummaryDto => ({
    ...FIXTURE_ORDERS[0],
    recordKind: "order",
    reference: "ORDER-SYNTHETIC-1",
    ...overrides,
  });

  it.each(["intake_needed", "follow_up_required", "appointment_needed"] as const)(
    "directs recorded Care %s to status without promising a working scheduler or inbox",
    (stage) => {
      const action = resolveNextAdministrativeAction(membership(), {
        sourceState: "available", enrolled: true,
        status: { stage, updatedAt: null, neutralSummary: null }, pharmacyState: "none",
      }, orders("complete", [order()]));
      expect(action?.target).toEqual({ kind: "care" });
      expect(action?.message).not.toMatch(/schedule your|check your messages|prescri|treatment/i);
    },
  );

  it.each(["past_due", "disputed"] as const)("routes %s billing truth to billing details", (billing) => {
    expect(resolveNextAdministrativeAction(membership({ billing }), FIXTURE_CARE_UNAVAILABLE, orders("partial"))?.target)
      .toEqual({ kind: "membership" });
  });

  it("offers the known unpaid order even when other history is incomplete, without an email delivery promise", () => {
    const action = resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("partial", [order()]));
    expect(action?.target).toEqual({ kind: "order", reference: "ORDER-SYNTHETIC-1" });
    expect(action?.message).toContain("recorded as unpaid");
    expect(action?.message).not.toContain("email");
  });

  it.each(["request", "unknown"] as const)("never turns an unpaid %s record into an order payment demand", (recordKind) => {
    expect(resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("complete", [order({ recordKind })])))
      .toBeNull();
  });

  it.each(["paid", "partially_refunded", "refunded", "unknown"] as const)("does not demand payment from %s truth", (paymentState) => {
    expect(resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("complete", [order({ paymentState })])))
      .toBeNull();
  });

  it.each(["cancelled", "exception", "unknown", "shipped", "delivered"] as const)("does not infer an obligation for %s fulfillment", (fulfillmentState) => {
    expect(resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("complete", [order({ fulfillmentState })])))
      .toBeNull();
  });

  it.each(["../other", "//example.invalid", "A?token=secret", "A#fragment", "A%2fB", "A\\B", "A".repeat(193)])(
    "never puts unsafe reference %s into a navigation target", (reference) => {
      expect(resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("partial", [order({ reference })]))?.target)
        .toEqual({ kind: "orders" });
    },
  );

  it("surfaces a known waiting support case without publishing its subject or identifier in the next step", () => {
    const waiting = { ...FIXTURE_SUPPORT_CASES[0], state: "waiting_on_customer" as const };
    const action = resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("partial"), [waiting]);
    expect(action).toEqual({ message: "A support case is waiting for your response.", target: { kind: "support" } });
    for (const state of ["open", "resolved"] as const) {
      expect(resolveNextAdministrativeAction(membership(), FIXTURE_CARE_UNAVAILABLE, orders("partial"), [{ ...waiting, state }]))
        .toBeNull();
    }
  });

  it("composes text, target and standing from the acting member's facts only", async () => {
    const seeds = defaultMemorySeeds().map((seed, index) => index === 0 ? {
      ...seed, orders: orders("partial", [order()]),
    } : seed);
    const service = createCustomerAccountService(createMemoryCustomerAccountPorts(seeds));
    const first = await service.resolveOverview("member-fixture-1", { staff: false });
    expect(first.kind).toBe("ok");
    if (first.kind === "ok") {
      expect(first.overview.nextAdministrativeActionTarget).toEqual({ kind: "order", reference: "ORDER-SYNTHETIC-1" });
      expect(first.overview.accountStanding).toBe("attention");
    }
    const second = await service.resolveOverview("member-fixture-2", { staff: false });
    expect(second.kind).toBe("ok");
    if (second.kind === "ok") {
      expect(second.overview.nextAdministrativeActionTarget).toBeNull();
      expect(second.overview.nextAdministrativeAction).toBeNull();
    }
    expect(JSON.stringify(second)).not.toContain("ORDER-SYNTHETIC-1");
  });

  it("a recorded support response prevents an all-clear in the composed overview", async () => {
    const seed = defaultMemorySeeds()[0];
    const service = createCustomerAccountService(createMemoryCustomerAccountPorts([{
      ...seed,
      orders: orders("complete"),
      supportCases: [{ ...FIXTURE_SUPPORT_CASES[0], state: "waiting_on_customer" }],
    }]));
    const result = await service.resolveOverview(seed.identity.memberKey, { staff: false });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.overview.accountStanding).toBe("attention");
      expect(result.overview.nextAdministrativeActionTarget).toEqual({ kind: "support" });
    }
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
