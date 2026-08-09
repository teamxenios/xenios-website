/**
 * The patient-facing Care surface inventory.
 *
 * This file is the single honest record of which patient Care screens are
 * backed by a server contract that actually exists in `server/care`, and which
 * ones are not built. It exists because a route that renders a shell with no
 * data source is not a feature, and a patient must never be shown a screen that
 * implies a capability the system does not have.
 *
 * Two rules govern every entry:
 *   1. `state: "available"` is only permitted when a registered route handler
 *      in `server/care` serves the named contract for a patient permission.
 *   2. `state: "no_patient_contract"` must name, in `missingContract`, the exact
 *      endpoint that does not exist. No entry may describe data it cannot read.
 *
 * Labs and adverse-event reporting are deliberately absent from this inventory.
 * They are owned by a separate lane, and claiming a state for them here would
 * be a guess.
 */

import type { CarePermission } from "./contracts";

export const CARE_PATIENT_SURFACE_STATES = [
  "available",
  "no_patient_contract",
] as const;

export type CarePatientSurfaceState =
  (typeof CARE_PATIENT_SURFACE_STATES)[number];

export interface CarePatientSurface {
  /** Stable key, also the last path segment for a pending surface. */
  key: string;
  /** The route this surface resolves at today. */
  path: string;
  title: string;
  /** Plain-English description of what the surface is for. */
  summary: string;
  state: CarePatientSurfaceState;
  /**
   * For an available surface, the contract it reads. For a missing surface, the
   * contract that would have to exist first. Never a promise that it will.
   */
  contract: string;
  /** Present only when the surface is not backed by a patient contract. */
  missingContract: string | null;
  /** The permission a patient would need. Named even when nothing serves it. */
  permission: CarePermission;
  /**
   * Why this is not available, in words a patient can read. Empty for an
   * available surface.
   */
  reason: string;
}

