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
  });

  it("an inactive member has no membership rather than a fabricated one", async () => {
    const m = await ports({ ...MEMBER, status: "pending" }).membership.membershipFor("x");
    expect(m.state).toBe("none");
    expect(m.planLabel).toBeNull();
  });

  it("unwired concerns return truthful empty states, never inventions", async () => {
    const p = ports();
    expect((await p.orders.ordersFor("k")).research).toHaveLength(0);
    expect((await p.care.careFor("k")).enrolled).toBe(false);
    expect(await p.documents.documentsFor("k")).toHaveLength(0);
    expect(await p.interests.interestsFor("k")).toHaveLength(0);
    expect(await p.attribution.attributionFor("k")).toBeNull();
  });

  it("a support write fails closed while no durable store is wired", async () => {
    await expect(
      ports().support.openCase("k", { category: "order", subject: "s", description: "d" }),
    ).rejects.toThrow("support_capability_pending");
  });

  it("mirrors requireActiveMember's billing rule only while billing is enabled", async () => {
    const withBilling = async (billing_state: string, access_basis?: string) => {
      process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
      try {
        return await ports({ ...MEMBER, billing_state, ...(access_basis ? { access_basis } : {}) })
          .membership.membershipFor("x");
      } finally {
        delete process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED;
      }
    };
    // Billing disabled (the production default): status alone decides.
    expect((await ports({ ...MEMBER, billing_state: "past_due" }).membership.membershipFor("x")).state).toBe("active");
    // Billing enabled: explicit non-active billing states surface truthfully.
    expect((await withBilling("active")).state).toBe("active");
    expect((await withBilling("")).state).toBe("active"); // verified-legacy
    expect((await withBilling("past_due")).state).toBe("past_due");
    expect((await withBilling("cancelled")).state).toBe("canceled");
    expect((await withBilling("not_started")).state).toBe("none");
    expect((await withBilling("past_due", "sponsored_b2b")).state).toBe("active");
  });

  it("surfaces non-active statuses without fabricating an active plan", async () => {
    expect((await ports({ ...MEMBER, status: "past_due" }).membership.membershipFor("x")).state).toBe("past_due");
    expect((await ports({ ...MEMBER, status: "cancelled" }).membership.membershipFor("x")).state).toBe("canceled");
    expect((await ports({ ...MEMBER, status: "pending_activation" }).membership.membershipFor("x")).state).toBe("none");
  });

  it("injected sources replace the empty fallbacks, and only those", async () => {
    const p = buildProductionCustomerAccountPorts(async () => MEMBER, {
      orders: {
        ordersFor: async () => ({
          research: [
            {
              reference: "XEA-TEST",
              placedAt: "2026-08-20T10:00:00.000Z",
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
