import type { CareAppointmentStatus } from "./appointments";
import type { CareConsentKind, CareConsentStatus } from "./consent";
import type {
  CareClinicianDecision,
  CareClinicianReviewStatus,
} from "./clinician-review";
import type { CareRecordId } from "./contracts";

/**
 * The clinician review queue projection.
 *
 * This is deliberately a WORKFLOW view, not a clinical record. It carries no
 * patient identifier, no clinician name, no state code, and no intake answer.
 * The server builds it, so the browser never receives the underlying
 * identifiers in the first place.
 */

export const CARE_REVIEW_INTAKE_STATES = [
  "submitted",
  "in_progress",
  "missing",
] as const;

export type CareReviewIntakeState =
  (typeof CARE_REVIEW_INTAKE_STATES)[number];

export interface CareReviewConsentSummary {
  kind: CareConsentKind;
  satisfied: boolean;
  reason: CareConsentStatus["reason"];
}

export interface CareReviewQueueItem {
  reviewId: CareRecordId;
  status: CareClinicianReviewStatus;
  decision: CareClinicianDecision | null;
  appointmentStatus: CareAppointmentStatus | null;
  intakeState: CareReviewIntakeState;
  consentComplete: boolean;
  version: number;
  updatedAt: string;
}

export interface CareReviewAppointmentSummary {
  status: CareAppointmentStatus | null;
  scheduled: boolean;
  completed: boolean;
  telehealthReady: boolean;
}

export interface CareReviewIntakeSummary {
  state: CareReviewIntakeState;
  definitionVersion: string | null;
  submittedAt: string | null;
}

export interface CareReviewDetail extends CareReviewQueueItem {
  decisionSource: "human_clinician" | null;
  appointment: CareReviewAppointmentSummary;
  intake: CareReviewIntakeSummary;
  consent: readonly CareReviewConsentSummary[];
}

export const CARE_REVIEW_STATUS_LABELS: Readonly<
  Record<CareClinicianReviewStatus, string>
> = {
  assigned: "Assigned",
  in_review: "In review",
  awaiting_information: "Waiting on information",
  awaiting_labs: "Waiting on labs",
  follow_up: "Follow up",
  decided: "Decided",
};

export const CARE_REVIEW_DECISION_LABELS: Readonly<
  Record<CareClinicianDecision, string>
> = {
  approved: "Approved",
  declined: "Declined",
  no_treatment: "No treatment",
};

export const CARE_REVIEW_APPOINTMENT_LABELS: Readonly<
  Record<CareAppointmentStatus, string>
> = {
  requested: "Requested",
  scheduled: "Scheduled",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Not attended",
};

export const CARE_REVIEW_INTAKE_LABELS: Readonly<
  Record<CareReviewIntakeState, string>
> = {
  submitted: "Submitted",
  in_progress: "Started, not submitted",
  missing: "Not started",
};

export const CARE_REVIEW_CONSENT_LABELS: Readonly<
  Record<CareConsentKind, string>
> = {
  telehealth: "Telehealth consent",
  privacy_notice: "Privacy notice",
};

export const CARE_REVIEW_CONSENT_REASON_LABELS: Readonly<
  Record<CareConsentStatus["reason"], string>
> = {
  document_unavailable: "No approved document is available",
  not_granted: "Not granted",
  revoked: "Revoked",
  wrong_version: "Granted against an older version",
  active: "Active",
};

export interface CareReviewQueueSummary {
  total: number;
  openWithClinician: number;
  waitingOnSomeoneElse: number;
  decided: number;
}

/** Plain counts for the queue header. No score, no ranking, no target. */
export function summarizeCareReviewQueue(
  items: readonly CareReviewQueueItem[],
): CareReviewQueueSummary {
  let openWithClinician = 0;
  let waitingOnSomeoneElse = 0;
  let decided = 0;
  for (const item of items) {
    if (item.status === "decided") decided += 1;
    else if (
      item.status === "awaiting_information" ||
      item.status === "awaiting_labs"
    ) {
      waitingOnSomeoneElse += 1;
    } else openWithClinician += 1;
  }
  return {
    total: items.length,
    openWithClinician,
    waitingOnSomeoneElse,
    decided,
  };
}
