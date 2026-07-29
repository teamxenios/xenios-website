/**
 * xenios research: the compliance gates that stand between a founder-approved
 * draft peptide price and a live member price.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS COMES FROM
 * ---------------------------------------------------------------------------
 *
 * Every row in this file is transcribed from the "Compliance Gates" sheet of
 * XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx
 * (sha256 f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519).
 * The sheet's own header states the rule this module enforces in code: premium
 * pricing is defensible only when the evidence stack is real, and each of these
 * gates is "Required before price activation".
 *
 * So the block is the founder's own rule, transcribed. It is not a restriction
 * this lane invented, and no field in this file is an opinion about whether a
 * price is a good one.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A SEPARATE MODULE
 * ---------------------------------------------------------------------------
 *
 * peptide-pricing-model.ts holds the prices. This file holds the reasons none of
 * them may be charged. Keeping them apart means the price data can be read,
 * reported on, and reviewed without any surface being able to import a price
 * without also importing the gate that blocks it: `resolvePriceStatus` and
 * `memberPriceCentsForDisplay` both require a verdict from `canActivatePricing`
 * as an argument, so the gate cannot be forgotten by omission.
 *
 * This module is deliberately dependency free.
 *
 * ---------------------------------------------------------------------------
 * THE ONE STATE THAT OPENS A GATE
 * ---------------------------------------------------------------------------
 *
 * The sheet records six distinct unhappy states (FAIL, UNKNOWN, PARTIAL,
 * UNVERIFIED, BLOCKED, DRAFT). It records no happy state, because today no gate
 * has one. `CLEARED` is therefore the only state in the vocabulary that is not
 * in the sheet: it exists so a future, evidenced clearing can be recorded, and
 * `gateIsClear` treats every other state, known or later added, as blocking.
 * The gate fails closed on anything it does not recognise as cleared.
 */

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/**
 * How much a gate matters. CRITICAL gates are the ones the sheet ties to
 * product identity, lab evidence, payment permission, claims, release, and the
 * regulatory hold. HIGH gates are real blockers too (see `canActivatePricing`,
 * which fails closed on both), but they are the commercial and operational
 * layer rather than the legal and evidentiary floor.
 */
export type PricingGateSeverity = "CRITICAL" | "HIGH";

export const PRICING_GATE_SEVERITIES: readonly PricingGateSeverity[] = [
  "CRITICAL",
  "HIGH",
] as const;

/**
 * A gate's current state.
 *
 * The first six members are the exact states the sheet records. `CLEARED` is
 * the only member that opens a gate and the only member no row currently holds.
 */
export type PricingGateState =
  | "FAIL"
  | "UNKNOWN"
  | "PARTIAL"
  | "UNVERIFIED"
  | "BLOCKED"
  | "DRAFT"
  | "CLEARED";

export const PRICING_GATE_STATES: readonly PricingGateState[] = [
  "FAIL",
  "UNKNOWN",
  "PARTIAL",
  "UNVERIFIED",
  "BLOCKED",
  "DRAFT",
  "CLEARED",
] as const;

/** The only state that lets a gate stop blocking. */
export const CLEARED_GATE_STATE: PricingGateState = "CLEARED";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface PricingGate {
  /** Stable slug derived from the sheet's gate name. Used to reference a gate in code and reports. */
  id: string;
  /** The gate name exactly as the sheet states it. */
  gate: string;
  currentState: PricingGateState;
  /** What was actually measured, in the sheet's words. Never a summary or a guess. */
  measuredEvidence: string;
  /** What the sheet says must exist before a price may be activated. */
  requiredBeforeActivation: string;
  /** The named humans accountable. Never "the system". */
  owner: string;
  severity: PricingGateSeverity;
  /** The document or conversation the state is drawn from. */
  source: string;
}

/**
 * All twelve gates from the sheet, in sheet order.
 *
 * The task brief for this import named five of them (the first five below: the
 * per-SKU price-evidence core, exported as PRICE_EVIDENCE_GATE_IDS). The other
 * seven are transcribed as well rather than dropped, because dropping a
 * recorded blocker would make this file understate what stands in the way. The
 * five remain callable as a subset for reporting.
 */
