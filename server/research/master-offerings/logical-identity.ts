/**
 * Stable logical identity for the master catalog, and the id-continuity map a
 * catalog swap needs.
 *
 * THE PROBLEM. An offering id is "mo_" + sha256(canonicalKey)[0:20] and a
 * variant id is "mov_" + sha256(canonicalKey + "|" + normalizedVariantLabel)
 * [0:20]. The canonical key is family plus the normalized product name (plus the
 * brand for supplements and diagnostics). That is a content hash, so it is
 * perfectly stable while the content is stable and it silently becomes a
 * different id the moment anyone edits the name, the variant label, the brand,
 * or the category that decides the family. Nothing warns. Everything bound to
 * the old id is quietly orphaned, and because a rename is the most ordinary
 * edit a catalog receives, this is the default failure of a workbook swap.
 *
 * THE DESIGN. Logical identity is not a second hash. A second hash would only
 * move the same problem to a different set of fields. Logical identity here is
 * an ordered ladder of evidence, and only the rungs that are unambiguous by
 * construction are allowed to preserve an id automatically:
 *
 *   1. The canonical key is identical. The id did not change, so there is
 *      nothing to preserve. Confidence: certain.
 *   2. The family is the same and the offering carries exactly the same set of
 *      workbook source IDs, matched one to one, and the names are related. The
 *      source ID is the operator's own identifier for the product, so this is
 *      the operator saying "same product, new name". A one-to-one requirement
 *      rules out merges and splits. Confidence: certain.
 *   3. Everything else. Partial source-ID overlap, a name that survived but a
 *      brand or family that changed, an alias that still carries the old name,
 *      or a name that merely looks similar. Every one of these is a proposal
 *      for a human. Confidence: high or medium, never certain, never merged
 *      automatically.
 *
 * WHY THIS IS THE RIGHT LINE. Three things could have been used as identity and
 * two of them are wrong here:
 *
 *   - The display name is wrong on its own, because renaming is the event we
 *     are trying to survive.
 *   - The family is wrong on its own, because it is derived from the workbook
 *     category and it decides visibility. The provider_network family is
 *     admin-only by policy, so carrying an id across a family change could walk
 *     a member-visible id into an administrative hold. Cross-family continuity
 *     is therefore never automatic, at any confidence.
 *   - The workbook source ID is right, when it is present and unambiguous. In
 *     the current 1,236-row workbook, 1,233 rows carry one and no source ID is
 *     shared by two different products, so it behaves as a real product key.
 *     Rung 2 uses it, and refuses to use it when it is blank, a placeholder, or
 *     shared by more than one offering on either side.
 *
 * A variant needs its own rule, because the variant id hashes the offering's
 * canonical key too: renaming a product changes every one of its variant ids
 * even though no variant label moved. So inside a matched offering, an
 * identical normalized label is certain continuity. A single residual variant
 * on each side is certain only when the two labels are compatible, which stops
 * "5 mg removed, 40 mg added" from being read as "5 mg renamed to 40 mg".
 *
 * This module is pure. No filesystem, no network, no database, no Product
 * Control binding, no mutation of any kind.
 */

import type {
  CatalogRevision,
  CatalogRevisionOffering,
  CatalogRevisionVariant,
} from "./catalog-revision";

/**
 * Only "certain" may preserve an id without a human. Everything else is a
 * proposal on a review list.
 */
export type IdContinuityConfidence = "certain" | "high" | "medium";

export const ID_CONTINUITY_CONFIDENCE_RANK: Readonly<
  Record<IdContinuityConfidence, number>
> = { certain: 0, high: 1, medium: 2 };

export type OfferingEvidenceKind =
  | "canonical_key_identical"
  | "source_sku_set_identical"
  | "source_sku_overlap"
  | "source_sku_group_ambiguous"
  | "alias_carries_other_name"
  | "normalized_name_identical"
  | "brand_changed"
  | "family_changed"
  | "name_similarity";

export type VariantEvidenceKind =
  | "variant_id_identical"
  | "normalized_label_identical"
  | "sole_residual_variant"
  | "compatible_quantity"
  | "label_similarity"
  | "incompatible_quantity";

