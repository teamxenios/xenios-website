/**
 * The change report for one master-catalog swap: what was added, what was
 * retired, what was renamed, which ids survived, which ids moved, which
 * variants a product gained or lost, which display states and holds changed,
 * and everything a human has to look at before any of it ships.
 *
 * The shape is the deliverable. A workbook swap is only safe when an operator
 * can see, in one place, the difference between "this product is gone" and
 * "this product was renamed and its id moved", because those two look identical
 * to a content hash and could not be more different to anything bound to it.
 *
 * This module is pure. No filesystem, no network, no database, no Product
 * Control binding, no mutation of any kind.
 */

import type { MasterOfferingDisplayState } from "@shared/research/master-offerings/contract";
import type {
  CatalogRevision,
  CatalogRevisionOffering,
} from "./catalog-revision";
import { countVariants, duplicateSourceRowIssues } from "./catalog-revision";
import {
  matchCatalogRevisions,
  type IdContinuityConfidence,
  type LogicalIdentityOptions,
  type MatchEvidence,
  type OfferingEvidenceKind,
  type RevisionMatch,
  type VariantEvidenceKind,
} from "./logical-identity";
import type { MasterOfferingCommerceIdentityBinding } from "./model";

export interface RevisionSummary {
  label: string;
  fidelity: CatalogRevision["fidelity"];
  sourceWorkbookSha256: string;
  sourceRowCount: number;
  offerings: number;
  variants: number;
  holds: number;
  duplicateSourceRowGroups: number;
  duplicateSourceRows: number;
}

export interface IdContinuityEntry {
  kind: "offering" | "variant";
  /** For a variant, the id of the offering it belongs to after the swap. */
  offeringId: string;
  name: string;
  previousId: string;
  nextId: string;
  idChanged: boolean;
  confidence: IdContinuityConfidence;
  evidence: readonly MatchEvidence<
    OfferingEvidenceKind | VariantEvidenceKind
  >[];
}

export interface OfferingChangeRecord {
  id: string;
  slug: string;
  displayName: string;
  family: string;
  displayState: MasterOfferingDisplayState;
  variantIds: readonly string[];
  sourceSkus: readonly string[];
}

export interface RenameRecord {
  previousId: string;
  nextId: string;
  previousName: string;
  nextName: string;
  previousSlug: string;
  nextSlug: string;
  family: string;
  confidence: IdContinuityConfidence;
  evidence: readonly MatchEvidence<OfferingEvidenceKind>[];
}

export interface VariantSetChange {
  offeringId: string;
  offeringName: string;
  gained: readonly { id: string; label: string }[];
  lost: readonly { id: string; label: string }[];
}

export interface DisplayStateTransition {
  kind: "offering" | "variant";
  offeringId: string;
  name: string;
  previous: MasterOfferingDisplayState;
  next: MasterOfferingDisplayState;
}

export interface HoldChange {
  id: string;
  displayName: string | null;
  family: string;
  reason: string;
}

export interface DuplicateGroup {
  revision: string;
  sheetRows: readonly number[];
  message: string;
}

export interface ReviewItem {
  kind: "offering" | "variant";
  confidence: IdContinuityConfidence;
  previousId: string;
  nextId: string;
  previousName: string;
  nextName: string;
  reason: string;
  evidence: readonly MatchEvidence<
    OfferingEvidenceKind | VariantEvidenceKind
  >[];
}

export type BindingOutcome =
  | "unchanged"
  | "id_moved_continuity_available"
  | "offering_retired"
  | "variant_retired"
  | "unknown_to_current_catalog"
  | "review_required";

export interface BindingRiskItem {
  offeringVariantId: string;
  productId: string;
  variantId: string;
  outcome: BindingOutcome;
  /** The id the binding should point at after the swap, when one is certain. */
  replacementOfferingVariantId: string | null;
  offeringName: string | null;
  variantLabel: string | null;
  note: string;
}

