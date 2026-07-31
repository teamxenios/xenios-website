import type { CareAppointmentStatus } from "./appointments";
import {
  careClinicalActionExplanation,
  type CareClinicalCapability,
  type CareClinicalCapabilityFlags,
} from "./clinical-actions";
import type { CareRecordId } from "./contracts";
import type {
  CarePharmacyOrderStatus,
  CarePrescriptionStatus,
} from "./prescriptions";

/**
 * The Care administrator's work queues.
 *
 * A Care admin already has write contracts (assign a clinician, schedule an
 * appointment, record a no show, assign a pharmacy, resolve a clarification)
 * but every list route is scoped to somebody else: the appointment and
 * prescription reads are patient self reads, and the pharmacy order read is
 * scoped to the operator's own pharmacies. These projections are the missing
 * read side.
 *
 * They are WORKFLOW views, not clinical records. Following the clinician
 * review queue, they carry no patient identifier, no clinician identity, no
 * state code, and no prescription content. The server builds them, so the
 * browser never receives the underlying identifiers at all. What is left is
 * exactly what an administrator needs to route work: the record id, the
 * version the write contract requires, the workflow state, and the timestamps.
 */

/* ------------------------------------------------------------------ *
 * Appointments
 * ------------------------------------------------------------------ */

export const CARE_ADMIN_APPOINTMENT_BUCKETS = [
  "needs_assignment",
  "needs_scheduling",
  "scheduled",
  "awaiting_completion",
  "no_show_candidate",
  "no_action_needed",
] as const;

export type CareAdminAppointmentBucket =
  (typeof CARE_ADMIN_APPOINTMENT_BUCKETS)[number];

export const CARE_ADMIN_APPOINTMENT_BUCKET_LABELS: Readonly<
  Record<CareAdminAppointmentBucket, string>
> = {
  needs_assignment: "Needs a clinician",
  needs_scheduling: "Needs a time",
  scheduled: "Scheduled",
  awaiting_completion: "Checked in, waiting on the clinician",
  no_show_candidate: "Booked time has passed",
  no_action_needed: "No admin action",
};

