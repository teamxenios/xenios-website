/**
 * Private Early Access: the adapter that feeds the catalog projection from the
 * LIVE Product Control reader. Server only. The only I/O is the reader's own.
 *
 * WHY THIS FILE EXISTS
 *
 * `projectEarlyAccessCatalog` turns `EarlyAccessProductRecord` values into the
 * rows a customer sees, and nothing built those records from the live reader,
 * so the projection had only test fixtures to run against. This is the missing
 * half. It reads Product Control through the same
 * `createProductionProductControlReader()` seam the pricing adapter and the
 * member catalog already read (server/index.ts, member-catalog-service.ts), so
 * Early Access answers from one catalog rather than from a second one that can
 * drift.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *
 * A Product Control record carries identity, status, content, variants, prices,
 * and media. It does NOT carry supplier assignment, fulfillment availability,
 * lot documentation, a per-order quantity ceiling, a resolved offer mode, a
 * variant-bound image, or the state of an identity or presentation dispute.
 * `eligibility.ts` states that those facts arrive declared and are never
 * inferred, and this adapter is the exact place where inferring one would be
 * easy and would be a lie. A `supplierReady: true` invented here puts a unit
 * nobody has verified in front of a paying customer.
 *
 * So every fact Product Control does not carry resolves to the value that keeps
 * the unit HELD. `heldVariantFacts` is the one place those conservative values
 * are written, and `EARLY_ACCESS_UNSOURCED_FACTS` names the gap as a checkable
 * list rather than as a paragraph nobody re-reads.
 *
 * WHAT THIS YIELDS AGAINST PRODUCTION DATA TODAY
 *
 * Every unit projects held, with PRICE_NOT_APPROVED, AUDIENCE_NOT_PERMITTED,
 * SUPPLIER_NOT_ASSIGNED, FULFILLMENT_UNAVAILABLE, QUANTITY_LIMIT_MISSING,
 * DOCUMENTATION_NOT_SATISFIED, IDENTITY_DISPUTE_UNRESOLVED,
 * STRENGTH_DISPUTE_UNRESOLVED, and OFFER_STATE_NOT_PURCHASABLE. The price
 * blocker rides along with the audience one rather than being a tenth gap: the
 * Product Control price resolver takes an authorized audience as an input, so
 * with no audience there is no resolved amount to approve.
 *
 * That is the truthful answer, not a failure of this adapter: those facts have
 * no store in this repository yet. It is also the state the founder release
 * bridge (release/founder-release.ts) was written for, so a held unit can still
 * be sold under one named human's explicit, version-bound decision.
 *
 * WHERE THE FACTS WILL COME FROM
 *
 * `EarlyAccessDeclaredFactsReader` is the seam each fact arrives through once
 * it has a store. Nothing is wired into it in production, and an absent reader
 * means absent facts, never assumed ones.
 */

import type { AdminProductDetail } from "@shared/research/product-admin";
import type { CartAudienceEligibility } from "@shared/research/cart-product-selection";
import { normalizePriceCurrency } from "@shared/research/pricing";
import {
  createProductionProductControlReader,
  type ProductCatalogReader,
} from "../../catalog/product-control-reader";
import { EARLY_ACCESS_CURRENCIES } from "../commerce/early-access-order";
import type {
  EarlyAccessProductRecord,
  EarlyAccessVariantFacts,
} from "./eligibility";
import {
  projectEarlyAccessCatalog,
  type EarlyAccessCatalogProjection,
} from "./early-access-catalog";

// ---------------------------------------------------------------------------
// The source
// ---------------------------------------------------------------------------

/**
 * One Early Access catalog, evaluated at an instant the caller supplies.
 *
 * The instant is a parameter rather than a clock read inside an implementation,
 * so one request evaluates every unit against one instant. Several eligibility
 * checks compare a fact's `evaluatedAt` against that instant, and two reads of
 * a clock inside one load would make a fact look stale for no reason.
 */
export interface EarlyAccessCatalogSource {
  load(now: Date): Promise<EarlyAccessCatalogProjection>;
}

/**
 * A read behind this source failed.
 *
 * It is a distinct type because a broken read and an empty catalog must never
 * look alike to a caller. An empty catalog says "there is nothing to sell"; a
 * failed read says "we do not know what there is", and a surface that renders
 * the second as the first has told a customer something it cannot support.
 */
