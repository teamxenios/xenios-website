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
  /** Server-owned authorization clock. Never derived from request input. */
  now(): string;
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

type BuyerSelection =
  | {
      state: "selected";
      relationship: B2BBuyerRelationshipRecord;
      entitlement: B2BBuyerEntitlementRecord;
    }
  | { state: "denied"; reason: B2BBuyerDenialReason };

/**
 * The ONE selection rule for "which relationship and entitlement may price
 * this member". Both the Bearer-authenticated context resolver and the
 * member-keyed pricing resolver go through here, so the two doors cannot
 * drift apart on what counts as an authorized buyer: zero or multiple active
 * relationships fail closed, as do duplicate active entitlements.
 */
function selectActiveBuyerRelationship(
  relationships: readonly B2BBuyerRelationshipRecord[],
  memberId: string,
  at: number,
): BuyerSelection {
  const active = relationships.filter((relationship) =>
    relationship.memberId === memberId
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

  return { state: "selected", relationship, entitlement: entitlements[0] };
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
): Promise<ResolveB2BBuyerResult> {
  const evaluatedAt = deps.now();
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
  const selection = selectActiveBuyerRelationship(relationships, member.memberId, at);
  if (selection.state === "denied") {
    return { state: "denied", reason: selection.reason };
  }
  const { relationship, entitlement } = selection;
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

export type B2BBuyerPricingForMember = {
  entitlementId: string;
  profileKey: typeof KRIS_VOLUME_PARTNER_PROFILE;
  profileVersion: number;
  profileEffectiveAt: string;
  relationshipId: string;
  businessKey: string;
};

/**
 * Resolve the pricing entitlement for a member whose identity arrived through
 * a DURABLE server-side binding rather than a Bearer token: the Early Access
 * order door authenticates its customer by session, resolves the member
 * through the M62 legal binding directory, and then asks this exact question.
 *
 * Same selection rule as `resolveB2BBuyerContext` (one active relationship,
 * one active entitlement, buyer role required, everything else fails closed).
 * This function authorizes PRICING ONLY. It does not re-check member status
 * or email verification (those live with the Bearer resolver); suspending a
 * buyer suspends the relationship or the entitlement, and either closes this
 * door. It never throws for a denial; null means "no buyer-scoped pricing",
 * and the caller must fall back to the shared ledger price, never to a guess.
 */
export async function resolveB2BBuyerPricingForMember(
  deps: Pick<B2BBuyerBridgeDeps, "now" | "listRelationshipsForMember">,
  memberId: string,
): Promise<B2BBuyerPricingForMember | null> {
  if (typeof memberId !== "string" || memberId.trim() === "") return null;
  const at = parseInstant(deps.now());
  if (at === null) return null;

  const relationships = await deps.listRelationshipsForMember(memberId);
  const selection = selectActiveBuyerRelationship(relationships, memberId, at);
  if (selection.state === "denied") return null;

  return {
    entitlementId: selection.entitlement.entitlementId,
    profileKey: KRIS_VOLUME_PARTNER_PROFILE,
    profileVersion: selection.entitlement.version,
    profileEffectiveAt: selection.entitlement.effectiveAt,
    relationshipId: selection.relationship.relationshipId,
    businessKey: selection.relationship.businessKey,
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
  input: { orderId: string },
): Promise<ClaimB2BOrderOwnershipResult> {
  const context = await resolveB2BBuyerContext(deps, request);
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
  });
  if (result === "conflict") {
    return { state: "denied", reason: "ownership_conflict" };
  }
  return { state: result, context: context.context };
}