export interface CareAdminAppointmentQueueItem {
  appointmentId: CareRecordId;
  bucket: CareAdminAppointmentBucket;
  status: CareAppointmentStatus;
  clinicianAssigned: boolean;
  scheduled: boolean;
  telehealthReady: boolean;
  startsAt: string | null;
  endsAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Which bucket one appointment belongs in.
 *
 * Every branch reads a real field of the appointment record. Nothing is
 * inferred about the patient, and no bucket implies a clinical judgement:
 * `no_show_candidate` says only that the booked end time has passed while the
 * appointment was still merely scheduled, which is the condition an
 * administrator looks at before deciding. It does not assert that anybody
 * failed to attend.
 */
export function careAdminAppointmentBucket(input: {
  status: CareAppointmentStatus;
  clinicianAssigned: boolean;
  endsAt: string | null;
  now: string;
}): CareAdminAppointmentBucket {
  if (input.status === "requested") {
    return input.clinicianAssigned ? "needs_scheduling" : "needs_assignment";
  }
  if (input.status === "checked_in") return "awaiting_completion";
  if (input.status === "scheduled") {
    const elapsed = input.endsAt !== null && input.endsAt <= input.now;
    return elapsed ? "no_show_candidate" : "scheduled";
  }
  // completed, cancelled, and no_show are terminal for the administrator.
  return "no_action_needed";
}

export interface CareAdminAppointmentQueueSummary {
  total: number;
  needsAssignment: number;
  needsScheduling: number;
  scheduled: number;
  awaitingCompletion: number;
  noShowCandidates: number;
}

/** Plain counts for the queue header. No score, no ranking, no target. */
export function summarizeCareAdminAppointmentQueue(
  items: readonly CareAdminAppointmentQueueItem[],
): CareAdminAppointmentQueueSummary {
  const summary: CareAdminAppointmentQueueSummary = {
    total: items.length,
    needsAssignment: 0,
    needsScheduling: 0,
    scheduled: 0,
    awaitingCompletion: 0,
    noShowCandidates: 0,
  };
  for (const item of items) {
    if (item.bucket === "needs_assignment") summary.needsAssignment += 1;
    else if (item.bucket === "needs_scheduling") summary.needsScheduling += 1;
    else if (item.bucket === "scheduled") summary.scheduled += 1;
    else if (item.bucket === "awaiting_completion") {
      summary.awaitingCompletion += 1;
    } else if (item.bucket === "no_show_candidate") {
      summary.noShowCandidates += 1;
    }
  }
  return summary;
}

/* ------------------------------------------------------------------ *
 * Prescriptions awaiting a pharmacy
 * ------------------------------------------------------------------ */

export const CARE_ADMIN_PRESCRIPTION_BUCKETS = [
  "awaiting_pharmacy_assignment",
  "pharmacy_assigned",
] as const;

export type CareAdminPrescriptionBucket =
  (typeof CARE_ADMIN_PRESCRIPTION_BUCKETS)[number];

export const CARE_ADMIN_PRESCRIPTION_BUCKET_LABELS: Readonly<
  Record<CareAdminPrescriptionBucket, string>
> = {
  awaiting_pharmacy_assignment: "Needs a pharmacy",
  pharmacy_assigned: "Pharmacy assigned",
};

export interface CareAdminPrescriptionQueueItem {
  prescriptionId: CareRecordId;
  bucket: CareAdminPrescriptionBucket;
  status: CarePrescriptionStatus;
  pharmacyAssigned: boolean;
  version: number;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CareAdminPrescriptionQueueSummary {
  total: number;
  awaitingPharmacyAssignment: number;
  pharmacyAssigned: number;
}

export function summarizeCareAdminPrescriptionQueue(
  items: readonly CareAdminPrescriptionQueueItem[],
): CareAdminPrescriptionQueueSummary {
  let awaitingPharmacyAssignment = 0;
  for (const item of items) {
    if (item.bucket === "awaiting_pharmacy_assignment") {
      awaitingPharmacyAssignment += 1;
    }
  }
  return {
    total: items.length,
    awaitingPharmacyAssignment,
    pharmacyAssigned: items.length - awaitingPharmacyAssignment,
  };
}

/* ------------------------------------------------------------------ *
 * Pharmacy orders, administrator view
 * ------------------------------------------------------------------ */

export const CARE_ADMIN_PHARMACY_ORDER_BUCKETS = [
  "awaiting_pharmacy",
  "clarification_open",
  "in_fulfillment",
  "closed",
] as const;

export type CareAdminPharmacyOrderBucket =
  (typeof CARE_ADMIN_PHARMACY_ORDER_BUCKETS)[number];

export const CARE_ADMIN_PHARMACY_ORDER_BUCKET_LABELS: Readonly<
  Record<CareAdminPharmacyOrderBucket, string>
> = {
  awaiting_pharmacy: "Waiting on the pharmacy to pick it up",
  clarification_open: "Pharmacy asked a question",
  in_fulfillment: "With the pharmacy",
  closed: "Closed",
};

export interface CareAdminPharmacyOrderQueueItem {
  orderId: CareRecordId;
  bucket: CareAdminPharmacyOrderBucket;
  status: CarePharmacyOrderStatus;
  clarificationOpen: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An open clarification outranks the order status, because the clarification
 * is the thing an administrator can actually act on.
 */
export function careAdminPharmacyOrderBucket(input: {
  status: CarePharmacyOrderStatus;
  clarificationOpen: boolean;
}): CareAdminPharmacyOrderBucket {
  if (input.clarificationOpen) return "clarification_open";
  if (input.status === "pending_pharmacy") return "awaiting_pharmacy";
  if (
    input.status === "rejected" ||
    input.status === "delivered" ||
    input.status === "cancelled"
  ) {
    return "closed";
  }
  return "in_fulfillment";
}

export interface CareAdminPharmacyOrderQueueSummary {
  total: number;
  awaitingPharmacy: number;
  clarificationOpen: number;
  inFulfillment: number;
  closed: number;
}

export function summarizeCareAdminPharmacyOrderQueue(
  items: readonly CareAdminPharmacyOrderQueueItem[],
): CareAdminPharmacyOrderQueueSummary {
  const summary: CareAdminPharmacyOrderQueueSummary = {
    total: items.length,
    awaitingPharmacy: 0,
    clarificationOpen: 0,
    inFulfillment: 0,
    closed: 0,
  };
  for (const item of items) {
    if (item.bucket === "awaiting_pharmacy") summary.awaitingPharmacy += 1;
    else if (item.bucket === "clarification_open") {
      summary.clarificationOpen += 1;
    } else if (item.bucket === "in_fulfillment") summary.inFulfillment += 1;
    else summary.closed += 1;
  }
  return summary;
}

/* ------------------------------------------------------------------ *
 * The administrator's action controls
 * ------------------------------------------------------------------ */

export const CARE_ADMIN_ACTIONS = [
  "assign_clinician",
  "schedule_appointment",
  "mark_no_show",
  "assign_pharmacy",
  "resolve_clarification",
] as const;

export type CareAdminAction = (typeof CARE_ADMIN_ACTIONS)[number];

export const CARE_ADMIN_ACTION_LABELS: Readonly<
  Record<CareAdminAction, string>
> = {
  assign_clinician: "Assign clinician",
  schedule_appointment: "Schedule",
  mark_no_show: "Record not attended",
  assign_pharmacy: "Assign pharmacy",
  resolve_clarification: "Resolve clarification",
};

/** The real POST contract each control would call. */
export const CARE_ADMIN_ACTION_CONTRACTS: Readonly<
  Record<CareAdminAction, string>
> = {
  assign_clinician: "/api/care/appointments/:appointmentId/assign",
  schedule_appointment: "/api/care/appointments/:appointmentId/schedule",
  mark_no_show: "/api/care/appointments/:appointmentId/no-show",
  assign_pharmacy:
    "/api/care/pharmacy/admin/prescriptions/:prescriptionId/assign",
  resolve_clarification:
    "/api/care/pharmacy/admin/orders/:orderId/clarification/resolve",
};

/**
 * Which clinical capability each administrator action depends on. Scheduling
 * work is a provider action; putting a prescription in front of a pharmacy is
 * clinical fulfilment.
 */
export const CARE_ADMIN_ACTION_CAPABILITY: Readonly<
  Record<CareAdminAction, CareClinicalCapability>
> = {
  assign_clinician: "provider_actions",
  schedule_appointment: "provider_actions",
  mark_no_show: "provider_actions",
  assign_pharmacy: "clinical_fulfillment",
  resolve_clarification: "clinical_fulfillment",
};

export type CareAdminActionBlockReason =
  | "care_not_active"
  | "capability_disabled"
  | "clinician_already_assigned"
  | "clinician_assignment_required"
  | "appointment_not_scheduled"
  | "pharmacy_already_assigned"
  | "prescription_not_signed"
  | "no_open_clarification";

export interface CareAdminActionState {
  action: CareAdminAction;
  label: string;
  contract: string;
  capability: CareClinicalCapability;
  enabled: boolean;
  blockedReason: CareAdminActionBlockReason | null;
  explanation: string;
}

const WORKFLOW_EXPLANATIONS: Readonly<
  Record<
    Exclude<
      CareAdminActionBlockReason,
      "care_not_active" | "capability_disabled"
    >,
    string
  >
> = {
  clinician_already_assigned:
    "This appointment already has a clinician, so there is nothing to assign.",
  clinician_assignment_required:
    "A clinician has to be assigned before a time can be set.",
  appointment_not_scheduled:
    "Only a scheduled appointment can be recorded as not attended.",
  pharmacy_already_assigned:
    "This prescription is already with a pharmacy, so it cannot be assigned again.",
  prescription_not_signed:
    "A prescription has to be signed by the prescribing clinician before it can go to a pharmacy.",
  no_open_clarification:
    "There is no open pharmacy question on this order to resolve.",
};

export function careAdminActionExplanation(
  reason: CareAdminActionBlockReason,
  capability: CareClinicalCapability,
): string {
  if (reason === "care_not_active" || reason === "capability_disabled") {
    return careClinicalActionExplanation(reason, capability);
  }
  return WORKFLOW_EXPLANATIONS[reason];
}

function blocked(
  action: CareAdminAction,
  reason: CareAdminActionBlockReason,
): CareAdminActionState {
  const capability = CARE_ADMIN_ACTION_CAPABILITY[action];
  return {
    action,
    label: CARE_ADMIN_ACTION_LABELS[action],
    contract: CARE_ADMIN_ACTION_CONTRACTS[action],
    capability,
    enabled: false,
    blockedReason: reason,
    explanation: careAdminActionExplanation(reason, capability),
  };
}

function allowed(action: CareAdminAction): CareAdminActionState {
  return {
    action,
    label: CARE_ADMIN_ACTION_LABELS[action],
    contract: CARE_ADMIN_ACTION_CONTRACTS[action],
    capability: CARE_ADMIN_ACTION_CAPABILITY[action],
    enabled: true,
    blockedReason: null,
    explanation: "",
  };
}

/**
 * Decide whether one administrator action may be offered as usable.
 *
 * Pure, deterministic, and fail closed, in the same order a reviewer would ask
 * the questions. Care being inactive and the capability being off are checked
 * before any workflow precondition, so with the shipped flags every control on
 * every queue is disabled no matter what the record says.
 */
export function careAdminActionState(input: {
  action: CareAdminAction;
  careEnabled: boolean;
  flags: CareClinicalCapabilityFlags;
  workflowBlockedReason: CareAdminActionBlockReason | null;
}): CareAdminActionState {
  const capability = CARE_ADMIN_ACTION_CAPABILITY[input.action];
  if (!input.careEnabled) return blocked(input.action, "care_not_active");
  if (!input.flags[capability]) {
    return blocked(input.action, "capability_disabled");
  }
  if (input.workflowBlockedReason !== null) {
    return blocked(input.action, input.workflowBlockedReason);
  }
  return allowed(input.action);
}

/** The three appointment controls, with this appointment's preconditions. */
export function careAdminAppointmentActionStates(input: {
  item: Pick<
    CareAdminAppointmentQueueItem,
    "status" | "clinicianAssigned"
  >;
  careEnabled: boolean;
  flags: CareClinicalCapabilityFlags;
}): CareAdminActionState[] {
  const { status, clinicianAssigned } = input.item;
  const workflow: Readonly<
    Record<
      "assign_clinician" | "schedule_appointment" | "mark_no_show",
      CareAdminActionBlockReason | null
    >
  > = {
    assign_clinician: clinicianAssigned ? "clinician_already_assigned" : null,
    schedule_appointment: clinicianAssigned
      ? null
      : "clinician_assignment_required",
    mark_no_show: status === "scheduled" ? null : "appointment_not_scheduled",
  };
  return (
    ["assign_clinician", "schedule_appointment", "mark_no_show"] as const
  ).map((action) =>
    careAdminActionState({
      action,
      careEnabled: input.careEnabled,
      flags: input.flags,
      workflowBlockedReason: workflow[action],
    }),
  );
}

export function careAdminPrescriptionActionStates(input: {
  item: Pick<CareAdminPrescriptionQueueItem, "status" | "pharmacyAssigned">;
  careEnabled: boolean;
  flags: CareClinicalCapabilityFlags;
}): CareAdminActionState[] {
  const workflowBlockedReason: CareAdminActionBlockReason | null =
    input.item.status !== "signed"
      ? "prescription_not_signed"
      : input.item.pharmacyAssigned
        ? "pharmacy_already_assigned"
        : null;
  return [
    careAdminActionState({
      action: "assign_pharmacy",
      careEnabled: input.careEnabled,
      flags: input.flags,
      workflowBlockedReason,
    }),
  ];
}

export function careAdminPharmacyOrderActionStates(input: {
  item: Pick<CareAdminPharmacyOrderQueueItem, "clarificationOpen">;
  careEnabled: boolean;
  flags: CareClinicalCapabilityFlags;
}): CareAdminActionState[] {
  return [
    careAdminActionState({
      action: "resolve_clarification",
      careEnabled: input.careEnabled,
      flags: input.flags,
      workflowBlockedReason: input.item.clarificationOpen
        ? null
        : "no_open_clarification",
    }),
  ];
}