export const PEPTIDE_PRICING_GATES: readonly PricingGate[] = [
  {
    id: "exact_product_identity_presentation",
    gate: "Exact product identity / presentation",
    currentState: "FAIL",
    measuredEvidence: "11 material strength or pack conflicts across 15 current SKUs",
    requiredBeforeActivation: "Signed per-SKU presentation confirmation; update catalog and labels",
    owner: "Mitch + Xenios",
    severity: "CRITICAL",
    source: "XENIOS_MITCH_CODE_EXTRACTION_AUDIT.md",
  },
  {
    id: "lot_matched_coa_files",
    gate: "Lot-matched COA files",
    currentState: "FAIL",
    measuredEvidence: "0 of 65 referenced attachments received or verified",
    requiredBeforeActivation:
      "Actual file arrival, hash, independent verification, exact lot binding",
    owner: "Mitch + QA",
    severity: "CRITICAL",
    source: "XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json",
  },
  {
    id: "purity_mass_sterility_endotoxin",
    gate: "Purity, mass, sterility, endotoxin",
    currentState: "UNKNOWN",
    measuredEvidence: "Not present in current implementation",
    requiredBeforeActivation: "Define required panels by format and verify exact results",
    owner: "QA + counsel",
    severity: "CRITICAL",
    source: "XENIOS_MITCH_CODE_EXTRACTION_AUDIT.md",
  },
  {
    id: "lot_and_expiry",
    gate: "Lot and expiry",
    currentState: "FAIL",
    measuredEvidence: "No lot or expiry record on file",
    requiredBeforeActivation: "Lot release record and stability-supported expiry",
    owner: "Mitch + QA",
    severity: "CRITICAL",
    source: "XENIOS_MITCH_CODE_EXTRACTION_AUDIT.md",
  },
  {
    id: "new_supplier_unit_cost",
    gate: "New supplier unit cost",
    currentState: "FAIL",
    measuredEvidence: "User reports cheaper sourcing, but no exact per-SKU quote supplied",
    requiredBeforeActivation:
      "Signed cost sheet with SKU, presentation, MOQ, lead time, shipping and terms",
    owner: "Mitch + Samuel",
    severity: "HIGH",
    source: "Founder conversation; not yet documented",
  },
  {
    id: "payment_processor_approval",
    gate: "Payment processor approval",
    currentState: "FAIL",
    measuredEvidence: "No written category approval in source package",
    requiredBeforeActivation: "Written approval for exact product category and descriptor",
    owner: "Samuel + processor",
    severity: "CRITICAL",
    source: "Product gate report",
  },
  {
    id: "claims_and_intended_use_review",
    gate: "Claims and intended-use review",
    currentState: "FAIL",
    measuredEvidence:
      "Health-adjacent product names and descriptions create net-impression risk",
    requiredBeforeActivation: "Counsel-approved claims set and page-level review",
    owner: "Counsel + marketing",
    severity: "CRITICAL",
    source: "FTC/FDA official guidance",
  },
  {
    id: "commerce_capability_and_founder_release",
    gate: "Commerce capability and founder release",
    currentState: "FAIL",
    measuredEvidence: "Purchase eligible: 0 of 15; commerce flags false",
    requiredBeforeActivation: "Exact-SHA release, founder approval, operational smoke",
    owner: "Samuel + release manager",
    severity: "CRITICAL",
    source: "XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json",
  },
  {
    id: "cold_chain_shipping_validation",
    gate: "Cold-chain / shipping validation",
    currentState: "PARTIAL",
    measuredEvidence: "Shipping profiles referenced, but source attachments not verified",
    requiredBeforeActivation:
      "Validated shipper evidence, temperature logger policy, exception SOP",
    owner: "Mitch + operations",
    severity: "HIGH",
    source: "Signed supplier master references",
  },
  {
    id: "inventory_availability",
    gate: "Inventory availability",
    currentState: "UNVERIFIED",
    measuredEvidence: "Supplier-stated inventory exists, no live feed",
    requiredBeforeActivation: "Count reconciliation, reservation process, expiry/lot allocation",
    owner: "Mitch + operations",
    severity: "HIGH",
    source: "XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json",
  },
  {
    id: "regulatory_hold_compounds",
    gate: "Regulatory-hold compounds",
    currentState: "BLOCKED",
    measuredEvidence: "16 variants across semaglutide, tirzepatide, retatrutide",
    requiredBeforeActivation:
      "Keep unavailable unless a separate lawful clinical or counsel-approved lane exists",
    owner: "Counsel + Samuel",
    severity: "CRITICAL",
    source: "Catalog regulatory_hold tier",
  },
  {
    id: "price_approval",
    gate: "Price approval",
    currentState: "DRAFT",
    measuredEvidence: "Current code contains conflicting 1.8x and 2.5x/floor rules",
    requiredBeforeActivation:
      "Adopt the market-led formula and record per-SKU effective approval",
    owner: "Samuel",
    severity: "HIGH",
    source: "Current catalog pricing rules",
  },
] as const;

/** How many gates the sheet records. Pinned so a silent deletion fails a test. */
export const PEPTIDE_PRICING_GATE_COUNT = 12;

/**
 * The five gates that are specifically about the evidence behind a per-SKU
 * price: what the product actually is, what the lab says about it, which lot it
 * came from, and what it costs. These are the five the pricing import brief
 * names, and the five a per-SKU price approval turns on.
 */
