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
});

describe("memberDestination", () => {
  it("allows active members to resume inside the member site", () => {
    expect(memberDestination(active, "/research/member/security")).toBe("/research/member/security");
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
