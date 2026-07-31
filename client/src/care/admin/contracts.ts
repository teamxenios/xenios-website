// The Care admin console's map of what actually exists on the server.
//
// This file is deliberately data, not prose. Every area a Care administrator
// expects is listed once, with the REAL server contracts it reads, the REAL
// action contracts it would call, and the exact contracts that do not exist
// yet. A surface with no contract renders an honest pending state naming the
// gap. Nothing here invents an endpoint, a table, or a record.
//
// Source of truth for the paths below: server/care/index.ts,
// server/care/eligibility-routes.ts, server/care/intake-routes.ts,
// server/care/appointment-routes.ts, server/care/prescription-routes.ts.

import type { CarePermission } from "@shared/care/contracts";

export const CARE_ADMIN_BASE_PATH = "/care/admin";

/** A server contract this console actually calls. */
export interface CareAdminReadContract {
  method: "GET";
  path: string;
  permission: CarePermission;
}

/**
 * A consequential clinical contract. The console renders a control for it so
 * the operator can see the shape of the real workflow, but the control is
 * always disabled: provider actions, prescribing, clinical fulfilment, real
 * patient data, and external communications are all off.
 */
export interface CareAdminActionContract {
  method: "POST";
  path: string;
  permission: CarePermission;
  label: string;
  /** Plain-English reason the control cannot fire. */
  blockedBecause: string;
}

export interface CareAdminArea {
  key: CareAdminAreaKey;
  label: string;
  path: string;
  /** One plain sentence describing what a Care admin does here. */
  summary: string;
  /** Contracts this surface reads. Empty means nothing exists to read. */
  reads: readonly CareAdminReadContract[];
  /** Consequential contracts, rendered as disabled controls. */
  actions: readonly CareAdminActionContract[];
  /** Exact contracts that do not exist. Empty only when the area is wired. */
  missing: readonly string[];
}

export const CARE_ADMIN_AREA_KEYS = [
  "overview",
  "applications",
  "identity",
  "patients",
  "providers",
  "credentials",
  "licensure",
  "service-areas",
  "scheduling",
  "consents",
  "forms",
  "protocols",
  "formulary",
  "labs",
  "pharmacy",
  "orders",
  "adverse-events",
  "privacy",
  "audit",
  "incidents",
  "access",
  "flags",
] as const;

export type CareAdminAreaKey = (typeof CARE_ADMIN_AREA_KEYS)[number];

const APPOINTMENT_READINESS: CareAdminReadContract = {
  method: "GET",
  path: "/api/care/appointments/admin/readiness",
  permission: "care:administer",
};

const PHARMACY_READINESS: CareAdminReadContract = {
  method: "GET",
  path: "/api/care/pharmacy/admin/readiness",
  permission: "care:administer",
};

const CAPABILITY_STATUS: CareAdminReadContract = {
  method: "GET",
  path: "/api/care/status",
  permission: "care:read_self",
};

const ACCESS_BOUNDARY_PROBE: CareAdminReadContract = {
  method: "GET",
  path: "/api/care/audit/access",
  permission: "care:security_audit",
};

/**
 * The named clinical gates for this build. None of them is exposed as a
 * server-readable flag, so the console never prints a true/false value for
 * them. It reports that fact and keeps every clinical control disabled.
 */
export const CARE_CLINICAL_GATE_NAMES = [
  "CARE_REAL_PATIENT_DATA_ENABLED",
  "CARE_PROVIDER_ACTIONS_ENABLED",
  "CARE_PRESCRIBING_ENABLED",
  "CARE_CLINICAL_FULFILLMENT_ENABLED",
  "CARE_EXTERNAL_COMMUNICATIONS_ENABLED",
] as const;

export type CareClinicalGateName = (typeof CARE_CLINICAL_GATE_NAMES)[number];

export const CARE_CLINICAL_GATE_EXPLANATION =
  "No server contract reads these gates, so this console shows no value for them and holds every clinical control closed.";

