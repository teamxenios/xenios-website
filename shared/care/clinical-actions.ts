import type { CareClinicianReviewAction } from "./clinician-review";

/**
 * Care clinical capability flags.
 *
 * Every capability that could produce a real clinical effect is named here and
 * defaults to FALSE. A control whose capability is false is still rendered, so
 * the workflow is visible and reviewable, but it renders visibly disabled with
 * a plain explanation and there is no code path from it to a clinical write.
 *
 * Two independent gates must both be open before any clinical action control
 * can become enabled:
 *   1. the Care capability status (`enabled`), which requires the approved
 *      database record plus the deployment approval flags, and
 *   2. the specific capability flag below.
 * Either one being false keeps the control disabled, so this fails closed.
 */
export const CARE_CLINICAL_CAPABILITIES = [
  "provider_actions",
  "prescribing",
  "clinical_fulfillment",
  "external_communications",
  "real_patient_data",
] as const;

export type CareClinicalCapability =
  (typeof CARE_CLINICAL_CAPABILITIES)[number];

export type CareClinicalCapabilityFlags = Readonly<
  Record<CareClinicalCapability, boolean>
>;

/** The shipped state. Nothing clinical is active. */
export const CARE_CLINICAL_CAPABILITIES_DISABLED: CareClinicalCapabilityFlags = {
  provider_actions: false,
  prescribing: false,
  clinical_fulfillment: false,
  external_communications: false,
  real_patient_data: false,
};

export const CARE_CLINICAL_CAPABILITY_ENV_KEYS: Readonly<
  Record<CareClinicalCapability, string>
> = {
  provider_actions: "CARE_PROVIDER_ACTIONS_ENABLED",
  prescribing: "CARE_PRESCRIBING_ENABLED",
  clinical_fulfillment: "CARE_CLINICAL_FULFILLMENT_ENABLED",
  external_communications: "CARE_EXTERNAL_COMMUNICATIONS_ENABLED",
  real_patient_data: "CARE_REAL_PATIENT_DATA_ENABLED",
};

/** Which capability each clinician review action would depend on. */
export const CARE_REVIEW_ACTION_CAPABILITY: Readonly<
  Record<CareClinicianReviewAction, CareClinicalCapability>
> = {
  review: "provider_actions",
  request_information: "external_communications",
  request_labs: "clinical_fulfillment",
  follow_up: "provider_actions",
  approve: "provider_actions",
  decline: "provider_actions",
  no_treatment: "provider_actions",
};

export const CARE_REVIEW_ACTION_LABELS: Readonly<
  Record<CareClinicianReviewAction, string>
> = {
  review: "Start review",
  request_information: "Request more information",
  request_labs: "Request labs",
  follow_up: "Schedule follow up",
  approve: "Approve",
  decline: "Decline",
  no_treatment: "Record no treatment",
};

/** Actions that record a final clinical decision. */
export const CARE_REVIEW_DECISION_ACTIONS = [
  "approve",
  "decline",
  "no_treatment",
] as const;

export type CareClinicalActionBlockReason =
  | "care_not_active"
  | "capability_disabled"
  | "review_already_decided"
  | "appointment_completion_required";

export interface CareClinicalActionState {
  action: CareClinicianReviewAction;
  label: string;
  capability: CareClinicalCapability;
  enabled: boolean;
  blockedReason: CareClinicalActionBlockReason | null;
  explanation: string;
}

const CAPABILITY_EXPLANATIONS: Readonly<
  Record<CareClinicalCapability, string>
> = {
  provider_actions:
    "Provider actions are turned off. This control is shown so the review workflow is visible, and it cannot be used.",
  prescribing:
    "Prescribing is turned off. No prescription can be created or signed from this screen.",
  clinical_fulfillment:
    "Clinical fulfillment is turned off. No lab, pharmacy, or order request can leave this screen.",
  external_communications:
    "Outbound communication is turned off. Nothing is sent to a patient from this screen.",
  real_patient_data:
    "Real patient data is turned off. This screen shows workflow state only.",
};

const REASON_EXPLANATIONS: Readonly<
  Record<
    Exclude<CareClinicalActionBlockReason, "capability_disabled">,
    string
  >
> = {
  care_not_active:
    "Care is not active yet, so no clinical action can be recorded here.",
  review_already_decided:
    "This review already has a recorded decision, so it cannot be changed from this screen.",
  appointment_completion_required:
    "The assigned clinician has to complete the appointment before a decision can be recorded.",
};

export function careClinicalActionExplanation(
  reason: CareClinicalActionBlockReason,
  capability: CareClinicalCapability,
): string {
  return reason === "capability_disabled"
    ? CAPABILITY_EXPLANATIONS[capability]
    : REASON_EXPLANATIONS[reason];
}

function isDecisionAction(action: CareClinicianReviewAction): boolean {
  return (CARE_REVIEW_DECISION_ACTIONS as readonly string[]).includes(action);
}

/**
 * Decide whether one clinician review action may be offered as usable.
 *
 * Pure, deterministic, and fail closed. The order of the checks is the order a
 * reviewer would ask them, and the first blocking answer is the one explained
 * to the clinician.
 */
export function careReviewActionState(input: {
  action: CareClinicianReviewAction;
  careEnabled: boolean;
  flags: CareClinicalCapabilityFlags;
  reviewDecided: boolean;
  appointmentCompleted: boolean;
}): CareClinicalActionState {
  const capability = CARE_REVIEW_ACTION_CAPABILITY[input.action];
  const label = CARE_REVIEW_ACTION_LABELS[input.action];
  const blocked = (
    reason: CareClinicalActionBlockReason,
  ): CareClinicalActionState => ({
    action: input.action,
    label,
    capability,
    enabled: false,
    blockedReason: reason,
    explanation: careClinicalActionExplanation(reason, capability),
  });

  if (!input.careEnabled) return blocked("care_not_active");
  if (!input.flags[capability]) return blocked("capability_disabled");
  if (input.reviewDecided) return blocked("review_already_decided");
  if (isDecisionAction(input.action) && !input.appointmentCompleted) {
    return blocked("appointment_completion_required");
  }
  return {
    action: input.action,
    label,
    capability,
    enabled: true,
    blockedReason: null,
    explanation: "",
  };
}