export interface MatchEvidence<Kind extends string> {
  kind: Kind;
  detail: string;
  /** Present when the evidence is a similarity score, in the range 0 to 1. */
  score?: number;
}

export interface VariantContinuity {
  previousId: string;
  nextId: string;
  previousLabel: string;
  nextLabel: string;
  idChanged: boolean;
  confidence: IdContinuityConfidence;
  evidence: readonly MatchEvidence<VariantEvidenceKind>[];
}

export interface VariantReviewProposal extends VariantContinuity {
  reason: string;
}

export interface VariantMatchResult {
  /** Same variant id on both sides. */
  unchanged: readonly VariantContinuity[];
  /** Certain continuity where the id changed and must be carried. */
  preserved: readonly VariantContinuity[];
  /** Proposals for a human. Never applied automatically. */
  review: readonly VariantReviewProposal[];
  gained: readonly CatalogRevisionVariant[];
  lost: readonly CatalogRevisionVariant[];
}

export interface OfferingContinuity {
  previous: CatalogRevisionOffering;
  next: CatalogRevisionOffering;
  previousId: string;
  nextId: string;
  idChanged: boolean;
  confidence: IdContinuityConfidence;
  evidence: readonly MatchEvidence<OfferingEvidenceKind>[];
  variants: VariantMatchResult;
}

export interface OfferingReviewProposal {
  previous: CatalogRevisionOffering;
  next: CatalogRevisionOffering;
  previousId: string;
  nextId: string;
  confidence: IdContinuityConfidence;
  evidence: readonly MatchEvidence<OfferingEvidenceKind>[];
  reason: string;
}

/**
 * An offering whose canonical key survived but whose workbook source IDs are
 * entirely different. The system calls this the same product because the key
 * hashes the same, and it may well not be: the most likely cause is that one
 * product was renamed onto another product's name while that other product left
 * the workbook. The id is reused for what may be a different thing, so a bound
 * variant would silently point at new content.
 */
export interface CanonicalKeyReassignment {
  id: string;
  displayName: string;
  previousSourceSkus: readonly string[];
  nextSourceSkus: readonly string[];
}

export interface RevisionMatch {
  /** The best confidence the evidence in these two revisions can support. */
  confidenceCeiling: IdContinuityConfidence;
  /** Plain-English notes about what this comparison could not see. */
  limitations: readonly string[];
  unchanged: readonly OfferingContinuity[];
  /** Certain continuity where the offering id changed and must be carried. */
  preserved: readonly OfferingContinuity[];
  review: readonly OfferingReviewProposal[];
  added: readonly CatalogRevisionOffering[];
  removed: readonly CatalogRevisionOffering[];
  canonicalKeyReassignments: readonly CanonicalKeyReassignment[];
}

export interface LogicalIdentityOptions {
  /** Minimum name similarity before a pair is worth a human's attention. */
  nameSimilarityFloor?: number;
  /** How many proposals to keep per removed offering. */
  maxProposalsPerOffering?: number;
}

const DEFAULT_NAME_SIMILARITY_FLOOR = 0.6;
const DEFAULT_MAX_PROPOSALS = 3;

const STRENGTH_UNITS =
  "mg|mcg|ug|g|kg|ml|l|iu|capsule|capsules|cap|caps|softgel|softgels|tablet|tablets|serving|servings|vial|vials|count|ct|pack|packs|unit|units|test|tests|session|sessions|month|months|week|weeks|day|days";

const NUMBER_PATTERN = /\d+(?:\.\d+)?/g;
const UNIT_PATTERN = new RegExp(`\\b(${STRENGTH_UNITS})\\b`, "g");

function canonicalUnit(unit: string): string {
  const singular = unit.endsWith("s") ? unit.slice(0, -1) : unit;
  if (singular === "cap") return "capsule";
  if (singular === "ct") return "count";
  if (singular === "ug") return "mcg";
  return singular;
}

