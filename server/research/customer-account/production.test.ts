import { describe, expect, it } from "vitest";

import type { MemberRow } from "../member-auth";
import { buildProductionCustomerAccountPorts } from "./production";

const MEMBER: MemberRow = {
  id: "member-prod-fixture",
  application_id: "app-fixture",
  auth_user_id: "auth-fixture",
  email: "prod.fixture@example.invalid",
  first_name: "Prod",
  status: "active",
  created_at: "2026-07-15T00:00:00.000Z",
};

function ports(row: MemberRow | null = MEMBER) {
  return buildProductionCustomerAccountPorts(async () => row);
}

describe("production customer-account ports", () => {
  it("resolves identity from the member row and null for unknown members", async () => {
    const p = ports();
    expect(await p.identity.identityFor("member-prod-fixture")).toEqual({
      memberKey: "member-prod-fixture",
      displayName: "Prod",
      email: "prod.fixture@example.invalid",
      accountStatus: "active",
      memberSince: "2026-07-15T00:00:00.000Z",
    });
    expect(await ports(null).identity.identityFor("nobody")).toBeNull();
  });

  it("reports manual billing truthfully — no portal link is invented", async () => {
    const m = await ports().membership.membershipFor("member-prod-fixture");
    expect(m.state).toBe("active");
    expect(m.manualBilling).toBe(true);
    expect(m.manageUrl).toBeNull();
    expect(m.nextRenewalAt).toBeNull();
    expect(m.renewal).toEqual({ state: "unavailable", nextRenewalAt: null });
  });

  it("no member row means no membership — and no fabricated plan", async () => {
    const m = await ports(null).membership.membershipFor("x");
    expect(m.state).toBe("none");
    expect(m.billing).toBe("none");
    expect(m.planLabel).toBeNull();
  });

  it("an unrecognized status reads inactive, never active and never erased", async () => {
    const m = await ports({ ...MEMBER, status: "pending" }).membership.membershipFor("x");
    expect(m.state).toBe("inactive");
  });

  it("unwired concerns return truthful empty states, never inventions", async () => {
    const p = ports();
    expect((await p.orders.ordersFor("k")).research).toHaveLength(0);
    expect((await p.care.careFor("k")).sourceState).toBe("unavailable"); // P1-D: unwired is unknowable, never "not enrolled"
    expect(await p.documents.documentsFor("k")).toHaveLength(0);
    expect(await p.interests.interestsFor("k")).toHaveLength(0);
    expect(await p.attribution.attributionFor("k")).toBeNull();
  });

  it("a support write fails closed while no durable store is wired", async () => {
    await expect(
      ports().support.openCase("k", { category: "order", subject: "s", description: "d" }),
    ).rejects.toThrow("support_capability_pending");
  });

  // P1-5 (2026-08-27): billing truth is NEVER erased by the enforcement flag.
  // Every stored billing state renders identically with enforcement ON and
  // OFF, and access state comes from status alone.
  it("renders every stored billing state truthfully, with enforcement ON and OFF", async () => {
    const expected: Array<[string | undefined, string]> = [
      ["active", "current"],
      ["past_due", "past_due"],
      ["disputed", "disputed"],
      ["cancelled", "cancelled"],
      ["refunded", "refunded"],
      ["not_started", "none"],
      ["activation_pending", "none"],
      ["subscription_pending", "none"],
      ["", "unknown"], // stored but unreadable
      [undefined, "unknown"], // pre-migration row: absence of knowledge
      ["something_new", "unknown"], // unrecognized: never guessed current
    ];
    for (const enforcement of [undefined, "true"]) {
      if (enforcement) process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = enforcement;
      try {
        for (const [stored, display] of expected) {
          const row = stored === undefined ? { ...MEMBER } : { ...MEMBER, billing_state: stored };
          const dto = await ports(row).membership.membershipFor("x");
          expect(dto.billing, `stored=${String(stored)} enforcement=${String(enforcement)}`).toBe(display);
          // Access state is status-derived and untouched by billing/flag.
          expect(dto.state, `stored=${String(stored)}`).toBe("active");
        }
      } finally {
        delete process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED;
      }
    }
  });

  it("a known past_due billing fact is NOT erased when enforcement is off", async () => {
    // The exact defect the adversarial review found, inverted into a pin.
    const dto = await ports({ ...MEMBER, billing_state: "past_due" }).membership.membershipFor("x");
    expect(dto.billing).toBe("past_due");
    expect(dto.nextRenewalAt).toBeNull(); // and no renewal date is invented
    expect(dto.renewal.state).toBe("unavailable");
  });

  it("surfaces every non-active status without fabricating an active plan", async () => {
    const cases: Array<[string, string]> = [
      ["past_due", "past_due"],
      ["cancelled", "canceled"],
      ["closed", "canceled"],
      ["pending_activation", "pending"],
      ["paused", "paused"],
      ["mystery_status", "inactive"],
    ];
    for (const [status, display] of cases) {
      expect((await ports({ ...MEMBER, status }).membership.membershipFor("x")).state, status).toBe(display);
    }
  });

  it("injected sources replace the empty fallbacks, and only those", async () => {
    const p = buildProductionCustomerAccountPorts(async () => MEMBER, {
      orders: {
        ordersFor: async () => ({
          research: [
            {
              reference: "XEA-TEST",
              recordKind: "order",
              placedAt: "2026-08-20T10:00:00.000Z",
              detailAvailability: "available",
              itemLabel: "DSIP 10 mg",
              variantLabel: null,
              quantity: 1,
              paymentState: "paid",
              fulfillmentState: "shipped",
              trackingUrl: null,
              lotCoaAvailable: false,
            },
          ],
          carePharmacy: [],
          carePharmacyHistory: {
            availability: "unavailable",
            authoritativeRecordCount: null,
          },
          history: {
            availability: "complete",
            authoritativeRecordCount: 1,
            sources: {
              commerce: { connected: true, complete: true },
              xea: { connected: true, complete: true },
              xec: { connected: true, complete: true },
              xrr: { connected: true, complete: true },
            },
          },
        }),
      },
      support: {
        casesFor: async () => [],
        openCase: async () => ({
          id: "q-1",
          category: "order",
          subject: "s",
          state: "open",
          lastUpdateAt: "2026-08-27T00:00:00.000Z",
          responseExpectation: "Our team reads every request and replies as soon as possible.",
        }),
      },
      catalogPriority: {
        catalogPriorityFor: async () => ({ statuses: { dsip: "live" }, queue: [] }),
      },
    });
    expect((await p.orders.ordersFor("k")).research).toHaveLength(1);
    expect((await p.support.openCase("k", { category: "order", subject: "s", description: "d" })).state).toBe("open");
    expect((await p.catalogPriority?.catalogPriorityFor())?.statuses.dsip).toBe("live");
    // Concerns with no injected source keep their truthful empties.
    expect(await p.documents.documentsFor("k")).toHaveLength(0);
    expect(await p.interests.interestsFor("k")).toHaveLength(0);
  });
});
