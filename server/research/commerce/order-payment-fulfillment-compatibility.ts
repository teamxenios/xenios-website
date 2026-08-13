/**
 * Unmounted final-base compatibility seams for Pack 04.
 *
 * These are structural adapters, not replacement account, buyer-commerce,
 * payment, claim, or fulfillment systems. Final-base recreation binds them to
 * the canonical Pack 02 and Buyer Commerce contracts after those owners land.
 */

import {
  PACK04_ORDER_QUANTITY_MAX,
  PACK04_ORDER_QUANTITY_MIN,
  type BusinessOrderOwner,
  type OrderActor,
  type OrderCommand,
  type OrderOwner,
  type OrderWorkflow,
} from "./order-payment-fulfillment";
import type { ClaimRecord } from "./refunds";
import type { FulfillmentAssignmentView } from "@shared/research/fulfillment/contracts";

export const PACK04_RECONCILED_AUTHORITIES = Object.freeze({
  q50: "0a15c63e57da25b56214c5e6f39eca1214018b09",
  buyerCommerce: "6f4c7517e762c484458d0ef9d935e518ff1398ee",
  pack02Accounts: "ca943a66b9ce6b6f8f03b9cf302a5aacea9b4fd2",
});

/**
 * Pack 04 never owns a second database schema. The only final-base mount shape
 * is an adapter over the canonical order/payment, fulfillment, and claim stores.
 */
export const PACK04_CANONICAL_PERSISTENCE_POLICY = Object.freeze({
  mode: "canonical_adapters_and_projections_only" as const,
  createsOrderTables: false,
  createsPaymentTables: false,
  createsFulfillmentTables: false,
  createsTimelineTables: false,
  createsAuditTables: false,
});

export type Pack04CanonicalOrderProjectionInput = Readonly<{
  order: OrderWorkflow;
  fulfillment: FulfillmentAssignmentView | null;
  claims: readonly Pick<ClaimRecord, "claimId" | "orderId" | "state" | "resolution">[];
}>;

export type Pack04CanonicalOperationalProjection = Readonly<{
  orderId: string;
  supplierReleaseEligible: boolean;
  fulfillment: Readonly<{
    assignmentId: string;
    state: FulfillmentAssignmentView["state"];
    version: number;
    carrier: string | null;
    trackingReference: string | null;
    updatedAt: string;
  }> | null;
  claims: readonly Readonly<{
    claimId: string;
    state: ClaimRecord["state"];
    resolution: ClaimRecord["resolution"];
  }>[];
}>;

/**
 * Join Pack 04 orchestration facts to canonical fulfillment and claim records.
 * It creates no fulfillment assignment or claim and fails closed on a cross-
 * order record, so callers cannot accidentally project another buyer's data.
 */
export function projectCanonicalOrderOperations(
  input: Pack04CanonicalOrderProjectionInput,
): Pack04CanonicalOperationalProjection | null {
  const { order, fulfillment, claims } = input;
  if (fulfillment !== null && fulfillment.orderReference !== order.orderId) return null;
  if (claims.some((claim) => claim.orderId !== order.orderId)) return null;
  const supplierReleaseEligible = order.approvedAt !== null
    && order.approvedBy !== null
    && order.settlement !== null
    && order.supplierHandoff?.releasedAt !== null
    && order.supplierHandoff?.releasedAt !== undefined;
  return Object.freeze({
    orderId: order.orderId,
    supplierReleaseEligible,
    fulfillment: fulfillment === null ? null : Object.freeze({
      assignmentId: fulfillment.assignmentId,
      state: fulfillment.state,
      version: fulfillment.version,
      carrier: fulfillment.carrier,
      trackingReference: fulfillment.trackingReference,
      updatedAt: fulfillment.updatedAt,
    }),
    claims: Object.freeze(claims.map((claim) => Object.freeze({
      claimId: claim.claimId,
      state: claim.state,
      resolution: claim.resolution,
    }))),
  });
}

