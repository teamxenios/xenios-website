/**
 * xenios research: white-label ACTIVATION ELIGIBILITY. Server only, derived, read only.
 *
 * One question: may this exact variant be activated as a partner white-label
 * product? The answer is computed from data that already exists in this repository.
 * This module records no new fact, resolves no dispute, names no supplier, and
 * carries no amount.
 *
 * THE SEVEN CONDITIONS. A variant is eligible only when ALL of them hold.
 *
 *   1. Canonical identity exists. The product has a canonical name, an internal
 *      product code, and a slug.
 *   2. The exact variant exists. The SKU resolves to exactly one catalog variant.
 *      An ambiguous SKU is not an identity, so it fails rather than picking one.
 *   3. The supplier of record is known. See THE SUPPLIER SEAM below.
 *   4. A wholesale cost basis OR an exact partner quote exists. Either is a price
 *      basis; neither amount ever leaves this module.
 *   5. The quality status is visible. The catalog's coaStatus must be a value from
 *      the closed vocabulary. Visible is not the same as verified:
 *      PENDING_LAB_DOCUMENTATION is a visible status, and the asset packet states
 *      it in plain words rather than hiding it.
 *   6. The purchase mode permits partner use. isPurchaseMode is the catalog's own
 *      authority; REQUEST_ACCESS_ONLY, DISPLAY_ONLY, and UNAVAILABLE all fail.
 *   7. It is not clinical-only. A GLP-class compound routes to
 *      CLINICAL_PROVIDER_ONLY and is never a white-label product.
 *
 * Plus the merged guard from PR #205: a variant whose strength is contested is not
 * eligible. That guard is IMPORTED, never re-implemented, so a founder decision that
 * clears a dispute for the price authority clears it here on the same edit.
 *
 * THE SUPPLIER SEAM, AND WHY THE ANSWER IS ZERO TODAY.
 *
 * The peptide catalog records a supplier SOURCE (which document a fact came from),
 * not a supplier IDENTITY. Both source strings state in their own text that no
 * supplier company is named. The supplier's legal identity and the signed per-SKU
 * pricing facts were deliberately removed from this repository, which is public, and
 * relocated to the private operations repository (see
 * docs/research-commerce/SUPPLIER_DATA_RELOCATION.md).
 *
 * So the registry of named suppliers reachable from this repository is EMPTY BY
 * DESIGN, and condition 3 fails for every variant. That is the honest answer, and
 * the loud one: zero of the catalog's variants are activatable from data in code.
 * The registry is an injected seam so the operations layer, which does hold the
 * identity, can supply it without this module ever learning a supplier's name (it
 * asks a yes-or-no question and keeps nothing).
 *
 * NOTHING IN AN OUTPUT OF THIS MODULE IS AN AMOUNT. An eligibility decision carries
 * identity, routing, and reasons. A test pins that.
 */

import {
  PEPTIDE_CATALOG,
  REGULATORY_HOLD_TIER,
  allVariantsWithProduct,
  isPurchaseMode,
  PEPTIDE_COA_STATUSES,
  type PeptideCoaStatus,
  type PeptideProduct,
  type PeptideVariant,
} from "@shared/research/catalog/peptide-catalog";
import {
  WHITE_LABEL_INELIGIBILITY_SENTENCES,
  type WhiteLabelIneligibilityReason,
  type WhiteLabelRouting,
} from "@shared/research/white-label/contracts";
import { findVariantStrengthDispute } from "../products-diagnostics/variant-strength-dispute";

// ---------------------------------------------------------------------------
// The supplier seam
// ---------------------------------------------------------------------------

/**
 * Whether a named supplier of record exists for one exact SKU.
 *
 * The question is deliberately a boolean. This module has no reason to learn a
 * supplier's name, and a name it never receives is a name it can never leak into a
 * partner payload.
 */
export interface SupplierOfRecordRegistry {
  hasSupplierOfRecord(sku: string): boolean;
}

export const SUPPLIER_IDENTITY_RELOCATION_NOTE =
  "Supplier legal identity and the signed per-SKU pricing facts were relocated out of this " +
  "public repository to the private operations repository on 2026-07-29. See " +
  "docs/research-commerce/SUPPLIER_DATA_RELOCATION.md. This repository therefore knows no " +
  "supplier of record for any SKU, and white-label activation fails closed until the " +
  "operations layer supplies one.";

