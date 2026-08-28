import { describe, expect, it } from "vitest";

import {
  CARE_TIMELINE_STAGES,
  MEMBERSHIP_BILLING_DISPLAY_STATES,
  MEMBERSHIP_DISPLAY_STATES,
  ORDER_FULFILLMENT_DISPLAY_STATES,
  ORDER_PAYMENT_DISPLAY_STATES,
  createMembershipDto,
  membershipRenewalMirrorMatches,
} from "./contract";
import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_ACCOUNT_OVERVIEW_STAFF,
  FIXTURE_CUSTOMER_ORDERS,
  FIXTURE_CUSTOMER_ORDERS_CARE_PARTIAL,
} from "./fixtures";

describe("care timeline vocabulary", () => {
  it("carries exactly the ten agreed stations in order", () => {
    expect(CARE_TIMELINE_STAGES).toEqual([
      "account_created",
      "intake_needed",
      "intake_submitted",
      "provider_review",
      "follow_up_required",
      "appointment_needed",
      "provider_decision_complete",
      "pharmacy_processing",
      "shipped",
      "completed",
    ]);
  });

  it("membership display states include none and never a medical promise", () => {
    expect(MEMBERSHIP_DISPLAY_STATES).toContain("none");
    expect(MEMBERSHIP_DISPLAY_STATES).toHaveLength(8);
  });

  it("billing display truth carries the full stored vocabulary plus unknown (P1-5)", () => {
    expect(MEMBERSHIP_BILLING_DISPLAY_STATES).toEqual([
      "current",
      "past_due",
      "disputed",
      "cancelled",
      "refunded",
      "none",
      "unknown",
    ]);
  });

  it("payment display truth includes refunded and unknown — no two-value guess (P1-3)", () => {
    expect(ORDER_PAYMENT_DISPLAY_STATES).toEqual([
      "unpaid",
      "paid",
      "partially_refunded",
      "refunded",
      "unknown",
    ]);
    expect(ORDER_FULFILLMENT_DISPLAY_STATES).toContain("unknown");
  });
});

describe("fixtures", () => {
  it("the customer's own overview never carries partner attribution", () => {
    expect(FIXTURE_ACCOUNT_OVERVIEW.partnerAttribution).toBeNull();
  });

  it("the staff projection carries attribution as slug + owner", () => {
    expect(FIXTURE_ACCOUNT_OVERVIEW_STAFF.partnerAttribution).toEqual({
      sourcePartner: "vitality_advisors",
      relationshipOwner: "Seth Grant",
    });
  });

  it("fixture identities are synthetic (.invalid / fixture markers only)", () => {
    expect(FIXTURE_ACCOUNT_OVERVIEW.identity.email.endsWith("@example.invalid")).toBe(true);
    for (const order of FIXTURE_CUSTOMER_ORDERS.research) {
      expect(order.reference).toMatch(/^XRR-\d{8}-TESTFIX/);
    }
  });

  it("membership and care remain separate objects with independent truth", () => {
    expect(FIXTURE_ACCOUNT_OVERVIEW.membership.state).toBe("active");
    expect(FIXTURE_ACCOUNT_OVERVIEW.careEnrollment.status.stage).toBe("provider_review");
    // An active membership does not imply pharmacy fulfillment.
    expect(FIXTURE_ACCOUNT_OVERVIEW.careEnrollment.pharmacyState).toBe("none");
  });

  it("partial Research history and available Care history keep distinct count truth", () => {
    expect(FIXTURE_CUSTOMER_ORDERS.history).toMatchObject({
      availability: "partial",
      authoritativeRecordCount: null,
    });
    expect(FIXTURE_CUSTOMER_ORDERS.carePharmacyHistory).toEqual({
      availability: "available",
      authoritativeRecordCount: 1,
    });
  });

  it("partial Care history preserves known records without claiming their length is total", () => {
    expect(FIXTURE_CUSTOMER_ORDERS_CARE_PARTIAL.carePharmacy).toEqual(
      FIXTURE_CUSTOMER_ORDERS.carePharmacy,
    );
    expect(FIXTURE_CUSTOMER_ORDERS_CARE_PARTIAL.carePharmacy.length).toBeGreaterThan(0);
    expect(FIXTURE_CUSTOMER_ORDERS_CARE_PARTIAL.carePharmacyHistory).toEqual({
      availability: "partial",
      authoritativeRecordCount: null,
    });
  });

  it("renewal evidence distinguishes scheduled, not scheduled, and unavailable", () => {
    expect(FIXTURE_ACCOUNT_OVERVIEW.membership.renewal).toEqual({
      state: "scheduled",
      nextRenewalAt: "2026-09-26T00:00:00.000Z",
    });
  });

  it("constructs the compatibility mirror from the discriminated renewal evidence", () => {
    const dto = createMembershipDto({
      state: "active",
      billing: "current",
      planLabel: "Fixture membership",
      renewal: { state: "scheduled", nextRenewalAt: "2026-10-01T00:00:00.000Z" },
      manageUrl: null,
      manualBilling: true,
    });

    expect(dto.nextRenewalAt).toBe(dto.renewal.nextRenewalAt);
    expect(membershipRenewalMirrorMatches(dto)).toBe(true);
  });

  it.each([
    {
      renewal: { state: "scheduled", nextRenewalAt: "2026-10-01T00:00:00.000Z" },
      nextRenewalAt: null,
    },
    {
      renewal: { state: "scheduled", nextRenewalAt: "2026-10-01T00:00:00.000Z" },
      nextRenewalAt: "2026-11-01T00:00:00.000Z",
    },
    {
      renewal: { state: "unavailable", nextRenewalAt: null },
      nextRenewalAt: "2026-10-01T00:00:00.000Z",
    },
  ])("rejects a contradictory renewal compatibility mirror %#", (candidate) => {
    expect(membershipRenewalMirrorMatches(candidate)).toBe(false);
  });

  it.each(["   ", "not-a-date", "2026-13-01T00:00:00.000Z", "2026-10-01T00:00:00Z", "2026-09-30T19:00:00.000-05:00"])(
    "refuses a non-canonical scheduled-renewal timestamp %s at construction",
    (nextRenewalAt) => {
      expect(() =>
        createMembershipDto({
          state: "active",
          billing: "current",
          planLabel: null,
          renewal: { state: "scheduled", nextRenewalAt },
          manageUrl: null,
          manualBilling: true,
        }),
      ).toThrow("membership_renewal_evidence_invalid");
    },
  );

  it("rejects a matching mirror when the scheduled value is not a timestamp", () => {
    expect(membershipRenewalMirrorMatches({
      renewal: { state: "scheduled", nextRenewalAt: "not-a-date" },
      nextRenewalAt: "not-a-date",
    })).toBe(false);
  });
});
