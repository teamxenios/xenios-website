import type {
  CareAppointment,
  CareAppointmentReadinessFacts,
} from "@shared/care/appointments";
import type {
  CareClinicianReview,
  CareClinicianReviewAction,
} from "@shared/care/clinician-review";
import type { CareRecordId } from "@shared/care/contracts";
import { getSupabaseAdmin } from "../supabase";

type Row = Record<string, unknown>;

export interface CareAppointmentRepository {
  listPatientAppointments(patientId: CareRecordId): Promise<CareAppointment[]>;
  listAssignedReviews(clinicianUserId: string): Promise<CareClinicianReview[]>;
  loadReadiness(stateCode: string | null): Promise<CareAppointmentReadinessFacts>;
  requestAppointment(input: {
    patientId: CareRecordId;
    intakeId: CareRecordId;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAppointment>;
  assignClinician(input: {
    appointmentId: CareRecordId;
    clinicianUserId: string;
    adminUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAppointment>;
  scheduleAppointment(input: {
    appointmentId: CareRecordId;
    adminUserId: string;
    expectedVersion: number;
    providerKey: string;
    providerSessionReference: string;
    startsAt: string;
    endsAt: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAppointment>;
  patientAction(input: {
    appointmentId: CareRecordId;
    patientId: CareRecordId;
    expectedVersion: number;
    action: "cancel" | "check_in";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAppointment>;
  clinicianComplete(input: {
    appointmentId: CareRecordId;
    clinicianUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAppointment>;
  adminMarkNoShow(input: {
    appointmentId: CareRecordId;
    adminUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAppointment>;
  applyReviewAction(input: {
    reviewId: CareRecordId;
    clinicianUserId: string;
    expectedVersion: number;
    action: CareClinicianReviewAction;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareClinicianReview>;
}

function asRecordId(value: unknown): CareRecordId {
  return String(value) as CareRecordId;
}

function asAppointment(row: Row, readyIds: ReadonlySet<string> = new Set()): CareAppointment {
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

function asReview(row: Row): CareClinicianReview {
  return {
    id: asRecordId(row.id),
    appointmentId: asRecordId(row.appointment_id),
    patientId: asRecordId(row.patient_id),
    assignedClinicianUserId: String(row.assigned_clinician_user_id),
    patientStateCode: String(row.patient_state_code),
    status: row.status as CareClinicianReview["status"],
    finalDecision: (row.final_decision as CareClinicianReview["finalDecision"]) ?? null,
    finalDecisionSource:
      (row.final_decision_source as CareClinicianReview["finalDecisionSource"]) ?? null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function throwOnError(error: { message?: string } | null, code: string) {
  if (error) throw new Error(code);
}

const APPOINTMENT_COLUMNS =
  "id, patient_id, intake_id, patient_location_id, patient_state_code, assigned_clinician_user_id, clinician_coverage_id, status, starts_at, ends_at, version, created_at, updated_at";
const REVIEW_COLUMNS =
  "id, appointment_id, patient_id, assigned_clinician_user_id, patient_state_code, status, final_decision, final_decision_source, version, created_at, updated_at";

export function buildCareAppointmentRepository(): CareAppointmentRepository {
  const admin = getSupabaseAdmin();

  const rpcAppointment = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CareAppointment> => {
    const { data, error } = await admin.rpc(name, args);
    throwOnError(error, "care_appointment_write_failed");
    return asAppointment(data as Row);
  };

  return {
    async listPatientAppointments(patientId) {
      const { data, error } = await admin
        .from("care_appointments")
        .select(APPOINTMENT_COLUMNS)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
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
        readyIds = new Set((sessions.data ?? []).map((row) => String(row.appointment_id)));
      }
      return (data ?? []).map((row) => asAppointment(row as Row, readyIds));
    },

    async listAssignedReviews(clinicianUserId) {
      const { data, error } = await admin
        .from("care_clinician_reviews")
        .select(REVIEW_COLUMNS)
        .eq("assigned_clinician_user_id", clinicianUserId)
        .order("updated_at", { ascending: false });
      throwOnError(error, "care_clinician_review_lookup_failed");
      return (data ?? []).map((row) => asReview(row as Row));
    },

    async loadReadiness(stateCode) {
      const now = new Date().toISOString();
      const [
        medicalGroups,
        clinicianProfiles,
        clinicianLicenses,
        schedulingProviders,
        supportedState,
        coverage,
      ] = await Promise.all([
        admin.from("care_medical_groups").select("id").eq("verification_state", "verified").limit(1),
        admin.from("care_clinician_profiles").select("clinician_user_id").eq("verification_state", "verified").limit(1),
        stateCode
          ? admin.from("care_clinician_licenses").select("id").eq("state_code", stateCode).eq("verification_state", "verified").gt("expires_at", now).limit(1)
          : Promise.resolve({ data: [], error: null }),
        admin.from("care_scheduling_providers").select("provider_key, reminder_offsets_minutes").eq("verification_state", "verified").eq("scheduling_active", true).eq("telehealth_active", true).limit(1),
        stateCode
          ? admin.from("care_supported_states").select("state_code").eq("state_code", stateCode).eq("supported_state_active", true).eq("service_coverage_active", true).limit(1)
          : Promise.resolve({ data: [], error: null }),
        stateCode
          ? admin.from("care_clinician_state_coverage").select("id").eq("state_code", stateCode).eq("active", true).limit(1)
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [
        medicalGroups,
        clinicianProfiles,
        clinicianLicenses,
        schedulingProviders,
        supportedState,
        coverage,
      ]) {
        throwOnError(result.error, "care_appointment_readiness_lookup_failed");
      }
      const provider = schedulingProviders.data?.[0];
      return {
        medicalGroupVerified: Boolean(medicalGroups.data?.length),
        clinicianRecordVerified: Boolean(clinicianProfiles.data?.length),
        clinicianLicenseVerified: Boolean(clinicianLicenses.data?.length),
        clinicianCredentialsVerified:
          Boolean(clinicianProfiles.data?.length) &&
          Boolean(clinicianLicenses.data?.length),
        clinicianCoverageVerified: Boolean(coverage.data?.length),
        supportedStateVerified: Boolean(supportedState.data?.length),
        telehealthProviderVerified: Boolean(provider),
        schedulingProviderVerified: Boolean(provider),
        remindersConfigured:
          Array.isArray(provider?.reminder_offsets_minutes) &&
          provider.reminder_offsets_minutes.length > 0,
        publicActivationApproved: false,
      };
    },

    requestAppointment: (input) =>
      rpcAppointment("care_request_appointment", {
        p_patient_id: input.patientId,
        p_intake_id: input.intakeId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    assignClinician: (input) =>
      rpcAppointment("care_assign_clinician", {
        p_appointment_id: input.appointmentId,
        p_clinician_user_id: input.clinicianUserId,
        p_admin_user_id: input.adminUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    scheduleAppointment: (input) =>
      rpcAppointment("care_schedule_appointment", {
        p_appointment_id: input.appointmentId,
        p_admin_user_id: input.adminUserId,
        p_expected_version: input.expectedVersion,
        p_provider_key: input.providerKey,
        p_provider_session_reference: input.providerSessionReference,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    patientAction: (input) =>
      rpcAppointment("care_patient_appointment_action", {
        p_appointment_id: input.appointmentId,
        p_patient_id: input.patientId,
        p_expected_version: input.expectedVersion,
        p_action: input.action,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    clinicianComplete: (input) =>
      rpcAppointment("care_clinician_complete_appointment", {
        p_appointment_id: input.appointmentId,
        p_clinician_user_id: input.clinicianUserId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    adminMarkNoShow: (input) =>
      rpcAppointment("care_admin_mark_no_show", {
        p_appointment_id: input.appointmentId,
        p_admin_user_id: input.adminUserId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      }),
    async applyReviewAction(input) {
      const { data, error } = await admin.rpc("care_apply_clinician_review_action", {
        p_review_id: input.reviewId,
        p_clinician_user_id: input.clinicianUserId,
        p_actor_kind: "human_clinician",
        p_expected_version: input.expectedVersion,
        p_action: input.action,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_clinician_review_write_failed");
      return asReview(data as Row);
    },
  };
}
