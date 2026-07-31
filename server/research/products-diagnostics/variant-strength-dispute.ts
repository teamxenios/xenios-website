/**
 * Variant strength disputes. Server only, derived, read only.
 *
 * A price is a settlement. Publishing an authoritative customer price for a
 * unit whose physical presentation is still contested reads as settled in a
 * way that a missing price never does, so the price authority must refuse that
 * exact unit until a human resolves the presentation.
 *
 * This module answers one question for the price resolver: is THIS variant's
 * presentation contested? It answers from data that already exists in the
 * repository. It invents no strength, resolves no dispute, and rewrites
 * neither side. Both claims are carried through with their provenance so the
 * refusal explains itself to an operator.
 *
 * TWO DERIVED SOURCES OF DISPUTE
 *
 * 1. signed_supplier_master. The peptide catalog already records, per variant,
 *    the strength the signed supplier master states where it differs from the
 *    catalog's own recorded strength (`disputedBySignedSupplierMasterStrength`,
 *    surfaced by `variantsWithStrengthConflict`). Twelve of the seventy catalog
 *    variants carry one today. These are read, never re-derived and never
 *    hardcoded here, so a founder decision recorded in the catalog clears the
 *    dispute in this module on the same edit.
 *
 * 2. product_control_drift. A Product Control variant that matches a catalog
 *    SKU but records a different strength contradicts the founder-locked
 *    presentation for that SKU. That is the same class of contest arriving from
 *    the other direction (an import or an admin edit), and it fails closed for
 *    the same reason.
 *
 * IDENTITY. The join is the catalog SKU, matched against the Product Control
 * variant's `sku` and, because a Product Control import may carry the catalog
 * SKU there instead, its `catalogNumber`. A variant matching neither is not in
 * the peptide catalog and is not constrained by this module.
 *
 * SAFETY OF THE OUTPUT. A dispute record carries presentations, identity, and
 * provenance only. It never carries wholesale cost, a pricing multiplier, a
 * margin, or any amount, because it is produced on a pricing path and a test
 * pins that.
 */

import {
  PEPTIDE_CATALOG,
  variantsWithStrengthConflict,
  type PeptideProduct,
  type PeptideVariant,
} from "@shared/research/catalog/peptide-catalog";

/** How a variant's presentation came to be contested. */
export type VariantStrengthDisputeSource =
  | "signed_supplier_master"
  | "product_control_drift";

/** One side of a contested presentation, exactly as its source records it. */
export interface StrengthClaim {
  /** The presentation verbatim. Never normalized, never rewritten. */
  presentation: string;
  /** Where this claim comes from, in plain words. */
  provenance: string;
}

/**
 * A contested presentation for one exact variant. Both sides are preserved;
 * choosing between them is a founder and counsel decision, not a code change.
 */
export interface VariantStrengthDispute {
  source: VariantStrengthDisputeSource;
  /** The catalog SKU the dispute is recorded against. */
  sku: string;
  /** The peptide lane product code that owns the SKU. */
  productCode: string;
  /** The code older repository documents use for the same product, if any. */
  legacyProductCode: string | null;
  /** The founder-locked canonical presentation. */
  founderLocked: StrengthClaim;
  /** The presentation that contests it. */
  contested: StrengthClaim;
}

/** The variant fields this module needs. Deliberately smaller than the record. */
export interface StrengthDisputeVariantIdentity {
  sku: string;
  catalogNumber?: string | null;
  strength?: string | null;
}

const FOUNDER_LOCKED_PROVENANCE =
  "Founder-locked catalog presentation, shared/research/catalog/peptide-catalog.ts PEPTIDE_CATALOG.";

const SIGNED_SUPPLIER_MASTER_PROVENANCE =
  "Signed supplier master, recorded on the catalog variant as " +
  "disputedBySignedSupplierMasterStrength. Reconciliation: " +
  "docs/research-commerce/SUPPLIER_FACT_RECONCILIATION_FINAL.md.";

const PRODUCT_CONTROL_PROVENANCE =
  "Product Control variant record, matched to the catalog SKU.";

/**
 * Identity key for a SKU. Case and whitespace differences between an import and
 * the catalog are not a different unit, so they must not open a gap in the
 * guard. Nothing else about the string is altered.
 */
export function normalizeSkuKey(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Comparison key for a presentation. Only case and whitespace are collapsed, so
 * an import that writes "15mg/15mg" where the catalog writes "15 mg / 15 mg" is
 * not read as a contest. Digits, units, separators, and word order are all left
 * intact, so "10 mg" and "5 mg", or "250 mcg" and "1500 mcg per capsule", can
 * never compare equal. Collapsing more than whitespace would risk calling two
 * genuinely different presentations the same, which is the one error a price
 * guard must not make.
 */
export function normalizePresentationKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}

interface CatalogEntry {
  product: PeptideProduct;
  variant: PeptideVariant;
}

