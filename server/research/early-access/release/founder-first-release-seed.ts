/**
 * The founder's first-release pricing decision, as versioned data with a
 * server-authoritative application path.
 *
 * WHAT THIS IS. Samuel's war-room decision of 2026-08-04 names 22 exact
 * units and their approved single-unit prices. This module records that list
 * VERBATIM and applies it by appending founder releases to the release
 * ledger, each pinned to the fingerprint of the unit as it stands at seed
 * time. Only the single-unit price is recorded; every bundle amount is
 * computed server-side by the promotion, never stored.
 *
 * WHAT THIS IS NOT. It is not a catalog, not a price authority the runtime
 * reads directly, and not a way around Product Control: a release clears no
 * non-waivable blocker, so a priced unit without a supplier confirmation
 * stays AVAILABILITY_CONFIRMATION_REQUIRED and a disputed or held unit stays
 * TEMPORARILY_HELD, truthfully.
 *
 * RESOLUTION IS EXACT OR IT IS REFUSED. An input resolves only when exactly
 * one projected unit matches its name (through the recorded alias table) AND
 * its exact strength. A missing product, a missing strength, or an ambiguous
 * match lands in `unresolved` with the reason, because inventing or bending
 * an identity to force a match is the one thing a price may never do.
 */

import {
  earlyAccessReleaseVersion,
  mayWaiveBlocker,
  type EarlyAccessRelease,
} from "./founder-release";
import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";

export const FOUNDER_FIRST_RELEASE_ACTOR = "Samuel Boadu";
export const FOUNDER_FIRST_RELEASE_RECORDED_AT = "2026-08-04T22:00:00.000Z";
export const FOUNDER_FIRST_RELEASE_REASON =
  "Founder first-release pricing decision, war room 2026-08-04. The price is " +
  "the founder's; availability stays confirmation-gated and a price clears " +
  "no blocker.";

/** Every unit ships at most three units per order (the bundle maximum). */
export const FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT = 3;

export type FounderFirstReleaseInput = Readonly<{
  /** The founder's own name for the product, verbatim from the decision. */
  name: string;
  strength: string;
  unitPriceCents: number;
}>;

/**
 * The 22 approved rows, verbatim. Do not edit a name or strength to make it
 * match the catalog; an unresolved row is reported, never bent.
 */
export const FOUNDER_FIRST_RELEASE_PRICING: readonly FounderFirstReleaseInput[] =
  Object.freeze([
    { name: "AOD-9604", strength: "5 mg", unitPriceCents: 5_600 },
    { name: "BPC-157", strength: "5 mg", unitPriceCents: 3_350 },
    { name: "BPC-157", strength: "10 mg", unitPriceCents: 4_750 },
    { name: "Cagrilintide", strength: "10 mg", unitPriceCents: 14_000 },
    { name: "DSIP", strength: "10 mg", unitPriceCents: 7_000 },
    { name: "GHK-Cu", strength: "50 mg", unitPriceCents: 2_250 },
    { name: "GHK-Cu", strength: "100 mg", unitPriceCents: 4_200 },
    { name: "Hexarelin", strength: "10 mg", unitPriceCents: 8_400 },
    { name: "Ipamorelin", strength: "10 mg", unitPriceCents: 4_750 },
    { name: "Kisspeptin", strength: "10 mg", unitPriceCents: 7_000 },
    { name: "KPV", strength: "10 mg", unitPriceCents: 5_050 },
    { name: "L-Glutathione", strength: "500 mg", unitPriceCents: 4_475 },
    { name: "MOTS-c", strength: "10 mg", unitPriceCents: 4_475 },
    { name: "NAD+", strength: "500 mg", unitPriceCents: 7_000 },
    { name: "NAD+", strength: "1,000 mg", unitPriceCents: 10_075 },
    { name: "Oxytocin", strength: "5 mg", unitPriceCents: 4_475 },
    { name: "PT-141", strength: "10 mg", unitPriceCents: 3_925 },
    { name: "Selank", strength: "10 mg", unitPriceCents: 5_325 },
    { name: "Semax", strength: "10 mg", unitPriceCents: 5_325 },
    { name: "Sermorelin", strength: "5 mg", unitPriceCents: 5_050 },
    { name: "Tesamorelin", strength: "10 mg", unitPriceCents: 10_650 },
    { name: "Thymosin Alpha 1", strength: "10 mg", unitPriceCents: 10_650 },
  ]);

/**
 * Name equivalences between the founder's decision and the founder-locked
 * catalog. An ALIAS states that two spellings name the same product; it
 * never changes a strength, a presentation, or an identity.
 */
const NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "l-glutathione": "glutathione",
  kisspeptin: "kisspeptin-10",
  "thymosin alpha 1": "thymosin alpha-1",
  "mots-c": "mots-c",
});

function normalizeName(value: string): string {
  const lowered = value
    .toLowerCase()
    .replace(/\s+research (material|blend|capsules)$/, "")
    .trim();
  const aliased = NAME_ALIASES[lowered] ?? lowered;
  return aliased.replace(/[^a-z0-9+]/g, "");
}

function normalizeStrength(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[,\s]/g, "");
}

/**
 * A unit the founder has NOT approved for commercial release, recorded as a
 * positive decision rather than an omission.
 *
 * The mechanism is the release ledger itself: a unit with no founder release
 * projects NO_FOUNDER_RELEASE and can never be purchased, and that hold is
 * exactly and only what it claims. Deliberately NOT the unit-hold registry,
 * whose four kinds (REGULATORY_HOLD, RECALL, STOP_SHIP, SUPPLIER_QUALITY_HOLD)
 * would each assert a determination nobody has made: there is no regulator
 * finding, no recall, no stop-ship order and no supplier quality failure here.
 * Recording one of those to achieve a hold would be a lie in an append-only
 * ledger, and the customer-facing reason would be wrong.
 *
 * The unit still renders, still appears in Product Control, and every
 * operational preparation (supplier mapping, lots, COA, inventory, admin and
 * browser testing) proceeds untouched. Releasing it later is a deliberate
 * founder act: remove the entry and seed the release.
 */
export type FounderCommercialHold = Readonly<{
  name: string;
  strength: string;
  reason: string;
  recordedBy: string;
  recordedAt: string;
}>;

export const FOUNDER_COMMERCIAL_HOLDS: readonly FounderCommercialHold[] =
  Object.freeze([
    Object.freeze({
      name: "Cagrilintide",
      strength: "10 mg",
      reason: "FOUNDER COMMERCIAL RELEASE NOT YET APPROVED",
      recordedBy: "Samuel Boadu",
      recordedAt: "2026-08-05T00:00:00.000Z",
    }),
  ]);

function heldByFounder(input: FounderFirstReleaseInput): FounderCommercialHold | null {
  return (
    FOUNDER_COMMERCIAL_HOLDS.find(
      (hold) =>
        normalizeName(hold.name) === normalizeName(input.name) &&
        normalizeStrength(hold.strength) === normalizeStrength(input.strength),
    ) ?? null
  );
}

export type UnresolvedFirstReleaseReason =
  | "product_not_in_catalog"
  | "strength_not_in_catalog"
  | "ambiguous_match";

export type UnresolvedFirstRelease = Readonly<{
  input: FounderFirstReleaseInput;
  reason: UnresolvedFirstReleaseReason;
  /** The strengths the catalog DOES carry for the product, when it exists. */
  catalogStrengths: readonly string[];
}>;

export type SeededFirstRelease = Readonly<{
  input: FounderFirstReleaseInput;
  productId: string;
  variantId: string;
  sku: string;
  releaseId: string;
}>;

export type FounderFirstReleaseSeedOutcome = Readonly<{
  seeded: readonly SeededFirstRelease[];
  unresolved: readonly UnresolvedFirstRelease[];
  /** Resolved units deliberately left unreleased. Visible, never purchasable. */
  founderHeld: readonly FounderCommercialHold[];
  /**
   * The exact units those holds resolved to. The storefront needs the product
   * and variant ids to keep the row VISIBLE while the missing release keeps it
   * unsellable; the hold list alone is names and strengths.
   */
  founderHeldUnits: readonly Readonly<{
    productId: string;
    variantId: string;
    sku: string;
  }>[];
}>;

export interface AppendOnlyReleaseLedger {
  append(release: Omit<EarlyAccessRelease, never>): Promise<
    | Readonly<{ ok: true }>
    | Readonly<{ ok: false; code: string }>
    | Readonly<{ ok: true; value: unknown }>
  >;
}

/**
 * Resolve every founder input against the projection and append a release
 * for each EXACT match. Rows the catalog cannot name exactly are returned in
 * `unresolved`, one reason each, and nothing is appended for them.
 */
/** One founder input resolved to exactly one projected unit. */
export type ResolvedFirstReleaseUnit = Readonly<{
  input: FounderFirstReleaseInput;
  row: EarlyAccessCatalogRow;
}>;

export type FounderFirstReleaseResolution = Readonly<{
  resolved: readonly ResolvedFirstReleaseUnit[];
  unresolved: readonly UnresolvedFirstRelease[];
}>;

