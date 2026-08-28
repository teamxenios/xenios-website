import { describe, expect, it } from "vitest";
import { denialDestination, memberDestination, safeResearchReturnTo } from "./member-routing";

const active = { firstName: "Avery", status: "active", applicationStatus: "active" };
const pending = { firstName: "Avery", status: "pending_activation", applicationStatus: "approved" };
const pastDue = { firstName: "Avery", status: "past_due", applicationStatus: null };
const paused = { firstName: "Avery", status: "paused", applicationStatus: null };

describe("safeResearchReturnTo", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/admin/research",
    "/research/admin",
    "/research/../admin",
    "/research/member/../../admin",
    "/research%2fmember",
    "/research/member/%2e%2e/admin",
    "/research/member/%252e%252e/%252e%252e/admin/research",
    "/research/member/welcome",
    "/research/member/not-a-real-route",
  ])("rejects unsafe or privileged destinations: %s", (value) => {
    expect(safeResearchReturnTo(value)).toBeNull();
  });

  it("allows canonical Research member paths", () => {
    expect(safeResearchReturnTo("/research/member/security?from=sign-in"))
      .toBe("/research/member/security?from=sign-in");
    expect(safeResearchReturnTo("/research/member/orders/order_123"))
      .toBe("/research/member/orders/order_123");
    expect(safeResearchReturnTo("/research/activate")).toBe("/research/activate");
  });

  it("allows a v2 catalog product detail so Buy Now survives sign-in", () => {
    expect(
      safeResearchReturnTo(
        "/research/member/catalog/research_vials/research-vials-bpc-157",
      ),
    ).toBe("/research/member/catalog/research_vials/research-vials-bpc-157");
    expect(
      safeResearchReturnTo(
        "/research/member/catalog/clinical_formulations_503a/some-offering-1",
      ),
    ).toBe("/research/member/catalog/clinical_formulations_503a/some-offering-1");
    // The list page was already a static member route and stays allowed.
    expect(safeResearchReturnTo("/research/member/catalog"))
      .toBe("/research/member/catalog");
  });

  it.each([
    // Crafted external and protocol-relative destinations that merely mention
    // the catalog path still refuse: the origin check and the leading-slash
    // requirement run before any pattern does.
    "https://evil.example/research/member/catalog/research_vials/bpc-157",
    "//evil.example/research/member/catalog/research_vials/bpc-157",
    "/\\evil.example/research/member/catalog/research_vials/bpc-157",
    "javascript:alert(1)//research/member/catalog/research_vials/bpc-157",
    // Traversal, encoded traversal, and double-encoded traversal inside the
    // catalog segments. (Traversal that normalizes onto a registered member
    // path is already covered by the shared normalization rules above; these
    // are the ones that try to escape.)
    "/research/member/catalog/research_vials/../../admin",
    "/research/member/catalog/research_vials/%2e%2e",
    "/research/member/catalog/research_vials/%252e%252e",
    // Shape violations: a missing segment, an extra segment, an uppercase
    // family, a slug with a dot, an overlong slug.
    "/research/member/catalog/research_vials",
    "/research/member/catalog/research_vials/bpc-157/extra",
    "/research/member/catalog/Research_Vials/bpc-157",
    "/research/member/catalog/research_vials/bpc.157",
    `/research/member/catalog/research_vials/${"a".repeat(200)}`,
  ])("refuses a crafted catalog returnTo: %s", (value) => {
    expect(safeResearchReturnTo(value)).toBeNull();
  });
});