export type Pack04AccountContext = Readonly<{
  auth: Readonly<{ userId: string; emailVerified: true }>;
  personal: Readonly<{ memberId: string }> | null;
  organizations: readonly Readonly<{
    id: string;
    status: "active" | "suspended" | "closed";
    roles: readonly ("organization_owner" | "organization_admin" | "business_buyer" | "billing_viewer")[];
    passwordChangeRequired: boolean;
  }>[];
  security: Readonly<{ passwordChangeRequired: boolean }>;
}>;

export type Pack04AccountTarget =
  | Readonly<{ kind: "personal" }>
  | Readonly<{ kind: "business"; organizationId: string }>;

export type Pack04AccountBindingResult =
  | Readonly<{ ok: true; actor: OrderActor; owner: OrderOwner }>
  | Readonly<{
      ok: false;
      code: "member_binding_required" | "organization_access_denied" | "password_change_required";
    }>;

/** Resolve ownership from authenticated Pack 02 state; never from request body IDs. */
export function resolvePack04AccountBinding(
  context: Pack04AccountContext,
  target: Pack04AccountTarget,
): Pack04AccountBindingResult {
  if (context.security.passwordChangeRequired) {
    return Object.freeze({ ok: false, code: "password_change_required" as const });
  }
  if (context.personal === null) {
    // The existing manual-payment bridge and Pack 04 invoice both bind memberId.
    return Object.freeze({ ok: false, code: "member_binding_required" as const });
  }
  if (target.kind === "personal") {
    return Object.freeze({
      ok: true as const,
      actor: Object.freeze({ actorId: context.personal.memberId, role: "buyer" as const }),
      owner: Object.freeze({ kind: "personal" as const, buyerId: context.personal.memberId }),
    });
  }
  const organization = context.organizations.find((item) => item.id === target.organizationId);
  const mayBuy = organization?.status === "active"
    && !organization.passwordChangeRequired
    && organization.roles.some((role) => (
      role === "organization_owner" || role === "organization_admin" || role === "business_buyer"
    ));
  if (!mayBuy) return Object.freeze({ ok: false, code: "organization_access_denied" as const });
  const owner: BusinessOrderOwner = Object.freeze({
    kind: "business",
    organizationId: target.organizationId,
    buyerId: context.personal.memberId,
  });
  return Object.freeze({
    ok: true as const,
    actor: Object.freeze({
      actorId: context.personal.memberId,
      role: "buyer" as const,
      organizationIds: Object.freeze([target.organizationId]),
    }),
    owner,
  });
}

export type Pack04BuyerCommerceRequestRecord = Readonly<{
  requestRef: string;
  createdAt: string;
  payload: Readonly<{ notes?: string }>;
  resolvedLines: readonly Readonly<{
    sku?: string;
    requestedQuantity: number;
    disposition: "direct_cart_eligible" | "order_request" | "care_pathway" | "unavailable";
    reason?:
      | "VARIANT_NOT_FOUND"
      | "CARE_PATHWAY_REQUIRED"
      | "DIRECT_AUTHORITY_UNAVAILABLE"
      | "PRICE_AUTHORITY_UNAVAILABLE"
      | "PRODUCT_CONTROL_REVIEW_REQUIRED";
  }>[];
}>;

export type Pack04BuyerReviewReason = Exclude<
  NonNullable<Pack04BuyerCommerceRequestRecord["resolvedLines"][number]["reason"]>,
  "VARIANT_NOT_FOUND" | "CARE_PATHWAY_REQUIRED"
>;

export type Pack04BuyerRequestAdaptation =
  | Readonly<{
      ok: true;
      command: Extract<OrderCommand, { kind: "create_request" }>;
      canonicalRequestRef: string;
      reviewReasons: readonly Readonly<{ sku: string; reason: Pack04BuyerReviewReason }>[];
    }>
  | Readonly<{
      ok: false;
      code: "existing_cart_required" | "care_pathway_required" | "unavailable" | "invalid_request_line";
    }>;

/**
 * Only Buyer Commerce `order_request` lines enter Pack 04. Direct lines stay in
 * the existing cart/checkout; Care and unavailable lines keep their real path.
 */
