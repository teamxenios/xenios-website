import type { CareAppointment } from "@shared/care/appointments";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CarePharmacyOrder,
  CarePrescription,
} from "@shared/care/prescriptions";
import { getSupabaseAdmin } from "../supabase";
import type { CareAdminPrescriptionFacts } from "./admin-queues";

type Row = Record<string, unknown>;

/**
 * The read side of the Care administrator's queues.
 *
 * This is a separate repository from the patient and pharmacy repositories on
 * purpose. Those are scoped to a single caller by construction, and widening
 * them would make it possible to call a self-scoped method without a scope.
 * Every method here is unscoped by design and is only ever reached through a
 * `care:administer` route.
 *
 * Each query is filtered to the records an administrator can actually act on,
 * so the response is a work list rather than a dump of the Care tables.
 */
export interface CareAdminQueueRepository {
  /** Appointments still open for admin routing. Terminal states excluded. */
  listOpenAppointments(): Promise<CareAppointment[]>;
  /** Signed prescriptions, with the pharmacy order if one already exists. */
  listSignedPrescriptions(): Promise<CareAdminPrescriptionFacts[]>;
  /** Every pharmacy order, as a workflow projection for the administrator. */
  listPharmacyOrders(): Promise<CarePharmacyOrder[]>;
}

const OPEN_APPOINTMENT_STATUSES = [
  "requested",
  "scheduled",
  "checked_in",
] as const;

const APPOINTMENT_COLUMNS =
  "id, patient_id, intake_id, patient_location_id, patient_state_code, assigned_clinician_user_id, clinician_coverage_id, status, starts_at, ends_at, version, created_at, updated_at";
const PRESCRIPTION_COLUMNS =
  "id,patient_id,appointment_id,clinician_review_id,prescribing_clinician_user_id,verified_content_source_id,status,version,signed_at,supersedes_prescription_id,created_at,updated_at,care_pharmacy_orders(id)";
const ORDER_COLUMNS =
  "id,patient_id,prescription_id,assigned_pharmacy_id,patient_state_code,status,clarification_open,tracking_reference,version,created_at,updated_at";

function asRecordId(value: unknown): CareRecordId {
  return String(value) as CareRecordId;
}

function throwOnError(error: { message?: string } | null, code: string) {
  if (error) throw new Error(code);
}

function asAppointment(
  row: Row,
  readyIds: ReadonlySet<string>,
): CareAppointment {
  return {
    id: asRecordId(row.id),
    patientId: asRecordId(row.patient_id),
    intakeId: asRecordId(row.intake_id),
    patientLocationId: asRecordId(row.patient_location_id),
    patientStateCode: String(row.patient_state_code),
    assignedClinicianUserId: row.assigned_clinician_user_id
      ? String(row.assigned_clinician_user_id)
      : null,
    clinicianCoverageId: row.clinician_coverage_id
      ? asRecordId(row.clinician_coverage_id)
      : null,
    status: row.status as CareAppointment["status"],
    startsAt: row.starts_at ? String(row.starts_at) : null,
    endsAt: row.ends_at ? String(row.ends_at) : null,
    telehealthReady: readyIds.has(String(row.id)),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * The prescription content source is deliberately NOT selected. An
 * administrator routes a prescription to a pharmacy; they do not need the
 * formulation, concentration, or directions to do that, so those columns never
 * leave the database on this path.
 */
function asPrescription(row: Row): CarePrescription {
  return {
    id: asRecordId(row.id),
    patientId: asRecordId(row.patient_id),
    appointmentId: asRecordId(row.appointment_id),
    clinicianReviewId: asRecordId(row.clinician_review_id),
    prescribingClinicianUserId: String(row.prescribing_clinician_user_id),
    status: row.status as CarePrescription["status"],
    formulation: null,
    concentration: null,
    route: null,
    quantity: null,
    directions: null,
    refills: null,
    verifiedContentSourceId: row.verified_content_source_id
      ? asRecordId(row.verified_content_source_id)
      : null,
    version: Number(row.version),
    signedAt: row.signed_at ? String(row.signed_at) : null,
    supersedesPrescriptionId: row.supersedes_prescription_id
      ? asRecordId(row.supersedes_prescription_id)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * `care_pharmacy_orders` is unique on `prescription_id`, so the embedded
 * relation is at most one row. Supabase still returns it as an array when the
 * shape is inferred as a collection, so both shapes are handled.
 */
function embeddedOrderId(value: unknown): CareRecordId | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const id = (row as Row).id;
  return id ? asRecordId(id) : null;
}

function asOrder(row: Row): CarePharmacyOrder {
  return {
    id: asRecordId(row.id),
    patientId: asRecordId(row.patient_id),
    prescriptionId: asRecordId(row.prescription_id),
    assignedPharmacyId: asRecordId(row.assigned_pharmacy_id),
    patientStateCode: String(row.patient_state_code),
    status: row.status as CarePharmacyOrder["status"],
    clarificationOpen: Boolean(row.clarification_open),
    trackingReferencePresent: Boolean(row.tracking_reference),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Defer construction until the first authorized read.
 *
 * The Supabase admin client throws when it is not configured, so building
 * eagerly at import time would decide the outcome at boot. Building on first
 * use keeps the failure inside the request, where the route turns it into the
 * standard temporarily-unavailable response.
 */
export function lazyCareAdminQueueRepository(
  build: () => CareAdminQueueRepository = buildCareAdminQueueRepository,
): CareAdminQueueRepository {
  let instance: CareAdminQueueRepository | null = null;
  const resolve = () => {
    instance ??= build();
    return instance;
  };
  return {
    listOpenAppointments: () => resolve().listOpenAppointments(),
    listSignedPrescriptions: () => resolve().listSignedPrescriptions(),
    listPharmacyOrders: () => resolve().listPharmacyOrders(),
  };
}

export function buildCareAdminQueueRepository(): CareAdminQueueRepository {
  const admin = getSupabaseAdmin();

  return {
    async listOpenAppointments() {
      const { data, error } = await admin
        .from("care_appointments")
        .select(APPOINTMENT_COLUMNS)
        .in("status", OPEN_APPOINTMENT_STATUSES)
        .order("created_at", { ascending: true });
      throwOnError(error, "care_appointment_lookup_failed");
      const ids = (data ?? []).map((row) => String(row.id));
      let readyIds = new Set<string>();
      if (ids.length > 0) {
        const sessions = await admin
          .from("care_telehealth_sessions")
          .select("appointment_id")
          .in("appointment_id", ids)
          .eq("status", "ready");
        throwOnError(sessions.error, "care_telehealth_status_lookup_failed");
        readyIds = new Set(
          (sessions.data ?? []).map((row) => String(row.appointment_id)),
        );
      }
      return (data ?? []).map((row) => asAppointment(row as Row, readyIds));
    },

    async listSignedPrescriptions() {
      const { data, error } = await admin
        .from("care_prescriptions")
        .select(PRESCRIPTION_COLUMNS)
        .eq("status", "signed")
        .order("created_at", { ascending: true });
      throwOnError(error, "care_prescription_lookup_failed");
      return (data ?? []).map((row) => ({
        prescription: asPrescription(row as Row),
        pharmacyOrderId: embeddedOrderId((row as Row).care_pharmacy_orders),
      }));
    },

    async listPharmacyOrders() {
      const { data, error } = await admin
        .from("care_pharmacy_orders")
        .select(ORDER_COLUMNS)
        .order("created_at", { ascending: true });
      throwOnError(error, "care_pharmacy_order_lookup_failed");
      return (data ?? []).map((row) => asOrder(row as Row));
    },
  };
}
