/**
 * xenios research: the catalog display projection. Server only, read only.
 *
 * This is the module that finally connects the three implemented catalogs in
 * shared/research/catalog/ to a surface. It builds the display wire contract
 * out of each lane's OWN customer safe projection and out of nothing else:
 *
 *   peptides    toCustomerProductProjection / customerCatalogProjection
 *   supplements toMemberSupplementCard
 *   Quantum     toMemberQuantumCard
 *
 * A raw catalog record never reaches this module's output. That matters
 * because the raw records carry wholesale costs, computed draft amounts, prior
 * matrix amounts, legacy published amounts, signed supplier master amounts,
 * competitor market reference prices, supplier source notes, regulatory notes,
 * readiness states, reseller authorization state, and missing input lists. Each
 * lane's projection strips all of that by explicit field pick, so building on
 * top of the projections is what makes the wire safe by construction rather
 * than by review.
 *
 * FOUR RULES ARE ENFORCED HERE IN CODE.
 *
 * 1. The regulatory hold tier never reaches a customer view. The peptide
 *    projection returns null for it before this module sees it, and the three
 *    held records are re-read separately, through a shape that has no price and
 *    no variants, for the ADMIN view only.
 *
 * 2. Display is not purchase. Every card carries the offer mode the lane
 *    resolved. This module never computes, upgrades, or defaults a mode.
 *
 * 3. No peptide price. The peptide customer projection carries no money field
 *    at all, so a peptide card's price is null by construction, not by a filter
 *    that a later edit could forget. Peptide amounts stay draft until the
 *    founder confirms one pricing formula (four numbers disagree today, and
 *    eleven of fifteen strengths are disputed by the signed supplier master).
 *
 * 4. An amount appears only where the offer mode permits one AND the amount is
 *    a positive safe integer. The lane projections already apply the first
 *    test; this module applies both again, so a future projection change cannot
 *    quietly put a zero or a withheld amount on the wire.
 */

import {
  PEPTIDE_CATALOG,
  productsInTier,
  toCustomerProductProjection,
  isPurchaseMode,
  type CustomerProductProjection,
  type PeptideAvailability,
  type PeptideProduct,
} from "@shared/research/catalog/peptide-catalog";
import {
  copyForProduct,
  RESEARCH_CONTEXT_DISCLOSURE,
  CATALOG_STATUS_DISCLOSURE,
} from "@shared/research/catalog/peptide-copy";
import {
  SUPPLEMENT_CATALOG,
  toMemberSupplementCard,
  type SupplementProduct,
} from "@shared/research/catalog/supplement-catalog";
import { findSupplementCopy } from "@shared/research/catalog/supplement-copy";
import {
  QUANTUM_PRODUCT,
  toMemberQuantumCard,
} from "@shared/research/catalog/quantum-product";
import {
  OFFER_AVAILABILITY_MODES,
  isApprovedAmount,
  mayDisplayAmount,
  type OfferAvailabilityMode,
} from "@shared/research/catalog/offer-readiness";
import type {
  CatalogDisplayLane,
  CatalogVisibilityBreadth,
  DisplayProductCard,
  DisplayProductDetail,
  DisplayVariant,
  HeldProductNotice,
  MemberAmount,
} from "@shared/research/catalog-display/contract";

// ---------------------------------------------------------------------------
// Shared vocabulary checks
// ---------------------------------------------------------------------------

/**
 * The peptide lane names its availability union PeptideAvailability and the
 * offer readiness machine names the same five values OfferAvailabilityMode.
 * These two assignments are compile time proof that they are the same closed
 * set, which is what lets one predicate serve all three lanes below. If either
 * union ever gains or loses a member, this file stops compiling rather than
 * silently mis-classifying a record.
 */
const _peptideModeIsOfferMode: OfferAvailabilityMode = "REQUEST_ACCESS_ONLY" as PeptideAvailability;
const _offerModeIsPeptideMode: PeptideAvailability = "REQUEST_ACCESS_ONLY" as OfferAvailabilityMode;
void _peptideModeIsOfferMode;
void _offerModeIsPeptideMode;

/**
 * The strongest mode in a set. OFFER_AVAILABILITY_MODES is ordered strongest
 * first, so the lowest index wins. An empty set is UNAVAILABLE: a product with
 * no displayable presentation is not offerable, which fails closed.
 */
export function strongestMode(
  modes: readonly OfferAvailabilityMode[],
): OfferAvailabilityMode {
  let best = -1;
  for (const mode of modes) {
    const index = OFFER_AVAILABILITY_MODES.indexOf(mode);
    if (index < 0) continue;
    if (best === -1 || index < best) best = index;
  }
  return best === -1 ? "UNAVAILABLE" : OFFER_AVAILABILITY_MODES[best];
}