export function adaptBuyerCommerceRequest(
  record: Pack04BuyerCommerceRequestRecord,
  owner: OrderOwner,
  orderId: string,
): Pack04BuyerRequestAdaptation {
  if (record.resolvedLines.some((line) => line.disposition === "direct_cart_eligible")) {
    return Object.freeze({ ok: false, code: "existing_cart_required" as const });
  }
  if (record.resolvedLines.some((line) => line.disposition === "care_pathway")) {
    return Object.freeze({ ok: false, code: "care_pathway_required" as const });
  }
  if (record.resolvedLines.some((line) => line.disposition === "unavailable")) {
    return Object.freeze({ ok: false, code: "unavailable" as const });
  }
  const seen = new Set<string>();
  const allowedReviewReasons = new Set<string>([
    "DIRECT_AUTHORITY_UNAVAILABLE",
    "PRICE_AUTHORITY_UNAVAILABLE",
    "PRODUCT_CONTROL_REVIEW_REQUIRED",
  ]);
  if (record.resolvedLines.length < 1 || record.resolvedLines.some((line) => {
    const invalid = typeof line.sku !== "string" || seen.has(line.sku)
      || !Number.isSafeInteger(line.requestedQuantity)
      || line.requestedQuantity < PACK04_ORDER_QUANTITY_MIN
      || line.requestedQuantity > PACK04_ORDER_QUANTITY_MAX
      || line.disposition !== "order_request"
      || !allowedReviewReasons.has(line.reason ?? "");
    if (typeof line.sku === "string") seen.add(line.sku);
    return invalid;
  })) {
    return Object.freeze({ ok: false, code: "invalid_request_line" as const });
  }
  return Object.freeze({
    ok: true as const,
    canonicalRequestRef: record.requestRef,
    reviewReasons: Object.freeze(record.resolvedLines.map((line) => Object.freeze({
      sku: line.sku!,
      reason: line.reason as Pack04BuyerReviewReason,
    }))),
    command: Object.freeze({
      kind: "create_request" as const,
      orderId,
      owner,
      request: Object.freeze({
        requestRef: record.requestRef,
        lines: Object.freeze(record.resolvedLines.map((line) => Object.freeze({
          sku: line.sku!,
          quantity: line.requestedQuantity,
        }))),
        ...(record.payload.notes ? { note: record.payload.notes } : {}),
      }),
      occurredAt: record.createdAt,
    }),
  });
}

export type Pack04CanonicalGate =
  | Readonly<{ state: "not_required" }>
  | Readonly<{ state: "cleared"; decisionRef: string }>
  | Readonly<{ state: "blocked" }>;

export type Pack04CanonicalApprovalInput = Readonly<{
  orderId: string;
  occurredAt: string;
  quantityReviewTriggered: boolean;
  eligibility: Pack04CanonicalGate;
  productControl: Pack04CanonicalGate;
  productSpecificLegal: Pack04CanonicalGate;
  valueReview: Pack04CanonicalGate;
  fraudReview: Pack04CanonicalGate;
}>;

export type Pack04CanonicalApprovalResult =
  | Readonly<{
      ok: true;
      command: Extract<OrderCommand, { kind: "approve_request" }>;
      canonicalDecisionRefs: readonly string[];
    }>
  | Readonly<{
      ok: false;
      code:
        | "stale_quantity_review_rule"
        | "eligibility_required"
        | "product_control_required"
        | "product_legal_restriction"
        | "value_review_required"
        | "fraud_review_required"
        | "invalid_decision_reference";
    }>;

const CANONICAL_DECISION_REF = /^[A-Za-z0-9][A-Za-z0-9:_./-]{2,127}$/;

/**
 * Convert already-authoritative policy decisions into an approval command.
 * Pack 04 does not evaluate or replace these policies. Quantity 1..50 never
 * creates a review here, while every real non-quantity gate remains mandatory.
 */