/**
 * Every quantity a label states, as a comparable signature, or null when it
 * states none.
 *
 * Numbers, not number-and-unit pairs, because the workbook writes both
 * "60 capsules" and "60 vegetarian capsules" and the word in the middle must
 * not make those two look like different sizes. Units are compared separately
 * so that "5 mg" and "5 ml" still fail.
 */
export function quantitySignature(normalizedLabel: string): string | null {
  const numbers = normalizedLabel.match(NUMBER_PATTERN);
  if (numbers === null || numbers.length === 0) return null;
  return numbers
    .map((value) => String(Number(value)))
    .sort()
    .join("+");
}

/** The measurement words a label uses, canonicalized and deduplicated. */
export function quantityUnits(normalizedLabel: string): readonly string[] {
  const found = normalizedLabel.match(UNIT_PATTERN) ?? [];
  return Array.from(new Set(found.map(canonicalUnit))).sort();
}

export function tokensOf(normalized: string): ReadonlySet<string> {
  return new Set(normalized.split(" ").filter((token) => token !== ""));
}

export function jaccard(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of Array.from(left)) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function intersection(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const other = new Set(right);
  return left.filter((value) => other.has(value));
}

function skuKey(offering: CatalogRevisionOffering): string {
  return `${offering.family}\u0000${offering.sourceSkus.join(",")}`;
}

function pairsBySide(
  unchanged: readonly OfferingContinuity[],
  preserved: readonly OfferingContinuity[],
  side: "previous" | "next",
): readonly CatalogRevisionOffering[] {
  return [...unchanged, ...preserved].map((pair) => pair[side]);
}

function namesRelated(
  previous: CatalogRevisionOffering,
  next: CatalogRevisionOffering,
): MatchEvidence<OfferingEvidenceKind> | null {
  if (previous.normalizedName === next.normalizedName) {
    return {
      kind: "normalized_name_identical",
      detail: `both revisions call it ${JSON.stringify(next.displayName)}`,
    };
  }
  if (next.normalizedAliases.includes(previous.normalizedName)) {
    return {
      kind: "alias_carries_other_name",
      detail: `the new offering still lists ${JSON.stringify(previous.displayName)} as an alias`,
    };
  }
  if (previous.normalizedAliases.includes(next.normalizedName)) {
    return {
      kind: "alias_carries_other_name",
      detail: `the previous offering already listed ${JSON.stringify(next.displayName)} as an alias`,
    };
  }
  const score = jaccard(
    tokensOf(previous.normalizedName),
    tokensOf(next.normalizedName),
  );
  if (score > 0) {
    return {
      kind: "name_similarity",
      detail: `${JSON.stringify(previous.displayName)} and ${JSON.stringify(next.displayName)} share wording`,
      score: Number(score.toFixed(3)),
    };
  }
  return null;
}

/**
 * Whether two variant labels can be the same variant re-worded.
 *
 * A label that states a quantity must state the same quantity, in units that do
 * not contradict. A label that states no quantity at all is compared on wording
 * alone. One side stating a quantity and the other not is a real difference,
 * not a re-wording.
 */
function labelsCompatible(
  previous: CatalogRevisionVariant,
  next: CatalogRevisionVariant,
): MatchEvidence<VariantEvidenceKind> | null {
  const previousQuantity = quantitySignature(previous.normalizedLabel);
  const nextQuantity = quantitySignature(next.normalizedLabel);
  if (previousQuantity !== null || nextQuantity !== null) {
    if (previousQuantity !== nextQuantity) return null;
    const previousUnits = quantityUnits(previous.normalizedLabel);
    const nextUnits = quantityUnits(next.normalizedLabel);
    if (
      previousUnits.length > 0 &&
      nextUnits.length > 0 &&
      previousUnits.every((unit) => !nextUnits.includes(unit))
    ) {
      return null;
    }
    return {
      kind: "compatible_quantity",
      detail: `both labels state ${previousQuantity}${previousUnits.length > 0 ? ` ${previousUnits.join(" ")}` : ""}`,
    };
  }
  const score = jaccard(
    tokensOf(previous.normalizedLabel),
    tokensOf(next.normalizedLabel),
  );
  if (score < 0.5) return null;
  return {
    kind: "label_similarity",
    detail: `${JSON.stringify(previous.label)} and ${JSON.stringify(next.label)} share wording`,
    score: Number(score.toFixed(3)),
  };
}

