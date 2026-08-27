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
});
