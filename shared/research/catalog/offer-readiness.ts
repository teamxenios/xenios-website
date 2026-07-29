// xenios research: the shared offer readiness state machine.
//
// One question, one authority: given the evidence we actually hold for a product,
// what is the STRONGEST TRUTHFUL thing a surface may say about buying it?
//
// The supplement catalog and the Quantum record both resolve through this module,
// so neither lane can quietly grant itself a stronger offer than its evidence
// supports. The design rules, in order of importance:
//
//   1. Fail closed. Every unknown weakens the mode, never strengthens it. There is
//      no default that upgrades a record.
//   2. Never render a price where there is none. `describeOfferMode` returns a
//      customer-facing sentence for every mode, so a surface never has to fall back
//      to "$0" or to a fabricated availability.
//   3. Direct checkout is the exception, not the baseline. `DIRECT_PRIVATE_PURCHASE`
//      requires an approved customer amount, non pending lab evidence, and an
//      explicit global commerce switch. Global commerce is flag off in production
//      today, so the private lanes pass that switch as false and the mode is
//      structurally unreachable for them.
//
// This module is deliberately dependency free so any lane can consume it.

// ---------------------------------------------------------------------------
// The closed unions
// ---------------------------------------------------------------------------

/**
 * How a product may be offered. Ordered from strongest to weakest, which is also
 * the order the resolver walks down as evidence runs out.
 */
export const OFFER_AVAILABILITY_MODES = [
  "DIRECT_PRIVATE_PURCHASE",
  "APPROVAL_REQUIRED_PURCHASE",
  "REQUEST_ACCESS_ONLY",
  "DISPLAY_ONLY",
  "UNAVAILABLE",
] as const;

export type OfferAvailabilityMode = (typeof OFFER_AVAILABILITY_MODES)[number];

/**
 * What the record is waiting on. Availability answers "what may a member do";
 * readiness answers "what is operations still chasing". They are separate on
 * purpose: a record can be offerable by approval while documentation is open.
 */
export const OFFER_READINESS_STATES = [
  "APPROVED_FOR_PRIVATE_OFFER",
  "NEEDS_FINAL_APPROVAL",
  "NEEDS_SUPPLIER_DOCUMENTATION",
  "NEEDS_PRICE_DECISION",
  "NOT_OFFERED",
] as const;

export type OfferReadinessState = (typeof OFFER_READINESS_STATES)[number];

/**
 * Lab documentation state for the exact item on offer.
 *
 * `NOT_APPLICABLE` is for finished consumer goods, where the gate is supplier
 * authorization and label documentation rather than a lot certificate of
 * analysis. It is never a way to skip the research material rule below.
 */
export const COA_EVIDENCE_STATES = [
  "ON_FILE",
  "PENDING_LAB_DOCUMENTATION",
  "NOT_ON_FILE",
  "NOT_APPLICABLE",
] as const;

export type CoaEvidenceState = (typeof COA_EVIDENCE_STATES)[number];

/** The lanes this state machine serves. */
export const OFFER_LANES = ["supplement", "research_material", "quantum"] as const;

export type OfferLane = (typeof OFFER_LANES)[number];

/** Lanes that resell another brand's finished goods, so identity is the supplier's code. */
const RESALE_LANES: ReadonlySet<OfferLane> = new Set<OfferLane>(["supplement"]);

// ---------------------------------------------------------------------------
// The evidence a record presents
// ---------------------------------------------------------------------------

/**
 * The only inputs the resolver reads. Anything absent is null or false, never a
 * placeholder string, so an empty value cannot be mistaken for evidence.
 */
export interface OfferEvidence {
  lane: OfferLane;
  /**
   * The exact customer amount a founder approved, in integer cents. Null when no
   * amount is approved. A zero or negative amount is treated as no amount.
   */
  approvedMemberAmountCents: number | null;
  /**
   * The supplier's own item code for a resale good. This is what identifies WHICH
   * item is being resold. Null when the source workbook left it blank.
   */
  supplierSkuCode: string | null;
  /**
   * The internal variant identifier for a first party lane, where there is no
   * supplier code to point at. Null for resale goods.
   */
  internalVariantSku: string | null;
  coaEvidence: CoaEvidenceState;
  /** An explicit operator decision that the item is off. Wins over everything. */
  unavailable: boolean;
  /**
   * The global commerce switch. Direct checkout is impossible while this is false,
   * whatever the rest of the evidence says. Production is false today.
   */
  directPurchaseEnabled: boolean;
}

/** A positive, safe, integer amount of cents. Anything else is treated as no price. */
export function isApprovedAmount(amountCents: number | null): amountCents is number {
  return (
    typeof amountCents === "number" &&
    Number.isSafeInteger(amountCents) &&
    amountCents > 0
  );
}

