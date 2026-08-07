/**
 * Private Early Access: the Product Control catalog projection for step 4 of the
 * stepper ("Research Catalog"). Server only, pure, side effect free, no clock,
 * no environment, no I/O.
 *
 * The projection turns Product Control records (`AdminProductDetail`, the same
 * runtime authority the member catalog reads through
 * server/research/catalog/product-control-reader.ts) into display rows for the
 * Early Access page. It mirrors the member catalog's shape and its truthful
 * display states rather than inventing new ones: one row per EXACT variant, a
 * price that is either an approved Product Control amount or null, and an
 * availability that is `available` or `unavailable` exactly as the member
 * catalog derives it.
 *
 * FIVE RULES, EACH ENFORCED IN CODE AND EACH PINNED BY A TEST
 *
 * 1. Never a zero price. An amount reaches a row only when Product Control has
 *    one approved, active, in-window row for the exact unit, the amount is a
 *    positive safe integer inside the Early Access ceiling, and the resolved
 *    offer mode permits an amount to be shown at all. Anything else is null.
 *
 * 2. Never an image that is not an approved EXACT-VARIANT asset. The row carries
 *    an explicit `imageState`, so the client renders a deliberate placeholder
 *    instead of guessing. Product Control media is product-scoped today, so a
 *    product-level asset can never satisfy this rule.
 *
 * 3. Never dosage, reconstitution, injection, or administration language. The
 *    description is screened against a closed term list, twice (once as written,
 *    once with whitespace removed), and a description that trips it is replaced
 *    with a fixed, information-free sentence.
 *
 * 4. Held rows are still returned. A unit that cannot be sold is shown honestly,
 *    with `purchasable: false` and its exact blockers, rather than vanishing.
 *
 * 5. No client-supplied price can enter. This function takes no price argument.
 *    Amounts come from `product.prices` through the Product Control resolver and
 *    from nowhere else.
 */

