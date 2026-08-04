/**
 * The founder-locked canonical record for one exact unit. Server only, derived,
 * read only, no clock, no I/O.
 *
 * WHY A SECOND RECORD MATTERS
 *
 * Product Control is the runtime authority on what a unit is. It is also a
 * single record, and a single record cannot corroborate itself: an import that
 * wrote the wrong canonical name, or an admin edit that renamed a product,
 * looks exactly like the truth from inside Product Control. The peptide catalog
 * (shared/research/catalog/peptide-catalog.ts) is an INDEPENDENT, founder-locked
 * record of the same units, and `variant-strength-dispute.ts` already trusts it
 * enough to refuse a price on a contested presentation.
 *
 * This module answers three more questions from that same record, using the
 * same SKU join, so nothing here invents a source:
 *
 *   1. Do two independent records agree about what this unit IS?
 *   2. Is the compound on a recorded regulatory hold?
 *   3. When a presentation is contested, is the contest about the STRENGTH of a
 *      single-component unit, or about the FORMULA of a blend?
 *
 * FAIL CLOSED. A SKU the founder-locked catalog does not carry yields
 * `unknown`, never `cleared`. One record is not corroboration, and a unit
 * nobody has cross-checked is not a cross-checked unit.
 *
 * SAFETY OF THE OUTPUT. Nothing here carries an amount of any kind. The peptide
 * catalog holds wholesale costs, draft computations, superseded published
 * prices, and a competitor's shelf price, and none of those may reach a pricing
 * path or a customer surface. A test pins that.
 */

import {
  PEPTIDE_CATALOG,
  type PeptideProduct,
  type PeptideVariant,
} from "@shared/research/catalog/peptide-catalog";
import {
  findVariantStrengthDispute,
  normalizePresentationKey,
  normalizeSkuKey,
  type VariantStrengthDispute,
} from "./variant-strength-dispute";

/** The product fields the corroboration needs. Deliberately smaller than the record. */
export interface CanonicalProductIdentity {
  readonly canonicalName: string;
  readonly slug: string;
}

/** The variant fields the join needs. Same two keys the strength dispute joins on. */
export interface CanonicalVariantIdentity {
  readonly sku: string;
  readonly catalogNumber?: string | null;
}

/**
 * Whether two independent records agree about what one exact unit is.
 *
 * `corroborated` means the founder-locked catalog carries this SKU and names
 * the same product. `contradicted` means it carries the SKU and names a
 * different one, which is a live identity dispute. `unrecorded` means the
 * founder-locked catalog has never seen this SKU.
 */
export type VariantIdentityCorroboration =
  | "corroborated"
  | "contradicted"
  | "unrecorded";

interface CanonicalEntry {
  readonly product: PeptideProduct;
  readonly variant: PeptideVariant;
}

function buildIndex(): Map<string, CanonicalEntry> {
  const bySku = new Map<string, CanonicalEntry>();
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
  // A SKU two catalog entries claim is an ambiguous join, and an ambiguous join
  // must not corroborate anything. Dropping both is the fail-closed direction:
  // the unit then reads as unrecorded rather than as agreeing with whichever
  // entry happened to be indexed first.
  collisions.forEach((key) => bySku.delete(key));
  return bySku;
}

const CANONICAL_BY_SKU = buildIndex();

