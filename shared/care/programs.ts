/**
 * Architecture-only Care program identities and readiness.
 *
 * These keys belong to the Care rail. They are not Research product, variant,
 * SKU, catalog-name, price, inventory, or order identities.
 */
export const CARE_PROGRAM_KEYS = [
  "care_program:glp_care",
  "care_program:quantum_ev",
] as const;

export type CareProgramKey = (typeof CARE_PROGRAM_KEYS)[number];

export const CARE_EVIDENCE_STATES = [
  "missing",
  "pending",
  "verified",
  "rejected",
  "expired",
] as const;

export type CareEvidenceState = (typeof CARE_EVIDENCE_STATES)[number];

export const CARE_PROGRAM_DEFINITION_STATES = [
  "missing",
  "pending",
  "verified",
  "rejected",
] as const;

export type CareProgramDefinitionState =
  (typeof CARE_PROGRAM_DEFINITION_STATES)[number];

export const CARE_PROGRAM_READINESS_STATES = [
  "blocked",
  "ready_for_internal_review",
] as const;

export type CareProgramReadinessState =
  (typeof CARE_PROGRAM_READINESS_STATES)[number];

export const CARE_PROGRAM_READINESS_REASONS = [
  "invalid_program",
  "missing_program",
  "ambiguous_program",
  "program_definition_unverified",
  "credential_unverified",
  "jurisdiction_unverified",
  "predecessor_unverified",
  "ready_for_internal_review",
] as const;

export type CareProgramReadinessReason =
  (typeof CARE_PROGRAM_READINESS_REASONS)[number];

/**
 * One fact is an internal architecture input, not a provider or patient record.
 * It deliberately contains no person, roster, product, price, or supplier field.
 */
export interface CareProgramReadinessFact {
  programKey: CareProgramKey;
  definitionState: CareProgramDefinitionState;
  credentialState: CareEvidenceState;
  jurisdictionState: CareEvidenceState;
  predecessorState: CareEvidenceState;
}

export interface CareProgramReadinessDecision {
  programKey: CareProgramKey | null;
  state: CareProgramReadinessState;
  reason: CareProgramReadinessReason;
}

export const CARE_PUBLIC_READINESS_STATUSES = [
  "unavailable",
  "documentation_pending",
] as const;

export type CarePublicReadinessStatus =
  (typeof CARE_PUBLIC_READINESS_STATUSES)[number];

/**
 * Count-free and evidence-free public projection. It cannot imply activation.
 */
export interface CareProgramPublicProjection {
  programKey: CareProgramKey | null;
  status: CarePublicReadinessStatus;
  message: string;
}

export function parseCareProgramKey(value: unknown): CareProgramKey | null {
  return typeof value === "string" &&
    (CARE_PROGRAM_KEYS as readonly string[]).includes(value)
    ? (value as CareProgramKey)
    : null;
}

/**
 * Requires exactly one fact for the exact opaque program key. Missing,
 * duplicated, aliased, or incomplete facts stay blocked.
 */
export function resolveCareProgramReadiness(
  program: unknown,
  facts: readonly CareProgramReadinessFact[],
): CareProgramReadinessDecision {
  const programKey = parseCareProgramKey(program);
  if (programKey === null) {
    return { programKey: null, state: "blocked", reason: "invalid_program" };
  }

  const matches = facts.filter((fact) => fact.programKey === programKey);
  if (matches.length === 0) {
    return { programKey, state: "blocked", reason: "missing_program" };
  }
  if (matches.length !== 1) {
    return { programKey, state: "blocked", reason: "ambiguous_program" };
  }

  const fact = matches[0];
  if (fact.definitionState !== "verified") {
    return {
      programKey,
      state: "blocked",
      reason: "program_definition_unverified",
    };
  }
  if (fact.credentialState !== "verified") {
    return { programKey, state: "blocked", reason: "credential_unverified" };
  }
  if (fact.jurisdictionState !== "verified") {
    return { programKey, state: "blocked", reason: "jurisdiction_unverified" };
  }
  if (fact.predecessorState !== "verified") {
    return { programKey, state: "blocked", reason: "predecessor_unverified" };
  }

  return {
    programKey,
    state: "ready_for_internal_review",
    reason: "ready_for_internal_review",
  };
}

/**
 * Internal-review readiness still projects as documentation pending. A separate
 * future server-owned activation decision would be required for stronger copy.
 */
export function projectCareProgramReadiness(
  decision: CareProgramReadinessDecision,
): CareProgramPublicProjection {
  if (decision.programKey === null) {
    return {
      programKey: null,
      status: "unavailable",
      message: "This Care program is not currently available.",
    };
  }

  return {
    programKey: decision.programKey,
    status: "documentation_pending",
    message: "Care program documentation is pending.",
  };
}
