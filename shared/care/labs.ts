import {
  parseCareContiguousStateCode,
  type CareContiguousStateCode,
} from "./jurisdiction-capabilities";
import {
  parseCareProgramKey,
  type CareEvidenceState,
  type CareProgramKey,
  type CarePublicReadinessStatus,
} from "./programs";

export const CARE_LAB_WORKFLOW_STATES = [
  "blocked",
  "documentation_pending",
  "reference_review_pending",
  "ready_for_internal_review",
  "closed",
] as const;

export type CareLabWorkflowState =
  (typeof CARE_LAB_WORKFLOW_STATES)[number];

export const CARE_LAB_PREDECESSOR_STATES = [
  "missing",
  "pending",
  "complete",
  "cancelled",
] as const;

export type CareLabPredecessorState =
  (typeof CARE_LAB_PREDECESSOR_STATES)[number];

export const CARE_LAB_READINESS_REASONS = [
  "invalid_program",
  "invalid_jurisdiction",
  "missing_context",
  "ambiguous_context",
  "credential_unverified",
  "jurisdiction_unverified",
  "predecessor_unverified",
  "reference_unverified",
  "workflow_blocked",
  "invalid_workflow_state",
  "documentation_pending",
  "ready_for_internal_review",
  "closed",
] as const;

export type CareLabReadinessReason =
  (typeof CARE_LAB_READINESS_REASONS)[number];

/**
 * Architecture context only. It does not represent an order, result, range,
 * interpretation, provider, patient, or laboratory identity.
 */
export interface CareLabReadinessFact {
  programKey: CareProgramKey;
  jurisdictionCode: CareContiguousStateCode;
  credentialState: CareEvidenceState;
  jurisdictionState: CareEvidenceState;
  predecessorState: CareLabPredecessorState;
  referenceState: CareEvidenceState;
  workflowState: CareLabWorkflowState;
}

export interface CareLabReadinessDecision {
  programKey: CareProgramKey | null;
  jurisdictionCode: CareContiguousStateCode | null;
  state: CareLabWorkflowState;
  reason: CareLabReadinessReason;
}

export interface CareLabPublicProjection {
  status: CarePublicReadinessStatus;
}

const ALLOWED_LAB_TRANSITIONS: Readonly<
  Record<CareLabWorkflowState, readonly CareLabWorkflowState[]>
> = {
  blocked: [],
  documentation_pending: ["reference_review_pending"],
  reference_review_pending: ["ready_for_internal_review"],
  ready_for_internal_review: ["closed"],
  closed: [],
};

export function isCareLabTransitionAllowed(
  current: unknown,
  next: unknown,
): boolean {
  if (
    typeof current !== "string" ||
    typeof next !== "string" ||
    !(CARE_LAB_WORKFLOW_STATES as readonly string[]).includes(current) ||
    !(CARE_LAB_WORKFLOW_STATES as readonly string[]).includes(next)
  ) {
    return false;
  }
  return ALLOWED_LAB_TRANSITIONS[current as CareLabWorkflowState].includes(
    next as CareLabWorkflowState,
  );
}

export function resolveCareLabReadiness(
  program: unknown,
  jurisdiction: unknown,
  facts: readonly CareLabReadinessFact[],
): CareLabReadinessDecision {
  const programKey = parseCareProgramKey(program);
  if (programKey === null) {
    return {
      programKey: null,
      jurisdictionCode: null,
      state: "blocked",
      reason: "invalid_program",
    };
  }

  const jurisdictionCode = parseCareContiguousStateCode(jurisdiction);
  if (jurisdictionCode === null) {
    return {
      programKey,
      jurisdictionCode: null,
      state: "blocked",
      reason: "invalid_jurisdiction",
    };
  }

  const matches = facts.filter(
    (fact) =>
      fact.programKey === programKey &&
      fact.jurisdictionCode === jurisdictionCode,
  );
  if (matches.length === 0) {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "missing_context",
    };
  }
  if (matches.length !== 1) {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "ambiguous_context",
    };
  }

  const fact = matches[0];
  if (fact.credentialState !== "verified") {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "credential_unverified",
    };
  }
  if (fact.jurisdictionState !== "verified") {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "jurisdiction_unverified",
    };
  }
  if (fact.predecessorState !== "complete") {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "predecessor_unverified",
    };
  }
  if (fact.referenceState !== "verified") {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "reference_unverified",
    };
  }
  if (
    !(CARE_LAB_WORKFLOW_STATES as readonly unknown[]).includes(
      fact.workflowState,
    )
  ) {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "invalid_workflow_state",
    };
  }
  if (fact.workflowState === "blocked") {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "workflow_blocked",
    };
  }
  if (fact.workflowState === "closed") {
    return {
      programKey,
      jurisdictionCode,
      state: "closed",
      reason: "closed",
    };
  }
  if (fact.workflowState !== "ready_for_internal_review") {
    return {
      programKey,
      jurisdictionCode,
      state: "documentation_pending",
      reason: "documentation_pending",
    };
  }

  return {
    programKey,
    jurisdictionCode,
    state: "ready_for_internal_review",
    reason: "ready_for_internal_review",
  };
}

export function projectCareLabReadiness(
  decision: CareLabReadinessDecision,
): CareLabPublicProjection {
  if (
    decision.state !== "documentation_pending" &&
    decision.state !== "reference_review_pending" &&
    decision.state !== "ready_for_internal_review"
  ) {
    return { status: "unavailable" };
  }
  return { status: "documentation_pending" };
}
