/**
 * Temporary B2B buyer bridge for the Pack02 account boundary.
 *
 * Supabase Auth and research_members remain the identity authorities. This
 * module only resolves a server-side member to an approved business buyer
 * relationship and its price profile. Email is deliberately absent from the
 * authorization record: changing an address cannot transfer wholesale access.
 *
 * The bridge owns no cart, checkout, order, payment, or fulfillment state.
 * Order ownership is immutable metadata over canonical research_orders.
 */

export const KRIS_VOLUME_PARTNER_PROFILE = "KRIS_VOLUME_PARTNER" as const;

export type B2BBuyerRole =
  | "organization_owner"
  | "organization_admin"
  | "business_buyer"
  | "billing_viewer";

export type AuthenticatedMemberIdentity = {
  authUserId: string;
  memberId: string;
  emailVerified: boolean;
  memberStatus: string;
};

export type B2BBuyerEntitlementRecord = {
  entitlementId: string;
  profileKey: string;
  version: number;
  state: "active" | "suspended" | "expired" | "revoked";
  effectiveAt: string;
  expiresAt: string | null;
};

export type B2BBuyerRelationshipRecord = {
  relationshipId: string;
  businessKey: string;
  businessDisplayName: string;
  memberId: string;
  state: "active" | "suspended" | "closed" | "migrated";
  roles: B2BBuyerRole[];
  migratedOrganizationId: string | null;
  entitlements: B2BBuyerEntitlementRecord[];
};

export type AuthorizedB2BBuyerContext = {
  authUserId: string;
  memberId: string;
  relationshipId: string;
  businessKey: string;
  businessDisplayName: string;
  roles: B2BBuyerRole[];
  pricing: {
    entitlementId: string;
    profileKey: typeof KRIS_VOLUME_PARTNER_PROFILE;
    profileVersion: number;
    evaluatedAt: string;
  };
};

export type B2BBuyerDenialReason =
  | "auth_required"
  | "email_verification_required"
  | "member_inactive"
  | "relationship_not_found"
  | "relationship_ambiguous"
  | "relationship_inactive"
  | "buyer_role_required"
  | "entitlement_not_active"
  | "entitlement_ambiguous"
  | "invalid_instant";

export type ResolveB2BBuyerResult =
  | { state: "authorized"; context: AuthorizedB2BBuyerContext }
  | { state: "denied"; reason: B2BBuyerDenialReason };

export interface B2BBuyerBridgeDeps {
  resolveAuthenticatedMember(request: unknown): Promise<AuthenticatedMemberIdentity | null>;
  listRelationshipsForMember(memberId: string): Promise<B2BBuyerRelationshipRecord[]>;
  findCanonicalOrderForMember(input: {
    orderId: string;
    memberId: string;
  }): Promise<{ orderId: string; memberId: string } | null>;
  commitOrderOwnership(input: {
    orderId: string;
    relationshipId: string;
    memberId: string;
    entitlementId: string;
    pricingProfileKey: typeof KRIS_VOLUME_PARTNER_PROFILE;
    pricingProfileVersion: number;
    establishedAt: string;
  }): Promise<"linked" | "replayed" | "conflict">;
}

function parseInstant(value: string): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entitlementIsActive(
  entitlement: B2BBuyerEntitlementRecord,
  at: number,
): boolean {
  const effectiveAt = parseInstant(entitlement.effectiveAt);
  const expiresAt = entitlement.expiresAt === null
    ? null
    : parseInstant(entitlement.expiresAt);
  return entitlement.profileKey === KRIS_VOLUME_PARTNER_PROFILE
    && entitlement.state === "active"
    && Number.isSafeInteger(entitlement.version)
    && entitlement.version > 0
    && effectiveAt !== null
    && effectiveAt <= at
    && (entitlement.expiresAt === null || (expiresAt !== null && expiresAt > at));
}

function hasBuyerRole(roles: readonly B2BBuyerRole[]): boolean {
  return roles.includes("organization_owner") || roles.includes("business_buyer");
}