/** A named identity is a non blank supplier code, or a non blank internal variant sku. */
export function hasNamedIdentity(evidence: OfferEvidence): boolean {
  const supplier = evidence.supplierSkuCode?.trim() ?? "";
  const internal = evidence.internalVariantSku?.trim() ?? "";
  if (RESALE_LANES.has(evidence.lane)) {
    // A resale record without the supplier's code names a product, not an item.
    // An internally minted sku cannot stand in for it, because we assigned it.
    return supplier.length > 0;
  }
  return internal.length > 0 || supplier.length > 0;
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/**
 * Derive the strongest truthful offer mode from the evidence.
 *
 * The order below is load bearing. Each step can only weaken the outcome, so no
 * combination of inputs can climb back up to a stronger mode than the evidence
 * supports.
 */
export function resolveOfferMode(evidence: OfferEvidence): OfferAvailabilityMode {
  // 1. An explicit off switch beats every other consideration.
  if (evidence.unavailable) {
    return "UNAVAILABLE";
  }

  const priced = isApprovedAmount(evidence.approvedMemberAmountCents);
  const identified = hasNamedIdentity(evidence);

  // 2. No approved amount. The record may still be shown and asked about, but a
  //    surface must never derive a number for it.
  if (!priced) {
    return identified ? "REQUEST_ACCESS_ONLY" : "DISPLAY_ONLY";
  }

  // 3. Priced but not identified. We know what we would charge, not what we would
  //    hand over. That is an access request, never a purchase.
  if (!identified) {
    return "REQUEST_ACCESS_ONLY";
  }

  // 4. Direct checkout. Three independent conditions, all required.
  const labEvidenceBlocks =
    evidence.coaEvidence === "PENDING_LAB_DOCUMENTATION" ||
    evidence.coaEvidence === "NOT_ON_FILE";
  const researchMaterialNeedsCoa =
    evidence.lane === "research_material" && evidence.coaEvidence !== "ON_FILE";

  if (evidence.directPurchaseEnabled && !labEvidenceBlocks && !researchMaterialNeedsCoa) {
    return "DIRECT_PRIVATE_PURCHASE";
  }

  // 5. Approved amount plus a named item, through a human approval each time.
  return "APPROVAL_REQUIRED_PURCHASE";
}

/**
 * The private lane resolver. Pins the global commerce switch to false, so a lane
 * that calls this can never emit `DIRECT_PRIVATE_PURCHASE` by accident, even if a
 * future edit sets the flag on a record.
 *
 * The supplement catalog and the Quantum record both use this entry point.
 * Turning direct checkout on is a separate founder and release step, not a data
 * edit in a catalog file.
 */
export function resolvePrivateLaneOfferMode(
  evidence: Omit<OfferEvidence, "directPurchaseEnabled">,
): OfferAvailabilityMode {
  return resolveOfferMode({ ...evidence, directPurchaseEnabled: false });
}

// ---------------------------------------------------------------------------
// Customer facing description
// ---------------------------------------------------------------------------

/**
 * The exact words a surface may show for a mode.
 *
 * Every mode has a sentence, so there is no path where a card has nothing to say
 * and falls back to a price of zero or to an invented availability.
 */
const OFFER_MODE_LABELS: Record<OfferAvailabilityMode, string> = {
  DIRECT_PRIVATE_PURCHASE: "Available to purchase",
  APPROVAL_REQUIRED_PURCHASE: "Available by approval",
  REQUEST_ACCESS_ONLY: "Request access",
  DISPLAY_ONLY: "Not currently available",
  UNAVAILABLE: "Not currently available",
};

export function describeOfferMode(mode: OfferAvailabilityMode): string {
  return OFFER_MODE_LABELS[mode];
}

/** Whether a mode lets a member start a checkout without a human in the loop. */
export function isSelfServePurchase(mode: OfferAvailabilityMode): boolean {
  return mode === "DIRECT_PRIVATE_PURCHASE";
}

/** Whether a member may see an amount at all for this mode. */
export function mayDisplayAmount(mode: OfferAvailabilityMode): boolean {
  return mode === "DIRECT_PRIVATE_PURCHASE" || mode === "APPROVAL_REQUIRED_PURCHASE";
}

// ---------------------------------------------------------------------------
// Missing inputs
// ---------------------------------------------------------------------------

/**
 * A structured hole in the record.
 *
 * `value` is typed as `null` and nothing else, so it is a compile error to put a
 * guessed string here. The only way to fill one of these fields is to change its
 * type once an authoritative document exists.
 */
export interface UnresolvedField {
  readonly value: null;
  /** Exactly what an authoritative document must supply. Never a guess at the answer. */
  readonly missingInputs: readonly string[];
}

export function unresolved(...missingInputs: string[]): UnresolvedField {
  return { value: null, missingInputs };
}

/** Plain language reasons a record is not at its strongest mode. Useful to operations. */
export function explainOfferMode(evidence: OfferEvidence): string[] {
  const reasons: string[] = [];
  if (evidence.unavailable) {
    reasons.push("An operator marked this item unavailable.");
  }
  if (!isApprovedAmount(evidence.approvedMemberAmountCents)) {
    reasons.push("No founder approved customer amount is on file.");
  }
  if (!hasNamedIdentity(evidence)) {
    reasons.push(
      RESALE_LANES.has(evidence.lane)
        ? "No supplier item code is on file, so the exact item being resold is not identified."
        : "No internal variant identifier is on file, so the exact item is not identified.",
    );
  }
  if (!evidence.directPurchaseEnabled) {
    reasons.push("Direct checkout is switched off, so purchase runs through approval.");
  }
  if (evidence.coaEvidence === "PENDING_LAB_DOCUMENTATION") {
    reasons.push("Lab documentation is pending for this item.");
  }
  if (evidence.coaEvidence === "NOT_ON_FILE") {
    reasons.push("No lab documentation is on file for this item.");
  }
  if (evidence.lane === "research_material" && evidence.coaEvidence !== "ON_FILE") {
    reasons.push("A research material may not be offered directly without lab documentation on file.");
  }
  return reasons;
}
