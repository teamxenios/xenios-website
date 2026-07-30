import { createHash } from "node:crypto";
import {
  ACCOUNT_ATTRIBUTION_LOCK_MONTHS,
  AFFILIATE_ORGANIZATION_POLICY_VERSION,
  ATTRIBUTION_CLICK_WINDOW_DAYS,
  COMMISSION_HOLD_DAYS,
  INDIVIDUAL_COMMISSION_BASIS_POINTS,
  MEMBERSHIP_FIRST_YEAR_BASIS_POINTS,
  MEMBERSHIP_RENEWAL_BASIS_POINTS,
  ORGANIZATION_COMMISSION_BASIS_POINTS,
  ORGANIZATION_PARENT_BASIS_POINTS,
  ORGANIZATION_SELLER_BASIS_POINTS,
  PAYOUT_MINIMUM_CENTS,
  type AffiliateCommissionAllocation,
  type AffiliateEconomicsDeniedDecision,
  type AffiliateEconomicsDecision,
  type AffiliateEconomicsDenialReason,
  type AffiliatePayabilityDecision,
  type AffiliatePayabilityDenialReason,
  type AffiliateReversalDecision,
  type CanonicalAccountAttributionLock,
  type CanonicalAffiliateAttributionProjection,
  type CanonicalAffiliatePayabilityProjection,
  type CanonicalAffiliateRevenueProjection,
  type CanonicalAffiliateReversalProjection,
} from "@shared/research/affiliates/organization-economics";
import type { AffiliateOrganizationEconomicsPort } from "./port";

const DAY_MS = 24 * 60 * 60 * 1_000;
const OPAQUE_ID = /^[A-Za-z0-9:_./-]{1,200}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_COMMISSIONABLE_REVENUE_CENTS = Math.floor(
  Number.MAX_SAFE_INTEGER / ORGANIZATION_COMMISSION_BASIS_POINTS,
);

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function opaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

function normalizedInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (record(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function decisionId(domain: string, value: unknown): string {
  let serialized: string;
  try {
    const candidate = stableJson(value);
    serialized =
      typeof candidate === "string"
        ? candidate
        : '"invalid-unserializable-projection"';
  } catch {
    serialized = '"invalid-unserializable-projection"';
  }
  return createHash("sha256")
    .update(`xenios:${AFFILIATE_ORGANIZATION_POLICY_VERSION}:${domain}:`)
    .update(serialized)
    .digest("hex");
}

function addDays(instant: string, days: number): string {
  return new Date(new Date(instant).getTime() + days * DAY_MS).toISOString();
}

function addUtcCalendarMonths(instant: string, months: number): string {
  const source = new Date(instant);
  const targetYear = source.getUTCFullYear() + Math.floor((source.getUTCMonth() + months) / 12);
  const targetMonth = (source.getUTCMonth() + months) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(source.getUTCDate(), lastTargetDay),
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    ),
  ).toISOString();
}

function normalizeLock(value: unknown): CanonicalAccountAttributionLock | null | undefined {
  if (value === null) return null;
  if (
    !record(value) ||
    !exactKeys(value, ["lockedAt", "expiresAt"]) ||
    !normalizedInstant(value.lockedAt) ||
    !normalizedInstant(value.expiresAt)
  ) {
    return undefined;
  }
  return { lockedAt: value.lockedAt, expiresAt: value.expiresAt };
}

function normalizeAttribution(
  value: unknown,
): CanonicalAffiliateAttributionProjection | undefined {
  if (
    !record(value) ||
    !exactKeys(value, [
      "attributionId",
      "kind",
      "sellerPartnerId",
      "organizationPartnerId",
      "clickedAt",
      "accountLock",
    ]) ||
    !opaqueId(value.attributionId) ||
    !["individual", "organization_direct", "organization_member"].includes(
      String(value.kind),
    ) ||
    !opaqueId(value.sellerPartnerId) ||
    !normalizedInstant(value.clickedAt)
  ) {
    return undefined;
  }
  const organizationPartnerId =
    value.organizationPartnerId === null
      ? null
      : opaqueId(value.organizationPartnerId)
        ? value.organizationPartnerId
        : undefined;
  const accountLock = normalizeLock(value.accountLock);
  if (organizationPartnerId === undefined || accountLock === undefined) return undefined;
  return {
    attributionId: value.attributionId,
    kind: value.kind as CanonicalAffiliateAttributionProjection["kind"],
    sellerPartnerId: value.sellerPartnerId,
    organizationPartnerId,
    clickedAt: value.clickedAt,
    accountLock,
  };
}

