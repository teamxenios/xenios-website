import { describe, expect, it } from "vitest";
import { memberAudienceSourceVersion } from "../catalog/member-catalog-service";
import type { MemberRow } from "../member-auth";
import {
  masterOfferingViewerForMember,
  pricingIdentityFromViewer,
} from "./member-pricing-viewer";

const MEMBER: MemberRow = {
  id: "11111111-1111-4111-8111-111111111111",
  application_id: "app-1",
  auth_user_id: "auth-1",
  email: "Member@Example.com",
  first_name: "Test",
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
};

describe("masterOfferingViewerForMember", () => {
  it("derives the grant from the member row through the exported fingerprint", () => {
    const viewer = masterOfferingViewerForMember(MEMBER, "");
    expect(viewer.audience).toBe("member");
    expect(viewer.email).toBe("member@example.com");
    expect(viewer.pricingGrant).toEqual({
      sourceVersion: memberAudienceSourceVersion(MEMBER),
    });
  });

  it("grants the admin audience only on an exact normalized admin match", () => {
    expect(
      masterOfferingViewerForMember(MEMBER, "Member@Example.com ").audience,
    ).toBe("admin");
    expect(
      masterOfferingViewerForMember(MEMBER, "someone-else@example.com").audience,
    ).toBe("member");
    // An empty configured admin email can never make anyone admin.
    expect(masterOfferingViewerForMember(MEMBER, "").audience).toBe("member");
  });
});

describe("pricingIdentityFromViewer", () => {
  it("resolves a member identity from a granted viewer", () => {
    const identity = pricingIdentityFromViewer(
      masterOfferingViewerForMember(MEMBER, ""),
    );
    expect(identity).not.toBeNull();
    expect(identity!.audience).toBe("member");
    expect(identity!.sourceVersion).toBe(memberAudienceSourceVersion(MEMBER));
    expect(identity!.currency).toBe("USD");
    expect(Date.parse(identity!.evaluatedAt)).not.toBeNaN();
  });

  it("is null-safe: an absent viewer or grant is a null identity, never a throw", () => {
    expect(pricingIdentityFromViewer(undefined)).toBeNull();
    expect(pricingIdentityFromViewer(null)).toBeNull();
    expect(
      pricingIdentityFromViewer({ audience: "member", email: "x@example.com" }),
    ).toBeNull();
  });
});