export const CARE_ADMIN_AREAS: readonly CareAdminArea[] = [
  {
    key: "overview",
    label: "Overview",
    path: CARE_ADMIN_BASE_PATH,
    summary:
      "What this console can read today, and which areas have no server contract yet.",
    reads: [CAPABILITY_STATUS],
    actions: [],
    missing: [],
  },
  {
    key: "applications",
    label: "Applications",
    path: `${CARE_ADMIN_BASE_PATH}/applications`,
    summary: "Review people asking to enter the Care pathway.",
    reads: [],
    actions: [],
    missing: [
      "No admin endpoint lists Care applications.",
      "No application decision endpoint exists.",
    ],
  },
  {
    key: "identity",
    label: "Identity review",
    path: `${CARE_ADMIN_BASE_PATH}/identity`,
    summary: "Confirm a patient is who they say they are before care begins.",
    reads: [],
    actions: [],
    missing: [
      "No admin endpoint reads a patient identity record. The CarePatientIdentity shape exists in shared/care/eligibility.ts, but only the patient's own eligibility read consumes it.",
      "No identity decision endpoint exists.",
    ],
  },
  {
    key: "patients",
    label: "Patients",
    path: `${CARE_ADMIN_BASE_PATH}/patients`,
    summary: "Find a patient and see their Care record.",
    reads: [],
    actions: [],
    missing: [
      "No admin patient search or list endpoint exists. GET /api/care/appointments and GET /api/care/prescriptions are patient-self reads bound to the caller's own patient id.",
    ],
  },
  {
    key: "providers",
    label: "Providers",
    path: `${CARE_ADMIN_BASE_PATH}/providers`,
    summary: "See which clinicians can take Care work.",
    reads: [APPOINTMENT_READINESS],
    actions: [],
    missing: [
      "No admin endpoint lists clinicians, so no provider roster can be shown.",
      "Only the readiness required-input labels report whether a verified clinician record exists.",
    ],
  },
  {
    key: "credentials",
    label: "Credentials",
    path: `${CARE_ADMIN_BASE_PATH}/credentials`,
    summary: "Track clinician credential verification.",
    reads: [APPOINTMENT_READINESS],
    actions: [],
    missing: [
      "No admin endpoint reads or records an individual credential. Readiness reports only whether credential verification is outstanding.",
    ],
  },
  {
    key: "licensure",
    label: "Licensure",
    path: `${CARE_ADMIN_BASE_PATH}/licensure`,
    summary: "Track the licences a clinician holds per state.",
    reads: [APPOINTMENT_READINESS],
    actions: [],
    missing: [
      "No admin endpoint reads or records a licence. Readiness reports only whether a current licence for the patient's state is outstanding.",
    ],
  },
  {
    key: "service-areas",
    label: "Service areas",
    path: `${CARE_ADMIN_BASE_PATH}/service-areas`,
    summary: "Check readiness for a single state before Care is offered there.",
    reads: [APPOINTMENT_READINESS, PHARMACY_READINESS],
    actions: [],
    missing: [
      "No admin endpoint lists or edits supported states. Readiness can only be queried one state at a time.",
    ],
  },
  {
    key: "scheduling",
    label: "Scheduling",
    path: `${CARE_ADMIN_BASE_PATH}/scheduling`,
    summary: "Assign, schedule, and close out Care appointments.",
    reads: [APPOINTMENT_READINESS],
    actions: [
      {
        method: "POST",
        path: "/api/care/appointments/:appointmentId/assign",
        permission: "care:administer",
        label: "Assign clinician",
        blockedBecause:
          "Assigning a clinician is a provider action. Provider actions are off and no appointment record is readable here.",
      },
      {
        method: "POST",
        path: "/api/care/appointments/:appointmentId/schedule",
        permission: "care:administer",
        label: "Schedule appointment",
        blockedBecause:
          "Scheduling books a real patient into a real telehealth session. Provider actions and external communications are off.",
      },
      {
        method: "POST",
        path: "/api/care/appointments/:appointmentId/no-show",
        permission: "care:administer",
        label: "Mark no-show",
        blockedBecause:
          "Marking a no-show writes to a patient's clinical record. Real patient data is off.",
      },
    ],
    missing: [
      "No admin endpoint lists appointments. GET /api/care/appointments returns only the calling patient's own appointments, so this console has no queue to act on.",
    ],
  },
  {
    key: "consents",
    label: "Consents",
    path: `${CARE_ADMIN_BASE_PATH}/consents`,
    summary: "Manage consent documents and see who has consented.",
    reads: [],
    actions: [],
    missing: [
      "No admin endpoint reads consent documents or consent events. POST /api/care/consents records the calling patient's own consent and requires care:intake_self.",
      "No endpoint publishes or supersedes a consent document version.",
    ],
  },
  {
    key: "forms",
    label: "Forms",
    path: `${CARE_ADMIN_BASE_PATH}/forms`,
    summary: "Publish and version the clinical intake form.",
    reads: [],
    actions: [],
    missing: [
      "No admin endpoint reads or publishes an intake definition. GET /api/care/intake returns the calling patient's own start context and requires care:intake_self.",
    ],
  },
  {
    key: "protocols",
    label: "Protocols",
    path: `${CARE_ADMIN_BASE_PATH}/protocols`,
    summary: "Hold the clinician-approved protocols care is delivered against.",
    reads: [],
    actions: [],
    missing: [
      "No protocol contract exists anywhere in server/care or shared/care.",
    ],
  },
  {
    key: "formulary",
    label: "Formulary",
    path: `${CARE_ADMIN_BASE_PATH}/formulary`,
    summary: "Hold the products a clinician may prescribe.",
    reads: [],
    actions: [],
    missing: [
      "No formulary contract exists anywhere in server/care or shared/care.",
    ],
  },
  {
    key: "labs",
    label: "Labs",
    path: `${CARE_ADMIN_BASE_PATH}/labs`,
    summary: "Order labs and route results to the reviewing clinician.",
    reads: [],
    actions: [],
    missing: [
      "CARE_ROUTE_CONTRACTS.labs declares /api/care/labs, but no handler is registered for it in server/care.",
      "The lab_reviewer role and its care:labs_assigned permission exist with no route that uses them.",
    ],
  },
  {
    key: "pharmacy",
    label: "Pharmacy configuration",
    path: `${CARE_ADMIN_BASE_PATH}/pharmacy`,
    summary: "Confirm the pharmacy relationship before anything is dispensed.",
    reads: [PHARMACY_READINESS],
    actions: [
      {
        method: "POST",
        path: "/api/care/pharmacy/admin/prescriptions/:prescriptionId/assign",
        permission: "care:administer",
        label: "Assign pharmacy",
        blockedBecause:
          "Assigning a pharmacy starts clinical fulfilment against a real prescription. Prescribing and clinical fulfilment are off.",
      },
      {
        method: "POST",
        path: "/api/care/pharmacy/admin/orders/:orderId/clarification/resolve",
        permission: "care:administer",
        label: "Resolve clarification",
        blockedBecause:
          "Resolving a clarification changes a live pharmacy order. Clinical fulfilment is off.",
      },
    ],
    missing: [
      "No admin endpoint lists pharmacies or reads a pharmacy configuration record. Readiness reports only which pharmacy inputs are outstanding.",
    ],
  },
  {
    key: "orders",
    label: "Orders",
    path: `${CARE_ADMIN_BASE_PATH}/orders`,
    summary: "Watch pharmacy orders move from assigned to delivered.",
    reads: [],
    actions: [],
    missing: [
      "No admin order list exists. GET /api/care/pharmacy/orders requires care:pharmacy_assigned and returns only the calling operator's assigned orders, so a Care admin cannot read it.",
    ],
  },
  {
    key: "adverse-events",
    label: "Adverse events",
    path: `${CARE_ADMIN_BASE_PATH}/adverse-events`,
    summary: "Capture and escalate an adverse event to a named human.",
    reads: [],
    actions: [],
    missing: [
      "CARE_ROUTE_CONTRACTS.adverseEvents declares /api/care/adverse-events, but no handler is registered for it in server/care.",
    ],
  },
  {
    key: "privacy",
    label: "Privacy",
    path: `${CARE_ADMIN_BASE_PATH}/privacy`,
    summary: "Handle access, correction, and deletion requests.",
    reads: [],
    actions: [],
    missing: [
      "No privacy request contract exists in server/care. The only privacy-adjacent record is the access-decision audit written by requireCarePermission.",
    ],
  },
  {
    key: "audit",
    label: "Audit",
    path: `${CARE_ADMIN_BASE_PATH}/audit`,
    summary: "Prove the Care access boundary is holding.",
    reads: [ACCESS_BOUNDARY_PROBE],
    actions: [],
    missing: [
      "No endpoint reads back the care_access_audit trail. GET /api/care/audit/access is a live boundary probe, not a log query.",
    ],
  },
  {
    key: "incidents",
    label: "Incidents",
    path: `${CARE_ADMIN_BASE_PATH}/incidents`,
    summary: "Record an operational incident and its resolution.",
    reads: [],
    actions: [],
    missing: [
      "No incident contract exists anywhere in server/care or shared/care.",
    ],
  },
  {
    key: "access",
    label: "Access",
    path: `${CARE_ADMIN_BASE_PATH}/access`,
    summary: "See which Care role carries which permission.",
    reads: [ACCESS_BOUNDARY_PROBE],
    actions: [],
    missing: [
      "No admin endpoint reads or changes a role assignment. The care_role_assignments table is read server-side by buildCareProductionDependencies and is not exposed over HTTP.",
    ],
  },
  {
    key: "flags",
    label: "Feature flags",
    path: `${CARE_ADMIN_BASE_PATH}/flags`,
    summary: "Read the server-authoritative Care capability. Read-only.",
    reads: [CAPABILITY_STATUS],
    actions: [],
    missing: [
      `No server contract exposes ${CARE_CLINICAL_GATE_NAMES.join(", ")}.`,
    ],
  },
];

const AREA_BY_KEY = new Map(CARE_ADMIN_AREAS.map((area) => [area.key, area]));

export function careAdminArea(key: CareAdminAreaKey): CareAdminArea {
  const area = AREA_BY_KEY.get(key);
  if (!area) throw new Error(`unknown_care_admin_area:${key}`);
  return area;
}

/** Areas this console can actually read something from. */
export function wiredCareAdminAreas(): readonly CareAdminArea[] {
  return CARE_ADMIN_AREAS.filter((area) => area.reads.length > 0);
}

/** Areas with no server contract at all. */
export function pendingCareAdminAreas(): readonly CareAdminArea[] {
  return CARE_ADMIN_AREAS.filter((area) => area.reads.length === 0);
}
