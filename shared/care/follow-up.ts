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

export const CARE_FOLLOW_UP_STATES = [
  "blocked",
  "documentation_pending",
  "review_pending",
  "ready_for_internal_review",
  "closed",
] as const;

export type CareFollowUpState = (typeof CARE_FOLLOW_UP_STATES)[number];

export const CARE_FOLLOW_UP_PREDECESSOR_STATES = [
  "missing",
  "pending",
  "complete",
  "cancelled",
] as const;

export type CareFollowUpPredecessorState =
  (typeof CARE_FOLLOW_UP_PREDECESSOR_STATES)[number];

export const CARE_FOLLOW_UP_REASONS = [
  "invalid_program",
  "invalid_jurisdiction",
  "missing_context",
  "ambiguous_context",
  "credential_unverified",
  "jurisdiction_unverified",
  "predecessor_unverified",
  "workflow_blocked",
  "invalid_workflow_state",
  "documentation_pending",
  "ready_for_internal_review",
  "closed",
] as const;

export type CareFollowUpReason = (typeof CARE_FOLLOW_UP_REASONS)[number];

/**
 * Architecture context only. It contains no patient, provider, message, result,
 * clinical interpretation, payment, product, or supplier field.
 */
export interface CareFollowUpReadinessFact {
  programKey: CareProgramKey;
  jurisdictionCode: CareContiguousStateCode;
  credentialState: CareEvidenceState;
  jurisdictionState: CareEvidenceState;
  predecessorState: CareFollowUpPredecessorState;
  workflowState: CareFollowUpState;
}

export interface CareFollowUpReadinessDecision {
  programKey: CareProgramKey | null;
  jurisdictionCode: CareContiguousStateCode | null;
  state: CareFollowUpState;
  reason: CareFollowUpReason;
}

export interface CareFollowUpPublicProjection {
  status: CarePublicReadinessStatus;
}

const ALLOWED_FOLLOW_UP_TRANSITIONS: Readonly<
  Record<CareFollowUpState, readonly CareFollowUpState[]>
> = {
  blocked: [],
  documentation_pending: ["review_pending"],
  review_pending: ["ready_for_internal_review"],
  ready_for_internal_review: ["closed"],
  closed: [],
};

export function isCareFollowUpTransitionAllowed(
  current: unknown,
  next: unknown,
): boolean {
  if (
    typeof current !== "string" ||
    typeof next !== "string" ||
    !(CARE_FOLLOW_UP_STATES as readonly string[]).includes(current) ||
    !(CARE_FOLLOW_UP_STATES as readonly string[]).includes(next)
  ) {
    return false;
  }
  return ALLOWED_FOLLOW_UP_TRANSITIONS[current as CareFollowUpState].includes(
    next as CareFollowUpState,
  );
}

export function resolveCareFollowUpReadiness(
  program: unknown,
  jurisdiction: unknown,
  facts: readonly CareFollowUpReadinessFact[],
): CareFollowUpReadinessDecision {
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
  if (
    !(CARE_FOLLOW_UP_STATES as readonly unknown[]).includes(
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

export function projectCareFollowUpReadiness(
  decision: CareFollowUpReadinessDecision,
): CareFollowUpPublicProjection {
  if (
    decision.state !== "documentation_pending" &&
    decision.state !== "review_pending" &&
    decision.state !== "ready_for_internal_review"
  ) {
    return { status: "unavailable" };
  }
  return { status: "documentation_pending" };
}