/**
 * Resolve the founder's 22 inputs against a projection: exactly one unit per
 * input or an unresolved entry with the reason. Shared by the pricing seed
 * and the supply seed so the two can never disagree about which unit a name
 * means.
 */
export function resolveFounderFirstReleaseUnits(
  rows: readonly EarlyAccessCatalogRow[],
): FounderFirstReleaseResolution {
  const resolved: ResolvedFirstReleaseUnit[] = [];
  const unresolved: UnresolvedFirstRelease[] = [];
  for (const pricing of FOUNDER_FIRST_RELEASE_PRICING) {
    const wantedName = normalizeName(pricing.name);
    const productRows = rows.filter(
      (row) =>
        normalizeName(row.displayName) === wantedName ||
        normalizeName(row.canonicalName) === wantedName,
    );
    if (productRows.length === 0) {
      unresolved.push(
        Object.freeze({
          input: pricing,
          reason: "product_not_in_catalog" as const,
          catalogStrengths: Object.freeze([]),
        }),
      );
      continue;
    }
    const wantedStrength = normalizeStrength(pricing.strength);
    const matches = productRows.filter(
      (row) => normalizeStrength(row.strength) === wantedStrength,
    );
    if (matches.length === 0) {
      unresolved.push(
        Object.freeze({
          input: pricing,
          reason: "strength_not_in_catalog" as const,
          catalogStrengths: Object.freeze(
            productRows.map((row) => row.strength ?? "unknown"),
          ),
        }),
      );
      continue;
    }
    if (matches.length > 1) {
      unresolved.push(
        Object.freeze({
          input: pricing,
          reason: "ambiguous_match" as const,
          catalogStrengths: Object.freeze(
            matches.map((row) => row.strength ?? "unknown"),
          ),
        }),
      );
      continue;
    }
    resolved.push(Object.freeze({ input: pricing, row: matches[0] }));
  }
  return Object.freeze({
    resolved: Object.freeze(resolved),
    unresolved: Object.freeze(unresolved),
  });
}

export async function seedFounderFirstRelease(input: {
  readonly rows: readonly EarlyAccessCatalogRow[];
  readonly ledger: AppendOnlyReleaseLedger;
  readonly recordedAt?: string;
}): Promise<FounderFirstReleaseSeedOutcome> {
  const seeded: SeededFirstRelease[] = [];
  const recordedAt = input.recordedAt ?? FOUNDER_FIRST_RELEASE_RECORDED_AT;
  const resolution = resolveFounderFirstReleaseUnits(input.rows);
  const unresolved = [...resolution.unresolved];

  const founderHeld: FounderCommercialHold[] = [];
  const founderHeldUnits: { productId: string; variantId: string; sku: string }[] = [];

  for (const { input: pricing, row } of resolution.resolved) {
    // A founder-held unit is resolved and priced but never released, so the
    // storefront holds it on NO_FOUNDER_RELEASE and the order path refuses it.
    const hold = heldByFounder(pricing);
    if (hold !== null) {
      founderHeld.push(hold);
      founderHeldUnits.push(
        Object.freeze({ productId: row.productId, variantId: row.variantId, sku: row.sku }),
      );
      continue;
    }
    const releaseId = `rel-first-${row.sku.toLowerCase()}`;
    const appended = await input.ledger.append({
      releaseId,
      productId: row.productId,
      variantId: row.variantId,
      productVersion: earlyAccessReleaseVersion(row),
      status: "approved",
      approvedPriceCents: pricing.unitPriceCents,
      currency: "USD",
      // Only what a founder MAY waive. Every non-waivable blocker on the row
      // stays, which is exactly why a priced row can still be unsellable.
      waivedBlockers: row.blockers.filter((blocker) => mayWaiveBlocker(blocker)),
      approvedQuantityLimit: FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT,
      expiresAt: null,
      actor: FOUNDER_FIRST_RELEASE_ACTOR,
      reason: FOUNDER_FIRST_RELEASE_REASON,
      recordedAt,
    } as never);
    if (!("ok" in appended) || appended.ok !== true) {
      throw new Error(
        `founder first-release seed refused for ${row.sku}: ${
          (appended as { code?: string }).code ?? "unknown"
        }`,
      );
    }
    seeded.push(
      Object.freeze({
        input: pricing,
        productId: row.productId,
        variantId: row.variantId,
        sku: row.sku,
        releaseId,
      }),
    );
  }

  return Object.freeze({
    seeded: Object.freeze(seeded),
    unresolved: Object.freeze(unresolved),
    founderHeld: Object.freeze(founderHeld),
    founderHeldUnits: Object.freeze(founderHeldUnits),
  });
}
