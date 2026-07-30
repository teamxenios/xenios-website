import {
  parseCareProgramKey,
  type CareEvidenceState,
  type CareProgramKey,
  type CarePublicReadinessStatus,
} from "./programs";

/**
 * The exact 48 contiguous United States in canonical alphabetical order.
 * Alaska and Hawaii are intentionally excluded; no district, territory,
 * military address, foreign jurisdiction, alias, or inferred location is valid.
 */
export const CARE_CONTIGUOUS_STATE_CODES = [
  "AL",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

export type CareContiguousStateCode =
  (typeof CARE_CONTIGUOUS_STATE_CODES)[number];

export const CARE_EXCLUDED_STATE_CODES = ["AK", "HI"] as const;
export type CareExcludedStateCode = (typeof CARE_EXCLUDED_STATE_CODES)[number];

export const CARE_JURISDICTION_CAPABILITY_STATES = [
  "blocked",
  "ready_for_internal_review",
] as const;

export type CareJurisdictionCapabilityState =
  (typeof CARE_JURISDICTION_CAPABILITY_STATES)[number];

export const CARE_JURISDICTION_REASONS = [
  "invalid_program",
  "invalid_jurisdiction",
  "missing_jurisdiction",
  "ambiguous_jurisdiction",
  "credential_unverified",
  "jurisdiction_unverified",
  "predecessor_unverified",
  "ready_for_internal_review",
] as const;

export type CareJurisdictionReason =
  (typeof CARE_JURISDICTION_REASONS)[number];

export interface CareJurisdictionCapabilityFact {
  programKey: CareProgramKey;
  jurisdictionCode: CareContiguousStateCode;
  credentialState: CareEvidenceState;
  jurisdictionState: CareEvidenceState;
  predecessorState: CareEvidenceState;
}

export interface CareJurisdictionCapabilityDecision {
  programKey: CareProgramKey | null;
  jurisdictionCode: CareContiguousStateCode | null;
  state: CareJurisdictionCapabilityState;
  reason: CareJurisdictionReason;
}

export interface CareJurisdictionPublicProjection {
  jurisdictionCode: CareContiguousStateCode | null;
  status: CarePublicReadinessStatus;
  message: string;
}

export function parseCareContiguousStateCode(
  value: unknown,
): CareContiguousStateCode | null {
  return typeof value === "string" &&
    (CARE_CONTIGUOUS_STATE_CODES as readonly string[]).includes(value)
    ? (value as CareContiguousStateCode)
    : null;
}

/**
 * Exact-one resolution prevents facts for another program or state from being
 * combined. There is no state-name normalization or inferred jurisdiction.
 */
export function resolveCareJurisdictionCapability(
  program: unknown,
  jurisdiction: unknown,
  facts: readonly CareJurisdictionCapabilityFact[],
): CareJurisdictionCapabilityDecision {
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
      reason: "missing_jurisdiction",
    };
  }
  if (matches.length !== 1) {
    return {
      programKey,
      jurisdictionCode,
      state: "blocked",
      reason: "ambiguous_jurisdiction",
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

  return {
    programKey,
    jurisdictionCode,
    state: "ready_for_internal_review",
    reason: "ready_for_internal_review",
  };
}

export function projectCareJurisdictionCapability(
  decision: CareJurisdictionCapabilityDecision,
): CareJurisdictionPublicProjection {
  if (decision.jurisdictionCode === null) {
    return {
      jurisdictionCode: null,
      status: "unavailable",
      message: "Care jurisdiction information is unavailable.",
    };
  }

  return {
    jurisdictionCode: decision.jurisdictionCode,
    status: "documentation_pending",
    message: "Care jurisdiction documentation is pending.",
  };
}