/**
 * The single amount gate. Both conditions must hold: the offer mode must
 * permit an amount at all, and the amount must be a positive safe integer.
 * Anything else is null, which the browser renders as the honest unavailable
 * copy rather than as a number.
 */
export function displayableAmount(
  availability: OfferAvailabilityMode,
  amountCents: number | null,
): MemberAmount | null {
  if (!mayDisplayAmount(availability)) return null;
  if (!isApprovedAmount(amountCents)) return null;
  return { amountCents, currency: "USD" };
}

// ---------------------------------------------------------------------------
// Peptides
// ---------------------------------------------------------------------------

function peptideVariants(
  projection: CustomerProductProjection,
): readonly DisplayVariant[] {
  return projection.variants.map((variant) => ({
    // The peptide customer projection publishes the sku, so it is the
    // customer safe selection id for this lane.
    id: variant.sku,
    label: variant.label,
    strength: variant.strength,
    size: variant.size,
    format: variant.format,
    availability: variant.availability,
    memberEligible: variant.memberEligible,
  }));
}

function peptideCard(
  product: PeptideProduct,
  projection: CustomerProductProjection,
): DisplayProductCard {
  const variants = peptideVariants(projection);
  const copy = copyForProduct(product);
  return {
    lane: "peptide",
    slug: projection.slug,
    displayName: projection.displayName,
    canonicalName: projection.canonicalName,
    category: projection.category,
    // The peptide customer projection publishes no brand and no collections.
    // Adding either would mean reading a field the projection withheld.
    brand: null,
    collections: [],
    availability: strongestMode(variants.map((variant) => variant.availability)),
    // Structural, not conditional: the peptide customer projection carries no
    // money field of any kind, so there is nothing here to show.
    price: null,
    variantCount: variants.length,
    positioning: copy?.positioning ?? null,
  };
}

function peptideDetail(
  product: PeptideProduct,
  projection: CustomerProductProjection,
): DisplayProductDetail {
  const copy = copyForProduct(product);
  const researchContext = copy?.researchContext ?? [];
  const disclosures: string[] = [CATALOG_STATUS_DISCLOSURE];
  // The copy module's own rule: research context may not be rendered without
  // the line that stops a list of study areas reading as a list of benefits.
  if (researchContext.length > 0) disclosures.unshift(RESEARCH_CONTEXT_DISCLOSURE);
  return {
    ...peptideCard(product, projection),
    overview: copy?.overview ?? null,
    researchContext,
    storageAndHandling: copy?.storageAndHandling ?? null,
    whyItPairs: null,
    disclosures,
    variants: peptideVariants(projection),
  };
}

