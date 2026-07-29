// xenios research: the Quantum product record, QNT-001.
//
// SERVER SIDE ONLY, for the same reason as the supplement catalog: this record
// carries approval notes and source references. Surfaces read
// `toMemberQuantumCard`, which is built by explicit pick.
//
// ---------------------------------------------------------------------------
// What is actually decided
// ---------------------------------------------------------------------------
//
// Exactly one thing: the customer amount. The founder approved QNT-001 at $1,800.00
// per vial for the member audience, in USD. Everything else about this product is
// still open, and this file is built so that the openness is structural rather than
// a comment someone can miss.
//
// The approved amount does not authorize a placeholder product, an invented sku, an
// invented strength, volume, concentration, or package description, publication,
// eligibility, a clinical claim, a retail or professional or wholesale price, a
// production row mutation, payment activation, or care activation.
//
// ---------------------------------------------------------------------------
// Why the identity fields cannot be filled in
// ---------------------------------------------------------------------------
//
// Strength, concentration, volume, package quantity, unit of measure, supplier,
// source tissue bank, lot, and expiry are each typed as `UnresolvedField`, whose
// `value` is the literal type `null`. It is a compile error to put a string there.
// The only way to record one of those facts is to change the field's type once an
// authoritative document exists, which is a reviewable diff rather than a quiet
// data edit.
//
// This is the founder's own directive expressed in the type system: never fabricate
// source tissue identity, purity, or lab results. Each field names exactly what
// document would settle it, so the openness is a work list rather than a shrug.
//
// ---------------------------------------------------------------------------
// Why it is offered by approval and not directly
// ---------------------------------------------------------------------------
//
// Lab documentation is pending, and global commerce is flag off. The record resolves
// through `resolvePrivateLaneOfferMode`, which pins the global switch off, so
// `DIRECT_PRIVATE_PURCHASE` is unreachable here. What remains is a concierge path: a
// member may ask, a named human decides, and the Quantum Commerce Activation
// Checklist (XR-QTM-008 in docs/research-legal/08-quantum-placeholders/) remains the
// hard gate before any transaction. Readiness stays NEEDS_FINAL_APPROVAL for exactly
// that reason.

import {
  resolvePrivateLaneOfferMode,
  unresolved,
  type CoaEvidenceState,
  type OfferAvailabilityMode,
  type OfferReadinessState,
  type UnresolvedField,
} from "./offer-readiness";

// ---------------------------------------------------------------------------
// Internal sku convention
// ---------------------------------------------------------------------------

/**
 * The internal item code convention, shared across lanes: one lane letter plus a
 * three digit row number, and a two digit variant suffix.
 *
 *   P001 to P015   research materials (the existing peptide lane)
 *   N001 to N020   supplements
 *   Q001           Quantum
 *
 * A variant is the product sku plus a two digit index, so the single Quantum vial
 * is Q001-01. This is our own identifier and it names nothing about the contents.
 */
export const QUANTUM_PRODUCT_SKU = "Q001";