function normalizeRevenue(
  value: unknown,
): CanonicalAffiliateRevenueProjection | undefined {
  if (
    !record(value) ||
    !exactKeys(value, [
      "projectionVersion",
      "revenueEventId",
      "orderId",
      "classification",
      "currency",
      "eligiblePaidRevenueCents",
      "convertedAt",
      "paidAt",
      "membershipPaidMonth",
      "attribution",
    ]) ||
    !safePositiveInteger(value.projectionVersion) ||
    !opaqueId(value.revenueEventId) ||
    !opaqueId(value.orderId) ||
    !["research_goods", "membership", "clinical", "unknown"].includes(
      String(value.classification),
    ) ||
    typeof value.currency !== "string" ||
    !CURRENCY.test(value.currency) ||
    !safeNonNegativeInteger(value.eligiblePaidRevenueCents) ||
    value.eligiblePaidRevenueCents > MAX_COMMISSIONABLE_REVENUE_CENTS ||
    !normalizedInstant(value.convertedAt) ||
    !normalizedInstant(value.paidAt)
  ) {
    return undefined;
  }
  const attribution = normalizeAttribution(value.attribution);
  if (!attribution) return undefined;
  const membershipPaidMonth =
    value.membershipPaidMonth === null
      ? null
      : safePositiveInteger(value.membershipPaidMonth)
        ? value.membershipPaidMonth
        : undefined;
  if (membershipPaidMonth === undefined) return undefined;
  return {
    projectionVersion: value.projectionVersion,
    revenueEventId: value.revenueEventId,
    orderId: value.orderId,
    classification: value.classification as CanonicalAffiliateRevenueProjection["classification"],
    currency: value.currency,
    eligiblePaidRevenueCents: value.eligiblePaidRevenueCents,
    convertedAt: value.convertedAt,
    paidAt: value.paidAt,
    membershipPaidMonth,
    attribution,
  };
}

function denied(
  domain: string,
  input: unknown,
  reason: AffiliateEconomicsDenialReason,
): AffiliateEconomicsDeniedDecision {
  return {
    status: "denied",
    decisionId: decisionId(domain, input),
    policyVersion: AFFILIATE_ORGANIZATION_POLICY_VERSION,
    reason,
    totalCommissionCents: 0,
    allocations: [],
    holdUntil: null,
    payable: false,
  };
}

function validOrganizationRelationship(
  attribution: CanonicalAffiliateAttributionProjection,
): boolean {
  if (attribution.kind === "individual") {
    return attribution.organizationPartnerId === null;
  }
  if (attribution.kind === "organization_direct") {
    return attribution.organizationPartnerId === attribution.sellerPartnerId;
  }
  return (
    attribution.organizationPartnerId !== null &&
    attribution.organizationPartnerId !== attribution.sellerPartnerId
  );
}

function attributionIsCurrent(
  projection: CanonicalAffiliateRevenueProjection,
): "current" | "expired" | "invalid_lock" {
  const clicked = new Date(projection.attribution.clickedAt).getTime();
  const converted = new Date(projection.convertedAt).getTime();
  if (clicked > converted) return "expired";

  const lock = projection.attribution.accountLock;
  if (lock) {
    const expectedExpiry = addUtcCalendarMonths(
      lock.lockedAt,
      ACCOUNT_ATTRIBUTION_LOCK_MONTHS,
    );
    const locked = new Date(lock.lockedAt).getTime();
    const expires = new Date(lock.expiresAt).getTime();
    if (
      expectedExpiry !== lock.expiresAt ||
      locked < clicked ||
      expires <= locked
    ) {
      return "invalid_lock";
    }
    if (locked <= converted && converted <= expires) return "current";
  }

  return converted - clicked <= ATTRIBUTION_CLICK_WINDOW_DAYS * DAY_MS
    ? "current"
    : "expired";
}

function commissionRates(
  projection: CanonicalAffiliateRevenueProjection,
): Array<{
  beneficiaryPartnerId: string;
  role: AffiliateCommissionAllocation["role"];
  basisPoints: number;
}> {
  const attribution = projection.attribution;
  const membershipRate =
    projection.classification === "membership"
      ? projection.membershipPaidMonth! <= 12
        ? MEMBERSHIP_FIRST_YEAR_BASIS_POINTS
        : MEMBERSHIP_RENEWAL_BASIS_POINTS
      : null;

  if (attribution.kind === "individual") {
    return [{
      beneficiaryPartnerId: attribution.sellerPartnerId,
      role: "individual",
      basisPoints: membershipRate ?? INDIVIDUAL_COMMISSION_BASIS_POINTS,
    }];
  }
  if (attribution.kind === "organization_direct") {
    return [{
      beneficiaryPartnerId: attribution.organizationPartnerId!,
      role: "organization",
      basisPoints: membershipRate ?? ORGANIZATION_COMMISSION_BASIS_POINTS,
    }];
  }

  const totalRate = membershipRate ?? ORGANIZATION_COMMISSION_BASIS_POINTS;
  const sellerRate =
    totalRate === ORGANIZATION_COMMISSION_BASIS_POINTS
      ? ORGANIZATION_SELLER_BASIS_POINTS
      : Math.floor((totalRate * 3) / 4);
  return [
    {
      beneficiaryPartnerId: attribution.sellerPartnerId,
      role: "organization_seller",
      basisPoints: sellerRate,
    },
    {
      beneficiaryPartnerId: attribution.organizationPartnerId!,
      role: "organization_parent",
      basisPoints: totalRate - sellerRate,
    },
  ];
}