/**
 * Resolve the one business buyer context authorized for this request.
 *
 * The browser supplies neither a business id nor a pricing profile. Both come
 * from the exact authenticated member binding. Zero or multiple active rows
 * fail closed, as do duplicate active entitlements.
 */
export async function resolveB2BBuyerContext(
  deps: B2BBuyerBridgeDeps,
  request: unknown,
  evaluatedAt: string,
): Promise<ResolveB2BBuyerResult> {
  const at = parseInstant(evaluatedAt);
  if (at === null) return { state: "denied", reason: "invalid_instant" };

  const member = await deps.resolveAuthenticatedMember(request);
  if (member === null) return { state: "denied", reason: "auth_required" };
  if (!member.emailVerified) {
    return { state: "denied", reason: "email_verification_required" };
  }
  if (member.memberStatus !== "active") {
    return { state: "denied", reason: "member_inactive" };
  }

  const relationships = await deps.listRelationshipsForMember(member.memberId);
  const active = relationships.filter((relationship) =>
    relationship.memberId === member.memberId
    && relationship.state === "active"
    && relationship.migratedOrganizationId === null
  );
  if (active.length === 0) {
    return {
      state: "denied",
      reason: relationships.length === 0 ? "relationship_not_found" : "relationship_inactive",
    };
  }
  if (active.length !== 1) {
    return { state: "denied", reason: "relationship_ambiguous" };
  }

  const relationship = active[0];
  if (!hasBuyerRole(relationship.roles)) {
    return { state: "denied", reason: "buyer_role_required" };
  }

  const entitlements = relationship.entitlements.filter((entitlement) =>
    entitlementIsActive(entitlement, at)
  );
  if (entitlements.length === 0) {
    return { state: "denied", reason: "entitlement_not_active" };
  }
  if (entitlements.length !== 1) {
    return { state: "denied", reason: "entitlement_ambiguous" };
  }

  const entitlement = entitlements[0];
  return {
    state: "authorized",
    context: {
      authUserId: member.authUserId,
      memberId: member.memberId,
      relationshipId: relationship.relationshipId,
      businessKey: relationship.businessKey,
      businessDisplayName: relationship.businessDisplayName,
      roles: [...relationship.roles],
      pricing: {
        entitlementId: entitlement.entitlementId,
        profileKey: KRIS_VOLUME_PARTNER_PROFILE,
        profileVersion: entitlement.version,
        evaluatedAt,
      },
    },
  };
}

export type ClaimB2BOrderOwnershipResult =
  | { state: "linked" | "replayed"; context: AuthorizedB2BBuyerContext }
  | { state: "denied"; reason: B2BBuyerDenialReason | "order_not_found" | "ownership_conflict" };

/**
 * Attach immutable business ownership to an existing canonical draft order.
 * The production adapter delegates the final validation/insert to the
 * candidate SECURITY DEFINER RPC, which refuses paid orders and mismatched
 * member/relationship/entitlement evidence.
 */
export async function claimB2BOrderOwnership(
  deps: B2BBuyerBridgeDeps,
  request: unknown,
  input: { orderId: string; establishedAt: string },
): Promise<ClaimB2BOrderOwnershipResult> {
  const context = await resolveB2BBuyerContext(deps, request, input.establishedAt);
  if (context.state === "denied") return context;

  const order = await deps.findCanonicalOrderForMember({
    orderId: input.orderId,
    memberId: context.context.memberId,
  });
  if (
    order === null
    || order.orderId !== input.orderId
    || order.memberId !== context.context.memberId
  ) {
    return { state: "denied", reason: "order_not_found" };
  }

  const result = await deps.commitOrderOwnership({
    orderId: order.orderId,
    relationshipId: context.context.relationshipId,
    memberId: context.context.memberId,
    entitlementId: context.context.pricing.entitlementId,
    pricingProfileKey: context.context.pricing.profileKey,
    pricingProfileVersion: context.context.pricing.profileVersion,
    establishedAt: input.establishedAt,
  });
  if (result === "conflict") {
    return { state: "denied", reason: "ownership_conflict" };
  }
  return { state: result, context: context.context };
}
