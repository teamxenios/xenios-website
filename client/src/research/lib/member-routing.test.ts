import { describe, expect, it } from "vitest";
import { memberDestination, safeResearchReturnTo } from "./member-routing";

const active = { firstName: "Avery", status: "active", applicationStatus: "active" };
const pending = { firstName: "Avery", status: "pending_activation", applicationStatus: "approved" };

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
  ])("rejects unsafe or privileged destinations: %s", (value) => {
    expect(safeResearchReturnTo(value)).toBeNull();
  });

  it("allows canonical Research member paths", () => {
    expect(safeResearchReturnTo("/research/member/security?from=sign-in"))
      .toBe("/research/member/security?from=sign-in");
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
});