function evaluateRevenue(input: unknown): AffiliateEconomicsDecision {
  const projection = normalizeRevenue(input);
  if (!projection) return denied("revenue", input, "invalid_projection");
  if (projection.classification === "clinical" || projection.classification === "unknown") {
    return denied("revenue", projection, "clinical_or_unknown_revenue");
  }
  if (
    (projection.classification === "membership") !==
    (projection.membershipPaidMonth !== null)
  ) {
    return denied("revenue", projection, "invalid_projection");
  }
  if (
    new Date(projection.paidAt).getTime() <
    new Date(projection.convertedAt).getTime()
  ) {
    return denied("revenue", projection, "invalid_projection");
  }
  if (!validOrganizationRelationship(projection.attribution)) {
    return denied("revenue", projection, "invalid_organization_relationship");
  }
  const attributionState = attributionIsCurrent(projection);
  if (attributionState === "invalid_lock") {
    return denied("revenue", projection, "invalid_account_lock");
  }
  if (attributionState === "expired") {
    return denied("revenue", projection, "attribution_expired");
  }
  if (projection.eligiblePaidRevenueCents <= 0) {
    return denied("revenue", projection, "no_eligible_paid_revenue");
  }

  const allocations = commissionRates(projection).map((rate) => ({
    ...rate,
    amountCents: Math.floor(
      (projection.eligiblePaidRevenueCents * rate.basisPoints) / 10_000,
    ),
  }));
  const totalCommissionCents = allocations.reduce(
    (total, allocation) => total + allocation.amountCents,
    0,
  );
  if (totalCommissionCents <= 0) {
    return denied("revenue", projection, "no_eligible_paid_revenue");
  }
  return {
    status: "eligible",
    decisionId: decisionId("revenue", projection),
    policyVersion: AFFILIATE_ORGANIZATION_POLICY_VERSION,
    revenueEventId: projection.revenueEventId,
    currency: projection.currency,
    totalCommissionCents,
    allocations,
    holdUntil: addDays(projection.paidAt, COMMISSION_HOLD_DAYS),
    payable: false,
  };
}

function evaluateReversal(input: unknown): AffiliateReversalDecision {
  if (
    !record(input) ||
    !exactKeys(input, [
      "projectionVersion",
      "reversalEventId",
      "reversedAt",
      "reversedEligibleRevenueCents",
      "originalRevenue",
    ]) ||
    !safePositiveInteger(input.projectionVersion) ||
    !opaqueId(input.reversalEventId) ||
    !normalizedInstant(input.reversedAt) ||
    !safePositiveInteger(input.reversedEligibleRevenueCents)
  ) {
    return denied("reversal", input, "invalid_projection");
  }
  const originalRevenue = normalizeRevenue(input.originalRevenue);
  if (!originalRevenue) return denied("reversal", input, "invalid_projection");
  const projection: CanonicalAffiliateReversalProjection = {
    projectionVersion: input.projectionVersion,
    reversalEventId: input.reversalEventId,
    reversedAt: input.reversedAt,
    reversedEligibleRevenueCents: input.reversedEligibleRevenueCents,
    originalRevenue,
  };
  const originalDecision = evaluateRevenue(originalRevenue);
  if (
    originalDecision.status !== "eligible" ||
    projection.reversedEligibleRevenueCents >
      originalRevenue.eligiblePaidRevenueCents ||
    new Date(projection.reversedAt).getTime() <
      new Date(originalRevenue.paidAt).getTime()
  ) {
    return denied("reversal", projection, "invalid_projection");
  }

  const full =
    projection.reversedEligibleRevenueCents ===
    originalRevenue.eligiblePaidRevenueCents;
  const allocations = originalDecision.allocations.map((allocation) => ({
    beneficiaryPartnerId: allocation.beneficiaryPartnerId,
    role: allocation.role,
    basisPoints: allocation.basisPoints,
    amountCents: full
      ? allocation.amountCents
      : Math.min(
          allocation.amountCents,
          Math.floor(
            (projection.reversedEligibleRevenueCents * allocation.basisPoints) /
              10_000,
          ),
        ),
  }));
  const totalReversalCents = allocations.reduce(
    (total, allocation) => total + allocation.amountCents,
    0,
  );
  if (totalReversalCents <= 0) {
    return denied("reversal", projection, "no_eligible_paid_revenue");
  }
  return {
    status: "eligible",
    decisionId: decisionId("reversal", projection),
    policyVersion: AFFILIATE_ORGANIZATION_POLICY_VERSION,
    reversalEventId: projection.reversalEventId,
    currency: originalRevenue.currency,
    totalReversalCents,
    allocations,
    payable: false,
  };
}

