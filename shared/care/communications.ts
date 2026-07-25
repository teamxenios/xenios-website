import type { CareRecordId, CareRole } from "./contracts";

export const CARE_EMERGENCY_BOUNDARY =
  "If you may be experiencing a medical emergency, contact local emergency services now. Do not wait for a message or response from Xenios.";

export interface CareConsent {
  id: CareRecordId;
  patientId: string;
  kind: "lab_share" | "secure_messaging";
  grantedAt: string;
  revokedAt: string | null;
  version: number;
}

export interface CareLabShare {
  id: CareRecordId;
  patientId: string;
  labOrderId: CareRecordId;
  consentId: CareRecordId;
  recipientRole: Extract<CareRole, "clinician" | "lab_reviewer">;
  recipientId: string;
  status: "prepared" | "shared" | "revoked";
}

export const CLINICAL_MESSAGE_CHANNELS = ["care_portal"] as const;
export type ClinicalMessageChannel = (typeof CLINICAL_MESSAGE_CHANNELS)[number];
export type NotificationOnlyChannel = "email" | "telegram";

export interface SecureCareMessage {
  id: CareRecordId;
  patientId: string;
  threadId: CareRecordId;
  senderSubjectId: string;
  channel: ClinicalMessageChannel;
  consentId: CareRecordId;
  body: string;
  createdAt: string;
}

export const ADVERSE_EVENT_STATES = [
  "reported",
  "triaged",
  "clinician_routed",
  "pharmacy_notified",
  "escalated",
  "closed",
] as const;
export type AdverseEventState = (typeof ADVERSE_EVENT_STATES)[number];

export interface CareAdverseEvent {
  id: CareRecordId;
  patientId: string;
  prescriptionId: CareRecordId | null;
  state: AdverseEventState;
  urgency: "unassessed" | "routine" | "urgent" | "emergency";
  assignedClinicianId: string | null;
  pharmacyAssignmentId: CareRecordId | null;
  auditRequired: true;
}

export interface CareAuditEvent {
  action: string;
  actorSubjectId: string;
  patientId: string;
  recordId: CareRecordId;
  occurredAt: string;
}
