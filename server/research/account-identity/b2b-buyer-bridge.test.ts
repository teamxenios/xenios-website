import { describe, expect, it, vi } from "vitest";
import {
  KRIS_VOLUME_PARTNER_PROFILE,
  claimB2BOrderOwnership,
  resolveB2BBuyerContext,
  type B2BBuyerBridgeDeps,
  type B2BBuyerRelationshipRecord,
} from "./b2b-buyer-bridge";

const AT = "2026-08-13T20:00:00.000Z";
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const ENTITLEMENT_ID = "44444444-4444-4444-8444-444444444444";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";

function relationship(
  patch: Partial<B2BBuyerRelationshipRecord> = {},
): B2BBuyerRelationshipRecord {
  return {
    relationshipId: RELATIONSHIP_ID,
    businessKey: "roman-health-marketplace",
    businessDisplayName: "Roman Health Marketplace",
    memberId: MEMBER_ID,
    state: "active",
    roles: ["organization_owner"],
    migratedOrganizationId: null,
    entitlements: [{
      entitlementId: ENTITLEMENT_ID,
      profileKey: KRIS_VOLUME_PARTNER_PROFILE,
      version: 1,
      state: "active",
      effectiveAt: "2026-08-13T00:00:00.000Z",
      expiresAt: null,
    }],
    ...patch,
  };
}

function deps(patch: Partial<B2BBuyerBridgeDeps> = {}): B2BBuyerBridgeDeps {
  return {
    resolveAuthenticatedMember: vi.fn(async () => ({
      authUserId: AUTH_USER_ID,
      memberId: MEMBER_ID,
      emailVerified: true,
      memberStatus: "active",
    })),
    listRelationshipsForMember: vi.fn(async () => [relationship()]),
    findCanonicalOrderForMember: vi.fn(async () => ({
      orderId: ORDER_ID,
      memberId: MEMBER_ID,
    })),
    commitOrderOwnership: vi.fn(async () => "linked"),
    ...patch,
  };
}

