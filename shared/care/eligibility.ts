import type { CareRecordId } from "./contracts";
import type { CareConsentStatus } from "./consent";

export const CARE_IDENTITY_STATES = [
  "unverified",
  "pending",
  "verified",
  "rejected",
] as const;

export type CareIdentityState = (typeof CARE_IDENTITY_STATES)[number];

export interface CarePatientLocation {
  id: CareRecordId;
  patientId: CareRecordId;
  stateCode: string;
  source: "patient_attestation" | "approved_identity_provider";
  attestedAt: string;
  supersedesLocationId: CareRecordId | null;
}

export interface CareCoverageSnapshot {
  stateCode: string;
  supportedStateActive: boolean;
  serviceCoverageActive: boolean;
  waitlistEnabled: boolean;
  activeClinicianCount: number;
}

export interface CarePatientIdentity {
  patientId: CareRecordId;
  state: CareIdentityState;
  verifiedAt: string | null;
}

export interface CareEligibilityContext {
  patientId: CareRecordId;
  capabilityEnabled: boolean;
  location: CarePatientLocation | null;
  identity: CarePatientIdentity;
  coverage: CareCoverageSnapshot | null;
  telehealthConsent: CareConsentStatus;
  privacyConsent: CareConsentStatus;
}

export const CARE_ELIGIBILITY_REASONS = [
  "care_disabled",
  "location_required",
  "invalid_state",
  "unsupported_state",
  "service_unavailable",
  "clinician_coverage_unavailable",
  "identity_unverified",
  "telehealth_consent_required",
  "privacy_notice_required",
  "intake_foundation_ready",
] as const;

export type CareEligibilityReason = (typeof CARE_ELIGIBILITY_REASONS)[number];

export interface CareEligibilityDecision {
  patientId: CareRecordId;
  outcome:
    | "unavailable"
    | "waitlist_available"
    | "consent_required"
    | "intake_available";
  reason: CareEligibilityReason;
  stateCode: string | null;
  careEligibilityCleared: false;
  evaluatedAt: string;
  auditRequired: true;
}

export interface CareEligibilityCheck {
  id: CareRecordId;
  patientId: CareRecordId;
  locationId: CareRecordId | null;
  decision: CareEligibilityDecision;
}

export interface CareWaitlistEvent {
  id: CareRecordId;
  patientId: CareRecordId;
  stateCode: string;
  action: "joined" | "withdrawn";
  occurredAt: string;
}
