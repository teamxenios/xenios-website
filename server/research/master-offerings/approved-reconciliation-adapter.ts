import type { NormalizedMasterOffering } from "./model";
import {
  validateMasterOfferingReconciliationDecisions,
  type ExistingCatalogIdentity,
  type MasterOfferingReconciliationDecision,
  type MasterOfferingReconciliationIssue,
} from "./reconciliation";

export interface ApprovedMasterOfferingReconciliationEnvelope {
  approval: "approved";
  approvedBy: string;
  approvedAt: string;
  sourceDigest: string;
  decision: MasterOfferingReconciliationDecision;
}
export interface PendingMasterOfferingReconciliationEnvelope {
  approval: "recommended" | "held_for_human_review";
  decision: MasterOfferingReconciliationDecision;
}

export type MasterOfferingReconciliationEnvelope =
  | ApprovedMasterOfferingReconciliationEnvelope
  | PendingMasterOfferingReconciliationEnvelope;

export type CompiledMasterOfferingReconciliation = {
  planningOfferingId: string;
  disposition: MasterOfferingReconciliationDecision["disposition"];
  existingIdentity: ExistingCatalogIdentity | null;
  targetPlanningOfferingId: string | null;
  approvalEvidence: {
    approvedBy: string;
    approvedAt: string;
    sourceDigest: string;
  };
};

export type ApprovedReconciliationCompileResult =
  | {
      ok: true;
      resolutions: readonly CompiledMasterOfferingReconciliation[];
    }
  | {
      ok: false;
      code: "unapproved_decision" | "invalid_approval" | "invalid_decision";
      issues: readonly MasterOfferingReconciliationIssue[];
    };

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return (
    nonBlank(value) &&
    Number.isFinite(Date.parse(value)) &&
    /[zZ]|[+-]\d\d:\d\d$/.test(value)
  );
}

function existingKey(
  source: string,
  productId: string,
  variantId: string | null,
): string {
  return `${source.trim()}|${productId.trim()}|${variantId?.trim() ?? ""}`;
}

/**
 * Compiles already-approved catalog identity decisions into an immutable read
 * plan. Recommendations are refused. This function does not mutate a registry,
 * create a Product Control binding, change an action, or write a database.
 */
export function compileApprovedMasterOfferingReconciliation(
  planning: readonly NormalizedMasterOffering[],
  existing: readonly ExistingCatalogIdentity[],
  envelopes: readonly MasterOfferingReconciliationEnvelope[],
): ApprovedReconciliationCompileResult {
  if (envelopes.some((entry) => entry.approval !== "approved")) {
    return { ok: false, code: "unapproved_decision", issues: [] };
  }

  const approved = envelopes as readonly ApprovedMasterOfferingReconciliationEnvelope[];
  if (
    approved.some(
      (entry) =>
        !nonBlank(entry.approvedBy) ||
        !validTimestamp(entry.approvedAt) ||
        !/^[a-f0-9]{64}$/i.test(entry.sourceDigest),
    )
  ) {
    return { ok: false, code: "invalid_approval", issues: [] };
  }

  const decisions = approved.map((entry) => entry.decision);
  const validation = validateMasterOfferingReconciliationDecisions(
    planning,
    existing,
    decisions,
  );
  if (!validation.ok) {
    return { ok: false, code: "invalid_decision", issues: validation.issues };
  }

  const existingByKey = new Map(
    existing.map((identity) => [
      existingKey(identity.source, identity.productId, identity.variantId),
      identity,
    ]),
  );
  return {
    ok: true,
    resolutions: approved
      .map((entry) => {
        const { decision } = entry;
        const existingIdentity =
          decision.existingSource && decision.existingProductId
            ? (existingByKey.get(
                existingKey(
                  decision.existingSource,
                  decision.existingProductId,
                  decision.existingVariantId,
                ),
              ) ?? null)
            : null;
        return {
          planningOfferingId: decision.planningOfferingId,
          disposition: decision.disposition,
          existingIdentity,
          targetPlanningOfferingId: decision.targetPlanningOfferingId,
          approvalEvidence: {
            approvedBy: entry.approvedBy,
            approvedAt: entry.approvedAt,
            sourceDigest: entry.sourceDigest.toLowerCase(),
          },
        } satisfies CompiledMasterOfferingReconciliation;
      })
      .sort((left, right) =>
        left.planningOfferingId.localeCompare(right.planningOfferingId),
      ),
  };
}
