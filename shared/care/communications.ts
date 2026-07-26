import type { CareRecordId } from "./contracts";

export const CARE_MESSAGE_THREAD_STATUSES = ["open", "closed"] as const;
export type CareMessageThreadStatus =
  (typeof CARE_MESSAGE_THREAD_STATUSES)[number];

export const CARE_MESSAGE_SENDER_KINDS = [
  "care_patient",
  "human_clinician",
] as const;
export type CareMessageSenderKind =
  (typeof CARE_MESSAGE_SENDER_KINDS)[number];

export interface CareMessageThread {
  id: CareRecordId;
  patientId: CareRecordId;
  appointmentId: CareRecordId;
  assignedClinicianUserId: string;
  status: CareMessageThreadStatus;
  subjectCategory: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CareMessage {
  id: CareRecordId;
  threadId: CareRecordId;
  patientId: CareRecordId;
  senderUserId: string;
  senderKind: CareMessageSenderKind;
  body: string;
  createdAt: string;
}

export interface CareMessageConversation {
  thread: CareMessageThread;
  messages: readonly CareMessage[];
}

export const CARE_LAB_CASE_STATUSES = [
  "awaiting_order_reference",
  "order_reference_recorded",
  "result_reference_recorded",
  "reviewed",
  "closed",
] as const;
export type CareLabCaseStatus = (typeof CARE_LAB_CASE_STATUSES)[number];

export interface CareLabCase {
  id: CareRecordId;
  patientId: CareRecordId;
  appointmentId: CareRecordId | null;
  status: CareLabCaseStatus;
  hasProviderReference: boolean;
  hasOrderReference: boolean;
  hasResultReference: boolean;
  hasSecureObjectReference: boolean;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const CARE_ADVERSE_EVENT_CATEGORIES = [
  "adverse_event",
  "quality_concern",
  "device_issue",
  "other_issue",
] as const;
export type CareAdverseEventCategory =
  (typeof CARE_ADVERSE_EVENT_CATEGORIES)[number];

export const CARE_ADVERSE_EVENT_URGENCIES = [
  "routine",
  "urgent",
  "possible_emergency",
] as const;
export type CareAdverseEventUrgency =
  (typeof CARE_ADVERSE_EVENT_URGENCIES)[number];

export const CARE_ADVERSE_EVENT_STATUSES = [
  "reported",
  "acknowledged",
  "escalated",
  "closed",
] as const;
export type CareAdverseEventStatus =
  (typeof CARE_ADVERSE_EVENT_STATUSES)[number];

export interface CareAdverseEvent {
  id: CareRecordId;
  patientId: CareRecordId;
  category: CareAdverseEventCategory;
  urgency: CareAdverseEventUrgency;
  summary: string;
  status: CareAdverseEventStatus;
  assignedOwnerUserId: string | null;
  assignedOwnerRole: "clinician" | "clinical_support" | null;
  acknowledgedAt: string | null;
  escalatedAt: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const CARE_EMERGENCY_GUIDANCE =
  "If you may be experiencing an emergency, contact local emergency services now. This form is not monitored for emergency response and does not provide diagnosis or treatment advice.";

export const CARE_PR6_REQUIRED_INPUT_LABELS = {
  assignedClinician: "ASSIGNED CLINICIAN REQUIRED",
  labProvider: "LABORATORY PROVIDER REFERENCE REQUIRED",
  labOrder: "LABORATORY ORDER REFERENCE REQUIRED",
  labResult: "LABORATORY RESULT REFERENCE REQUIRED",
  labSecureObject: "PRIVATE LABORATORY FILE REFERENCE REQUIRED",
  labReviewer: "ASSIGNED LAB REVIEWER REQUIRED",
  adverseOwner: "ADVERSE-EVENT OWNER REQUIRED",
  careActivation: "CARE ACTIVATION APPROVAL REQUIRED",
} as const;