/**
 * The registry this repository can actually build: empty, on purpose, for the reason
 * above. It is a real object rather than a null so a caller cannot forget the seam
 * and accidentally treat "unconfigured" as "eligible".
 */
export const REPOSITORY_SUPPLIER_REGISTRY: SupplierOfRecordRegistry = Object.freeze({
  hasSupplierOfRecord(): boolean {
    return false;
  },
});

/** A registry over an explicit allowlist of SKUs. The operations layer builds this. */
export function supplierRegistryFromSkus(
  skus: readonly string[],
): SupplierOfRecordRegistry {
  const known = new Set(skus.map((sku) => sku.trim().toUpperCase()));
  return Object.freeze({
    hasSupplierOfRecord(sku: string): boolean {
      return known.has(sku.trim().toUpperCase());
    },
  });
}

// ---------------------------------------------------------------------------
// GLP class
// ---------------------------------------------------------------------------

/**
 * The GLP-class canonical names, DERIVED from the catalog's own regulatory-hold
 * tier rather than typed in here. If a fourth GLP compound is added to that tier,
 * this set grows with it and no edit is needed in this file.
 */
const GLP_CANONICAL_NAMES: ReadonlySet<string> = new Set(
  REGULATORY_HOLD_TIER.map((product) => product.canonicalName.trim().toLowerCase()),
);

/**
 * Whether a product is GLP class.
 *
 * Two independent tests, either of which is sufficient: the product sits in the
 * regulatory-hold tier, or it records one of the hold tier's canonical molecules
 * under some other tier. The second test is the one that matters: a duplicate record
 * of a held molecule filed as an ordinary product would otherwise walk straight past
 * a tier check.
 */