function buildFounderLockedIndex(): {
  bySku: Map<string, CatalogEntry>;
  collisions: string[];
} {
  const bySku = new Map<string, CatalogEntry>();
  const collisions = new Set<string>();
  for (const product of PEPTIDE_CATALOG) {
    for (const variant of product.variants) {
      const key = normalizeSkuKey(variant.sku);
      if (!key) continue;
      if (bySku.has(key)) {
        collisions.add(key);
        continue;
      }
      bySku.set(key, { product, variant });
    }
  }
  return { bySku, collisions: Array.from(collisions).sort() };
}

const FOUNDER_LOCKED_INDEX = buildFounderLockedIndex();

/**
 * Freeze a dispute before it leaves this module. The registry is shared by
 * every resolution in the process, so a caller must not be able to edit a
 * recorded claim and change what the guard says for the next request.
 */
function frozen(dispute: VariantStrengthDispute): VariantStrengthDispute {
  Object.freeze(dispute.founderLocked);
  Object.freeze(dispute.contested);
  return Object.freeze(dispute);
}

function supplierMasterDispute(entry: CatalogEntry): VariantStrengthDispute | null {
  const contested = entry.variant.disputedBySignedSupplierMasterStrength;
  if (contested === null || !contested.trim()) return null;
  return frozen({
    source: "signed_supplier_master",
    sku: entry.variant.sku,
    productCode: entry.product.internalProductCode,
    legacyProductCode: entry.product.legacyProductCode,
    founderLocked: {
      presentation: entry.variant.strength,
      provenance: FOUNDER_LOCKED_PROVENANCE,
    },
    contested: {
      presentation: contested,
      provenance: SIGNED_SUPPLIER_MASTER_PROVENANCE,
    },
  });
}

function buildRecordedDisputes(): Map<string, VariantStrengthDispute> {
  const bySku = new Map<string, VariantStrengthDispute>();
  for (const entry of variantsWithStrengthConflict()) {
    const dispute = supplierMasterDispute(entry);
    if (dispute === null) continue;
    const key = normalizeSkuKey(dispute.sku);
    if (!key || bySku.has(key)) continue;
    bySku.set(key, dispute);
  }
  return bySku;
}

const RECORDED_DISPUTES = buildRecordedDisputes();

/**
 * Every presentation dispute the catalog already records, in SKU order.
 * Operator reporting and tests read this; the resolver does not.
 */
export function recordedVariantStrengthDisputes(): readonly VariantStrengthDispute[] {
  return Array.from(RECORDED_DISPUTES.values()).sort((left, right) =>
    left.sku.localeCompare(right.sku),
  );
}

/**
 * Normalized SKU keys that more than one catalog variant claims. The catalog
 * pins SKU uniqueness, so this must stay empty; a test asserts it. It is
 * surfaced rather than swallowed because a collision would make the identity
 * join ambiguous, and an ambiguous join is exactly what a price guard must not
 * resolve on its own.
 */
export function catalogSkuCollisions(): readonly string[] {
  return FOUNDER_LOCKED_INDEX.collisions;
}

function driftDispute(
  entry: CatalogEntry,
  recordedStrength: string,
): VariantStrengthDispute {
  return frozen({
    source: "product_control_drift",
    sku: entry.variant.sku,
    productCode: entry.product.internalProductCode,
    legacyProductCode: entry.product.legacyProductCode,
    founderLocked: {
      presentation: entry.variant.strength,
      provenance: FOUNDER_LOCKED_PROVENANCE,
    },
    contested: {
      presentation: recordedStrength,
      provenance: PRODUCT_CONTROL_PROVENANCE,
    },
  });
}

/**
 * The dispute contesting this exact variant, or null when its presentation is
 * uncontested. Scoped to the one variant: a sibling presentation of the same
 * product is unaffected, because the join is the SKU and every variant of a
 * product has a distinct SKU by the catalog's own convention.
 */
export function findVariantStrengthDispute(
  variant: StrengthDisputeVariantIdentity,
): VariantStrengthDispute | null {
  const keys: string[] = [];
  for (const candidate of [variant.sku, variant.catalogNumber]) {
    const key = normalizeSkuKey(candidate);
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (keys.length === 0) return null;

  for (const key of keys) {
    const recorded = RECORDED_DISPUTES.get(key);
    if (recorded !== undefined) return recorded;
  }

  const recordedStrength = (variant.strength ?? "").trim();
  if (!recordedStrength) return null;
  for (const key of keys) {
    const entry = FOUNDER_LOCKED_INDEX.bySku.get(key);
    if (entry === undefined) continue;
    if (
      normalizePresentationKey(recordedStrength) !==
      normalizePresentationKey(entry.variant.strength)
    ) {
      return driftDispute(entry, recordedStrength);
    }
  }
  return null;
}
