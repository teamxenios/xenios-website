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
  "ready_for_internal_review",
] as const;

export type CareLabWorkflowState =
  (typeof CARE_LAB_WORKFLOW_STATES)[number];

export const CARE_LAB_READINESS_REASONS = [
  "invalid_program",
  "invalid_jurisdiction",
  "missing_context",
  "ambiguous_context",
  "credential_unverified",
  "jurisdiction_unverified",
  "predecessor_unverified",
  "reference_unverified",
  "documentation_pending",
  "ready_for_internal_review",
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
  predecessorState: CareEvidenceState;
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
  message: string;
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
  if (fact.predecessorState !== "verified") {
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
  if (decision.state === "blocked") {
    return {
      status: "unavailable",
      message: "Care laboratory information is unavailable.",
    };
  }
  return {
    status: "documentation_pending",
    message: "Care laboratory documentation is pending.",
  };
}
