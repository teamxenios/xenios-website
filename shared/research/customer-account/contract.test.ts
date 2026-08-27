import { describe, expect, it } from "vitest";

import { CARE_TIMELINE_STAGES, MEMBERSHIP_DISPLAY_STATES } from "./contract";
import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_ACCOUNT_OVERVIEW_STAFF,
  FIXTURE_CUSTOMER_ORDERS,
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
    expect(MEMBERSHIP_DISPLAY_STATES).toHaveLength(5);
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
});