export function adaptCanonicalApprovalDecision(
  input: Pack04CanonicalApprovalInput,
): Pack04CanonicalApprovalResult {
  if (input.quantityReviewTriggered) {
    return Object.freeze({ ok: false, code: "stale_quantity_review_rule" as const });
  }
  if (input.eligibility.state !== "cleared") {
    return Object.freeze({ ok: false, code: "eligibility_required" as const });
  }
  if (input.productControl.state !== "cleared") {
    return Object.freeze({ ok: false, code: "product_control_required" as const });
  }
  if (input.productSpecificLegal.state === "blocked") {
    return Object.freeze({ ok: false, code: "product_legal_restriction" as const });
  }
  if (input.valueReview.state === "blocked") {
    return Object.freeze({ ok: false, code: "value_review_required" as const });
  }
  if (input.fraudReview.state === "blocked") {
    return Object.freeze({ ok: false, code: "fraud_review_required" as const });
  }
  const gates = [
    input.eligibility,
    input.productControl,
    input.productSpecificLegal,
    input.valueReview,
    input.fraudReview,
  ];
  const decisionRefs = gates.flatMap((gate) => gate.state === "cleared" ? [gate.decisionRef] : []);
  if (decisionRefs.some((ref) => !CANONICAL_DECISION_REF.test(ref))) {
    return Object.freeze({ ok: false, code: "invalid_decision_reference" as const });
  }
  return Object.freeze({
    ok: true as const,
    command: Object.freeze({
      kind: "approve_request" as const,
      orderId: input.orderId,
      occurredAt: input.occurredAt,
    }),
    canonicalDecisionRefs: Object.freeze(decisionRefs),
  });
}

/** Pack 02-compatible organization history projection from Pack 04 authority. */
export function projectPack04OrganizationOrder(
  order: OrderWorkflow,
  displayNameBySku: Readonly<Record<string, string>>,
  canonicalReviewTriggers: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (order.owner.kind !== "business") return null;
  if (order.request.lines.some((line) => !displayNameBySku[line.sku])) return null;
  if (new Set(canonicalReviewTriggers).size !== canonicalReviewTriggers.length
    || canonicalReviewTriggers.some((trigger) => (
      typeof trigger !== "string" || trigger.length < 1 || trigger.length > 128
    ))) return null;
  const invoiceLines = new Map(order.invoice?.lines.map((line) => [line.sku, line]) ?? []);
  return Object.freeze({
    ownership: Object.freeze({
      organizationId: order.owner.organizationId,
      basis: "organization_checkout" as const,
    }),
    source: "research_order" as const,
    sourceOrderId: order.orderId,
    orderNumber: order.orderId,
    state: order.stage,
    reviewTriggers: Object.freeze([...canonicalReviewTriggers]),
    placedAt: order.createdAt,
    totalCents: order.invoice?.amountCents ?? 0,
    currency: order.invoice?.currency ?? "USD",
    lines: Object.freeze(order.request.lines.map((line) => Object.freeze({
      sku: line.sku,
      displayName: displayNameBySku[line.sku]!,
      quantity: line.quantity,
      lineTotalCents: invoiceLines.get(line.sku)?.lineTotalCents ?? null,
    }))),
    invoice: order.invoice ? Object.freeze({
      invoiceNumber: order.invoice.invoiceRef,
      status: order.verification ? "paid" : "awaiting_payment",
      issuedAt: order.invoice.createdAt,
      totalCents: order.invoice.amountCents,
      currency: order.invoice.currency,
    }) : null,
    payments: Object.freeze(order.invoice ? [Object.freeze({
      status: order.verification
        ? "verified"
        : order.paymentEvidence.length > 0 ? "evidence_submitted" : "awaiting_payment",
      amountCents: order.invoice.amountCents,
      currency: order.invoice.currency,
      recordedAt: order.verification?.verifiedAt
        ?? order.paymentEvidence.at(-1)?.reportedAt ?? order.invoice.createdAt,
      referenceLabel: order.invoice.invoiceRef,
    })] : []),
    tracking: Object.freeze(order.tracking.map((fact) => Object.freeze({
      carrier: fact.carrier,
      trackingNumber: fact.trackingNumber,
      status: order.stage,
      updatedAt: fact.recordedAt,
    }))),
    canRequestAgain: true,
  });
}