export interface CatalogRevisionDiffSummary {
  offeringsUnchanged: number;
  offeringsAdded: number;
  offeringsRetired: number;
  offeringsRenamed: number;
  offeringIdsPreserved: number;
  offeringIdsChanged: number;
  variantsUnchanged: number;
  variantIdsPreserved: number;
  variantIdsChanged: number;
  variantsGained: number;
  variantsLost: number;
  displayStateTransitions: number;
  holdsAdded: number;
  holdsRemoved: number;
  reviewItems: number;
  bindingsAtRisk: number;
  canonicalKeyReassignments: number;
}

export interface CatalogRevisionDiff {
  schemaVersion: 1;
  generatedAt: string;
  current: RevisionSummary;
  candidate: RevisionSummary;
  confidenceCeiling: IdContinuityConfidence;
  limitations: readonly string[];
  summary: CatalogRevisionDiffSummary;
  idContinuity: readonly IdContinuityEntry[];
  added: readonly OfferingChangeRecord[];
  retired: readonly OfferingChangeRecord[];
  renamed: readonly RenameRecord[];
  variantChanges: readonly VariantSetChange[];
  displayStateTransitions: readonly DisplayStateTransition[];
  holdsAdded: readonly HoldChange[];
  holdsRemoved: readonly HoldChange[];
  duplicates: readonly DuplicateGroup[];
  review: readonly ReviewItem[];
  bindingRisk: readonly BindingRiskItem[];
  canonicalKeyReassignments: RevisionMatch["canonicalKeyReassignments"];
  /** One plain-English line per thing a human has to decide. */
  humanAttention: readonly string[];
}

export interface CatalogRevisionDiffOptions extends LogicalIdentityOptions {
  generatedAt?: string;
  /**
   * Every Product Control identity binding an operator knows about. There is no
   * production binding store in this tree, so the honest default is none, and
   * the report says so rather than implying it checked.
   */
  bindings?: readonly MasterOfferingCommerceIdentityBinding[];
}