describe("Pack02 temporary B2B buyer bridge", () => {
  it("authorizes the exact member-bound Roman relationship and price profile", async () => {
    const result = await resolveB2BBuyerContext(deps(), {}, AT);
    expect(result).toEqual({
      state: "authorized",
      context: {
        authUserId: AUTH_USER_ID,
        memberId: MEMBER_ID,
        relationshipId: RELATIONSHIP_ID,
        businessKey: "roman-health-marketplace",
        businessDisplayName: "Roman Health Marketplace",
        roles: ["organization_owner"],
        pricing: {
          entitlementId: ENTITLEMENT_ID,
          profileKey: KRIS_VOLUME_PARTNER_PROFILE,
          profileVersion: 1,
          evaluatedAt: AT,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("info@romanhealthcollective.com");
  });

  it("never accepts email or business/profile input from the browser", async () => {
    const bridge = deps();
    const request = {
      body: {
        email: "info@romanhealthcollective.com",
        businessKey: "roman-health-marketplace",
        profile: KRIS_VOLUME_PARTNER_PROFILE,
      },
    };
    await resolveB2BBuyerContext(bridge, request, AT);
    expect(bridge.listRelationshipsForMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(bridge.listRelationshipsForMember).not.toHaveBeenCalledWith(
      expect.stringContaining("romanhealthcollective"),
    );
  });

  it("refuses anonymous, unverified, and inactive members", async () => {
    await expect(resolveB2BBuyerContext(deps({
      resolveAuthenticatedMember: vi.fn(async () => null),
    }), {}, AT)).resolves.toEqual({ state: "denied", reason: "auth_required" });

    await expect(resolveB2BBuyerContext(deps({
      resolveAuthenticatedMember: vi.fn(async () => ({
        authUserId: AUTH_USER_ID,
        memberId: MEMBER_ID,
        emailVerified: false,
        memberStatus: "active",
      })),
    }), {}, AT)).resolves.toEqual({
      state: "denied",
      reason: "email_verification_required",
    });

    await expect(resolveB2BBuyerContext(deps({
      resolveAuthenticatedMember: vi.fn(async () => ({
        authUserId: AUTH_USER_ID,
        memberId: MEMBER_ID,
        emailVerified: true,
        memberStatus: "paused",
      })),
    }), {}, AT)).resolves.toEqual({ state: "denied", reason: "member_inactive" });
  });

  it("fails closed for another member or multiple active relationships", async () => {
    await expect(resolveB2BBuyerContext(deps({
      listRelationshipsForMember: vi.fn(async () => [relationship({
        memberId: "99999999-9999-4999-8999-999999999999",
      })]),
    }), {}, AT)).resolves.toEqual({ state: "denied", reason: "relationship_inactive" });

    await expect(resolveB2BBuyerContext(deps({
      listRelationshipsForMember: vi.fn(async () => [
        relationship(),
        relationship({ relationshipId: "66666666-6666-4666-8666-666666666666" }),
      ]),
    }), {}, AT)).resolves.toEqual({ state: "denied", reason: "relationship_ambiguous" });
  });

  it("refuses non-buyers and migrated or suspended relationships", async () => {
    await expect(resolveB2BBuyerContext(deps({
      listRelationshipsForMember: vi.fn(async () => [relationship({ roles: ["billing_viewer"] })]),
    }), {}, AT)).resolves.toEqual({ state: "denied", reason: "buyer_role_required" });

    for (const row of [
      relationship({ state: "suspended" }),
      relationship({
        state: "migrated",
        migratedOrganizationId: "77777777-7777-4777-8777-777777777777",
      }),
    ]) {
      await expect(resolveB2BBuyerContext(deps({
        listRelationshipsForMember: vi.fn(async () => [row]),
      }), {}, AT)).resolves.toEqual({ state: "denied", reason: "relationship_inactive" });
    }
  });

  it("refuses pending, expired, wrong-profile, and duplicate entitlements", async () => {
    for (const entitlementPatch of [
      { state: "suspended" as const },
      { expiresAt: "2026-08-13T19:59:59.000Z" },
      { profileKey: "ordinary_member" },
      { effectiveAt: "2026-08-14T00:00:00.000Z" },
    ]) {
      const row = relationship();
      row.entitlements = [{ ...row.entitlements[0], ...entitlementPatch }];
      await expect(resolveB2BBuyerContext(deps({
        listRelationshipsForMember: vi.fn(async () => [row]),
      }), {}, AT)).resolves.toEqual({ state: "denied", reason: "entitlement_not_active" });
    }

    const duplicate = relationship();
    duplicate.entitlements = [
      duplicate.entitlements[0],
      { ...duplicate.entitlements[0], entitlementId: "88888888-8888-4888-8888-888888888888" },
    ];
    await expect(resolveB2BBuyerContext(deps({
      listRelationshipsForMember: vi.fn(async () => [duplicate]),
    }), {}, AT)).resolves.toEqual({ state: "denied", reason: "entitlement_ambiguous" });
  });

  it("claims ownership only for the exact canonical member order", async () => {
    const bridge = deps();
    const result = await claimB2BOrderOwnership(bridge, {}, {
      orderId: ORDER_ID,
      establishedAt: AT,
    });
    expect(result.state).toBe("linked");
    expect(bridge.findCanonicalOrderForMember).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      memberId: MEMBER_ID,
    });
    expect(bridge.commitOrderOwnership).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      relationshipId: RELATIONSHIP_ID,
      memberId: MEMBER_ID,
      entitlementId: ENTITLEMENT_ID,
      pricingProfileKey: KRIS_VOLUME_PARTNER_PROFILE,
      pricingProfileVersion: 1,
      establishedAt: AT,
    });
  });

  it("redacts cross-member order existence and refuses ownership conflicts", async () => {
    await expect(claimB2BOrderOwnership(deps({
      findCanonicalOrderForMember: vi.fn(async () => ({
        orderId: ORDER_ID,
        memberId: "99999999-9999-4999-8999-999999999999",
      })),
    }), {}, { orderId: ORDER_ID, establishedAt: AT })).resolves.toEqual({
      state: "denied",
      reason: "order_not_found",
    });

    await expect(claimB2BOrderOwnership(deps({
      commitOrderOwnership: vi.fn(async () => "conflict"),
    }), {}, { orderId: ORDER_ID, establishedAt: AT })).resolves.toEqual({
      state: "denied",
      reason: "ownership_conflict",
    });
  });

  it("treats an exact replay as success without creating a second order", async () => {
    const result = await claimB2BOrderOwnership(deps({
      commitOrderOwnership: vi.fn(async () => "replayed"),
    }), {}, { orderId: ORDER_ID, establishedAt: AT });
    expect(result.state).toBe("replayed");
  });
});