export class EarlyAccessCatalogSourceError extends Error {}

/**
 * The facts an Early Access sale needs that Product Control does not record,
 * and that nothing else in this repository records either.
 *
 * The names are the fields they occupy on `EarlyAccessProductRecord` and
 * `EarlyAccessVariantFacts`, checked by the compiler, so renaming a field
 * upstream breaks this list rather than leaving it quietly wrong. Wiring a real
 * source for one of these is what removes its entry.
 */
export const EARLY_ACCESS_UNSOURCED_FACTS = [
  "audience",
  "supplier",
  "fulfillment",
  "documentation",
  "quantityLimit",
  "offerState",
  "image",
  "identityDispute",
  "strengthDispute",
] as const satisfies readonly ("audience" | keyof EarlyAccessVariantFacts)[];

export type EarlyAccessUnsourcedFact =
  (typeof EARLY_ACCESS_UNSOURCED_FACTS)[number];

/**
 * The declared facts for one exact unit when nobody has declared any.
 *
 * Every field is the value that BLOCKS. `null` is an absent fact, and both
 * dispute states are `unknown`, which blocks exactly as an open dispute blocks,
 * because a unit nobody has reviewed is not a cleared unit. Changing any value
 * here to its permissive counterpart would make an unverified unit purchasable,
 * so this function is the single place to read when auditing that claim.
 */
export function heldVariantFacts(variantId: string): EarlyAccessVariantFacts {
  return {
    variantId,
    supplier: null,
    fulfillment: null,
    documentation: null,
    quantityLimit: null,
    offerState: null,
    identityDispute: "unknown",
    strengthDispute: "unknown",
    image: null,
  };
}

/**
 * The one currency Early Access settles in.
 *
 * `EARLY_ACCESS_CURRENCIES` is the closed vocabulary an order is checked
 * against (commerce/early-access-order.ts), and the member catalog and the
 * founder release ledger independently name the same single currency. One entry
 * therefore names the settlement currency and is a real source, not a guess.
 *
 * Two or more entries would make the choice a per-record decision this adapter
 * has no input for, and guessing it would be guessing at money, so it declines
 * and every record blocks on the missing currency instead.
 */
export function resolveEarlyAccessSettlementCurrency(
  currencies: readonly string[] = EARLY_ACCESS_CURRENCIES,
): string {
  if (currencies.length !== 1) return "";
  return normalizePriceCurrency(currencies[0]) ?? "";
}

// ---------------------------------------------------------------------------
// The seam the unsourced facts will arrive through
// ---------------------------------------------------------------------------

/** The non-product half of one record, exactly as some future store declares it. */
export interface EarlyAccessDeclaredProductFacts {
  readonly productId: string;
  /**
   * The server-authorized audience. A browser-requested audience is never
   * authorization, so this is null unless a server-side authority produced it.
   */
  readonly audience: CartAudienceEligibility | null;
  readonly variantFacts: readonly EarlyAccessVariantFacts[];
}

/**
 * The store of declared facts, read once per load against the products the
 * reader returned.
 *
 * It is handed the products and the evaluation instant because several of the
 * facts it returns are only valid at one instant (fulfillment and documentation
 * both carry an `evaluatedAt` that eligibility compares against the load's).
 */
export interface EarlyAccessDeclaredFactsReader {
  readDeclaredFacts(input: {
    readonly products: readonly AdminProductDetail[];
    readonly now: Date;
  }): Promise<readonly EarlyAccessDeclaredProductFacts[]>;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export interface ProductControlCatalogSourceDependencies {
  /** The Product Control catalog. Injected, so this class needs no database. */
  readonly catalog: ProductCatalogReader;
  /** Absent in production today. Absent means every declared fact is absent. */
  readonly declaredFacts?: EarlyAccessDeclaredFactsReader | null;
  /** The settlement currency vocabulary. Defaults to the Early Access one. */
  readonly currencies?: readonly string[];
}

async function readOrFail<T>(
  read: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    // Rethrown, never swallowed into an empty result. The original is carried
    // as the cause so an operator still sees what actually broke.
    throw new EarlyAccessCatalogSourceError(message, { cause });
  }
}