describe("safeResearchReturnTo for the account portal", () => {
  it("allows exactly the nine registered static account-portal routes", () => {
    for (const path of [
      "/research/account",
      "/research/account/orders",
      "/research/account/subscription",
      "/research/account/care",
      "/research/account/documents",
      "/research/account/support",
      "/research/account/profile",
      "/research/account/security",
      "/research/account/interests",
    ]) {
      expect(safeResearchReturnTo(path)).toBe(path);
    }
  });

  it("preserves a safe case-sensitive opaque order-detail reference, with its query", () => {
    expect(safeResearchReturnTo("/research/account/orders/XRR-Fixture_01")).toBe("/research/account/orders/XRR-Fixture_01");
    expect(safeResearchReturnTo("/research/account/orders/xrr-fixture-01?tab=payment")).toBe("/research/account/orders/xrr-fixture-01?tab=payment");
  });

  it.each([
    "/research/account/orders/:reference",
    "/Research/account/orders/XRR-Fixture_01",
    "/research/Account/orders/XRR-Fixture_01",
    "/research/account/orders/XRR-Fixture_01/extra",
    "/research/account/orders/XRR%2DFixture",
    "/research/account/orders/.hidden",
    "/research/account/orders/",
    `/research/account/orders/${"a".repeat(193)}`,
    "/research/account/orders/XRR Fixture",
    "/research/account/orders/../../admin",
  ])("refuses a crafted order-detail returnTo: %s", (value) => {
    expect(safeResearchReturnTo(value)).toBeNull();
  });

  it("keeps the allowlist closed: parked and unregistered account paths are rejected", () => {
    expect(safeResearchReturnTo("/research/account/sign-in")).toBeNull();
    expect(safeResearchReturnTo("/research/account/claim-history")).toBeNull();
    expect(safeResearchReturnTo("/research/account/organizations/abc")).toBeNull();
    expect(safeResearchReturnTo("/research/account/nonexistent")).toBeNull();
    expect(safeResearchReturnTo("/research/account/orders/../../admin")).toBeNull();
  });
});

describe("memberDestination", () => {
  it("allows active members to resume inside the member site", () => {
    expect(memberDestination(active, "/research/member/security")).toBe("/research/member/security");
  });

  it("returns an active member to the exact account-portal route they asked for", () => {
    expect(memberDestination(active, "/research/account/orders")).toBe("/research/account/orders");
    expect(memberDestination(active, "/research/account")).toBe("/research/account");
  });

  it("never lets an account returnTo bypass activation or billing routing", () => {
    expect(memberDestination(pending, "/research/account/orders")).toBe("/research/activate");
    expect(memberDestination(pastDue, "/research/account/orders"))
      .toBe("/research/access-state?code=billing_past_due");
  });

  it("routes active members away from activation to the member site", () => {
    expect(memberDestination(active, "/research/activate")).toBe("/research/member");
  });

  it("never lets a non-active member bypass activation", () => {
    expect(memberDestination(pending, "/research/member/security")).toBe("/research/activate");
  });

  // The non-active statuses mirror the server guard's classification
  // (server/research/member-auth.ts requireActiveMember): pending_activation
  // is the activation flow, past_due is the billing screen, anything else
  // non-active is the inactive-membership screen. returnTo never overrides
  // any of them.
  it("routes a past_due member to the billing screen, never into member content", () => {
    expect(memberDestination(pastDue)).toBe("/research/access-state?code=billing_past_due");
    expect(memberDestination(pastDue, "/research/member/security"))
      .toBe("/research/access-state?code=billing_past_due");
  });

  it("routes any other non-active member to the inactive-membership screen", () => {
    expect(memberDestination(paused)).toBe("/research/access-state?code=membership_inactive");
    expect(memberDestination({ ...paused, status: "closed" }))
      .toBe("/research/access-state?code=membership_inactive");
  });
});

describe("denialDestination", () => {
  it("sends activation_required to the canonical activation flow, not a duplicate screen", () => {
    expect(denialDestination("activation_required")).toBe("/research/activate");
  });

  it("sends every other coded refusal to its access-state screen with the code as transport", () => {
    expect(denialDestination("recovery_session")).toBe("/research/access-state?code=recovery_session");
    expect(denialDestination("billing_past_due")).toBe("/research/access-state?code=billing_past_due");
    expect(denialDestination("membership_inactive")).toBe("/research/access-state?code=membership_inactive");
  });

  it("URL-encodes the code so a hostile code cannot break out of the query string", () => {
    expect(denialDestination("a&b=c")).toBe("/research/access-state?code=a%26b%3Dc");
  });
});