export const PRICE_EVIDENCE_GATE_IDS: readonly string[] = [
  "exact_product_identity_presentation",
  "lot_matched_coa_files",
  "purity_mass_sterility_endotoxin",
  "lot_and_expiry",
  "new_supplier_unit_cost",
] as const;

/** The sheet's own statement of what these gates are for. */
export const PRICING_GATE_DOCTRINE =
  "Premium pricing is defensible only when the evidence stack is real. Every gate below is required before price activation.";

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/** True only for the one state that opens a gate. Everything else blocks. */
export function gateIsClear(gate: PricingGate): boolean {
  return gate.currentState === CLEARED_GATE_STATE;
}

export interface PricingActivationVerdict {
  /** True only when every gate is cleared. There is no partial permission. */
  allowed: boolean;
  /** Every gate still blocking, in sheet order. */
  blockingGates: readonly PricingGate[];
  blockingGateIds: readonly string[];
  /** The blocking gates the sheet marks CRITICAL. */
  blockingCriticalGateIds: readonly string[];
  /** The blocking gates the sheet marks HIGH. */
  blockingHighGateIds: readonly string[];
  /** One plain-English line naming what stands in the way. Safe to log. */
  summary: string;
}

/**
 * The single authority on whether any peptide price may become a live member
 * price. Pure: it reads the gate records and nothing else, so no flag, founder
 * field, or urgency can route around a missing document.
 *
 * It fails closed twice over. A gate blocks unless it is explicitly CLEARED,
 * and the verdict is allowed only when the blocking list is empty. An empty
 * gate list is also refused, because "no gates recorded" is an absence of
 * evidence, not a clearance.
 */
export function canActivatePricing(
  gates: readonly PricingGate[] = PEPTIDE_PRICING_GATES,
): PricingActivationVerdict {
  if (gates.length === 0) {
    return {
      allowed: false,
      blockingGates: [],
      blockingGateIds: [],
      blockingCriticalGateIds: [],
      blockingHighGateIds: [],
      summary:
        "Pricing activation refused: no compliance gates were presented, which is not the same as a clear gate set.",
    };
  }

  const blockingGates = gates.filter((gate) => !gateIsClear(gate));
  const blockingGateIds = blockingGates.map((gate) => gate.id);
  const blockingCriticalGateIds = blockingGates
    .filter((gate) => gate.severity === "CRITICAL")
    .map((gate) => gate.id);
  const blockingHighGateIds = blockingGates
    .filter((gate) => gate.severity === "HIGH")
    .map((gate) => gate.id);

  if (blockingGates.length === 0) {
    return {
      allowed: true,
      blockingGates: [],
      blockingGateIds: [],
      blockingCriticalGateIds: [],
      blockingHighGateIds: [],
      summary: "Every recorded compliance gate is cleared.",
    };
  }

  return {
    allowed: false,
    blockingGates,
    blockingGateIds,
    blockingCriticalGateIds,
    blockingHighGateIds,
    summary: `Pricing activation blocked by ${blockingGates.length} gate(s): ${blockingGates
      .map((gate) => `${gate.gate} (${gate.severity} ${gate.currentState})`)
      .join("; ")}.`,
  };
}

/** The blocking gates that are also in the five-gate price-evidence core. */
export function blockingPriceEvidenceGates(
  gates: readonly PricingGate[] = PEPTIDE_PRICING_GATES,
): readonly PricingGate[] {
  const core = new Set(PRICE_EVIDENCE_GATE_IDS);
  return gates.filter((gate) => core.has(gate.id) && !gateIsClear(gate));
}

export function findPricingGate(
  id: string,
  gates: readonly PricingGate[] = PEPTIDE_PRICING_GATES,
): PricingGate | null {
  return gates.find((gate) => gate.id === id) ?? null;
}

export function pricingGatesBySeverity(
  severity: PricingGateSeverity,
  gates: readonly PricingGate[] = PEPTIDE_PRICING_GATES,
): readonly PricingGate[] {
  return gates.filter((gate) => gate.severity === severity);
}

/**
 * Model a hypothetical: what the verdict would be if the named gates were
 * cleared. Pure, returns a new array, and never edits the record. It exists so
 * a report can answer "what actually unlocks these prices" without anyone
 * editing a state to find out.
 *
 * Clearing a gate in a real record requires the evidence in its
 * `requiredBeforeActivation` field, and that is a reviewed edit to this file.
 */
export function withGatesCleared(
  ids: readonly string[],
  gates: readonly PricingGate[] = PEPTIDE_PRICING_GATES,
): readonly PricingGate[] {
  const clearing = new Set(ids);
  return gates.map((gate) =>
    clearing.has(gate.id) ? { ...gate, currentState: CLEARED_GATE_STATE } : gate,
  );
}
