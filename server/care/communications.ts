import {
  CARE_EMERGENCY_GUIDANCE,
  type CareAdverseEvent,
  type CareLabCase,
  type CareMessageThread,
} from "@shared/care/communications";

export function canUseCareMessageThread(input: {
  thread: CareMessageThread;
  principal: {
    subjectId: string;
    patientId?: string;
    roles: readonly string[];
  };
}) {
  const patientAllowed =
    input.principal.roles.includes("care_patient") &&
    input.principal.patientId === input.thread.patientId;
  const clinicianAllowed =
    input.principal.roles.includes("clinician") &&
    input.principal.subjectId === input.thread.assignedClinicianUserId;
  return patientAllowed || clinicianAllowed;
}

export type CareLabAction =
  | "record_order_reference"
  | "record_result_reference"
  | "review"
  | "close";

export function advanceCareLabCase(
  labCase: CareLabCase,
  action: CareLabAction,
): CareLabCase | null {
  const nextStatus = {
    record_order_reference: "order_reference_recorded",
    record_result_reference: "result_reference_recorded",
    review: "reviewed",
    close: "closed",
  }[action] as CareLabCase["status"];
  const allowed =
    (labCase.status === "awaiting_order_reference" &&
      action === "record_order_reference" &&
      labCase.hasProviderReference &&
      labCase.hasOrderReference) ||
    (labCase.status === "order_reference_recorded" &&
      action === "record_result_reference" &&
      labCase.hasResultReference &&
      labCase.hasSecureObjectReference) ||
    (labCase.status === "result_reference_recorded" && action === "review") ||
    (labCase.status === "reviewed" && action === "close");
  return allowed
    ? { ...labCase, status: nextStatus, version: labCase.version + 1 }
    : null;
}

export type CareAdverseEventAction = "acknowledge" | "escalate" | "close";

export function advanceCareAdverseEvent(input: {
  adverseEvent: CareAdverseEvent;
  actorUserId: string;
  action: CareAdverseEventAction;
  occurredAt: string;
}) {
  if (input.adverseEvent.assignedOwnerUserId !== input.actorUserId) return null;
  const allowed =
    (input.adverseEvent.status === "reported" &&
      input.action === "acknowledge") ||
    (["reported", "acknowledged"].includes(input.adverseEvent.status) &&
      input.action === "escalate") ||
    (["acknowledged", "escalated"].includes(input.adverseEvent.status) &&
      input.action === "close");
  if (!allowed) return null;
  const status = {
    acknowledge: "acknowledged",
    escalate: "escalated",
    close: "closed",
  }[input.action] as CareAdverseEvent["status"];
  return {
    ...input.adverseEvent,
    status,
    version: input.adverseEvent.version + 1,
    acknowledgedAt:
      input.action === "acknowledge"
        ? input.occurredAt
        : input.adverseEvent.acknowledgedAt,
    escalatedAt:
      input.action === "escalate"
        ? input.occurredAt
        : input.adverseEvent.escalatedAt,
    closedAt:
      input.action === "close"
        ? input.occurredAt
        : input.adverseEvent.closedAt,
  };
}

export function emergencyGuidanceForCareIssue() {
  return CARE_EMERGENCY_GUIDANCE;
}