export function internalVariantSku(productSku: string, index: number): string {
  return `${productSku}-${String(index).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface QuantumVariant {
  /** The founder's own words for the presentation. */
  label: "1 vial";
  format: "vial";
  /** Our internal identifier, minted on the shared convention. */
  sku: string;
  memberEligible: true;
}

/**
 * The structured identity of the item. Every field is unresolved by construction.
 *
 * These are the facts a member, a processor, a carrier, and counsel would each need,
 * and not one of them is currently supported by a document we hold.
 */
export interface QuantumIdentity {
  strength: UnresolvedField;
  concentration: UnresolvedField;
  volume: UnresolvedField;
  packageQuantity: UnresolvedField;
  unitOfMeasure: UnresolvedField;
  supplier: UnresolvedField;
  sourceTissueBank: UnresolvedField;
  lot: UnresolvedField;
  expiry: UnresolvedField;
}

export interface QuantumProduct {
  decisionId: "QNT-001";
  canonicalName: "Quantum Foundational Reset";
  displayName: string;
  slug: string;
  lane: "quantum";
  category: "quantum";
  sku: string;
  variants: readonly [QuantumVariant];
  approvedMemberAmountCents: 180000;
  currency: "USD";
  audience: "member";
  availability: OfferAvailabilityMode;
  readiness: OfferReadinessState;
  coaStatus: CoaEvidenceState;
  identity: QuantumIdentity;
  sourceReference: string;
  effectiveDate: null;
  approvalNote: string;
  /** The document classes that would unblock this record, named once at the top level. */
  blockingDocuments: readonly string[];
}

const IDENTITY: QuantumIdentity = {
  strength: unresolved(
    "Manufacturer specification sheet stating the labeled strength for the vial",
  ),
  concentration: unresolved(
    "Manufacturer specification sheet stating concentration and its unit",
    "Certificate of analysis for the released lot",
  ),
  volume: unresolved("Manufacturer specification sheet stating fill volume per vial"),
  packageQuantity: unresolved(
    "Manufacturer or supplier packing specification stating vials per package",
  ),
  unitOfMeasure: unresolved(
    "Manufacturer specification sheet stating the unit of measure the strength is expressed in",
  ),
  supplier: unresolved(
    "Executed supplier agreement naming the legal entity",
    "Supplier establishment registration and product listing evidence",
  ),
  sourceTissueBank: unresolved(
    "Source documentation naming the tissue bank or origin establishment",
    "Donor eligibility and screening documentation, if the classification requires it",
    "Counsel classification memo per XR-QTM-003, which determines whether this field applies at all",
  ),
  lot: unresolved(
    "Lot release record for the exact units on offer",
  ),
  expiry: unresolved(
    "Stability data supporting a dated expiry for the exact presentation",
    "Lot release record carrying the assigned expiry date",
  ),
};

const COA_STATUS: CoaEvidenceState = "PENDING_LAB_DOCUMENTATION";

const VARIANT: QuantumVariant = {
  label: "1 vial",
  format: "vial",
  sku: internalVariantSku(QUANTUM_PRODUCT_SKU, 1),
  memberEligible: true,
};

export const QUANTUM_PRODUCT: QuantumProduct = {
  decisionId: "QNT-001",
  canonicalName: "Quantum Foundational Reset",
  displayName: "Quantum Foundational Reset",
  slug: "quantum-foundational-reset",
  lane: "quantum",
  category: "quantum",
  sku: QUANTUM_PRODUCT_SKU,
  variants: [VARIANT],
  approvedMemberAmountCents: 180000,
  currency: "USD",
  audience: "member",
  availability: resolvePrivateLaneOfferMode({
    lane: "quantum",
    approvedMemberAmountCents: 180000,
    supplierSkuCode: null,
    internalVariantSku: VARIANT.sku,
    coaEvidence: COA_STATUS,
    unavailable: false,
  }),
  readiness: "NEEDS_FINAL_APPROVAL",
  coaStatus: COA_STATUS,
  identity: IDENTITY,
  sourceReference:
    "XENIOS_RESEARCH_FOUNDER_PRICING_DECISION_MATRIX row QNT-001 (approved), with the lane gate defined by docs/research-legal/08-quantum-placeholders/QUANTUM_COMMERCE_ACTIVATION_CHECKLIST.md (XR-QTM-008).",
  effectiveDate: null,
  approvalNote:
    "Founder-approved 2026-07-29: all 35 matrix rows incl. NUT-019 and NUT-020. QNT-001 was approved earlier and covers the customer amount only.",
  blockingDocuments: [
    "Counsel classification memo (XR-QTM-003)",
    "Manufacturer specification sheet for the exact presentation",
    "Certificate of analysis and lot release record",
    "Stability data supporting an assigned expiry",
    "Executed supplier agreement and establishment evidence",
    "Approved claims set matched to the classification lane",
    "Payment processor written approval of the category",
  ],
};

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/** Every identity field that is still open, with what would settle it. */
export function quantumMissingInputs(): ReadonlyArray<{
  field: keyof QuantumIdentity;
  missingInputs: readonly string[];
}> {
  return (Object.keys(IDENTITY) as Array<keyof QuantumIdentity>).map((field) => ({
    field,
    missingInputs: IDENTITY[field].missingInputs,
  }));
}

/** True while any identity field is open. There is no partial activation. */
export function quantumIdentityResolved(): boolean {
  return (Object.keys(IDENTITY) as Array<keyof QuantumIdentity>).every(
    (field) => IDENTITY[field].value !== null,
  );
}

export interface MemberQuantumCard {
  slug: string;
  displayName: string;
  category: "quantum";
  variantLabel: string;
  availability: OfferAvailabilityMode;
  amountCents: number | null;
  currency: "USD";
}

/**
 * The member safe view. Explicit pick, so the identity holes, the blocking document
 * list, and the approval note never reach a browser. The amount is shown because
 * the mode permits an amount; if the mode ever weakens, the amount goes with it.
 */
export function toMemberQuantumCard(product: QuantumProduct = QUANTUM_PRODUCT): MemberQuantumCard {
  const showAmount =
    product.availability === "APPROVAL_REQUIRED_PURCHASE" ||
    product.availability === "DIRECT_PRIVATE_PURCHASE";
  return {
    slug: product.slug,
    displayName: product.displayName,
    category: product.category,
    variantLabel: product.variants[0].label,
    availability: product.availability,
    amountCents: showAmount ? product.approvedMemberAmountCents : null,
    currency: product.currency,
  };
}