/**
 * Variant continuity inside one matched offering pair.
 *
 * The offering match is the premise. Without it there is no reason to believe
 * two labels describe the same thing, so this is never called on its own.
 */
export function matchVariants(
  previous: CatalogRevisionOffering,
  next: CatalogRevisionOffering,
): VariantMatchResult {
  const unchanged: VariantContinuity[] = [];
  const preserved: VariantContinuity[] = [];
  const review: VariantReviewProposal[] = [];

  const previousLeft = new Map(
    previous.variants.map((variant) => [variant.id, variant] as const),
  );
  const nextLeft = new Map(
    next.variants.map((variant) => [variant.id, variant] as const),
  );

  for (const variant of previous.variants) {
    const same = nextLeft.get(variant.id);
    if (same === undefined) continue;
    unchanged.push({
      previousId: variant.id,
      nextId: same.id,
      previousLabel: variant.label,
      nextLabel: same.label,
      idChanged: false,
      confidence: "certain",
      evidence: [
        {
          kind: "variant_id_identical",
          detail: "the variant id did not change",
        },
      ],
    });
    previousLeft.delete(variant.id);
    nextLeft.delete(same.id);
  }

  // A renamed offering changes every variant id beneath it, so an identical
  // normalized label under a matched offering is the same variant.
  const nextByLabel = new Map<string, CatalogRevisionVariant[]>();
  for (const variant of Array.from(nextLeft.values())) {
    nextByLabel.set(variant.normalizedLabel, [
      ...(nextByLabel.get(variant.normalizedLabel) ?? []),
      variant,
    ]);
  }
  for (const variant of Array.from(previousLeft.values())) {
    const candidates = nextByLabel.get(variant.normalizedLabel) ?? [];
    if (candidates.length !== 1) continue;
    const match = candidates[0];
    if (!nextLeft.has(match.id)) continue;
    preserved.push({
      previousId: variant.id,
      nextId: match.id,
      previousLabel: variant.label,
      nextLabel: match.label,
      idChanged: true,
      confidence: "certain",
      evidence: [
        {
          kind: "normalized_label_identical",
          detail:
            "the label did not change; the variant id moved only because the offering key did",
        },
      ],
    });
    previousLeft.delete(variant.id);
    nextLeft.delete(match.id);
  }

  const previousResidual = Array.from(previousLeft.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const nextResidual = Array.from(nextLeft.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  if (previousResidual.length === 1 && nextResidual.length === 1) {
    const only = previousResidual[0];
    const other = nextResidual[0];
    const compatible = labelsCompatible(only, other);
    const entry: VariantContinuity = {
      previousId: only.id,
      nextId: other.id,
      previousLabel: only.label,
      nextLabel: other.label,
      idChanged: true,
      confidence: compatible === null ? "medium" : "certain",
      evidence: [
        {
          kind: "sole_residual_variant",
          detail:
            "every other variant of this offering matched, so one label on each side is left",
        },
        compatible ?? {
          kind: "incompatible_quantity",
          detail: `${JSON.stringify(only.label)} and ${JSON.stringify(other.label)} state different quantities, so this is more likely one variant leaving and another arriving`,
        },
      ],
    };
    if (compatible === null) {
      review.push({
        ...entry,
        reason:
          "the only residual labels on each side are not compatible, so this is reported as a loss and a gain rather than a rename",
      });
      return {
        unchanged,
        preserved,
        review,
        gained: nextResidual,
        lost: previousResidual,
      };
    }
    preserved.push(entry);
    return { unchanged, preserved, review, gained: [], lost: [] };
  }

  // More than one residual on a side. Rank the pairs for a human and merge
  // nothing.
  for (const only of previousResidual) {
    let best: { variant: CatalogRevisionVariant; score: number } | null = null;
    for (const other of nextResidual) {
      const score = jaccard(
        tokensOf(only.normalizedLabel),
        tokensOf(other.normalizedLabel),
      );
      if (best === null || score > best.score) best = { variant: other, score };
    }
    if (best === null || best.score <= 0) continue;
    const compatible = labelsCompatible(only, best.variant);
    review.push({
      previousId: only.id,
      nextId: best.variant.id,
      previousLabel: only.label,
      nextLabel: best.variant.label,
      idChanged: true,
      confidence: compatible === null ? "medium" : "high",
      evidence: [
        {
          kind: "label_similarity",
          detail: `${JSON.stringify(only.label)} is closest to ${JSON.stringify(best.variant.label)}`,
          score: Number(best.score.toFixed(3)),
        },
        ...(compatible === null ? [] : [compatible]),
      ],
      reason:
        "several variant labels changed at once, so no pairing is unambiguous",
    });
  }

  return {
    unchanged,
    preserved,
    review,
    gained: nextResidual,
    lost: previousResidual,
  };
}

function continuity(
  previous: CatalogRevisionOffering,
  next: CatalogRevisionOffering,
  evidence: readonly MatchEvidence<OfferingEvidenceKind>[],
): OfferingContinuity {
  return {
    previous,
    next,
    previousId: previous.id,
    nextId: next.id,
    idChanged: previous.id !== next.id,
    confidence: "certain",
    evidence,
    variants: matchVariants(previous, next),
  };
}

/**
 * Compare two revisions and produce the id-continuity map plus the review list.
 *
 * The result is deterministic: every pool is iterated in sorted id order and
 * every rung is resolved completely before the next one starts.
 */
export function matchCatalogRevisions(
  current: CatalogRevision,
  candidate: CatalogRevision,
  options: LogicalIdentityOptions = {},
): RevisionMatch {
  const similarityFloor =
    options.nameSimilarityFloor ?? DEFAULT_NAME_SIMILARITY_FLOOR;
  const maxProposals = options.maxProposalsPerOffering ?? DEFAULT_MAX_PROPOSALS;

  const limitations: string[] = [];
  const skuEvidenceAvailable =
    current.fidelity === "normalized" && candidate.fidelity === "normalized";
  if (!skuEvidenceAvailable) {
    limitations.push(
      "One side of this comparison is a generated member-safe dataset. That file carries no workbook source ID and no canonical key, so a rename cannot be confirmed and every rename is reported for review instead of being applied.",
    );
  }

  const byId = (offerings: readonly CatalogRevisionOffering[]) =>
    new Map(
      [...offerings]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((offering) => [offering.id, offering] as const),
    );

  const currentLeft = byId(current.offerings);
  const candidateLeft = byId(candidate.offerings);

  const unchanged: OfferingContinuity[] = [];
  const preserved: OfferingContinuity[] = [];
  const review: OfferingReviewProposal[] = [];
  const canonicalKeyReassignments: CanonicalKeyReassignment[] = [];

  // Rung 1: the canonical key is identical, so the id never moved.
  for (const [id, previous] of Array.from(currentLeft.entries())) {
    const next = candidateLeft.get(id);
    if (next === undefined) continue;
    unchanged.push(
      continuity(previous, next, [
        {
          kind: "canonical_key_identical",
          detail: "the canonical key, and therefore the id, did not change",
        },
      ]),
    );
    if (
      previous.sourceSkus.length > 0 &&
      next.sourceSkus.length > 0 &&
      intersection(previous.sourceSkus, next.sourceSkus).length === 0
    ) {
      canonicalKeyReassignments.push({
        id,
        displayName: next.displayName,
        previousSourceSkus: previous.sourceSkus,
        nextSourceSkus: next.sourceSkus,
      });
    }
    currentLeft.delete(id);
    candidateLeft.delete(id);
  }

  // Rung 2: the same family and exactly the same workbook source IDs, one to
  // one. This is the rung that survives a rename.
  if (skuEvidenceAvailable) {
    const group = (offerings: readonly CatalogRevisionOffering[]) => {
      const map = new Map<string, CatalogRevisionOffering[]>();
      for (const offering of offerings) {
        if (offering.sourceSkus.length === 0) continue;
        const key = skuKey(offering);
        map.set(key, [...(map.get(key) ?? []), offering]);
      }
      return map;
    };
    const currentGroups = group(Array.from(currentLeft.values()));
    const candidateGroups = group(Array.from(candidateLeft.values()));

    for (const key of Array.from(currentGroups.keys()).sort()) {
      const previousGroup = currentGroups.get(key) ?? [];
      const nextGroup = candidateGroups.get(key) ?? [];
      if (nextGroup.length === 0) continue;
      if (previousGroup.length !== 1 || nextGroup.length !== 1) {
        for (const previous of previousGroup) {
          for (const next of nextGroup) {
            review.push({
              previous,
              next,
              previousId: previous.id,
              nextId: next.id,
              confidence: "high",
              evidence: [
                {
                  kind: "source_sku_group_ambiguous",
                  detail: `source IDs ${previous.sourceSkus.join(", ")} cover ${previousGroup.length} previous and ${nextGroup.length} new offerings, so no pairing is one to one`,
                },
              ],
              reason:
                "the workbook source IDs point at more than one offering on a side, which is a merge or a split and never an automatic rename",
            });
          }
        }
        continue;
      }
      const previous = previousGroup[0];
      const next = nextGroup[0];
      if (!currentLeft.has(previous.id) || !candidateLeft.has(next.id)) continue;
      if (previous.normalizedBrand !== next.normalizedBrand) {
        // The brand is part of the canonical key for supplements and
        // diagnostics, and it is a substantive product fact rather than a
        // label. A preserved source ID over a changed brand is a supplier
        // switch or a correction, and a person has to say which.
        review.push({
          previous,
          next,
          previousId: previous.id,
          nextId: next.id,
          confidence: "high",
          evidence: [
            {
              kind: "brand_changed",
              detail: `the workbook source ID is unchanged but the brand moved from ${JSON.stringify(previous.brand ?? "")} to ${JSON.stringify(next.brand ?? "")}`,
            },
          ],
          reason:
            "the brand is part of the canonical key for this family, so a brand edit is a real identity question and never an automatic rename",
        });
        continue;
      }
      const nameEvidence = namesRelated(previous, next);
      const skuEvidence: MatchEvidence<OfferingEvidenceKind> = {
        kind: "source_sku_set_identical",
        detail: `both carry exactly the workbook source ID set ${previous.sourceSkus.join(", ")} in family ${previous.family}`,
      };
      if (nameEvidence === null) {
        review.push({
          previous,
          next,
          previousId: previous.id,
          nextId: next.id,
          confidence: "high",
          evidence: [skuEvidence],
          reason:
            "the workbook source ID matches but the two names have nothing in common, which is as likely a reused ID as a rename",
        });
        continue;
      }
      preserved.push(continuity(previous, next, [skuEvidence, nameEvidence]));
      currentLeft.delete(previous.id);
      candidateLeft.delete(next.id);
    }
  }

  // Rung 3: proposals only. Nothing here consumes a side, so anything left over
  // is still reported as added or removed and a human decides.
  const remainingCandidates = Array.from(candidateLeft.values()).sort(
    (left, right) => left.id.localeCompare(right.id),
  );
  const candidatesByName = new Map<string, CatalogRevisionOffering[]>();
  const candidatesByToken = new Map<string, CatalogRevisionOffering[]>();
  const candidatesBySku = new Map<string, CatalogRevisionOffering[]>();
  for (const offering of remainingCandidates) {
    candidatesByName.set(offering.normalizedName, [
      ...(candidatesByName.get(offering.normalizedName) ?? []),
      offering,
    ]);
    for (const token of Array.from(tokensOf(offering.normalizedName))) {
      candidatesByToken.set(token, [
        ...(candidatesByToken.get(token) ?? []),
        offering,
      ]);
    }
    for (const sku of offering.sourceSkus) {
      candidatesBySku.set(sku, [...(candidatesBySku.get(sku) ?? []), offering]);
    }
  }

  for (const previous of Array.from(currentLeft.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const scored = new Map<
      string,
      {
        next: CatalogRevisionOffering;
        confidence: IdContinuityConfidence;
        evidence: MatchEvidence<OfferingEvidenceKind>[];
        reason: string;
        score: number;
      }
    >();

    const consider = (
      next: CatalogRevisionOffering,
      confidence: IdContinuityConfidence,
      evidence: MatchEvidence<OfferingEvidenceKind>[],
      reason: string,
      score: number,
    ) => {
      const existing = scored.get(next.id);
      if (
        existing !== undefined &&
        ID_CONTINUITY_CONFIDENCE_RANK[existing.confidence] <=
          ID_CONTINUITY_CONFIDENCE_RANK[confidence] &&
        existing.score >= score
      ) {
        return;
      }
      scored.set(next.id, { next, confidence, evidence, reason, score });
    };

    for (const next of candidatesByName.get(previous.normalizedName) ?? []) {
      if (next.family !== previous.family) {
        consider(
          next,
          "high",
          [
            {
              kind: "family_changed",
              detail: `the name is unchanged but the family moved from ${previous.family} to ${next.family}`,
            },
          ],
          "a family change decides visibility and routing, so an id is never carried across one automatically",
          1,
        );
        continue;
      }
      if (previous.normalizedBrand !== next.normalizedBrand) {
        consider(
          next,
          "high",
          [
            {
              kind: "brand_changed",
              detail: `the name is unchanged but the brand moved from ${JSON.stringify(previous.brand ?? "")} to ${JSON.stringify(next.brand ?? "")}`,
            },
          ],
          "the brand is part of the canonical key for this family, so a brand edit is a real identity question",
          1,
        );
      }
    }

    for (const sku of previous.sourceSkus) {
      for (const next of candidatesBySku.get(sku) ?? []) {
        const shared = intersection(previous.sourceSkus, next.sourceSkus);
        if (shared.length === 0) continue;
        if (sameSet(previous.sourceSkus, next.sourceSkus)) continue;
        consider(
          next,
          "high",
          [
            {
              kind: "source_sku_overlap",
              detail: `they share workbook source IDs ${shared.join(", ")} but not the whole set`,
            },
          ],
          "a partial source-ID overlap is a split, a merge, or a typo, and a human has to say which",
          shared.length / Math.max(previous.sourceSkus.length, 1),
        );
      }
    }

    const seen = new Set<string>();
    for (const token of Array.from(tokensOf(previous.normalizedName))) {
      for (const next of candidatesByToken.get(token) ?? []) {
        if (seen.has(next.id)) continue;
        seen.add(next.id);
        if (next.family !== previous.family) continue;
        if (next.normalizedAliases.includes(previous.normalizedName)) {
          consider(
            next,
            "high",
            [
              {
                kind: "alias_carries_other_name",
                detail: `the new offering still lists ${JSON.stringify(previous.displayName)} as an alias`,
              },
            ],
            "the new offering still answers to the old name, which usually means a rename the source IDs did not confirm",
            1,
          );
          continue;
        }
        const score = jaccard(
          tokensOf(previous.normalizedName),
          tokensOf(next.normalizedName),
        );
        if (score < similarityFloor) continue;
        consider(
          next,
          "medium",
          [
            {
              kind: "name_similarity",
              detail: `${JSON.stringify(previous.displayName)} reads close to ${JSON.stringify(next.displayName)}`,
              score: Number(score.toFixed(3)),
            },
          ],
          "the names are similar and nothing stronger connects them, so this is a suggestion and not a match",
          score,
        );
      }
    }

    const proposals = Array.from(scored.values())
      .sort((left, right) => {
        const byConfidence =
          ID_CONTINUITY_CONFIDENCE_RANK[left.confidence] -
          ID_CONTINUITY_CONFIDENCE_RANK[right.confidence];
        if (byConfidence !== 0) return byConfidence;
        if (right.score !== left.score) return right.score - left.score;
        return left.next.id.localeCompare(right.next.id);
      })
      .slice(0, maxProposals);

    for (const proposal of proposals) {
      review.push({
        previous,
        next: proposal.next,
        previousId: previous.id,
        nextId: proposal.next.id,
        confidence: proposal.confidence,
        evidence: proposal.evidence,
        reason: proposal.reason,
      });
    }
  }

  // Splits and merges hide from the loop above, because one side of them was
  // already consumed by rung 1. A workbook row moving out of a canonical group
  // leaves the old offering standing and puts a new one beside it, and both
  // carry the same workbook source ID. That is exactly the shape a matcher must
  // not read as a rename, and exactly the shape an operator must still see.
  const indexBySku = (offerings: readonly CatalogRevisionOffering[]) => {
    const map = new Map<string, CatalogRevisionOffering[]>();
    for (const offering of offerings) {
      for (const sku of offering.sourceSkus) {
        map.set(sku, [...(map.get(sku) ?? []), offering]);
      }
    }
    return map;
  };
  const alreadyProposed = new Set(
    review.map((item) => `${item.previousId} ${item.nextId}`),
  );
  const proposeOverlap = (
    previous: CatalogRevisionOffering,
    next: CatalogRevisionOffering,
    reason: string,
  ) => {
    const key = `${previous.id} ${next.id}`;
    if (alreadyProposed.has(key)) return;
    const shared = intersection(previous.sourceSkus, next.sourceSkus);
    if (shared.length === 0) return;
    alreadyProposed.add(key);
    review.push({
      previous,
      next,
      previousId: previous.id,
      nextId: next.id,
      confidence: "high",
      evidence: [
        {
          kind: "source_sku_overlap",
          detail: `they share workbook source IDs ${shared.join(", ")} while both exist`,
        },
      ],
      reason,
    });
  };

  if (skuEvidenceAvailable) {
    const survivingCurrentBySku = indexBySku(
      pairsBySide(unchanged, preserved, "previous"),
    );
    const survivingCandidateBySku = indexBySku(
      pairsBySide(unchanged, preserved, "next"),
    );
    for (const next of Array.from(candidateLeft.values()).sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      for (const sku of next.sourceSkus) {
        for (const previous of survivingCurrentBySku.get(sku) ?? []) {
          proposeOverlap(
            previous,
            next,
            "a new offering carries workbook source IDs that an existing offering still uses. That is a split, not a rename, and the ids stay where they are until a human says otherwise.",
          );
        }
      }
    }
    for (const previous of Array.from(currentLeft.values()).sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      for (const sku of previous.sourceSkus) {
        for (const next of survivingCandidateBySku.get(sku) ?? []) {
          proposeOverlap(
            previous,
            next,
            "a retired offering shares workbook source IDs with an offering that survived. That is a merge, not a rename, and the ids stay where they are until a human says otherwise.",
          );
        }
      }
    }
  }

  const bySortKey = (
    left: CatalogRevisionOffering,
    right: CatalogRevisionOffering,
  ) =>
    `${left.family}|${left.displayName}|${left.id}`.localeCompare(
      `${right.family}|${right.displayName}|${right.id}`,
    );

  return {
    confidenceCeiling: skuEvidenceAvailable ? "certain" : "high",
    limitations,
    unchanged: unchanged.sort((left, right) =>
      bySortKey(left.next, right.next),
    ),
    preserved: preserved.sort((left, right) => bySortKey(left.next, right.next)),
    review: review.sort((left, right) => {
      const byConfidence =
        ID_CONTINUITY_CONFIDENCE_RANK[left.confidence] -
        ID_CONTINUITY_CONFIDENCE_RANK[right.confidence];
      if (byConfidence !== 0) return byConfidence;
      return bySortKey(left.previous, right.previous);
    }),
    added: Array.from(candidateLeft.values()).sort(bySortKey),
    removed: Array.from(currentLeft.values()).sort(bySortKey),
    canonicalKeyReassignments: canonicalKeyReassignments.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}
