import type { MasterOfferingFamily } from "@shared/research/master-offerings/contract";
import type { NormalizedMasterOffering } from "./model";

export const MASTER_OFFERING_RECONCILIATION_DISPOSITIONS = [
  "new_canonical_offering",
  "bind_existing_product",
  "add_variant_to_existing_product",
  "merge_duplicate_planning_rows",
  "hold_for_review",
  "exclude",
] as const;

export type MasterOfferingReconciliationDisposition =
  (typeof MASTER_OFFERING_RECONCILIATION_DISPOSITIONS)[number];

/**
 * The minimum safe identity an existing repository registry exposes to the
 * reconciliation process. No price, supplier, readiness, inventory, or commerce
 * field belongs here.
 */
export interface ExistingCatalogIdentity {
  source: string;
  productId: string;
  variantId: string | null;
  canonicalKey: string;
  family: MasterOfferingFamily;
  displayName: string;
}

export interface MasterOfferingReconciliationCandidate {
  planningOfferingId: string;
  planningCanonicalKey: string;
  planningDisplayName: string;
  planningFamily: MasterOfferingFamily;
  exactMatches: readonly ExistingCatalogIdentity[];
  suggestedDisposition:
    | "new_canonical_offering"
    | "bind_existing_product"
    | "hold_for_review";
  requiresHumanReview: boolean;
}

export interface MasterOfferingReconciliationDecision {
  planningOfferingId: string;
  disposition: MasterOfferingReconciliationDisposition;
  existingSource: string | null;
  existingProductId: string | null;
  existingVariantId: string | null;
  targetPlanningOfferingId: string | null;
  reviewedBy: string;
  reviewedAt: string;
  reason: string;
}

export interface MasterOfferingReconciliationIssue {
  code:
    | "duplicate_decision"
    | "unknown_planning_offering"
    | "unknown_existing_target"
    | "unknown_planning_merge_target"
    | "self_merge"
    | "missing_existing_target"
    | "unexpected_existing_target"
    | "missing_planning_merge_target"
    | "unexpected_planning_merge_target"
    | "family_mismatch"
    | "missing_reviewer"
    | "invalid_reviewed_at"
    | "missing_reason";
  planningOfferingId: string;
  message: string;
}

export interface MasterOfferingReconciliationValidation {
  ok: boolean;
  issues: readonly MasterOfferingReconciliationIssue[];
}

