/**
 * Private Early Access: the eligibility gate for one exact unit. Server only,
 * pure, side effect free, no clock, no environment, no I/O.
 *
 * WHAT PRODUCT CONTROL IS HERE
 *
 * The runtime authority is the Product Control record set, `AdminProductDetail`,
 * read in production by `LiveProductControlReader`
 * (server/research/catalog/product-control-reader.ts) over
 * `SupabaseProductAdminRepository` and consumed by the member catalog
 * (server/research/catalog/member-catalog-service.ts). This module takes exactly
 * that record as its product input, so Early Access and the member catalog
 * answer from one source rather than from two catalogs that can drift.
 *
 * A Product Control product record does not, on its own, carry every fact an
 * Early Access sale needs. Supplier assignment, fulfillment availability, the
 * per-unit quantity ceiling, the lot documentation state, the resolved offer
 * mode, and the state of an open identity or presentation dispute all live
 * outside `AdminProductDetail`. They arrive here as declared, per-variant facts
 * on `EarlyAccessProductRecord`. They are never inferred.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 *
 * Missing data is a blocker, never a pass. Every check below is written so that
 * a null fact, an unknown state, a blank source version, or a stale evaluation
 * instant produces a blocker. There is no branch where the absence of evidence
 * becomes evidence of eligibility, and there is no default that upgrades a
 * record. Blockers accumulate rather than short-circuit, so an operator sees the
 * complete blocking set for a unit instead of fixing one gate at a time.
 *
 * The blockers are machine codes from a closed union, so a caller can route,
 * count, and test on them. They are never sentences.
 */

import type {
  AdminProductDetail,
  AdminProductVariant,
  ProductMediaState,
} from "@shared/research/product-admin";
import type {
  CartAudienceEligibility,
  CartInventoryEligibility,
  CartPurchaseAudience,
} from "@shared/research/cart-product-selection";
import type { MemberCatalogLotCoaPresentation } from "@shared/research/member-catalog";
import type { FulfillmentOwner, ProductAvailability } from "@shared/research/catalog";
import type { OfferAvailabilityMode } from "@shared/research/catalog/offer-readiness";
import {
  isCustomerSafeAmountCents,
  normalizePriceCurrency,
} from "@shared/research/pricing";
import {
  decideProductControlPrice,
  parseProductControlTimestamp,
  type ProductControlPriceRefusalCode,
} from "../../products-diagnostics/product-control-price-resolver";
import {
  findVariantStrengthDispute,
  normalizeSkuKey,
} from "../../products-diagnostics/variant-strength-dispute";
import {
  EARLY_ACCESS_CURRENCIES,
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MAX_UNIT_PRICE_CENTS,
  EARLY_ACCESS_MIN_QUANTITY,
} from "../commerce/early-access-order";

// ---------------------------------------------------------------------------
// The closed blocker vocabulary
// ---------------------------------------------------------------------------

/**
 * Every reason an exact unit may not be sold through Early Access.
 *
 * The order is the order they are reported in, so a blocker list is stable and
 * comparable across runs.
 */
export const EARLY_ACCESS_BLOCKERS = [
  "IDENTITY_NOT_CONFIRMED",
  "STRENGTH_NOT_CONFIRMED",
  "PRESENTATION_NOT_CONFIRMED",
  "PRICE_NOT_APPROVED",
  "PRICE_CURRENCY_MISSING",
  "AUDIENCE_NOT_PERMITTED",
  "SUPPLIER_NOT_ASSIGNED",
  "FULFILLMENT_UNAVAILABLE",
  "QUANTITY_LIMIT_MISSING",
  "DOCUMENTATION_NOT_SATISFIED",
  "IDENTITY_DISPUTE_UNRESOLVED",
  "STRENGTH_DISPUTE_UNRESOLVED",
  // Recorded prohibitions, emitted FIRST-CLASS rather than folded into the
  // offer state. This is the QA R4 repair: a hold that only ever surfaced as
  // OFFER_STATE_NOT_PURCHASABLE could be waived by an older founder release
  // and might not even change the release fingerprint. Each of these is
  // NON-WAIVABLE in founder-release.ts, so a hold recorded after a release
  // makes the fingerprint stale AND refuses the release on its own name.
  "REGULATORY_HOLD",
  "RECALL",
  "STOP_SHIP",
  "SUPPLIER_QUALITY_HOLD",
  "OFFER_STATE_NOT_PURCHASABLE",
] as const;

export type EarlyAccessBlocker = (typeof EARLY_ACCESS_BLOCKERS)[number];