const surfaces: readonly CarePatientSurface[] = [
  {
    key: "eligibility",
    path: "/care/eligibility",
    title: "Eligibility",
    summary:
      "Whether Care can be offered where you are, and joining the waitlist if it cannot.",
    state: "available",
    contract: "GET /api/care/eligibility",
    missingContract: null,
    permission: "care:read_self",
    reason: "",
  },
  {
    key: "consent",
    path: "/care/consent",
    title: "Consent",
    summary: "The consents Care would require before any clinical step.",
    state: "available",
    contract: "POST /api/care/consents",
    missingContract: null,
    permission: "care:intake_self",
    reason: "",
  },
  {
    key: "appointments",
    path: "/care/appointments",
    title: "Appointments",
    summary: "Whether any appointment record exists for you.",
    state: "available",
    contract: "GET /api/care/appointments",
    missingContract: null,
    permission: "care:appointments_self",
    reason: "",
  },
  {
    key: "prescriptions",
    path: "/care/prescriptions",
    title: "Prescriptions",
    summary: "Whether a clinician has signed any prescription record for you.",
    state: "available",
    contract: "GET /api/care/prescriptions",
    missingContract: null,
    permission: "care:read_self",
    reason: "",
  },
  {
    key: "messages",
    path: "/care/messages",
    title: "Messages",
    summary: "Secure messages between you and an assigned clinician.",
    state: "no_patient_contract",
    contract: "GET /api/care/messages",
    missingContract: "GET /api/care/messages",
    permission: "care:message_self",
    reason:
      "The messaging permission exists in the Care role model, but no server route serves it, so there is nothing to read or send.",
  },
  {
    key: "care-plan",
    path: "/care/care-plan",
    title: "Care plan",
    summary: "The plan an assigned clinician has recorded for you.",
    state: "no_patient_contract",
    contract: "GET /api/care/care-plan",
    missingContract: "GET /api/care/care-plan",
    permission: "care:read_self",
    reason:
      "No care plan endpoint or record exists yet, so no plan can be shown and none should be inferred from anything else on this site.",
  },
  {
    key: "monitoring",
    path: "/care/monitoring",
    title: "Monitoring",
    summary: "Measurements a clinician has asked you to track over time.",
    state: "no_patient_contract",
    contract: "GET /api/care/monitoring",
    missingContract: "GET /api/care/monitoring",
    permission: "care:read_self",
    reason:
      "No monitoring endpoint or record exists yet. Nothing you enter anywhere on this site is reviewed as a clinical measurement.",
  },
  {
    key: "check-ins",
    path: "/care/check-ins",
    title: "Check-ins",
    summary: "Scheduled check-ins before and after an appointment.",
    state: "no_patient_contract",
    contract: "GET /api/care/check-ins",
    missingContract: "GET /api/care/check-ins",
    permission: "care:appointments_self",
    reason:
      "The appointment record supports a check-in transition on the server, but no check-in screen or endpoint exists for a patient, so there is nothing to complete here.",
  },
  {
    key: "documents",
    path: "/care/documents",
    title: "Documents",
    summary: "Copies of what you signed and what a clinician shared with you.",
    state: "no_patient_contract",
    contract: "GET /api/care/documents",
    missingContract: "GET /api/care/documents",
    permission: "care:read_self",
    reason:
      "No document endpoint or store exists for a patient yet, so no signed copy can be retrieved from this screen.",
  },
  {
    key: "orders",
    path: "/care/orders",
    title: "Orders",
    summary: "The status of a pharmacy order placed against a prescription.",
    state: "no_patient_contract",
    contract: "GET /api/care/pharmacy/orders (patient-scoped)",
    missingContract: "GET /api/care/pharmacy/orders (patient-scoped)",
    permission: "care:read_self",
    reason:
      "A pharmacy order route exists, but it is restricted to assigned pharmacy operators. There is no patient-scoped order read, so your own order status cannot be shown.",
  },
  {
    key: "refill",
    path: "/care/refill",
    title: "Refill request",
    summary: "Asking a clinician to consider a refill.",
    state: "no_patient_contract",
    contract: "POST /api/care/prescriptions/:prescriptionId/refill-request",
    missingContract:
      "POST /api/care/prescriptions/:prescriptionId/refill-request",
    permission: "care:message_self",
    reason:
      "No refill request endpoint exists. A refill is a clinical decision, and no request submitted anywhere on this site would reach a clinician.",
  },
  {
    key: "support",
    path: "/care/support",
    title: "Support",
    summary: "Reaching a named person about a Care question.",
    state: "no_patient_contract",
    contract: "GET /api/care/support",
    missingContract: "GET /api/care/support",
    permission: "care:read_self",
    reason:
      "A support path is reserved in the Care route contracts, but no server route serves it, so no support request can be opened or tracked here.",
  },
  {
    key: "settings",
    path: "/care/settings",
    title: "Settings",
    summary: "Contact preferences and notification choices for Care.",
    state: "no_patient_contract",
    contract: "GET /api/care/settings",
    missingContract: "GET /api/care/settings",
    permission: "care:read_self",
    reason:
      "No Care settings endpoint or record exists. Care sends no notifications, so there is nothing to configure.",
  },
  {
    key: "access-log",
    path: "/care/access-log",
    title: "Access log",
    summary: "Who has looked at your Care record, and when.",
    state: "no_patient_contract",
    contract: "GET /api/care/audit/access (patient-scoped)",
    missingContract: "GET /api/care/audit/access (patient-scoped)",
    permission: "care:read_self",
    reason:
      "An audit probe exists for a security administrator only. There is no patient-scoped access history, so this screen cannot show you who read your record.",
  },
  {
    key: "privacy-request",
    path: "/care/privacy-request",
    title: "Privacy request",
    summary: "Asking for a copy of your record, a correction, or a deletion.",
    state: "no_patient_contract",
    contract: "POST /api/care/privacy-requests",
    missingContract: "POST /api/care/privacy-requests",
    permission: "care:read_self",
    reason:
      "No privacy request endpoint exists. Use the contact route on the main site, which reaches a named person, rather than a form here that would go nowhere.",
  },
  {
    key: "tasks",
    path: "/care/tasks",
    title: "Tasks",
    summary: "What Care is waiting on from you.",
    state: "no_patient_contract",
    contract: "GET /api/care/tasks",
    missingContract: "GET /api/care/tasks",
    permission: "care:read_self",
    reason:
      "No task endpoint or record exists, so nothing can be assigned to you and no outstanding item can be listed.",
  },
  {
    key: "telehealth",
    path: "/care/telehealth",
    title: "Telehealth waiting room",
    summary: "Joining a scheduled telehealth visit.",
    state: "no_patient_contract",
    contract: "GET /api/care/appointments/:appointmentId/telehealth-session",
    missingContract:
      "GET /api/care/appointments/:appointmentId/telehealth-session",
    permission: "care:appointments_self",
    reason:
      "No telehealth session endpoint exists and no telehealth provider is verified, so there is no visit to join and no waiting room to enter.",
  },
];