import type {
  AdminProductDetail,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { CartPurchaseAudience } from "@shared/research/cart-product-selection";
import type { FulfillmentOwner } from "@shared/research/catalog";
import type { OfferAvailabilityMode } from "@shared/research/catalog/offer-readiness";
import { mayDisplayAmount } from "@shared/research/catalog/offer-readiness";
import {
  isCustomerSafeAmountCents,
  normalizePriceCurrency,
} from "@shared/research/pricing";
import { normalizeSkuKey } from "../../products-diagnostics/variant-strength-dispute";
import {
  assessEarlyAccessEligibility,
  earlyAccessEvaluatedAt,
  earlyAccessIdentityDisputeState,
  earlyAccessStrengthDisputeState,
  earlyAccessVariantFacts,
  fulfillmentAvailable,
  resolveEarlyAccessPrice,
  type EarlyAccessBlocker,
  type EarlyAccessDisputeState,
  type EarlyAccessProductRecord,
  type EarlyAccessVariantFacts,
} from "./eligibility";
import { earlyAccessProductDescriptor } from "./early-access-product-descriptor";

export class EarlyAccessCatalogError extends Error {}

// ---------------------------------------------------------------------------
// Display vocabulary
// ---------------------------------------------------------------------------

export const EARLY_ACCESS_IMAGE_STATES = ["approved", "pending", "none"] as const;

export type EarlyAccessImageState = (typeof EARLY_ACCESS_IMAGE_STATES)[number];

/** The member catalog's two truthful availability states, reused verbatim. */
export const EARLY_ACCESS_AVAILABILITY_STATES = [
  "available",
  "unavailable",
] as const;

export type EarlyAccessAvailability =
  (typeof EARLY_ACCESS_AVAILABILITY_STATES)[number];

/**
 * The sentence a row carries when Product Control has no description for it, or
 * when the description it does have is not safe to show. It states the catalog
 * state and nothing else: no benefit, no use, no quantity, no schedule.
 */
export const EARLY_ACCESS_WITHHELD_DESCRIPTION =
  "Product information for this item is still being confirmed.";

/**
 * Language an Early Access row may never carry.
 *
 * These are the terms that turn a catalog entry into an instruction. The screen
 * is a containment check on the whole projected description, so a term inside a
 * longer word is still caught, which is the safe direction for this rule.
 */
export const EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS = [
  "dose",
  "dosage",
  "mg/kg",
  "inject",
  "injection",
  "reconstitut",
  "administer",
  "administration",
  "iu per",
  "subcutaneous",
  "intramuscular",
] as const;

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export interface EarlyAccessRowDisputeStatus {
  readonly identity: EarlyAccessDisputeState;
  readonly strength: EarlyAccessDisputeState;
}

export interface EarlyAccessCatalogRow {
  /** The canonical product, as Product Control records it. */
  readonly productId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly canonicalName: string;
  /** The exact variant. Early Access sells a presentation, never a molecule. */
  readonly variantId: string;
  readonly sku: string;
  readonly strength: string | null;
  readonly presentation: string | null;
  /** An approved Product Control amount, or null. Never zero, never derived. */
  readonly priceCents: number | null;
  /** The supported currency for the amount, or "" when no amount may be shown. */
  readonly currency: string;
  readonly audience: CartPurchaseAudience | null;
  readonly availability: EarlyAccessAvailability;
  readonly offerState: OfferAvailabilityMode | null;
  readonly description: string;
  readonly imageState: EarlyAccessImageState;
  readonly quantityLimit: number | null;
  readonly supplierReady: boolean;
  /**
   * WHO ships this exact unit, when an assignment names it. Null when nobody is
   * assigned. `supplierReady` answers whether an assignment exists at all; a
   * founder deciding whether to release a unit needs the name as well, because
   * "someone will ship it" is not an operational answer.
   */
  readonly fulfillmentOwner: FulfillmentOwner | null;
  readonly disputeStatus: EarlyAccessRowDisputeStatus;
  /** True only when every eligibility condition holds for this exact unit. */
  readonly purchasable: boolean;
  /** The exact machine codes holding this row. Empty when purchasable. */
  readonly blockers: readonly EarlyAccessBlocker[];
}

export interface EarlyAccessCatalogInput {
  readonly products: readonly EarlyAccessProductRecord[];
  readonly now: Date;
}

export interface EarlyAccessCatalogProjection {
  readonly evaluatedAt: string;
  readonly rows: readonly EarlyAccessCatalogRow[];
  /**
   * Product Control products that contributed no row because they hold no
   * variant. Early Access sells an exact presentation, so a product with no
   * presentation has nothing to show. Reported rather than silently dropped.
   */
  readonly productsWithoutVariants: readonly string[];
}

export interface EarlyAccessEligibilityCensus {
  readonly eligibleRows: readonly EarlyAccessCatalogRow[];
  readonly heldRows: readonly EarlyAccessCatalogRow[];
  /** Every row keyed by `earlyAccessRowKey`. An eligible row maps to an empty list. */
  readonly blockersByRow: Readonly<Record<string, readonly EarlyAccessBlocker[]>>;
}

// ---------------------------------------------------------------------------
// Description safety
// ---------------------------------------------------------------------------

/**
 * Whether a candidate description carries any forbidden term.
 *
 * Two passes: the text as written with whitespace collapsed, and the text with
 * all whitespace removed. The second pass means "m g / k g" and "IU  per" cannot
 * slip through a spacing trick.
 */
export function carriesForbiddenDescriptionTerm(candidate: string): boolean {
  const lowered = candidate.toLowerCase();
  const collapsed = lowered.replace(/\s+/g, " ");
  const stripped = lowered.replace(/\s+/g, "");
  return EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS.some((term) => {
    const strippedTerm = term.replace(/\s+/g, "");
    return collapsed.includes(term) || stripped.includes(strippedTerm);
  });
}

/**
 * The description a row may carry, in three steps of descending authority.
 *
 *   1. Product Control's short description, when a named human has written
 *      one and it is safe to show. Nothing outranks a person.
 *   2. The canonical descriptor, composed from the product record itself:
 *      the canonical name, the classification, this exact unit's strength and
 *      presentation, and the alternative names already on file. It authors no
 *      research narrative; it restates what Product Control already holds.
 *      See early-access-product-descriptor.ts for why that is the boundary.
 *   3. The withheld sentence, when even the record cannot be read.
 *
 * The forbidden-term screen runs over EVERY candidate, including the composed
 * one, so a descriptor that somehow turned into an instruction is withheld
 * rather than shipped. There is no path that returns a blank, so a surface
 * never renders an empty panel that reads as missing data rather than
 * withheld data.
 */
export function earlyAccessDescription(
  product: AdminProductDetail,
  variant: AdminProductVariant | null = null,
): string {
  const authored = product.content.shortDescription?.trim() ?? "";
  if (authored) {
    return carriesForbiddenDescriptionTerm(authored)
      ? EARLY_ACCESS_WITHHELD_DESCRIPTION
      : authored;
  }
  const composed = earlyAccessProductDescriptor(product, variant).trim();
  if (composed && !carriesForbiddenDescriptionTerm(composed)) return composed;
  return EARLY_ACCESS_WITHHELD_DESCRIPTION;
}

// ---------------------------------------------------------------------------
// Image state
// ---------------------------------------------------------------------------

/**
 * The image state for one exact unit.
 *
 * `approved` requires an asset bound to this exact variant, in the approved
 * state, with a named approver and alt text. Everything short of that is
 * `pending` when an asset exists and `none` when one does not.
 */
export function earlyAccessImageState(
  facts: EarlyAccessVariantFacts | null,
  variant: AdminProductVariant,
): EarlyAccessImageState {
  const image = facts?.image ?? null;
  if (image === null) return "none";
  if (image.variantId !== variant.id) return "none";
  const approved =
    image.state === "approved" &&
    typeof image.approvedBy === "string" &&
    image.approvedBy.trim().length > 0 &&
    image.altText.trim().length > 0 &&
    image.mediaId.trim().length > 0;
  return approved ? "approved" : "pending";
}

// ---------------------------------------------------------------------------
// Cross-record identity
// ---------------------------------------------------------------------------

function countKeys(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Identities that more than one record in the source set claims.
 *
 * The member catalog drops an ambiguous record. Early Access holds it instead,
 * because a page that silently omits a unit is less truthful than one that shows
 * it as blocked. Either way an ambiguous identity is never purchasable.
 */
function ambiguousIdentities(products: readonly EarlyAccessProductRecord[]): {
  productIds: ReadonlySet<string>;
  slugs: ReadonlySet<string>;
  skus: ReadonlySet<string>;
} {
  const idCounts = countKeys(products.map((record) => record.product.id));
  const slugCounts = countKeys(
    products.map((record) => record.product.slug.trim().toLowerCase()),
  );
  const skuCounts = countKeys(
    products.flatMap((record) =>
      record.product.variants.map((variant) => normalizeSkuKey(variant.sku)),
    ),
  );
  const repeated = (counts: Map<string, number>) =>
    new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  return {
    productIds: repeated(idCounts),
    slugs: repeated(slugCounts),
    skus: repeated(skuCounts),
  };
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

function projectRow(
  record: EarlyAccessProductRecord,
  variant: AdminProductVariant,
  now: Date,
  evaluatedAt: string,
  ambiguous: boolean,
): EarlyAccessCatalogRow {
  const product = record.product;
  const facts = earlyAccessVariantFacts(record, variant.id);
  const eligibility = assessEarlyAccessEligibility(record, variant, now);
  const blockers: readonly EarlyAccessBlocker[] = eligibility.eligible
    ? ambiguous
      ? ["IDENTITY_NOT_CONFIRMED"]
      : []
    : ambiguous && !eligibility.blockers.includes("IDENTITY_NOT_CONFIRMED")
      ? ["IDENTITY_NOT_CONFIRMED", ...eligibility.blockers]
      : eligibility.blockers;

  const offerState = facts?.offerState ?? null;
  const price = resolveEarlyAccessPrice(record, variant, now);
  // Two independent gates on money: Product Control must have resolved one
  // approved, customer-safe amount, and the resolved offer mode must permit an
  // amount to be shown at all. A zero can satisfy neither.
  const showAmount =
    price.ok &&
    offerState !== null &&
    mayDisplayAmount(offerState) &&
    isCustomerSafeAmountCents(price.amountCents);
  const priceCents = showAmount ? price.amountCents : null;

  const quantityLimit = facts?.quantityLimit ?? null;
  const supplier = facts?.supplier ?? null;

  return {
    productId: product.id,
    slug: product.slug,
    displayName: product.displayName,
    canonicalName: product.canonicalName,
    variantId: variant.id,
    sku: variant.sku,
    strength: variant.strength,
    presentation: variant.presentation,
    priceCents,
    currency: showAmount ? (normalizePriceCurrency(record.currency) ?? "") : "",
    audience: record.audience?.audience ?? null,
    availability: fulfillmentAvailable(record, facts, variant, evaluatedAt)
      ? "available"
      : "unavailable",
    offerState,
    description: earlyAccessDescription(product, variant),
    imageState: earlyAccessImageState(facts, variant),
    quantityLimit:
      quantityLimit !== null &&
      quantityLimit.variantId === variant.id &&
      Number.isSafeInteger(quantityLimit.maxUnitsPerOrder)
        ? quantityLimit.maxUnitsPerOrder
        : null,
    supplierReady:
      supplier !== null &&
      supplier.variantId === variant.id &&
      supplier.fulfillmentOwner !== "not_assigned" &&
      supplier.sourceVersion.trim().length > 0,
    fulfillmentOwner:
      supplier !== null && supplier.variantId === variant.id
        ? supplier.fulfillmentOwner
        : null,
    disputeStatus: {
      identity: earlyAccessIdentityDisputeState(facts),
      strength: earlyAccessStrengthDisputeState(facts, variant),
    },
    purchasable: blockers.length === 0,
    blockers,
  };
}

/**
 * Project the Early Access catalog from Product Control records at `now`.
 *
 * One row per exact variant. Every row is returned, purchasable or held, so the
 * page can state the truth about each unit instead of hiding what it cannot
 * sell. `now` is supplied by the caller: this module reads no clock.
 */
export function projectEarlyAccessCatalog(
  input: EarlyAccessCatalogInput,
): EarlyAccessCatalogProjection {
  const evaluatedAt = earlyAccessEvaluatedAt(input.now);
  if (evaluatedAt === null) {
    throw new EarlyAccessCatalogError(
      "A usable evaluation instant is required to project the Early Access catalog.",
    );
  }
  const ambiguous = ambiguousIdentities(input.products);
  const rows: EarlyAccessCatalogRow[] = [];
  const productsWithoutVariants: string[] = [];

  for (const record of input.products) {
    if (record.product.variants.length === 0) {
      productsWithoutVariants.push(record.product.id);
      continue;
    }
    const identityAmbiguous =
      ambiguous.productIds.has(record.product.id) ||
      ambiguous.slugs.has(record.product.slug.trim().toLowerCase());
    for (const variant of record.product.variants) {
      rows.push(
        projectRow(
          record,
          variant,
          input.now,
          evaluatedAt,
          identityAmbiguous || ambiguous.skus.has(normalizeSkuKey(variant.sku)),
        ),
      );
    }
  }

  rows.sort(
    (left, right) =>
      left.displayName.localeCompare(right.displayName) ||
      left.sku.localeCompare(right.sku) ||
      left.variantId.localeCompare(right.variantId),
  );

  return {
    evaluatedAt,
    rows,
    productsWithoutVariants: productsWithoutVariants.sort(),
  };
}

/** The stable key for one row: the exact product and the exact variant. */
export function earlyAccessRowKey(row: EarlyAccessCatalogRow): string {
  return `${row.productId}::${row.variantId}`;
}

/**
 * The eligibility census for a projection.
 *
 * Counts come from the arrays, so a caller publishing "N eligible, M held"
 * cannot disagree with the rows it is showing. Two rows that collide on the same
 * key have their blockers merged rather than one overwriting the other, so a
 * blocker can never be lost to a duplicate identity.
 */
export function summarizeEarlyAccessEligibility(
  rows: readonly EarlyAccessCatalogRow[],
): EarlyAccessEligibilityCensus {
  const blockersByRow: Record<string, readonly EarlyAccessBlocker[]> = {};
  for (const row of rows) {
    const key = earlyAccessRowKey(row);
    const existing = blockersByRow[key] ?? [];
    const merged = new Set<EarlyAccessBlocker>([...existing, ...row.blockers]);
    blockersByRow[key] = Array.from(merged);
  }
  return {
    eligibleRows: rows.filter((row) => row.purchasable),
    heldRows: rows.filter((row) => !row.purchasable),
    blockersByRow,
  };
}