/** The recorded-prohibition subset. What a hold registry may assert. */
export type EarlyAccessHoldBlocker =
  | "REGULATORY_HOLD"
  | "RECALL"
  | "STOP_SHIP"
  | "SUPPLIER_QUALITY_HOLD";

/**
 * The state of a recorded dispute for one exact unit.
 *
 * `unknown` is the state of a unit nobody has reviewed. It blocks, exactly like
 * an open dispute blocks, because a silent record is not a cleared record.
 */
export const EARLY_ACCESS_DISPUTE_STATES = ["unknown", "open", "cleared"] as const;

export type EarlyAccessDisputeState = (typeof EARLY_ACCESS_DISPUTE_STATES)[number];

/**
 * The audiences Early Access serves.
 *
 * Early Access is a private, password-gated first release for approved members.
 * Retail, professional, and wholesale audiences are not served by this page, so
 * they fail closed here. Widening this set is a founder decision recorded in a
 * reviewed change, never a runtime default.
 */
export const EARLY_ACCESS_PERMITTED_AUDIENCES: readonly CartPurchaseAudience[] = [
  /**
   * The ONLY audience Early Access sells to. Founder decision (war room):
   * the password grants portal access, membership grants membership, and
   * neither is Early Access approval. An approved, session-bound Early
   * Access customer is the one authorization that projects eligible rows,
   * so an unrelated signed-in member is refused exactly as a password-only
   * session is.
   */
  "private_early_access",
] as const;

/**
 * The offer modes that permit an Early Access purchase.
 *
 * Early Access is a manual-payment flow with a human verifying every payment
 * (server/research/early-access/commerce/payment-verification.ts), so an
 * approval-required offer is enough. `REQUEST_ACCESS_ONLY`, `DISPLAY_ONLY`, and
 * `UNAVAILABLE` are not purchase modes and never become one here.
 */
export const EARLY_ACCESS_PURCHASE_OFFER_MODES: readonly OfferAvailabilityMode[] = [
  "DIRECT_PRIVATE_PURCHASE",
  "APPROVAL_REQUIRED_PURCHASE",
] as const;

/**
 * Product Control availability states that can transact at all. Mirrors the
 * catalog contract's own purchasable set (shared/research/catalog.ts). Being in
 * this set is necessary, never sufficient.
 */
const EARLY_ACCESS_TRANSACTING_AVAILABILITY: ReadonlySet<ProductAvailability> =
  new Set<ProductAvailability>(["in_stock", "low_stock"]);

/** Lot documentation states that satisfy the Early Access documentation gate. */
const SATISFIED_DOCUMENTATION_STATES: ReadonlySet<
  MemberCatalogLotCoaPresentation["state"]
> = new Set<MemberCatalogLotCoaPresentation["state"]>([
  "verified",
  "not_applicable",
]);

// ---------------------------------------------------------------------------
// The declared facts that do not live on a Product Control product record
// ---------------------------------------------------------------------------

/** Who ships this exact unit. `not_assigned` is the unassigned state, and blocks. */
export interface EarlyAccessSupplierAssignment {
  readonly variantId: string;
  readonly fulfillmentOwner: FulfillmentOwner;
  /** Provenance of the assignment. A blank version is an unrecorded assignment. */
  readonly sourceVersion: string;
}

/** The per-order ceiling for one exact unit, in whole units. */
export interface EarlyAccessQuantityLimit {
  readonly variantId: string;
  readonly maxUnitsPerOrder: number;
}

/**
 * An image asset bound to one EXACT variant.
 *
 * Product Control media (`AdminProductMedia`) is product-scoped and carries no
 * variant binding, so a product-level asset can never satisfy the exact-variant
 * rule. Until a variant-bound asset exists, every row's image state is `pending`
 * or `none`, which is the truthful answer and the reason the client renders an
 * intentional placeholder rather than a wrong picture.
 */
export interface EarlyAccessVariantImage {
  readonly variantId: string;
  readonly mediaId: string;
  readonly state: ProductMediaState;
  readonly approvedBy: string | null;
  readonly altText: string;
}

