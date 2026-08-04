/**
 * The founder-locked canonical catalog, projected for REVIEW ONLY.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 *
 * `docs/early-access/FIRST_RELEASE_CANDIDATES.md` is the founder's reviewed
 * first-release list. It has to be reproducible from code, or it becomes a
 * document nobody can re-derive and therefore nobody can trust. This module is
 * how it is re-derived: it projects the founder-locked peptide catalog through
 * the SAME adapter, declared-facts reader, eligibility gate, and classifier
 * that production uses, substituting exactly one thing.
 *
 * IT IS NOT A RUNTIME CATALOG. No request path imports it, and a test asserts
 * that. `createProductionEarlyAccessCatalogSource()` reads Product Control and
 * this module is not reachable from it. If it ever were, the portal would be
 * serving a static file as a live catalog, which is the failure this whole
 * lane exists to prevent.
 *
 * THE ONE SUBSTITUTION, STATED PLAINLY
 *
 * Inventory. This repository carries no `research_inventory_lots` data, so the
 * review runs against an inventory reader that reports NO ALLOCATABLE LOTS.
 * That is not a stub answer: it is the exact answer production returns for a
 * SKU with no allocatable lots, produced in the same shape. Every unit
 * therefore reports FULFILLMENT_UNAVAILABLE, which is true of this repository
 * and is the first thing a real deployment resolves.
 *
 * THE PREMISE, ALSO STATED PLAINLY
 *
 * The review reads each founder-locked presentation as a Product Control
 * variant that Product Control carries and has approved, because the question
 * the founder is asking is "what do we know about these units", not "has the
 * import run yet". Everything Product Control alone can establish, and that the
 * founder-locked catalog does not record, is left at the value that blocks:
 * draft status, members-only visibility, unapproved commerce, no price rows, no
 * media, and documentation state derived from the recorded COA status.
 *
 * NO AMOUNT is read from the peptide catalog. It holds wholesale costs, draft
 * computations, a superseded published price, and a competitor's shelf price,
 * and every one of them is excluded here, so no row in the review can carry a
 * price this repository never approved.
 */

import type {
  AdminProductDetail,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { DocumentState } from "@shared/research/catalog";
import {
  PEPTIDE_CATALOG,
  type PeptideCoaStatus,
  type PeptideProduct,
  type PeptideVariant,
} from "@shared/research/catalog/peptide-catalog";
import type { VariantInventoryFactsReader } from "../../catalog/member-catalog-service";
import {
  ProductControlDeclaredFactsReader,
  REVIEW_AUDIENCE_SOURCE,
} from "../catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import type { EarlyAccessCatalogProjection } from "../catalog/early-access-catalog";

/** The named human a review projection is attributed to when a script runs it. */
export const CANONICAL_REVIEW_ACTOR = "founder-release-review";

/** The instant the committed document is generated for, so the file is stable. */
export const CANONICAL_REVIEW_INSTANT = "2026-08-04T00:00:00.000Z";

/**
 * An inventory reader for a deployment with no lots on file.
 *
 * Every field is the value the production reader produces when the allocatable
 * query returns nothing: unavailable with the stated reason, and lot
 * documentation still required. The source version fingerprints the empty set,
 * exactly as the production reader fingerprints the rows it found.
 */
export const NO_RECORDED_LOTS_INVENTORY: VariantInventoryFactsReader = {
  async readVariantInventoryFacts({ productId, variant, evaluatedAt }) {
    const sourceVersion = "no_recorded_lots";
    return {
      inventory: {
        productId,
        variantId: variant.id,
        state: "unavailable",
        reason: "not_currently_available",
        sourceVersion,
        evaluatedAt,
      },
      lotCoa: {
        productId,
        variantId: variant.id,
        state: "required",
        sourceVersion,
        evaluatedAt,
      },
    };
  },
};

/** The one lab-document state a recorded COA status establishes. */
function qualityDocumentStateFor(coaStatus: PeptideCoaStatus): DocumentState {
  // Only an actual verified file counts. Everything else is a promise about a
  // file, and a promise is not a document.
  return coaStatus === "VERIFIED_FILE_PRESENT" ? "approved" : "missing";
}

function toVariant(
  product: PeptideProduct,
  variant: PeptideVariant,
  index: number,
): AdminProductVariant {
  return {
    id: variant.sku,
    productId: product.internalProductCode,
    sku: variant.sku,
    catalogNumber: null,
    label: variant.label,
    strength: variant.strength,
    size: variant.size,
    format: variant.format,
    // The presentation IS the founder-locked label. Early Access sells a
    // presentation, never a molecule, and the label is what names it.
    presentation: variant.label,
    shippingClass: null,
    memberEligible: variant.memberEligible,
    // The founder locked this presentation, which is what "approved" means for
    // the purposes of this review. See the premise in the file header.
    status: "approved",
    active: true,
    sortOrder: index,
    createdAt: CANONICAL_REVIEW_INSTANT,
    updatedAt: CANONICAL_REVIEW_INSTANT,
  };
}

function toProduct(product: PeptideProduct): AdminProductDetail {
  const variants = product.variants.map((variant, index) =>
    toVariant(product, variant, index),
  );
  return {
    id: product.internalProductCode,
    productCode: product.internalProductCode,
    slug: product.slug,
    displayName: product.displayName,
    canonicalName: product.canonicalName,
    aliases: [...product.nameAliases],
    lane: "research_material",
    category: product.category,
    classification: product.productClass,
    // Product Control has published none of these, and saying otherwise would
    // be the one lie this review cannot afford.
    status: "draft",
    active: true,
    visibility: "members_only",
    availability: "documentation_review",
    commerceApproval: "blocked_pending_written_approval",
    qualityDocumentState: qualityDocumentStateFor(product.coaStatus),
    variantCount: variants.length,
    approvedVariantCount: variants.length,
    missingInputCount: 0,
    updatedAt: CANONICAL_REVIEW_INSTANT,
    publishedAt: null,
    content: {
      // The founder-locked catalog carries no customer description, so the
      // projection carries the withheld sentence rather than inventing one.
      shortDescription: null,
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants,
    // No approved price row exists for any of these units, which is exactly why
    // a founder release carries the price itself.
    prices: [],
    media: [],
    history: [],
  };
}

/** Every founder-locked unit, in the shape Product Control returns one. */
export function canonicalReviewProducts(): AdminProductDetail[] {
  return PEPTIDE_CATALOG.map(toProduct);
}

/**
 * Project the founder-locked catalog through the production adapter.
 *
 * The adapter, the declared-facts reader, the eligibility gate, and the
 * classifier are the production ones. Only the catalog reader and the inventory
 * reader are supplied, and both supply real answers rather than convenient
 * ones.
 */
export async function projectCanonicalFirstReleaseCatalog(
  now: Date = new Date(CANONICAL_REVIEW_INSTANT),
): Promise<EarlyAccessCatalogProjection> {
  const products = canonicalReviewProducts();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => products },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      // The review audience, because a founder review has no member row and no
      // customer. It authorizes nothing to be sold; it only lets the review ask
      // what a member could be sold. See declared-facts-source.ts.
      audience: REVIEW_AUDIENCE_SOURCE,
      currency: resolveEarlyAccessSettlementCurrency(),
    }),
  });
  return source.load(now, { reviewActor: CANONICAL_REVIEW_ACTOR });
}