function payabilityDenied(
  input: unknown,
  reason: AffiliatePayabilityDenialReason,
  currency: string | null = null,
): AffiliatePayabilityDecision {
  return {
    payable: false,
    decisionId: decisionId("payability", input),
    policyVersion: AFFILIATE_ORGANIZATION_POLICY_VERSION,
    reason,
    amountCents: 0,
    currency,
  };
}

function normalizePayability(
  input: unknown,
): CanonicalAffiliatePayabilityProjection | undefined {
  if (
    !record(input) ||
    !exactKeys(input, [
      "projectionVersion",
      "partnerId",
      "currency",
      "evaluatedAt",
      "partnerState",
      "termsVerified",
      "payoutConfigurationVerified",
      "clinicalOrUnknownRevenueIncluded",
      "grossCommissionCents",
      "reversalCents",
      "latestHoldUntil",
    ]) ||
    !safePositiveInteger(input.projectionVersion) ||
    !opaqueId(input.partnerId) ||
    typeof input.currency !== "string" ||
    !CURRENCY.test(input.currency) ||
    !normalizedInstant(input.evaluatedAt) ||
    !["active", "paused", "disabled", "under_review"].includes(
      String(input.partnerState),
    ) ||
    typeof input.termsVerified !== "boolean" ||
    typeof input.payoutConfigurationVerified !== "boolean" ||
    typeof input.clinicalOrUnknownRevenueIncluded !== "boolean" ||
    !safeNonNegativeInteger(input.grossCommissionCents) ||
    !safeNonNegativeInteger(input.reversalCents) ||
    !normalizedInstant(input.latestHoldUntil)
  ) {
    return undefined;
  }
  return input as unknown as CanonicalAffiliatePayabilityProjection;
}

function assessPayability(input: unknown): AffiliatePayabilityDecision {
  const projection = normalizePayability(input);
  if (!projection) return payabilityDenied(input, "invalid_projection");
  const currency = projection.currency;
  if (projection.partnerState !== "active") {
    return payabilityDenied(projection, "partner_not_active", currency);
  }
  if (!projection.termsVerified) {
    return payabilityDenied(projection, "terms_not_verified", currency);
  }
  if (!projection.payoutConfigurationVerified) {
    return payabilityDenied(
      projection,
      "payout_configuration_not_verified",
      currency,
    );
  }
  if (projection.clinicalOrUnknownRevenueIncluded) {
    return payabilityDenied(
      projection,
      "clinical_or_unknown_revenue_included",
      currency,
    );
  }
  if (projection.reversalCents > projection.grossCommissionCents) {
    return payabilityDenied(projection, "invalid_projection", currency);
  }
  const amountCents =
    projection.grossCommissionCents - projection.reversalCents;
  if (amountCents <= 0) {
    return payabilityDenied(projection, "no_payable_balance", currency);
  }
  if (
    new Date(projection.evaluatedAt).getTime() <
    new Date(projection.latestHoldUntil).getTime()
  ) {
    return payabilityDenied(projection, "hold_not_elapsed", currency);
  }
  if (amountCents < PAYOUT_MINIMUM_CENTS) {
    return payabilityDenied(projection, "below_payout_minimum", currency);
  }
  return {
    payable: true,
    decisionId: decisionId("payability", projection),
    policyVersion: AFFILIATE_ORGANIZATION_POLICY_VERSION,
    amountCents,
    currency,
  };
}

export function createAffiliateOrganizationEconomicsKernel(): AffiliateOrganizationEconomicsPort {
  return {
    async evaluateRevenue(projection) {
      try {
        return evaluateRevenue(projection);
      } catch {
        return denied("revenue", projection, "invalid_projection");
      }
    },
    async evaluateReversal(projection) {
      try {
        return evaluateReversal(projection);
      } catch {
        return denied("reversal", projection, "invalid_projection");
      }
    },
    async assessPayability(projection) {
      try {
        return assessPayability(projection);
      } catch {
        return payabilityDenied(projection, "invalid_projection");
      }
    },
  };
}