/** "1 offering" rather than "1 offerings". A report is read by a person. */
export function counted(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function revisionSummary(revision: CatalogRevision): RevisionSummary {
  const duplicates = duplicateSourceRowIssues(revision);
  return {
    label: revision.label,
    fidelity: revision.fidelity,
    sourceWorkbookSha256: revision.sourceWorkbookSha256,
    sourceRowCount: revision.sourceRowCount,
    offerings: revision.offerings.length,
    variants: countVariants(revision),
    holds: revision.holds.length,
    duplicateSourceRowGroups: duplicates.length,
    duplicateSourceRows: duplicates.reduce(
      (sum, issue) => sum + issue.sheetRows.length,
      0,
    ),
  };
}

function changeRecord(offering: CatalogRevisionOffering): OfferingChangeRecord {
  return {
    id: offering.id,
    slug: offering.slug,
    displayName: offering.displayName,
    family: offering.family,
    displayState: offering.displayState,
    variantIds: offering.variants.map((variant) => variant.id),
    sourceSkus: offering.sourceSkus,
  };
}

/**
 * What actually happens to a retired offering that a Product Control binding
 * still points at. This is read off the shipped code, not assumed.
 *
 * resolveMasterOfferingAction now requires the exact offering and variant to
 * both be `available_now`, in addition to a matching server-only selection with
 * validated current/live activation authority. Removing the offering, or
 * retaining it as unavailable, therefore closes this catalog action path.
 *
 * Retirement still does not revoke durable mutation authority or clean up the
 * Product Control identity. A stale binding or live activation record must be
 * withdrawn explicitly before the swap so no other mutation surface can treat
 * catalog retirement as revocation.
 */
export const RETIRED_AND_BOUND_CONSEQUENCE =
  "Retiring an offering removes it from the member catalog, or retains it as unavailable when retired rows are preserved. resolveMasterOfferingAction requires the exact offering and variant to both be available_now plus a matching server-only selection with validated current/live activation authority, so retirement closes this catalog action path. Retirement does not itself revoke durable mutation authority or clean up Product Control identity: withdraw or repoint the stale binding and revoke durable activation authority before the swap.";

export function buildCatalogRevisionDiff(
  current: CatalogRevision,
  candidate: CatalogRevision,
  options: CatalogRevisionDiffOptions = {},
): CatalogRevisionDiff {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const bindings = options.bindings ?? [];
  const match = matchCatalogRevisions(current, candidate, options);

  const idContinuity: IdContinuityEntry[] = [];
  const displayStateTransitions: DisplayStateTransition[] = [];
  const variantChanges: VariantSetChange[] = [];
  const review: ReviewItem[] = [];

  let variantsUnchanged = 0;
  let variantIdsPreserved = 0;
  let variantsGained = 0;
  let variantsLost = 0;

  const pairs = [...match.unchanged, ...match.preserved];
  for (const pair of pairs) {
    idContinuity.push({
      kind: "offering",
      offeringId: pair.nextId,
      name: pair.next.displayName,
      previousId: pair.previousId,
      nextId: pair.nextId,
      idChanged: pair.idChanged,
      confidence: pair.confidence,
      evidence: pair.evidence,
    });
    if (pair.previous.displayState !== pair.next.displayState) {
      displayStateTransitions.push({
        kind: "offering",
        offeringId: pair.nextId,
        name: pair.next.displayName,
        previous: pair.previous.displayState,
        next: pair.next.displayState,
      });
    }

    const previousVariantState = new Map(
      pair.previous.variants.map(
        (variant) => [variant.id, variant.displayState] as const,
      ),
    );
    const nextVariantById = new Map(
      pair.next.variants.map((variant) => [variant.id, variant] as const),
    );

    for (const entry of [
      ...pair.variants.unchanged,
      ...pair.variants.preserved,
    ]) {
      if (entry.idChanged) variantIdsPreserved += 1;
      else variantsUnchanged += 1;
      idContinuity.push({
        kind: "variant",
        offeringId: pair.nextId,
        name: `${pair.next.displayName} / ${entry.nextLabel}`,
        previousId: entry.previousId,
        nextId: entry.nextId,
        idChanged: entry.idChanged,
        confidence: entry.confidence,
        evidence: entry.evidence,
      });
      const before = previousVariantState.get(entry.previousId);
      const after = nextVariantById.get(entry.nextId);
      if (before !== undefined && after !== undefined && before !== after.displayState) {
        displayStateTransitions.push({
          kind: "variant",
          offeringId: pair.nextId,
          name: `${pair.next.displayName} / ${after.label}`,
          previous: before,
          next: after.displayState,
        });
      }
    }

    for (const proposal of pair.variants.review) {
      review.push({
        kind: "variant",
        confidence: proposal.confidence,
        previousId: proposal.previousId,
        nextId: proposal.nextId,
        previousName: `${pair.previous.displayName} / ${proposal.previousLabel}`,
        nextName: `${pair.next.displayName} / ${proposal.nextLabel}`,
        reason: proposal.reason,
        evidence: proposal.evidence,
      });
    }

    if (pair.variants.gained.length > 0 || pair.variants.lost.length > 0) {
      variantsGained += pair.variants.gained.length;
      variantsLost += pair.variants.lost.length;
      variantChanges.push({
        offeringId: pair.nextId,
        offeringName: pair.next.displayName,
        gained: pair.variants.gained.map((variant) => ({
          id: variant.id,
          label: variant.label,
        })),
        lost: pair.variants.lost.map((variant) => ({
          id: variant.id,
          label: variant.label,
        })),
      });
    }
  }

  for (const proposal of match.review) {
    review.push({
      kind: "offering",
      confidence: proposal.confidence,
      previousId: proposal.previousId,
      nextId: proposal.nextId,
      previousName: proposal.previous.displayName,
      nextName: proposal.next.displayName,
      reason: proposal.reason,
      evidence: proposal.evidence,
    });
  }

  const holdById = (revision: CatalogRevision) =>
    new Map(revision.holds.map((hold) => [hold.id, hold] as const));
  const currentHolds = holdById(current);
  const candidateHolds = holdById(candidate);
  const holdsAdded: HoldChange[] = [];
  const holdsRemoved: HoldChange[] = [];
  for (const [id, hold] of Array.from(candidateHolds.entries()).sort()) {
    if (currentHolds.has(id)) continue;
    holdsAdded.push({
      id,
      displayName: hold.displayName,
      family: hold.family,
      reason: hold.reason,
    });
  }
  for (const [id, hold] of Array.from(currentHolds.entries()).sort()) {
    if (candidateHolds.has(id)) continue;
    holdsRemoved.push({
      id,
      displayName: hold.displayName,
      family: hold.family,
      reason: hold.reason,
    });
  }

  const duplicates: DuplicateGroup[] = [
    ...duplicateSourceRowIssues(current).map((issue) => ({
      revision: current.label,
      sheetRows: issue.sheetRows,
      message: issue.message,
    })),
    ...duplicateSourceRowIssues(candidate).map((issue) => ({
      revision: candidate.label,
      sheetRows: issue.sheetRows,
      message: issue.message,
    })),
  ];

  // Product Control state. Nothing is written and nothing is created; this is
  // only the report an operator needs so no binding is orphaned by a swap.
  const variantContinuityById = new Map<string, IdContinuityEntry>();
  for (const entry of idContinuity) {
    if (entry.kind === "variant") variantContinuityById.set(entry.previousId, entry);
  }
  const currentVariantOwner = new Map<
    string,
    { offering: CatalogRevisionOffering; label: string }
  >();
  for (const offering of current.offerings) {
    for (const variant of offering.variants) {
      currentVariantOwner.set(variant.id, { offering, label: variant.label });
    }
  }
  const candidateVariantIds = new Set<string>();
  for (const offering of candidate.offerings) {
    for (const variant of offering.variants) candidateVariantIds.add(variant.id);
  }
  const retiredOfferingIds = new Set(match.removed.map((offering) => offering.id));
  const reviewedVariantIds = new Set(
    review.filter((item) => item.kind === "variant").map((item) => item.previousId),
  );

  const bindingRisk: BindingRiskItem[] = [];
  for (const binding of [...bindings].sort((left, right) =>
    left.offeringVariantId.localeCompare(right.offeringVariantId),
  )) {
    const owner = currentVariantOwner.get(binding.offeringVariantId);
    const continuity = variantContinuityById.get(binding.offeringVariantId);
    let outcome: BindingOutcome;
    let replacement: string | null = null;
    let note: string;

    if (owner === undefined) {
      outcome = "unknown_to_current_catalog";
      note =
        "This binding points at a variant id that is not in the current catalog at all. It is already stale and cannot be carried forward by this swap.";
    } else if (continuity !== undefined && !continuity.idChanged) {
      outcome = "unchanged";
      replacement = continuity.nextId;
      note = "The variant id is unchanged, so the binding still resolves.";
    } else if (continuity !== undefined) {
      outcome = "id_moved_continuity_available";
      replacement = continuity.nextId;
      note = `The variant id moved. Repoint the binding at ${continuity.nextId}, or regenerate with id pinning, before this dataset ships.`;
    } else if (retiredOfferingIds.has(owner.offering.id)) {
      outcome = "offering_retired";
      note = RETIRED_AND_BOUND_CONSEQUENCE;
    } else if (reviewedVariantIds.has(binding.offeringVariantId)) {
      outcome = "review_required";
      note =
        "Only a below-certain proposal connects this variant to anything in the new catalog. A human has to choose before the binding can be repointed.";
    } else if (!candidateVariantIds.has(binding.offeringVariantId)) {
      outcome = "variant_retired";
      note = RETIRED_AND_BOUND_CONSEQUENCE;
    } else {
      outcome = "unchanged";
      replacement = binding.offeringVariantId;
      note = "The variant id is unchanged, so the binding still resolves.";
    }

    bindingRisk.push({
      offeringVariantId: binding.offeringVariantId,
      productId: binding.productId,
      variantId: binding.variantId,
      outcome,
      replacementOfferingVariantId: replacement,
      offeringName: owner?.offering.displayName ?? null,
      variantLabel: owner?.label ?? null,
      note,
    });
  }

  const offeringIdsPreserved = match.preserved.length;
  const summary: CatalogRevisionDiffSummary = {
    offeringsUnchanged: match.unchanged.length,
    offeringsAdded: match.added.length,
    offeringsRetired: match.removed.length,
    offeringsRenamed: offeringIdsPreserved,
    offeringIdsPreserved,
    offeringIdsChanged: offeringIdsPreserved,
    variantsUnchanged,
    variantIdsPreserved,
    variantIdsChanged: variantIdsPreserved,
    variantsGained,
    variantsLost,
    displayStateTransitions: displayStateTransitions.length,
    holdsAdded: holdsAdded.length,
    holdsRemoved: holdsRemoved.length,
    reviewItems: review.length,
    bindingsAtRisk: bindingRisk.filter((item) => item.outcome !== "unchanged")
      .length,
    canonicalKeyReassignments: match.canonicalKeyReassignments.length,
  };

  const humanAttention: string[] = [];
  if (review.length > 0) {
    humanAttention.push(
      `${counted(review.length, "identity proposal")} below certain ${review.length === 1 ? "was" : "were"} NOT merged. Each one is a rename, split, merge, or reclassification that a person has to confirm.`,
    );
  }
  if (match.canonicalKeyReassignments.length > 0) {
    humanAttention.push(
      `${counted(match.canonicalKeyReassignments.length, "offering")} kept its id while its workbook source IDs changed completely. The id now points at what may be a different product.`,
    );
  }
  if (summary.bindingsAtRisk > 0) {
    humanAttention.push(
      `${counted(summary.bindingsAtRisk, "Product Control binding")} would not resolve cleanly after this swap.`,
    );
  }
  if (bindings.length === 0) {
    humanAttention.push(
      "No Product Control binding inventory was supplied, so no binding was checked. There is no binding store in this tree; supply one with --bindings when it exists.",
    );
  }
  if (summary.offeringsRetired > 0) {
    humanAttention.push(
      `${counted(summary.offeringsRetired, "offering")} retired by this swap. ${RETIRED_AND_BOUND_CONSEQUENCE}`,
    );
  }
  if (summary.variantsLost > 0) {
    humanAttention.push(
      `${counted(summary.variantsLost, "variant")} disappear${summary.variantsLost === 1 ? "s" : ""} from offerings that survive. Each one is an id that stops resolving.`,
    );
  }
  if (duplicates.length > 0) {
    humanAttention.push(
      `${counted(duplicates.length, "duplicate source-row group")} reported by the normalizer across both revisions. Provenance is preserved but the duplication should be reconciled at the source.`,
    );
  }
  for (const limitation of match.limitations) humanAttention.push(limitation);

  return {
    schemaVersion: 1,
    generatedAt,
    current: revisionSummary(current),
    candidate: revisionSummary(candidate),
    confidenceCeiling: match.confidenceCeiling,
    limitations: match.limitations,
    summary,
    idContinuity,
    added: match.added.map(changeRecord),
    retired: match.removed.map(changeRecord),
    renamed: match.preserved.map((pair) => ({
      previousId: pair.previousId,
      nextId: pair.nextId,
      previousName: pair.previous.displayName,
      nextName: pair.next.displayName,
      previousSlug: pair.previous.slug,
      nextSlug: pair.next.slug,
      family: pair.next.family,
      confidence: pair.confidence,
      evidence: pair.evidence,
    })),
    variantChanges,
    displayStateTransitions,
    holdsAdded,
    holdsRemoved,
    duplicates,
    review,
    bindingRisk,
    canonicalKeyReassignments: match.canonicalKeyReassignments,
    humanAttention,
  };
}

/**
 * The id-continuity map on its own: old id to new id, with the evidence and the
 * confidence for each entry. Only certain entries may be applied without a
 * human, and that rule is enforced where the map is used, not here.
 */
export function idContinuityMap(
  diff: CatalogRevisionDiff,
): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const entry of diff.idContinuity) {
    if (entry.confidence !== "certain") continue;
    if (!entry.idChanged) continue;
    map[entry.previousId] = entry.nextId;
  }
  return map;
}