/** Every peptide product a customer may see, paired with its raw record. */
function displayablePeptides(): ReadonlyArray<{
  product: PeptideProduct;
  projection: CustomerProductProjection;
}> {
  const entries: Array<{
    product: PeptideProduct;
    projection: CustomerProductProjection;
  }> = [];
  for (const product of PEPTIDE_CATALOG) {
    // The exclusion happens inside the catalog: a regulatory hold product
    // projects to null and never becomes an entry here.
    const projection = toCustomerProductProjection(product);
    if (projection === null) continue;
    entries.push({ product, projection });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

function supplementCard(product: SupplementProduct): DisplayProductCard {
  const card = toMemberSupplementCard(product);
  const copy = findSupplementCopy(card.slug);
  return {
    lane: "supplement",
    slug: card.slug,
    displayName: card.displayName,
    // The supplement projection publishes one name. Repeating it as the
    // canonical name is truthful: the record states the two are equal today
    // because no member facing rename has been approved.
    canonicalName: card.displayName,
    category: card.category,
    brand: card.brand,
    collections: card.collections,
    availability: card.availability,
    price: displayableAmount(card.availability, card.amountCents),
    // The workbook states no form factor for any supplement row, so no
    // presentation is invented here. The record is the presentation.
    variantCount: 0,
    positioning: copy?.positioning ?? null,
  };
}

function supplementDetail(product: SupplementProduct): DisplayProductDetail {
  const copy = findSupplementCopy(product.slug);
  return {
    ...supplementCard(product),
    overview: copy?.overview ?? null,
    researchContext: [],
    storageAndHandling: null,
    whyItPairs: copy?.whyItPairs ?? null,
    disclosures: [CATALOG_STATUS_DISCLOSURE],
    variants: [],
  };
}

// ---------------------------------------------------------------------------
// Quantum
// ---------------------------------------------------------------------------

function quantumCard(): DisplayProductCard {
  const card = toMemberQuantumCard();
  return {
    lane: "quantum",
    slug: card.slug,
    displayName: card.displayName,
    canonicalName: card.displayName,
    category: card.category,
    brand: null,
    collections: [],
    availability: card.availability,
    price: displayableAmount(card.availability, card.amountCents),
    variantCount: 1,
    positioning: null,
  };
}

function quantumVariants(): readonly DisplayVariant[] {
  const card = toMemberQuantumCard();
  return [
    {
      // The Quantum member card publishes no sku, so the selection id is
      // derived from the already public slug rather than lifted from the
      // internal variant code the projection withheld.
      id: `${card.slug}-1`,
      label: card.variantLabel,
      // Every Quantum identity field is unresolved by construction. Publishing
      // a strength, a volume, or a form here would be inventing a fact.
      strength: null,
      size: null,
      format: null,
      availability: card.availability,
      memberEligible: true,
    },
  ];
}

function quantumDetail(): DisplayProductDetail {
  return {
    ...quantumCard(),
    overview: null,
    researchContext: [],
    storageAndHandling: null,
    whyItPairs: null,
    disclosures: [CATALOG_STATUS_DISCLOSURE],
    variants: quantumVariants(),
  };
}

// ---------------------------------------------------------------------------
// Breadth
// ---------------------------------------------------------------------------

/**
 * Whether a card belongs to the STANDARD member breadth.
 *
 * The rule, and the whole rule: the record's strongest mode is a purchase mode,
 * meaning the offer readiness machine found a founder approved amount and a
 * named item for it.
 *
 * The reasoning: the default catalog should read as what a member can act on. A
 * record that is request access only or display only is real, and it is listed
 * at full breadth, but listing it by default would make the range look larger
 * than the evidence supports.
 *
 * isPurchaseMode is the peptide lane's exported name for exactly this set (the
 * two states that let money change hands). It serves all three lanes because
 * the availability unions are the same closed set, proven above. Note what this
 * predicate does NOT do: it never changes the mode it reads, so a record listed
 * only at full breadth arrives with its weaker mode intact.
 */
export function isStandardBreadthCard(card: DisplayProductCard): boolean {
  return isPurchaseMode(card.availability);
}

function applyBreadth(
  cards: readonly DisplayProductCard[],
  breadth: CatalogVisibilityBreadth,
): readonly DisplayProductCard[] {
  return breadth === "full" ? cards : cards.filter(isStandardBreadthCard);
}

// ---------------------------------------------------------------------------
// The public reads
// ---------------------------------------------------------------------------

/** Every displayable product across the three lanes, at full breadth. */
export function allDisplayableCards(): readonly DisplayProductCard[] {
  return [
    ...displayablePeptides().map((entry) => peptideCard(entry.product, entry.projection)),
    ...SUPPLEMENT_CATALOG.map(supplementCard),
    quantumCard(),
  ];
}

/** The cards a viewer at this breadth may list. */
export function displayCatalog(
  breadth: CatalogVisibilityBreadth,
): readonly DisplayProductCard[] {
  return applyBreadth(allDisplayableCards(), breadth);
}

/**
 * One product's detail, or null when it is not visible at this breadth.
 *
 * The breadth check runs on the card built from the same projection the list
 * uses, so a member cannot reach a wider record by guessing its slug. A
 * regulatory hold slug returns null here for every breadth and every audience,
 * because it never becomes an entry in the first place.
 */
export function displayProductDetail(
  lane: CatalogDisplayLane,
  slug: string,
  breadth: CatalogVisibilityBreadth,
): DisplayProductDetail | null {
  const normalized = String(slug).trim().toLowerCase();
  if (normalized === "") return null;

  let detail: DisplayProductDetail | null = null;
  if (lane === "peptide") {
    const entry = displayablePeptides().find(
      (candidate) => candidate.projection.slug === normalized,
    );
    detail = entry ? peptideDetail(entry.product, entry.projection) : null;
  } else if (lane === "supplement") {
    const product = SUPPLEMENT_CATALOG.find((candidate) => candidate.slug === normalized);
    detail = product ? supplementDetail(product) : null;
  } else if (lane === "quantum") {
    detail = QUANTUM_PRODUCT.slug === normalized ? quantumDetail() : null;
  }

  if (detail === null) return null;
  if (breadth !== "full" && !isStandardBreadthCard(detail)) return null;
  return detail;
}

/**
 * The regulatory hold records, for the ADMIN view only.
 *
 * These are read straight from the tier because there is no customer
 * projection that can express them, which is the point: the only way to see
 * them is to ask for the held list explicitly, on an admin authorized request.
 * The shape carries no price, no variants, and no offer mode.
 */
export function heldProductNotices(): readonly HeldProductNotice[] {
  return productsInTier("regulatory_hold").map((product) => ({
    lane: "peptide" as const,
    slug: product.slug,
    displayName: product.displayName,
    status: "regulatory_hold" as const,
    holdReason:
      product.holdReason ??
      "Held pending a founder decision and counsel review. No reason is recorded on this record.",
  }));
}

/** How many products the regulatory hold tier keeps out of every customer view. */
export function excludedRegulatoryHoldCount(): number {
  return productsInTier("regulatory_hold").length;
}