export function isGlpClass(product: PeptideProduct): boolean {
  if (product.tier === "regulatory_hold") return true;
  return GLP_CANONICAL_NAMES.has(product.canonicalName.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/** One variant's activation decision. Identity, routing, and reasons. No amounts. */
export interface WhiteLabelEligibility {
  sku: string;
  productCode: string;
  slug: string;
  displayName: string;
  routing: WhiteLabelRouting;
  eligible: boolean;
  /** Every unmet condition, in the order the conditions are documented. Empty when eligible. */
  reasons: readonly WhiteLabelIneligibilityReason[];
  /** The same reasons as plain sentences, safe to show an operator or a partner. */
  explanations: readonly string[];
}

/** What the evaluator needs besides the catalog. Both are seams, both fail closed. */
export interface WhiteLabelEligibilityContext {
  suppliers: SupplierOfRecordRegistry;
  /** Whether an exact partner quote exists for this SKU. Defaults to "no". */
  hasPartnerQuote?: (sku: string) => boolean;
}

function isVisibleCoaStatus(value: PeptideCoaStatus): boolean {
  return (PEPTIDE_COA_STATUSES as readonly string[]).includes(value);
}

function hasCanonicalIdentity(product: PeptideProduct): boolean {
  return (
    product.canonicalName.trim().length > 0 &&
    product.internalProductCode.trim().length > 0 &&
    product.slug.trim().length > 0
  );
}

function decide(
  product: PeptideProduct,
  variant: PeptideVariant,
  context: WhiteLabelEligibilityContext,
  variantIsUnique: boolean,
): WhiteLabelEligibility {
  const reasons: WhiteLabelIneligibilityReason[] = [];

  // The GLP exclusion is absolute and short-circuits, exactly as the catalog's
  // regulatory hold does. A held compound is not a white-label product that happens
  // to be missing paperwork; it is routed elsewhere, and listing the paperwork it
  // also lacks would read as a to-do list for activating it.
  if (isGlpClass(product)) {
    reasons.push("glp_class_clinical_provider_only");
    return Object.freeze({
      sku: variant.sku,
      productCode: product.internalProductCode,
      slug: product.slug,
      displayName: product.displayName,
      routing: "CLINICAL_PROVIDER_ONLY" as const,
      eligible: false,
      reasons: Object.freeze(reasons.slice()),
      explanations: Object.freeze(
        reasons.map((reason) => WHITE_LABEL_INELIGIBILITY_SENTENCES[reason]),
      ),
    });
  }

  if (!hasCanonicalIdentity(product)) reasons.push("canonical_identity_missing");
  if (!variantIsUnique) reasons.push("variant_not_in_catalog");
  if (!context.suppliers.hasSupplierOfRecord(variant.sku)) {
    reasons.push("supplier_of_record_unknown");
  }

  const hasCostBasis = variant.wholesaleSourceCostCents !== null;
  const hasQuote = context.hasPartnerQuote?.(variant.sku) === true;
  if (!hasCostBasis && !hasQuote) reasons.push("no_price_basis");

  if (!isVisibleCoaStatus(product.coaStatus)) reasons.push("quality_status_not_visible");
  if (!isPurchaseMode(variant.availability)) {
    reasons.push("purchase_mode_excludes_partner_use");
  }
  if (findVariantStrengthDispute(variant) !== null) {
    reasons.push("variant_strength_disputed");
  }

  const routing: WhiteLabelRouting =
    reasons.length === 0 ? "ELIGIBLE" : "NOT_ELIGIBLE";

  return Object.freeze({
    sku: variant.sku,
    productCode: product.internalProductCode,
    slug: product.slug,
    displayName: product.displayName,
    routing,
    eligible: routing === "ELIGIBLE",
    reasons: Object.freeze(reasons.slice()),
    explanations: Object.freeze(
      reasons.map((reason) => WHITE_LABEL_INELIGIBILITY_SENTENCES[reason]),
    ),
  });
}

function skuCounts(
  catalog: readonly PeptideProduct[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of allVariantsWithProduct(catalog)) {
    const key = entry.variant.sku.trim().toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Every variant's decision, in catalog order. */
export function evaluateWhiteLabelEligibility(
  context: WhiteLabelEligibilityContext,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly WhiteLabelEligibility[] {
  const counts = skuCounts(catalog);
  return allVariantsWithProduct(catalog).map((entry) =>
    decide(
      entry.product,
      entry.variant,
      context,
      counts.get(entry.variant.sku.trim().toUpperCase()) === 1,
    ),
  );
}

/**
 * One variant's decision by SKU. A SKU with no catalog variant, or with more than
 * one, resolves to a NOT_ELIGIBLE decision rather than to null, so a caller cannot
 * treat "unknown" as "fine".
 */
export function whiteLabelEligibilityForSku(
  sku: string,
  context: WhiteLabelEligibilityContext,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): WhiteLabelEligibility {
  const key = sku.trim().toUpperCase();
  const matches = allVariantsWithProduct(catalog).filter(
    (entry) => entry.variant.sku.trim().toUpperCase() === key,
  );
  if (matches.length !== 1) {
    const reasons: WhiteLabelIneligibilityReason[] = ["variant_not_in_catalog"];
    return Object.freeze({
      sku: sku.trim(),
      productCode: "",
      slug: "",
      displayName: "",
      routing: "NOT_ELIGIBLE" as const,
      eligible: false,
      reasons: Object.freeze(reasons),
      explanations: Object.freeze(
        reasons.map((reason) => WHITE_LABEL_INELIGIBILITY_SENTENCES[reason]),
      ),
    });
  }
  return decide(matches[0].product, matches[0].variant, context, true);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** A count of decisions, so the honest answer can be stated as a number. */
export interface WhiteLabelEligibilitySummary {
  variantsConsidered: number;
  eligible: number;
  notEligible: number;
  clinicalProviderOnly: number;
  /** How many variants each reason blocks. A variant can appear under several. */
  reasonCounts: Record<WhiteLabelIneligibilityReason, number>;
  eligibleSkus: readonly string[];
}

export function summarizeWhiteLabelEligibility(
  decisions: readonly WhiteLabelEligibility[],
): WhiteLabelEligibilitySummary {
  const reasonCounts = {} as Record<WhiteLabelIneligibilityReason, number>;
  for (const reason of Object.keys(
    WHITE_LABEL_INELIGIBILITY_SENTENCES,
  ) as WhiteLabelIneligibilityReason[]) {
    reasonCounts[reason] = 0;
  }
  let eligible = 0;
  let notEligible = 0;
  let clinicalProviderOnly = 0;
  const eligibleSkus: string[] = [];
  for (const decision of decisions) {
    if (decision.routing === "ELIGIBLE") {
      eligible += 1;
      eligibleSkus.push(decision.sku);
    } else if (decision.routing === "CLINICAL_PROVIDER_ONLY") {
      clinicalProviderOnly += 1;
    } else {
      notEligible += 1;
    }
    for (const reason of decision.reasons) reasonCounts[reason] += 1;
  }
  return {
    variantsConsidered: decisions.length,
    eligible,
    notEligible,
    clinicalProviderOnly,
    reasonCounts,
    eligibleSkus,
  };
}