function joinKeys(variant: CanonicalVariantIdentity): string[] {
  const keys: string[] = [];
  for (const candidate of [variant.sku, variant.catalogNumber]) {
    const key = normalizeSkuKey(candidate);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function canonicalEntryFor(variant: CanonicalVariantIdentity): CanonicalEntry | null {
  for (const key of joinKeys(variant)) {
    const entry = CANONICAL_BY_SKU.get(key);
    if (entry !== undefined) return entry;
  }
  return null;
}

/** Case and whitespace are not a different name. Nothing else about the string is altered. */
function nameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether the founder-locked catalog corroborates this unit's identity.
 *
 * Both the canonical name and the slug must agree. The slug is included because
 * two products can share a canonical name across lanes, and the slug is what a
 * customer's link resolves through; a unit whose slug points somewhere else is
 * not the unit the founder locked.
 */
export function corroborateVariantIdentity(
  product: CanonicalProductIdentity,
  variant: CanonicalVariantIdentity,
): VariantIdentityCorroboration {
  const entry = canonicalEntryFor(variant);
  if (entry === null) return "unrecorded";
  const sameName =
    nameKey(entry.product.canonicalName) === nameKey(product.canonicalName);
  const sameSlug = nameKey(entry.product.slug) === nameKey(product.slug);
  return sameName && sameSlug ? "corroborated" : "contradicted";
}

/**
 * The recorded reason this compound is held, or null when it is not held.
 *
 * A regulatory hold is absolute in the founder-locked catalog: no cost basis,
 * no lab document, and no flag moves a held compound out of `UNAVAILABLE`
 * (`resolveVariantAvailability`). This surfaces the same fact for one exact
 * unit so a surface outside that catalog cannot offer what it refuses.
 */
export function variantRegulatoryHoldReason(
  variant: CanonicalVariantIdentity,
): string | null {
  const entry = canonicalEntryFor(variant);
  if (entry === null) return null;
  if (entry.product.tier !== "regulatory_hold") return null;
  const reason = entry.product.holdReason?.trim() ?? "";
  // A held product with a blank reason is still held. The tier is the decision;
  // the sentence is only how it is explained.
  return reason.length > 0
    ? reason
    : "This compound is held pending a founder decision and counsel review.";
}

/** Mass units a recorded presentation uses, in milligrams. */
const MASS_IN_MG: Readonly<Record<string, number>> = {
  g: 1000,
  mg: 1,
  mcg: 0.001,
  ug: 0.001,
};

/** A number immediately followed by one of the mass units, and nothing else. */
const MASS_PATTERN = /(\d+(?:\.\d+)?)\s*(g|mg|mcg|ug)\b/gi;

/**
 * The masses a recorded presentation names, in milligrams, sorted.
 *
 * Two rules keep this from becoming a presentation parser:
 *
 *   1. Only a number IMMEDIATELY followed by a mass unit counts. "60 capsules"
 *      contributes nothing, because a capsule count is not a mass and reading
 *      it as one would invent a component.
 *   2. Anything in parentheses is dropped first. Both recorded sides annotate a
 *      blend with "(70 mg total)", and counting the annotation as a component
 *      would make two records that agree look like two that disagree.
 *
 * It exists only to compare two ALREADY RECORDED strings against each other in
 * an operator review. Nothing it returns is written anywhere, shown to a
 * customer, or used to resolve a presentation.
 */
export function presentationMassesMg(presentation: string): readonly number[] | null {
  const withoutAnnotations = presentation.replace(/\([^)]*\)/g, " ");
  const masses: number[] = [];
  // The regex carries the global flag, so lastIndex is reset before each read;
  // the constant is module scoped and a stale index would silently skip the
  // first component of the next presentation compared.
  MASS_PATTERN.lastIndex = 0;
  let match = MASS_PATTERN.exec(withoutAnnotations);
  while (match !== null) {
    const amount = Number.parseFloat(match[1]);
    const factor = MASS_IN_MG[match[2].toLowerCase()];
    if (!Number.isFinite(amount) || factor === undefined) return null;
    masses.push(amount * factor);
    match = MASS_PATTERN.exec(withoutAnnotations);
  }
  // A presentation naming no mass at all cannot be compared, so it is not
  // reported as comparable. The caller treats that as the stronger hold.
  return masses.length === 0 ? null : masses.sort((left, right) => left - right);
}

function sameMasses(
  left: readonly number[] | null,
  right: readonly number[] | null,
): boolean {
  if (left === null || right === null) return false;
  if (left.length !== right.length) return false;
  return left.every((mass, index) => mass === right[index]);
}

/**
 * What a contested presentation is a contest ABOUT.
 *
 * `formula` when the two records disagree about what is physically in the vial:
 * a different set of masses, on a unit either side describes as more than one
 * component. That is a composition we do not know, and settling it needs the
 * supplier's written formula.
 *
 * `strength` when the two records name the same masses (so the contest is about
 * how the presentation is written, not what it contains), or when both describe
 * a single component (so only the amount is in question).
 *
 * A presentation neither side states in comparable masses is `formula`, which
 * is the fail-closed direction: an unreadable composition is not a known one.
 *
 * The distinction changes who resolves it and how, which is why it is drawn
 * here rather than left to a reader of the two strings. Both kinds hold the
 * unit either way; neither is a route to selling anything.
 */
export type PresentationContestKind = "formula" | "strength";

export function presentationContestKind(
  dispute: VariantStrengthDispute,
): PresentationContestKind {
  const locked = presentationMassesMg(dispute.founderLocked.presentation);
  const contested = presentationMassesMg(dispute.contested.presentation);
  if (locked === null || contested === null) return "formula";
  if (sameMasses(locked, contested)) return "strength";
  return locked.length > 1 || contested.length > 1 ? "formula" : "strength";
}

/** Every canonical fact this module derives for one exact unit, in one read. */
export interface VariantCanonicalRecord {
  readonly identity: VariantIdentityCorroboration;
  readonly regulatoryHoldReason: string | null;
  readonly strengthDispute: VariantStrengthDispute | null;
  /** Null when nothing is contested. */
  readonly contestKind: PresentationContestKind | null;
  /**
   * True when the founder-locked record and the Product Control record name the
   * same presentation. A unit with no founder-locked record is false, because
   * an uncorroborated presentation is not a corroborated one.
   */
  readonly presentationCorroborated: boolean;
  /**
   * True for the ONE presentation of a product that the founder workbook
   * establishes as authoritative.
   *
   * Every other size in the founder-locked catalog was harvested from a market
   * reference: the presentation is recorded, but no founder has confirmed it as
   * the presentation xenios sells, and none has a sourced cost basis. That is
   * not a blocker, and it is not treated as one. It is the difference between
   * "we could release this" and "this is the one we meant to release", which is
   * exactly the judgement a first-release shortlist is for.
   */
  readonly authoritativePresentation: boolean;
}

export function readVariantCanonicalRecord(
  product: CanonicalProductIdentity,
  variant: CanonicalVariantIdentity & { readonly strength?: string | null },
): VariantCanonicalRecord {
  const dispute = findVariantStrengthDispute({
    sku: variant.sku,
    catalogNumber: variant.catalogNumber ?? null,
    strength: variant.strength ?? null,
  });
  const entry = canonicalEntryFor(variant);
  const recordedStrength = (variant.strength ?? "").trim();
  return {
    identity: corroborateVariantIdentity(product, variant),
    regulatoryHoldReason: variantRegulatoryHoldReason(variant),
    strengthDispute: dispute,
    contestKind: dispute === null ? null : presentationContestKind(dispute),
    presentationCorroborated:
      dispute === null &&
      entry !== null &&
      recordedStrength.length > 0 &&
      normalizePresentationKey(recordedStrength) ===
        normalizePresentationKey(entry.variant.strength),
    authoritativePresentation:
      entry !== null &&
      entry.variant.isPrimary &&
      entry.variant.origin === "founder_workbook",
  };
}