/** Every declared fact for one exact variant. A missing fact is null, never a default. */
export interface EarlyAccessVariantFacts {
  readonly variantId: string;
  readonly supplier: EarlyAccessSupplierAssignment | null;
  readonly fulfillment: CartInventoryEligibility | null;
  readonly documentation: MemberCatalogLotCoaPresentation | null;
  readonly quantityLimit: EarlyAccessQuantityLimit | null;
  readonly offerState: OfferAvailabilityMode | null;
  readonly identityDispute: EarlyAccessDisputeState;
  readonly strengthDispute: EarlyAccessDisputeState;
  readonly image: EarlyAccessVariantImage | null;
  /**
   * Recorded prohibitions currently ACTIVE for this exact unit, loaded at
   * projection time. Optional because a hold is a positive record: absence of
   * the field means no registry was consulted beyond the canonical record,
   * and absence of a hold means nothing prohibits. Every value here lands in
   * the blockers verbatim and every one is non-waivable.
   */
  readonly activeHolds?: readonly EarlyAccessHoldBlocker[];
}

/**
 * One Product Control product plus the declared facts for its variants.
 *
 * `audience` is the server-authorized audience fact, the same shape the member
 * catalog resolves from the member row. A browser-requested audience is never
 * authorization, so a null here fails closed.
 */
