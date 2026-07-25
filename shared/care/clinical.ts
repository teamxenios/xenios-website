import type { CareRecordId } from "./contracts";

export const ELIGIBILITY_REASONS = [
  "eligible",
  "care_disabled",
  "location_unverified",
  "unsupported_state",
  "clinician_unavailable",
  "service_unavailable",
  "identity_unverified",
  "consent_required",
] as const;

export type EligibilityReason = (typeof ELIGIBILITY_REASONS)[number];

export interface VerifiedEligibilitySignals {
  patientId: string;
  physicalState: string | null;
  locationVerifiedAt: string | null;
  identityVerifiedAt: string | null;
  consentId: string | null;
}

export interface CareCoveragePolicy {
  capabilityEnabled: boolean;
  supportedStates: readonly string[];
  clinicianStates: readonly string[];
  serviceStates: readonly string[];
}

export interface EligibilityDecision {
  eligible: boolean;
  reason: EligibilityReason;
  physicalState: string | null;
  evaluatedAt: string;
  auditRequired: true;
}

export interface ClinicalIntakeDraft {
  id: CareRecordId;
  patientId: string;
  definitionVersion: string;
  consentId: string;
  status: "draft";
  sections: readonly ["partner_defined"];
  createdAt: string;
}

export const APPOINTMENT_STATES = [
  "requested",
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

export interface CareAppointment {
  id: CareRecordId;
  patientId: string;
  clinicianId: string | null;
  state: AppointmentState;
  startsAt: string | null;
  mode: "telehealth";
  providerDisplayName: null;
}

export const CLINICIAN_REVIEW_ACTIONS = [
  "review",
  "request_information",
  "request_labs",
  "approve",
  "decline",
  "no_treatment",
  "follow_up",
  "draft_care_plan",
  "prepare_prescription",
] as const;

export type ClinicianReviewAction = (typeof CLINICIAN_REVIEW_ACTIONS)[number];

export interface ClinicianReview {
  id: CareRecordId;
  patientId: string;
  assignedClinicianId: string;
  status: "assigned" | "in_review" | "awaiting_information" | "awaiting_labs" | "decided";
  lastAction: ClinicianReviewAction | null;
  finalDecisionSource: "human_clinician" | null;
}
