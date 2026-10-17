import type { EarlyAccessBlocker } from "../catalog/eligibility";
import type {
  EarlyAccessCatalogProjection,
  EarlyAccessCatalogRow,
} from "../catalog/early-access-catalog";
import {
  decideEarlyAccessRelease,
  type EarlyAccessRelease,
  type EarlyAccessReleaseHold,
} from "./founder-release";

// What the customer actually sees inside Private Early Access.
//
// This composes two independent answers and never merges them:
//
//   Product Control  - the authority on identity, strength, presentation, and
//                      whether a unit is genuinely ready. Its verdict is
//                      reported verbatim and is never edited or suppressed.
//   Founder release  - a named human's explicit decision to sell one exact unit
//                      anyway, while Product Control catches up.
//
// A unit is purchasable if EITHER Product Control cleared it on its own (the
// long-term path) OR a valid founder release covers it (the temporary bridge).
// Everything else is shown with the real reason it is held, because a customer
// reading "coming soon" about something on a regulatory hold has been told
// something untrue.

export type EarlyAccessUnitState =
  | "purchasable"
  | "request_access"
  | "coming_soon"
  | "held";

/** Why a unit is purchasable, so an order can record its own basis. */
export type EarlyAccessPurchaseBasis = "product_control" | "founder_release";

export interface EarlyAccessStorefrontUnit {
  readonly productId: string;
  readonly variantId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly canonicalName: string;
  readonly sku: string;
  readonly strength: string | null;
  readonly presentation: string | null;
  readonly description: string;
  readonly imageState: EarlyAccessCatalogRow["imageState"];
  readonly quantityLimit: number | null;
  readonly state: EarlyAccessUnitState;
  /** Set only when the unit is purchasable. Never shown otherwise. */
  readonly priceCents: number | null;
  readonly currency: string;
  readonly basis: EarlyAccessPurchaseBasis | null;
  /** The release this unit is sold under, so an order can pin it. */
  readonly releaseId: string | null;
  /** The product fingerprint the release was approved against. */
  readonly productVersion: string | null;
  /** Product Control's verdict, reported whether or not it was overridden. */
  readonly productControlBlockers: readonly EarlyAccessBlocker[];
  /** Blockers a founder deliberately waived. Empty on the normal path. */
  readonly waivedBlockers: readonly EarlyAccessBlocker[];
  /** Why this unit is not purchasable, in machine form. Null when it is. */
  readonly hold: EarlyAccessReleaseHold | null;
}

export interface EarlyAccessStorefront {
  readonly evaluatedAt: string;
  readonly units: readonly EarlyAccessStorefrontUnit[];
  readonly purchasableCount: number;
  readonly heldCount: number;
}

/**
 * Decide the customer-facing state of a held unit.
 *
 * "Coming soon" is reserved for a unit that could genuinely be sold once a
 * founder releases it. A unit on a regulatory hold is NOT coming soon and must
 * not be described that way, so it stays held.
 */
function stateForHeldUnit(row: EarlyAccessCatalogRow): EarlyAccessUnitState {
  if (row.offerState === "UNAVAILABLE") return "held";
  if (row.offerState === "REQUEST_ACCESS_ONLY") return "request_access";
  if (row.offerState === null) return "held";
  return "coming_soon";
}

export function buildEarlyAccessStorefront(input: {
  readonly projection: EarlyAccessCatalogProjection;
  readonly releases: readonly EarlyAccessRelease[];
}): EarlyAccessStorefront {
  const units = input.projection.rows.map((row) => toUnit(row, input.releases));
  return Object.freeze({
    evaluatedAt: input.projection.evaluatedAt,
    units: Object.freeze(units),
    purchasableCount: units.filter((unit) => unit.state === "purchasable").length,
    heldCount: units.filter((unit) => unit.state !== "purchasable").length,
  });
}

function toUnit(
  row: EarlyAccessCatalogRow,
  releases: readonly EarlyAccessRelease[],
): EarlyAccessStorefrontUnit {
  const base = {
    productId: row.productId,
    variantId: row.variantId,
    slug: row.slug,
    displayName: row.displayName,
    canonicalName: row.canonicalName,
    sku: row.sku,
    strength: row.strength,
    presentation: row.presentation,
    description: row.description,
    imageState: row.imageState,
    quantityLimit: row.quantityLimit,
    productControlBlockers: Object.freeze([...row.blockers]),
  };

  // The long-term path. A unit Product Control cleared needs no override, and
  // deleting the bridge later must not disturb it.
  if (row.purchasable) {
    return Object.freeze({
      ...base,
      state: "purchasable" as const,
      priceCents: row.priceCents,
      currency: row.currency,
      basis: "product_control" as const,
      releaseId: null,
      productVersion: null,
      waivedBlockers: Object.freeze([]),
      hold: null,
    });
  }

  const decision = decideEarlyAccessRelease({ row, releases });
  if (decision.released) {
    return Object.freeze({
      ...base,
      state: "purchasable" as const,
      // The price comes from the release, because Product Control has none for
      // these units. It is server authoritative in both cases.
      priceCents: decision.priceCents,
      currency: decision.currency,
      basis: "founder_release" as const,
      releaseId: decision.releaseId,
      productVersion: decision.productVersion,
      waivedBlockers: decision.waivedBlockers,
      hold: null,
    });
  }

  return Object.freeze({
    ...base,
    state: stateForHeldUnit(row),
    // A held unit shows no amount at all. An amount beside "request access"
    // reads as a quotable price and would be one we never approved.
    priceCents: null,
    currency: "",
    basis: null,
    releaseId: null,
    productVersion: null,
    waivedBlockers: Object.freeze([]),
    hold: decision.hold,
  });
}
