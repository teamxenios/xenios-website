// xenios research: referral, partner, attribution, and commission contract.
//
// Two founder rules are encoded structurally rather than left to policy prose:
//
//   1. NO RECURSIVE DOWNLINE. A partner has no parent and no children. There is no
//      field in this file that could express one, so a multi-level compensation
//      structure cannot be built on top of it by accident.
//   2. NO COMPENSATION FOR RECRUITING. Commission is computed only from eligible net
//      revenue on an attributed order. There is no recruitment event type.

export type PartnerRole =
  | "member_referral"
  | "affiliate"
  | "research_rep"
  | "senior_research_rep"
  | "organization_partner"
  | "private_community_partner"
  | "professional_partner"
  | "future_wholesale"
  | "future_institutional";

export const PARTNER_ROLES: readonly PartnerRole[] = [
  "member_referral",
  "affiliate",
  "research_rep",
  "senior_research_rep",
  "organization_partner",
  "private_community_partner",
  "professional_partner",
  "future_wholesale",
  "future_institutional",
] as const;

export type PartnerState =
  | "application"
  | "identity_verification_pending"
  | "tax_status_pending"
  | "payout_status_pending"
  | "agreement_pending"
  | "training_pending"
  | "certification_pending"
  | "active"
  | "quality_review"
  | "suspended"
  | "terminated";

/** A partner may only earn or be paid while fully active. Fails closed. */
export function partnerCanEarn(state: PartnerState): boolean {
  return state === "active";
}

export function partnerCanBePaid(state: PartnerState): boolean {
  // A suspended or terminated partner keeps accrued ledger history but cannot be paid
  // out while under review, so a quality problem is resolved before money moves.
  return state === "active";
}

// ---------------------------------------------------------------------------
// Store credit and referrals
// ---------------------------------------------------------------------------

/** Founder decision: the new member receives $10, the referrer receives $15. */
export const REFERRAL_NEW_MEMBER_CREDIT_CENTS = 1000;
export const REFERRAL_REFERRER_CREDIT_CENTS = 1500;

/** Founder decision: a 14-day hold before referral credit approves. */
export const REFERRAL_HOLD_DAYS = 14;

export type LedgerEntryState = "pending" | "held" | "approved" | "reversed" | "fraud_flagged";

export interface StoreCreditEntry {
  id: string;
  memberId: string;
  amountCents: number;
  state: LedgerEntryState;
  reason: "referral_new_member" | "referral_referrer" | "service_recovery" | "manual_adjustment";
  createdAt: string;
  availableAt: string | null;
}

/**
 * Spendable balance counts ONLY approved entries.
 *
 * Pending, held, reversed, and fraud-flagged entries are deliberately excluded, so a
 * credit under review cannot be spent while it is still reversible.
 */