function identityKey(
  source: string,
  productId: string,
  variantId: string | null,
): string {
  return `${source.trim()}|${productId.trim()}|${variantId?.trim() ?? ""}`;
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: string): boolean {
  if (!nonBlank(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && /[zZ]|[+-]\d\d:\d\d$/.test(value);
}

/**
 * Produce exact-key worklist candidates only. This function never binds or merges
 * a record. Search aliases and fuzzy text are intentionally irrelevant here.
 */
export function buildMasterOfferingReconciliationCandidates(
  planning: readonly NormalizedMasterOffering[],
  existing: readonly ExistingCatalogIdentity[],
): readonly MasterOfferingReconciliationCandidate[] {
  const byCanonicalKey = new Map<string, ExistingCatalogIdentity[]>();
  for (const identity of existing) {
    byCanonicalKey.set(identity.canonicalKey, [
      ...(byCanonicalKey.get(identity.canonicalKey) ?? []),
      identity,
    ]);
  }

  return planning
    .map((offering) => {
      const exactMatches = [...(byCanonicalKey.get(offering.canonicalKey) ?? [])]
        .sort((left, right) =>
          identityKey(left.source, left.productId, left.variantId).localeCompare(
            identityKey(right.source, right.productId, right.variantId),
          ),
        );
      return {
        planningOfferingId: offering.id,
        planningCanonicalKey: offering.canonicalKey,
        planningDisplayName: offering.displayName,
        planningFamily: offering.family,
        exactMatches,
        suggestedDisposition:
          exactMatches.length === 0
            ? "new_canonical_offering"
            : exactMatches.length === 1
              ? "bind_existing_product"
              : "hold_for_review",
        requiresHumanReview: exactMatches.length > 0,
      } satisfies MasterOfferingReconciliationCandidate;
    })
    .sort((left, right) =>
      `${left.planningFamily}|${left.planningDisplayName}|${left.planningOfferingId}`.localeCompare(
        `${right.planningFamily}|${right.planningDisplayName}|${right.planningOfferingId}`,
      ),
    );
}

/**
 * Validate reviewed decisions without applying them. The output cannot create a
 * Product Control binding or customer action.
 */
export function validateMasterOfferingReconciliationDecisions(
  planning: readonly NormalizedMasterOffering[],
  existing: readonly ExistingCatalogIdentity[],
  decisions: readonly MasterOfferingReconciliationDecision[],
): MasterOfferingReconciliationValidation {
  const issues: MasterOfferingReconciliationIssue[] = [];
  const planningById = new Map(planning.map((offering) => [offering.id, offering]));
  const existingByKey = new Map(
    existing.map((identity) => [
      identityKey(identity.source, identity.productId, identity.variantId),
      identity,
    ]),
  );
  const seen = new Set<string>();

  for (const decision of decisions) {
    const id = decision.planningOfferingId;
    if (seen.has(id)) {
      issues.push({
        code: "duplicate_decision",
        planningOfferingId: id,
        message: "Only one reviewed reconciliation decision may exist per planning offering.",
      });
    }
    seen.add(id);

    const offering = planningById.get(id);
    if (!offering) {
      issues.push({
        code: "unknown_planning_offering",
        planningOfferingId: id,
        message: "The decision references a planning offering that is not in this catalog version.",
      });
    }

    if (!nonBlank(decision.reviewedBy)) {
      issues.push({
        code: "missing_reviewer",
        planningOfferingId: id,
        message: "A named reviewer is required.",
      });
    }
    if (!validTimestamp(decision.reviewedAt)) {
      issues.push({
        code: "invalid_reviewed_at",
        planningOfferingId: id,
        message: "reviewedAt must be a timezone-qualified ISO timestamp.",
      });
    }
    if (!nonBlank(decision.reason)) {
      issues.push({
        code: "missing_reason",
        planningOfferingId: id,
        message: "A reconciliation reason is required.",
      });
    }

    const requiresExisting =
      decision.disposition === "bind_existing_product" ||
      decision.disposition === "add_variant_to_existing_product";
    const hasAnyExisting =
      nonBlank(decision.existingSource) ||
      nonBlank(decision.existingProductId) ||
      nonBlank(decision.existingVariantId);

    let target: ExistingCatalogIdentity | undefined;
    if (requiresExisting) {
      if (!nonBlank(decision.existingSource) || !nonBlank(decision.existingProductId)) {
        issues.push({
          code: "missing_existing_target",
          planningOfferingId: id,
          message: "This disposition requires an existing source and product ID.",
        });
      } else {
        target = existingByKey.get(
          identityKey(
            decision.existingSource,
            decision.existingProductId,
            decision.existingVariantId,
          ),
        );
        if (!target) {
          issues.push({
            code: "unknown_existing_target",
            planningOfferingId: id,
            message: "The reviewed existing target is not present in the supplied registry identities.",
          });
        }
      }
    } else if (hasAnyExisting) {
      issues.push({
        code: "unexpected_existing_target",
        planningOfferingId: id,
        message: "This disposition must not carry an existing product target.",
      });
    }

    const requiresPlanningTarget =
      decision.disposition === "merge_duplicate_planning_rows";
    if (requiresPlanningTarget) {
      if (!nonBlank(decision.targetPlanningOfferingId)) {
        issues.push({
          code: "missing_planning_merge_target",
          planningOfferingId: id,
          message: "A duplicate-merge decision requires a target planning offering ID.",
        });
      } else if (decision.targetPlanningOfferingId === id) {
        issues.push({
          code: "self_merge",
          planningOfferingId: id,
          message: "A planning offering cannot merge into itself.",
        });
      } else if (!planningById.has(decision.targetPlanningOfferingId)) {
        issues.push({
          code: "unknown_planning_merge_target",
          planningOfferingId: id,
          message: "The planning merge target is not in this catalog version.",
        });
      }
    } else if (nonBlank(decision.targetPlanningOfferingId)) {
      issues.push({
        code: "unexpected_planning_merge_target",
        planningOfferingId: id,
        message: "Only a duplicate-merge decision may carry a planning merge target.",
      });
    }

    if (offering && target && offering.family !== target.family) {
      issues.push({
        code: "family_mismatch",
        planningOfferingId: id,
        message: "The planning and existing records are in different families and cannot be bound without a revised reviewed decision.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