export interface EarlyAccessProductRecord {
  readonly product: AdminProductDetail;
  readonly audience: CartAudienceEligibility | null;
  readonly currency: string;
  readonly variantFacts: readonly EarlyAccessVariantFacts[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type EarlyAccessEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly blockers: readonly EarlyAccessBlocker[] };

/** The one approved Early Access amount for a unit, or the refusal that stopped it. */
export type EarlyAccessPriceOutcome =
  | { readonly ok: true; readonly amountCents: number; readonly currency: string }
  | {
      readonly ok: false;
      readonly code: ProductControlPriceRefusalCode | "audience_missing";
    };

// ---------------------------------------------------------------------------
// Small predicates
// ---------------------------------------------------------------------------

function nonBlank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The canonical evaluation instant, or null when the caller handed over an
 * unusable clock reading. Null blocks every check that needs an instant.
 */
export function earlyAccessEvaluatedAt(now: Date): string | null {
  return now instanceof Date && Number.isFinite(now.getTime())
    ? now.toISOString()
    : null;
}

/** The declared facts for one exact variant, or null when none were supplied. */
export function earlyAccessVariantFacts(
  record: EarlyAccessProductRecord,
  variantId: string,
): EarlyAccessVariantFacts | null {
  const matches = record.variantFacts.filter(
    (facts) => facts.variantId === variantId,
  );
  // More than one declaration for the same unit is ambiguous, and an ambiguous
  // fact is not a fact. It resolves to none, which blocks.
  return matches.length === 1 ? matches[0] : null;
}

function sameInstant(left: string, right: string): boolean {
  const parsedLeft = parseProductControlTimestamp(left);
  const parsedRight = parseProductControlTimestamp(right);
  return parsedLeft !== null && parsedLeft === parsedRight;
}

// ---------------------------------------------------------------------------
// The twelve conditions
// ---------------------------------------------------------------------------

/**
 * The unit is exactly one named, approved, active unit of exactly one named
 * product. Ambiguity inside the record is not resolved here; it blocks.
 */
function identityConfirmed(
  record: EarlyAccessProductRecord,
  variant: AdminProductVariant,
): boolean {
  const product = record.product;
  const named = [
    product.id,
    product.productCode,
    product.slug,
    product.displayName,
    product.canonicalName,
  ].every(nonBlank);
  if (!named) return false;
  if (!nonBlank(variant.id) || !nonBlank(variant.sku)) return false;
  if (variant.productId !== product.id) return false;
  if (variant.status !== "approved" || !variant.active) return false;
  const sameId = product.variants.filter((item) => item.id === variant.id);
  const skuKey = normalizeSkuKey(variant.sku);
  const sameSku = product.variants.filter(
    (item) => normalizeSkuKey(item.sku) === skuKey,
  );
  return sameId.length === 1 && sameSku.length === 1;
}

/**
 * The one approved, active, in-window Product Control price row for this unit.
 *
 * The amount comes from Product Control and from nowhere else: this function
 * takes no amount from a caller, and a resolved amount is re-checked against the
 * customer-safe rule and the Early Access unit ceiling before it is returned, so
 * a zero, a negative, or an out-of-range amount can never leave here.
 */
export function resolveEarlyAccessPrice(
  record: EarlyAccessProductRecord,
  variant: AdminProductVariant,
  now: Date,
): EarlyAccessPriceOutcome {
  const evaluatedAt = earlyAccessEvaluatedAt(now);
  if (evaluatedAt === null) return { ok: false, code: "invalid_context" };
  // The currency is checked before the audience, so a record with no settlement
  // currency reports that fact rather than having it masked by another gap.
  const currency = normalizePriceCurrency(record.currency);
  if (
    currency === null ||
    !(EARLY_ACCESS_CURRENCIES as readonly string[]).includes(currency)
  ) {
    return { ok: false, code: "price_currency_mismatch" };
  }
  const audience = record.audience;
  if (audience === null) return { ok: false, code: "audience_missing" };
  const decision = decideProductControlPrice({
    productId: record.product.id,
    variant,
    prices: record.product.prices,
    audienceEligibility: audience,
    currency,
    evaluatedAt,
  });
  if (!decision.ok) return { ok: false, code: decision.code };
  const amountCents = decision.price.amountCents;
  // Both gates again, deliberately. The resolver already refuses a non-positive
  // or unsafe amount; repeating it here means no future reordering upstream can
  // put a zero or an out-of-range amount on an Early Access surface.
  if (
    !isCustomerSafeAmountCents(amountCents) ||
    amountCents > EARLY_ACCESS_MAX_UNIT_PRICE_CENTS
  ) {
    return { ok: false, code: "price_missing" };
  }
  return { ok: true, amountCents, currency: decision.price.currency };
}

function audiencePermitted(
  record: EarlyAccessProductRecord,
  variant: AdminProductVariant,
  evaluatedAt: string,
): boolean {
  const audience = record.audience;
  if (audience === null) return false;
  return (
    EARLY_ACCESS_PERMITTED_AUDIENCES.includes(audience.audience) &&
    audience.state === "authorized" &&
    nonBlank(audience.sourceVersion) &&
    sameInstant(audience.evaluatedAt, evaluatedAt) &&
    (audience.audience !== "member" || variant.memberEligible)
  );
}

function supplierAssigned(
  facts: EarlyAccessVariantFacts | null,
  variant: AdminProductVariant,
): boolean {
  const supplier = facts?.supplier ?? null;
  return (
    supplier !== null &&
    supplier.variantId === variant.id &&
    supplier.fulfillmentOwner !== "not_assigned" &&
    nonBlank(supplier.sourceVersion)
  );
}

/**
 * Fulfillment availability for the exact unit, derived exactly as the member
 * catalog derives a variant's availability: the eligibility fact must name this
 * unit, be eligible with no stated reason, carry provenance, and have been
 * evaluated at this same instant.
 */
export function fulfillmentAvailable(
  record: EarlyAccessProductRecord,
  facts: EarlyAccessVariantFacts | null,
  variant: AdminProductVariant,
  evaluatedAt: string,
): boolean {
  const fulfillment = facts?.fulfillment ?? null;
  return (
    fulfillment !== null &&
    fulfillment.productId === record.product.id &&
    fulfillment.variantId === variant.id &&
    fulfillment.state === "eligible" &&
    fulfillment.reason === null &&
    nonBlank(fulfillment.sourceVersion) &&
    sameInstant(fulfillment.evaluatedAt, evaluatedAt)
  );
}

function quantityLimitPresent(
  facts: EarlyAccessVariantFacts | null,
  variant: AdminProductVariant,
): boolean {
  const limit = facts?.quantityLimit ?? null;
  return (
    limit !== null &&
    limit.variantId === variant.id &&
    Number.isSafeInteger(limit.maxUnitsPerOrder) &&
    limit.maxUnitsPerOrder >= EARLY_ACCESS_MIN_QUANTITY &&
    limit.maxUnitsPerOrder <= EARLY_ACCESS_MAX_QUANTITY
  );
}

function documentationSatisfied(
  record: EarlyAccessProductRecord,
  facts: EarlyAccessVariantFacts | null,
  variant: AdminProductVariant,
  evaluatedAt: string,
): boolean {
  const documentation = facts?.documentation ?? null;
  return (
    record.product.qualityDocumentState === "approved" &&
    documentation !== null &&
    documentation.productId === record.product.id &&
    documentation.variantId === variant.id &&
    SATISFIED_DOCUMENTATION_STATES.has(documentation.state) &&
    nonBlank(documentation.sourceVersion) &&
    sameInstant(documentation.evaluatedAt, evaluatedAt)
  );
}

/**
 * The presentation dispute state for one exact unit.
 *
 * A dispute the repository already records against this SKU
 * (server/research/products-diagnostics/variant-strength-dispute.ts) wins over
 * any declaration, so a record cannot declare away a contested presentation.
 */
export function earlyAccessStrengthDisputeState(
  facts: EarlyAccessVariantFacts | null,
  variant: AdminProductVariant,
): EarlyAccessDisputeState {
  if (findVariantStrengthDispute(variant) !== null) return "open";
  return facts?.strengthDispute ?? "unknown";
}

/** The identity dispute state for one exact unit. Undeclared reads as unknown. */
export function earlyAccessIdentityDisputeState(
  facts: EarlyAccessVariantFacts | null,
): EarlyAccessDisputeState {
  return facts?.identityDispute ?? "unknown";
}

function offerStatePermitsPurchase(
  record: EarlyAccessProductRecord,
  facts: EarlyAccessVariantFacts | null,
): boolean {
  const product = record.product;
  const offerState = facts?.offerState ?? null;
  return (
    offerState !== null &&
    EARLY_ACCESS_PURCHASE_OFFER_MODES.includes(offerState) &&
    product.status === "published" &&
    product.active &&
    product.visibility !== "hidden" &&
    product.commerceApproval === "approved" &&
    EARLY_ACCESS_TRANSACTING_AVAILABILITY.has(product.availability)
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Whether one exact unit may be sold through Private Early Access at `now`.
 *
 * Every condition must hold. A refusal carries the complete set of machine
 * codes that blocked it, in `EARLY_ACCESS_BLOCKERS` order.
 */
export function assessEarlyAccessEligibility(
  product: EarlyAccessProductRecord,
  variant: AdminProductVariant,
  now: Date,
): EarlyAccessEligibility {
  const blockers: EarlyAccessBlocker[] = [];
  const evaluatedAt = earlyAccessEvaluatedAt(now);
  const facts = earlyAccessVariantFacts(product, variant.id);

  if (!identityConfirmed(product, variant)) {
    blockers.push("IDENTITY_NOT_CONFIRMED");
  }
  if (!nonBlank(variant.strength)) {
    blockers.push("STRENGTH_NOT_CONFIRMED");
  }
  if (!nonBlank(variant.presentation)) {
    blockers.push("PRESENTATION_NOT_CONFIRMED");
  }

  const price = resolveEarlyAccessPrice(product, variant, now);
  if (!price.ok) {
    if (price.code === "price_currency_mismatch") {
      blockers.push("PRICE_NOT_APPROVED", "PRICE_CURRENCY_MISSING");
    } else {
      blockers.push("PRICE_NOT_APPROVED");
    }
  }
  if (
    price.ok &&
    !(EARLY_ACCESS_CURRENCIES as readonly string[]).includes(price.currency)
  ) {
    blockers.push("PRICE_CURRENCY_MISSING");
  }

  if (evaluatedAt === null || !audiencePermitted(product, variant, evaluatedAt)) {
    blockers.push("AUDIENCE_NOT_PERMITTED");
  }
  if (!supplierAssigned(facts, variant)) {
    blockers.push("SUPPLIER_NOT_ASSIGNED");
  }
  if (
    evaluatedAt === null ||
    !fulfillmentAvailable(product, facts, variant, evaluatedAt)
  ) {
    blockers.push("FULFILLMENT_UNAVAILABLE");
  }
  if (!quantityLimitPresent(facts, variant)) {
    blockers.push("QUANTITY_LIMIT_MISSING");
  }
  if (
    evaluatedAt === null ||
    !documentationSatisfied(product, facts, variant, evaluatedAt)
  ) {
    blockers.push("DOCUMENTATION_NOT_SATISFIED");
  }
  if (earlyAccessIdentityDisputeState(facts) !== "cleared") {
    blockers.push("IDENTITY_DISPUTE_UNRESOLVED");
  }
  if (earlyAccessStrengthDisputeState(facts, variant) !== "cleared") {
    blockers.push("STRENGTH_DISPUTE_UNRESOLVED");
  }
  // Recorded prohibitions, verbatim and first-class. Loaded at projection
  // time, so a hold recorded five minutes ago is in THIS answer, makes the
  // release fingerprint stale, and refuses any release under its own name.
  for (const hold of facts?.activeHolds ?? []) {
    blockers.push(hold);
  }
  if (!offerStatePermitsPurchase(product, facts)) {
    blockers.push("OFFER_STATE_NOT_PURCHASABLE");
  }

  if (blockers.length > 0) {
    // Reported in the canonical order, deduplicated, so the set is stable.
    const ordered = EARLY_ACCESS_BLOCKERS.filter((code) =>
      blockers.includes(code),
    );
    return { eligible: false, blockers: ordered };
  }
  return { eligible: true };
}
