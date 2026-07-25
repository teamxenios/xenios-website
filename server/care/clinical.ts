import type {
  AppointmentState,
  CareAppointment,
  CareCoveragePolicy,
  ClinicalIntakeDraft,
  ClinicianReview,
  ClinicianReviewAction,
  EligibilityDecision,
  VerifiedEligibilitySignals,
} from "@shared/care/clinical";
import type { CareRecordId } from "@shared/care/contracts";

function normalizedState(value: string | null): string | null {
  return value?.trim().toUpperCase() || null;
}

export function evaluateEligibility(
  verified: VerifiedEligibilitySignals,
  policy: CareCoveragePolicy,
  now: Date,
): EligibilityDecision {
  const state = normalizedState(verified.physicalState);
  const decision = (
    eligible: boolean,
    reason: EligibilityDecision["reason"],
  ): EligibilityDecision => ({
    eligible,
    reason,
    physicalState: state,
    evaluatedAt: now.toISOString(),
    auditRequired: true,
  });

  if (!policy.capabilityEnabled) return decision(false, "care_disabled");
  if (!state || !verified.locationVerifiedAt) return decision(false, "location_unverified");
  if (!policy.supportedStates.includes(state)) return decision(false, "unsupported_state");
  if (!policy.clinicianStates.includes(state)) return decision(false, "clinician_unavailable");
  if (!policy.serviceStates.includes(state)) return decision(false, "service_unavailable");
  if (!verified.identityVerifiedAt) return decision(false, "identity_unverified");
  if (!verified.consentId) return decision(false, "consent_required");
  return decision(true, "eligible");
}

export function createClinicalIntakeDraft(input: {
  id: string;
  patientId: string;
  definitionVersion: string;
  consentId: string;
  createdAt: Date;
}): ClinicalIntakeDraft {
  if (!input.definitionVersion.trim()) throw new Error("intake_definition_version_required");
  if (!input.consentId.trim()) throw new Error("intake_consent_required");
  return {
    id: input.id as CareRecordId,
    patientId: input.patientId,
    definitionVersion: input.definitionVersion,
    consentId: input.consentId,
    status: "draft",
    sections: ["partner_defined"],
    createdAt: input.createdAt.toISOString(),
  };
}

const APPOINTMENT_TRANSITIONS: Readonly<Record<AppointmentState, readonly AppointmentState[]>> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["scheduled", "checked_in", "cancelled", "no_show"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: ["scheduled"],
};

export function transitionAppointment(
  appointment: CareAppointment,
  next: AppointmentState,
  startsAt: string | null = appointment.startsAt,
): CareAppointment {
  if (!APPOINTMENT_TRANSITIONS[appointment.state].includes(next)) {
    throw new Error("invalid_appointment_transition");
  }
  if (next === "scheduled" && !startsAt) throw new Error("appointment_time_required");
  return { ...appointment, state: next, startsAt };
}

const REVIEW_STATUS: Readonly<Record<ClinicianReviewAction, ClinicianReview["status"]>> = {
  review: "in_review",
  request_information: "awaiting_information",
  request_labs: "awaiting_labs",
  approve: "decided",
  decline: "decided",
  no_treatment: "decided",
  follow_up: "in_review",
  draft_care_plan: "in_review",
  prepare_prescription: "in_review",
};

export function applyClinicianReviewAction(
  review: ClinicianReview,
  actor: { clinicianId: string; actorType: "human_clinician" | "automation" | "ai" },
  action: ClinicianReviewAction,
): ClinicianReview {
  if (actor.actorType !== "human_clinician") throw new Error("human_clinician_required");
  if (review.assignedClinicianId !== actor.clinicianId) throw new Error("assigned_clinician_required");
  if (review.status === "decided") throw new Error("review_already_decided");
  const isDecision = ["approve", "decline", "no_treatment"].includes(action);
  return {
    ...review,
    status: REVIEW_STATUS[action],
    lastAction: action,
    finalDecisionSource: isDecision ? "human_clinician" : null,
  };
}
