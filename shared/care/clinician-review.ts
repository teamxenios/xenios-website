import type { CareRecordId } from "./contracts";

export const CARE_CLINICIAN_REVIEW_STATUSES = [
  "assigned",
  "in_review",
  "awaiting_information",
  "awaiting_labs",
  "follow_up",
  "decided",
] as const;

export type CareClinicianReviewStatus =
  (typeof CARE_CLINICIAN_REVIEW_STATUSES)[number];

export const CARE_CLINICIAN_REVIEW_ACTIONS = [
  "review",
  "request_information",
  "request_labs",
  "follow_up",
  "approve",
  "decline",
  "no_treatment",
] as const;

export type CareClinicianReviewAction =
  (typeof CARE_CLINICIAN_REVIEW_ACTIONS)[number];

export type CareClinicianDecision =
  | "approved"
  | "declined"
  | "no_treatment";

export interface CareClinicianReview {
  id: CareRecordId;
  appointmentId: CareRecordId;
  patientId: CareRecordId;
  assignedClinicianUserId: string;
  patientStateCode: string;
  status: CareClinicianReviewStatus;
  finalDecision: CareClinicianDecision | null;
  finalDecisionSource: "human_clinician" | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CareClinicianReviewActor {
  subjectId: string;
  actorKind: "human_clinician" | "automation" | "ai";
  stateCoverageVerified: boolean;
}