export const CARE_PATIENT_SURFACES: readonly CarePatientSurface[] = surfaces;

export const CARE_PATIENT_RECORD_PATH = "/care/record";

export function carePatientSurfaceByPath(
  path: string,
): CarePatientSurface | null {
  const normalized = path.toLowerCase().replace(/\/+$/, "");
  return (
    surfaces.find((surface) => surface.path === (normalized || "/care")) ?? null
  );
}

export function carePatientPendingSurfaces(): readonly CarePatientSurface[] {
  return surfaces.filter((surface) => surface.state === "no_patient_contract");
}

export function carePatientAvailableSurfaces(): readonly CarePatientSurface[] {
  return surfaces.filter((surface) => surface.state === "available");
}

/* --------------------------------------------------------- patient actions */

/**
 * The actions a patient would eventually take. Every one is listed so the
 * intended workflow is visible and reviewable, and every one is blocked. The
 * shape mirrors `careReviewActionState` in `clinical-actions.ts`: a pure,
 * deterministic decision that fails closed, with the first blocking answer
 * being the one explained.
 */
export const CARE_PATIENT_ACTIONS = [
  "request_appointment",
  "check_in",
  "cancel_appointment",
  "request_refill",
  "message_clinician",
  "request_records",
] as const;

export type CarePatientAction = (typeof CARE_PATIENT_ACTIONS)[number];

export const CARE_PATIENT_ACTION_LABELS: Readonly<
  Record<CarePatientAction, string>
> = {
  request_appointment: "Request an appointment",
  check_in: "Check in for a visit",
  cancel_appointment: "Cancel an appointment",
  request_refill: "Request a refill",
  message_clinician: "Message a clinician",
  request_records: "Request a copy of my record",
};

export type CarePatientActionBlockReason =
  | "care_not_active"
  | "no_patient_contract"
  | "no_write_path";

/**
 * Whether the server contract this action would call exists at all today.
 * `false` means there is no endpoint to call, so the control can never be more
 * than a description of intent.
 */
const PATIENT_ACTION_CONTRACT_EXISTS: Readonly<
  Record<CarePatientAction, boolean>
> = {
  request_appointment: true,
  check_in: true,
  cancel_appointment: true,
  request_refill: false,
  message_clinician: false,
  request_records: false,
};

const PATIENT_ACTION_REASONS: Readonly<
  Record<CarePatientActionBlockReason, string>
> = {
  care_not_active:
    "Care is not active yet, so this cannot be started from here.",
  no_patient_contract:
    "Nothing on the server accepts this request yet, so it would not reach a person.",
  no_write_path:
    "This release has no path from this screen to a Care record, so the control does nothing.",
};

export interface CarePatientActionState {
  action: CarePatientAction;
  label: string;
  enabled: boolean;
  blockedReason: CarePatientActionBlockReason;
  explanation: string;
}

export function carePatientActionState(input: {
  action: CarePatientAction;
  careEnabled: boolean;
}): CarePatientActionState {
  const label = CARE_PATIENT_ACTION_LABELS[input.action];
  const blocked = (
    reason: CarePatientActionBlockReason,
  ): CarePatientActionState => ({
    action: input.action,
    label,
    enabled: false,
    blockedReason: reason,
    explanation: PATIENT_ACTION_REASONS[reason],
  });

  if (!PATIENT_ACTION_CONTRACT_EXISTS[input.action]) {
    return blocked("no_patient_contract");
  }
  if (!input.careEnabled) return blocked("care_not_active");
  // The contract exists and Care reports itself active, and the control is
  // still refused: this frontend ships no patient write path, so there is
  // nothing for the control to do. This branch never returns `enabled: true`.
  return blocked("no_write_path");
}

export function carePatientActionStates(
  careEnabled: boolean,
): readonly CarePatientActionState[] {
  return CARE_PATIENT_ACTIONS.map((action) =>
    carePatientActionState({ action, careEnabled }),
  );
}