export function spendableStoreCreditCents(entries: readonly StoreCreditEntry[]): number {
  return entries
    .filter((e) => e.state === "approved")
    .reduce((sum, e) => sum + e.amountCents, 0);
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export type AttributionChannel = "signed_link" | "code" | "qr" | "campaign" | "organization" | "event" | "manual";

export type AttributionModel = "first_touch" | "last_touch";

export interface AttributionTouch {
  partnerId: string;
  channel: AttributionChannel;
  occurredAt: string;
  /** Manual attribution is permitted but must always name the admin who set it. */
  setByAdminId?: string;
}

export interface AttributionConfig {
  model: AttributionModel;
  windowDays: number;
}

export const DEFAULT_ATTRIBUTION: AttributionConfig = { model: "last_touch", windowDays: 30 };

/**
 * Resolves which partner earns credit for a conversion.
 *
 * Touches outside the window are discarded first, so an ancient link cannot claim a
 * conversion. Ties are broken deterministically by partner id rather than by array
 * order, so a concurrent race cannot produce two different winners for one order.
 */
export function resolveAttribution(
  touches: readonly AttributionTouch[],
  convertedAt: string,
  config: AttributionConfig = DEFAULT_ATTRIBUTION,
): AttributionTouch | null {
  const convertedMs = new Date(convertedAt).getTime();
  const windowMs = config.windowDays * 24 * 60 * 60 * 1000;

  const eligible = touches.filter((t) => {
    const ms = new Date(t.occurredAt).getTime();
    return ms <= convertedMs && convertedMs - ms <= windowMs;
  });
  if (eligible.length === 0) return null;

  // A manual attribution set by an admin always wins, because it is a deliberate
  // human correction of the automatic result.
  const manual = eligible.filter((t) => t.channel === "manual");
  if (manual.length > 0) {
    return manual.slice().sort((a, b) => cmpTouch(a, b, "last_touch"))[0];
  }
  return eligible.slice().sort((a, b) => cmpTouch(a, b, config.model))[0];
}

function cmpTouch(a: AttributionTouch, b: AttributionTouch, model: AttributionModel): number {
  const at = new Date(a.occurredAt).getTime();
  const bt = new Date(b.occurredAt).getTime();
  if (at !== bt) return model === "first_touch" ? at - bt : bt - at;
  // Deterministic tiebreak so a race cannot yield two winners.
  return a.partnerId.localeCompare(b.partnerId);
}

// ---------------------------------------------------------------------------
// Commission ledger
// ---------------------------------------------------------------------------

export type CommissionState =
  | "pending"
  | "held"
  | "approved"
  | "payable"
  | "paid"
  | "reversed"
  | "disputed"
  | "forfeited";

export interface OrderRevenueBreakdown {
  grossItemsCents: number;
  taxCents: number;
  shippingCents: number;
  discountsCents: number;
  storeCreditAppliedCents: number;
  refundedCents: number;
  chargebackCents: number;
  /** Items in a category whose commission is not activated (peptides, Quantum). */
  ineligibleCategoryCents: number;
}

/**
 * Eligible net revenue.
 *
 * Everything the founder decision excludes is subtracted: tax, shipping, discounts,
 * store credit, refunds, chargebacks, and any category whose commission is not
 * activated. Clamped at zero, because a heavily refunded order must produce no
 * commission rather than a negative that could offset another order.
 */
export function eligibleNetRevenueCents(b: OrderRevenueBreakdown): number {
  const net =
    b.grossItemsCents -
    b.taxCents -
    b.shippingCents -
    b.discountsCents -
    b.storeCreditAppliedCents -
    b.refundedCents -
    b.chargebackCents -
    b.ineligibleCategoryCents;
  return Math.max(0, net);
}

export interface CommissionRate {
  role: PartnerRole;
  /** Basis points. Configurable, never hardcoded as a permanent published tier. */
  basisPoints: number;
}

export interface CommissionContext {
  partnerState: PartnerState;
  commissionsEnabled: boolean;
  /** Peptide and Quantum commission activation stays disabled until approved. */
  laneCommissionEnabled: boolean;
}

export type CommissionComputation =
  | { earned: true; amountCents: number; eligibleNetCents: number }
  | { earned: false; reason: CommissionDenialReason; eligibleNetCents: number };

export type CommissionDenialReason =
  | "commissions_disabled"
  | "lane_commission_disabled"
  | "partner_not_active"
  | "no_eligible_revenue";

/**
 * Computes a commission. Fails closed at every gate, and rounds DOWN so rounding can
 * never invent a fraction of a cent in the partner's favour.
 */
export function computeCommission(
  breakdown: OrderRevenueBreakdown,
  rate: CommissionRate,
  ctx: CommissionContext,
): CommissionComputation {
  const eligibleNetCents = eligibleNetRevenueCents(breakdown);

  if (!ctx.commissionsEnabled) {
    return { earned: false, reason: "commissions_disabled", eligibleNetCents };
  }
  if (!ctx.laneCommissionEnabled) {
    return { earned: false, reason: "lane_commission_disabled", eligibleNetCents };
  }
  if (!partnerCanEarn(ctx.partnerState)) {
    return { earned: false, reason: "partner_not_active", eligibleNetCents };
  }
  if (eligibleNetCents <= 0) {
    return { earned: false, reason: "no_eligible_revenue", eligibleNetCents };
  }
  return {
    earned: true,
    amountCents: Math.floor((eligibleNetCents * rate.basisPoints) / 10_000),
    eligibleNetCents,
  };
}

interface CommissionRule {
  from: CommissionState;
  to: CommissionState;
  actors: readonly ("admin" | "system")[];
}

export const COMMISSION_TRANSITIONS: readonly CommissionRule[] = [
  { from: "pending", to: "held", actors: ["system", "admin"] },
  { from: "pending", to: "approved", actors: ["system", "admin"] },
  { from: "pending", to: "reversed", actors: ["system", "admin"] },
  { from: "held", to: "approved", actors: ["admin"] },
  { from: "held", to: "reversed", actors: ["system", "admin"] },
  { from: "held", to: "forfeited", actors: ["admin"] },
  { from: "approved", to: "payable", actors: ["system", "admin"] },
  { from: "approved", to: "reversed", actors: ["system", "admin"] },
  { from: "approved", to: "disputed", actors: ["admin"] },
  { from: "payable", to: "paid", actors: ["system"] },
  { from: "payable", to: "reversed", actors: ["system", "admin"] },
  { from: "payable", to: "disputed", actors: ["admin"] },
  // A paid commission can still be reversed, because a chargeback can arrive later.
  { from: "paid", to: "reversed", actors: ["system", "admin"] },
  { from: "paid", to: "disputed", actors: ["admin"] },
  { from: "disputed", to: "approved", actors: ["admin"] },
  { from: "disputed", to: "reversed", actors: ["admin"] },
  { from: "disputed", to: "forfeited", actors: ["admin"] },
] as const;

export const TERMINAL_COMMISSION_STATES: ReadonlySet<CommissionState> = new Set<CommissionState>([
  "reversed",
  "forfeited",
]);

export function transitionCommission(
  from: CommissionState,
  to: CommissionState,
  actor: "admin" | "system",
): { ok: true; state: CommissionState } | { ok: false; message: string } {
  if (TERMINAL_COMMISSION_STATES.has(from)) {
    return { ok: false, message: `Commission is terminal in state ${from}.` };
  }
  const rule = COMMISSION_TRANSITIONS.find((r) => r.from === from && r.to === to);
  if (!rule) return { ok: false, message: `No transition from ${from} to ${to}.` };
  if (!rule.actors.includes(actor)) {
    return { ok: false, message: `Actor ${actor} may not move ${from} to ${to}.` };
  }
  return { ok: true, state: to };
}

// ---------------------------------------------------------------------------
// Partner privacy
// ---------------------------------------------------------------------------

/**
 * Data a partner must NEVER see. Exported so the authorization layer and its tests
 * share one definition rather than drifting apart.
 */
export const PARTNER_FORBIDDEN_FIELDS = [
  "applicantHealthData",
  "rejectionReason",
  "memberBlueprint",
  "memberPlans",
  "trackerData",
  "privateMemberOrders",
  "identityDocuments",
  "samuelNotes",
] as const;

export type PartnerForbiddenField = (typeof PARTNER_FORBIDDEN_FIELDS)[number];

/** A partner sees aggregates, never a member-level record. */
export interface PartnerVisibleConversion {
  attributedAt: string;
  eligibleNetCents: number;
  commissionCents: number;
  state: CommissionState;
}

export interface PartnerVisibleAggregate {
  leadCount: number;
  conversionCount: number;
  totalCommissionCents: number;
  conversions: PartnerVisibleConversion[];
}

/**
 * Builds the partner-visible view by explicit construction, never by filtering a
 * richer object, so a new sensitive field cannot leak into a partner response.
 */
export function toPartnerVisibleConversion(input: {
  attributedAt: string;
  eligibleNetCents: number;
  commissionCents: number;
  state: CommissionState;
  memberId?: string;
  memberEmail?: string;
  healthGoals?: string[];
}): PartnerVisibleConversion {
  return {
    attributedAt: input.attributedAt,
    eligibleNetCents: input.eligibleNetCents,
    commissionCents: input.commissionCents,
    state: input.state,
  };
}
