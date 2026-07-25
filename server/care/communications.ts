import type {
  AdverseEventState,
  CareAdverseEvent,
  CareAuditEvent,
  CareConsent,
  CareLabShare,
  NotificationOnlyChannel,
  SecureCareMessage,
} from "@shared/care/communications";
import type { CareRecordId } from "@shared/care/contracts";

export function canShareLab(input: {
  patientId: string;
  consent: CareConsent | null;
  share: CareLabShare;
  requestingRole: string;
  requestingSubjectId: string;
}): boolean {
  const { patientId, consent, share, requestingRole, requestingSubjectId } = input;
  if (!consent || consent.kind !== "lab_share" || consent.revokedAt) return false;
  if (consent.id !== share.consentId || consent.patientId !== patientId || share.patientId !== patientId) return false;
  if (share.status === "revoked") return false;
  if (requestingRole !== "clinician" && requestingRole !== "lab_reviewer") return false;
  return share.recipientRole === requestingRole && share.recipientId === requestingSubjectId;
}

export function revokeLabShare(share: CareLabShare, consent: CareConsent): CareLabShare {
  if (share.consentId !== consent.id || share.patientId !== consent.patientId) {
    throw new Error("lab_consent_binding_mismatch");
  }
  if (!consent.revokedAt) throw new Error("lab_consent_not_revoked");
  return { ...share, status: "revoked" };
}

export function createSecureCareMessage(input: {
  id: string;
  patientId: string;
  threadId: CareRecordId;
  senderSubjectId: string;
  channel: "care_portal" | NotificationOnlyChannel;
  consent: CareConsent;
  body: string;
  createdAt: Date;
}): SecureCareMessage {
  if (input.channel !== "care_portal") throw new Error("notification_channel_not_clinical_record");
  if (
    input.consent.kind !== "secure_messaging" ||
    input.consent.patientId !== input.patientId ||
    input.consent.revokedAt
  ) {
    throw new Error("secure_messaging_consent_required");
  }
  if (!input.body.trim()) throw new Error("message_body_required");
  return {
    id: input.id as CareRecordId,
    patientId: input.patientId,
    threadId: input.threadId,
    senderSubjectId: input.senderSubjectId,
    channel: "care_portal",
    consentId: input.consent.id,
    body: input.body,
    createdAt: input.createdAt.toISOString(),
  };
}

const ADVERSE_EVENT_TRANSITIONS: Readonly<Record<AdverseEventState, readonly AdverseEventState[]>> = {
  reported: ["triaged", "escalated"],
  triaged: ["clinician_routed", "pharmacy_notified", "escalated"],
  clinician_routed: ["pharmacy_notified", "escalated", "closed"],
  pharmacy_notified: ["clinician_routed", "escalated", "closed"],
  escalated: ["clinician_routed", "pharmacy_notified", "closed"],
  closed: [],
};

export function transitionAdverseEvent(
  event: CareAdverseEvent,
  next: AdverseEventState,
  patch: Partial<Pick<CareAdverseEvent, "urgency" | "assignedClinicianId" | "pharmacyAssignmentId">> = {},
): CareAdverseEvent {
  if (!ADVERSE_EVENT_TRANSITIONS[event.state].includes(next)) {
    throw new Error("invalid_adverse_event_transition");
  }
  const updated = { ...event, ...patch, state: next };
  if (next === "clinician_routed" && !updated.assignedClinicianId) {
    throw new Error("adverse_event_clinician_required");
  }
  if (next === "pharmacy_notified" && !updated.pharmacyAssignmentId) {
    throw new Error("adverse_event_pharmacy_required");
  }
  if (next === "closed" && updated.urgency === "unassessed") {
    throw new Error("adverse_event_triage_required");
  }
  return updated;
}

export function createCareAuditEvent(input: CareAuditEvent): CareAuditEvent {
  return {
    action: input.action,
    actorSubjectId: input.actorSubjectId,
    patientId: input.patientId,
    recordId: input.recordId,
    occurredAt: input.occurredAt,
  };
}

const CLINICAL_COMPENSATION_EVENTS = new Set([
  "prescription",
  "treatment_approval",
  "diagnosis",
  "medication_value",
  "pharmacy_fill",
  "lab_result",
]);

export function affiliateCompensationAllowed(event: string): boolean {
  return !CLINICAL_COMPENSATION_EVENTS.has(event);
}