/** The declared facts for one exact unit, or none when the declaration is unusable. */
function declaredFactsForVariant(
  declared: EarlyAccessDeclaredProductFacts | null,
  variantId: string,
): EarlyAccessVariantFacts | null {
  if (declared === null) return null;
  const matches = declared.variantFacts.filter(
    (facts) => facts.variantId === variantId,
  );
  // Two declarations for one unit disagree about something, and a fact that
  // disagrees with itself is not a fact. It resolves to none, which holds.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The Early Access catalog, read from Product Control.
 *
 * The reader is injected rather than built here, which is what makes the class
 * testable with no database and is the same shape
 * `MemberCatalogService` uses for the same reader.
 */
export class ProductControlCatalogSource implements EarlyAccessCatalogSource {
  private readonly catalog: ProductCatalogReader;
  private readonly declaredFacts: EarlyAccessDeclaredFactsReader | null;
  private readonly currency: string;

  constructor(dependencies: ProductControlCatalogSourceDependencies) {
    this.catalog = dependencies.catalog;
    this.declaredFacts = dependencies.declaredFacts ?? null;
    this.currency = resolveEarlyAccessSettlementCurrency(
      dependencies.currencies,
    );
  }

  async load(now: Date): Promise<EarlyAccessCatalogProjection> {
    const products = await readOrFail(
      () => this.catalog.readCatalog(),
      "The Product Control catalog could not be read for Private Early Access.",
    );
    const reader = this.declaredFacts;
    const declared =
      reader === null
        ? []
        : await readOrFail(
            () => reader.readDeclaredFacts({ products, now }),
            "The declared Early Access facts could not be read.",
          );
    return projectEarlyAccessCatalog({
      products: products.map((product) => this.toRecord(product, declared)),
      now,
    });
  }

  private toRecord(
    product: AdminProductDetail,
    declared: readonly EarlyAccessDeclaredProductFacts[],
  ): EarlyAccessProductRecord {
    const matches = declared.filter((entry) => entry.productId === product.id);
    // More than one declaration for the same product is ambiguous, so none of
    // them is used. Picking one would be picking which unverified claim to
    // trust, which is the decision this adapter is not allowed to make.
    const facts = matches.length === 1 ? matches[0] : null;
    return {
      product,
      audience: facts?.audience ?? null,
      currency: this.currency,
      // One entry per variant, always. A variant nobody declared facts for gets
      // the held set, so the absence is explicit in the record rather than
      // being a gap a later reader has to interpret.
      variantFacts: product.variants.map(
        (variant) =>
          declaredFactsForVariant(facts, variant.id) ??
          heldVariantFacts(variant.id),
      ),
    };
  }
}

/**
 * An Early Access catalog with nothing in it.
 *
 * For a deployment with no Product Control data and for tests that need a
 * source without needing a catalog. It is not a fallback: nothing catches a
 * read failure and substitutes this, because a broken database must not look
 * like an empty shelf.
 */
export class EmptyEarlyAccessCatalogSource implements EarlyAccessCatalogSource {
  async load(now: Date): Promise<EarlyAccessCatalogProjection> {
    // Projected rather than hand-built, so an unusable clock is refused here
    // exactly as the live source refuses it instead of returning a plausible
    // empty catalog stamped with an invented evaluation instant.
    return projectEarlyAccessCatalog({ products: [], now });
  }
}

/**
 * The production wiring: the real Product Control reader, and no declared facts.
 *
 * The reader is the same `createProductionProductControlReader()` server/index.ts
 * hands to `CatalogPricingProductSource`, so pricing, the member catalog, and
 * Early Access all read one catalog.
 *
 * No declared-facts reader is passed, because the facts in
 * `EARLY_ACCESS_UNSOURCED_FACTS` have no store yet. Every unit therefore
 * projects held. Passing a stub that answered "ready" would make this function
 * the single most dangerous line in the portal, so it stays absent until each
 * fact has a real source.
 */
export function createProductionEarlyAccessCatalogSource(): ProductControlCatalogSource {
  return new ProductControlCatalogSource({
    catalog: createProductionProductControlReader(),
  });
}
