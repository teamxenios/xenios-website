import type { CareAppointment } from "@shared/care/appointments";
import type { CareConsentDocument, CareConsentKind } from "@shared/care/consent";
import type { CareClinicianReview } from "@shared/care/clinician-review";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareClinicalIntake } from "@shared/care/intake";
import { getSupabaseAdmin } from "../supabase";
import { resolveCareConsentStatus } from "./consent";
import type { CareReviewFacts } from "./review-detail";

/**
 * The read side of the clinician review experience. Both methods are scoped to
 * the assigned clinician inside the query, so an unassigned clinician cannot
 * read a review even if a review id leaks.
 */
export interface CareClinicianReviewRepository {
  listAssignedReviewFacts(clinicianUserId: string): Promise<CareReviewFacts[]>;
  loadAssignedReviewFacts(input: {
    reviewId: CareRecordId;
    clinicianUserId: string;
  }): Promise<CareReviewFacts | null>;
}

type Row = Record<string, unknown>;

const REVIEW_COLUMNS =
  "id, appointment_id, patient_id, assigned_clinician_user_id, patient_state_code, status, final_decision, final_decision_source, version, created_at, updated_at";
const APPOINTMENT_COLUMNS =
  "id, patient_id, intake_id, patient_location_id, patient_state_code, assigned_clinician_user_id, clinician_coverage_id, status, starts_at, ends_at, version, created_at, updated_at";
const INTAKE_COLUMNS =
  "id, patient_id, definition_id, definition_version, telehealth_consent_event_id, privacy_consent_event_id, status, version, created_at, submitted_at";
const CONSENT_KINDS: readonly CareConsentKind[] = ["telehealth", "privacy_notice"];

function asRecordId(value: unknown): CareRecordId {
  return String(value) as CareRecordId;
}

function throwOnError(error: { message?: string } | null, code: string) {
  if (error) throw new Error(code);
}

function asReview(row: Row): CareClinicianReview {
  return {
    id: asRecordId(row.id),
    appointmentId: asRecordId(row.appointment_id),
    patientId: asRecordId(row.patient_id),
    assignedClinicianUserId: String(row.assigned_clinician_user_id),
    patientStateCode: String(row.patient_state_code),
    status: row.status as CareClinicianReview["status"],
    finalDecision:
      (row.final_decision as CareClinicianReview["finalDecision"]) ?? null,
    finalDecisionSource:
      (row.final_decision_source as CareClinicianReview["finalDecisionSource"]) ??
      null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asAppointment(row: Row, telehealthReady: boolean): CareAppointment {
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
    telehealthReady,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asIntake(row: Row): CareClinicalIntake {
  return {
    id: asRecordId(row.id),
    patientId: asRecordId(row.patient_id),
    definitionId: asRecordId(row.definition_id),
    definitionVersion: String(row.definition_version),
    telehealthConsentEventId: asRecordId(row.telehealth_consent_event_id),
    privacyConsentEventId: asRecordId(row.privacy_consent_event_id),
    status: row.status as CareClinicalIntake["status"],
    version: Number(row.version),
    createdAt: String(row.created_at),
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
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
export function lazyCareClinicianReviewRepository(
  build: () => CareClinicianReviewRepository = buildCareClinicianReviewRepository,
): CareClinicianReviewRepository {
  let instance: CareClinicianReviewRepository | null = null;
  const resolve = () => {
    instance ??= build();
    return instance;
  };
  return {
    listAssignedReviewFacts: (clinicianUserId) =>
      resolve().listAssignedReviewFacts(clinicianUserId),
    loadAssignedReviewFacts: (input) => resolve().loadAssignedReviewFacts(input),
  };
}

export function buildCareClinicianReviewRepository(): CareClinicianReviewRepository {
  const admin = getSupabaseAdmin();

  const loadTelehealthReady = async (appointmentId: string): Promise<boolean> => {
    const { data, error } = await admin
      .from("care_telehealth_sessions")
      .select("appointment_id")
      .eq("appointment_id", appointmentId)
      .eq("status", "ready")
      .limit(1);
    throwOnError(error, "care_telehealth_status_lookup_failed");
    return Boolean(data?.length);
  };

  const loadAppointment = async (
    appointmentId: CareRecordId,
  ): Promise<CareAppointment | null> => {
    const { data, error } = await admin
      .from("care_appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("id", appointmentId)
      .maybeSingle();
    throwOnError(error, "care_appointment_lookup_failed");
    if (!data) return null;
    return asAppointment(
      data as Row,
      await loadTelehealthReady(String((data as Row).id)),
    );
  };

  const loadIntake = async (
    intakeId: CareRecordId,
  ): Promise<CareClinicalIntake | null> => {
    const { data, error } = await admin
      .from("care_intakes")
      .select(INTAKE_COLUMNS)
      .eq("id", intakeId)
      .maybeSingle();
    throwOnError(error, "care_intake_lookup_failed");
    return data ? asIntake(data as Row) : null;
  };

  const loadConsents = async (patientId: CareRecordId) =>
    Promise.all(
      CONSENT_KINDS.map(async (kind) => {
        const { data: document, error: documentError } = await admin
          .from("care_consent_documents")
          .select("id, kind, version, content_hash, status, approved_at, effective_at")
          .eq("kind", kind)
          .eq("status", "approved")
          .maybeSingle();
        throwOnError(documentError, "care_consent_document_lookup_failed");

        const { data: events, error: eventError } = await admin
          .from("care_consent_events")
          .select("id, patient_id, document_id, kind, document_version, action, occurred_at")
          .eq("patient_id", patientId)
          .eq("kind", kind)
          .order("occurred_at", { ascending: false })
          .limit(10);
        throwOnError(eventError, "care_consent_event_lookup_failed");

        const requiredDocument: CareConsentDocument | null = document
          ? {
              id: asRecordId(document.id),
              kind,
              version: String(document.version),
              contentHash: String(document.content_hash),
              status: "approved",
              approvedAt: document.approved_at ? String(document.approved_at) : null,
              effectiveAt: document.effective_at
                ? String(document.effective_at)
                : null,
            }
          : null;

        return resolveCareConsentStatus(
          kind,
          requiredDocument,
          (events ?? []).map((event) => ({
            id: asRecordId(event.id),
            patientId: asRecordId(event.patient_id),
            documentId: asRecordId(event.document_id),
            kind,
            documentVersion: String(event.document_version),
            action: event.action as "granted" | "revoked",
            occurredAt: String(event.occurred_at),
          })),
          patientId,
        );
      }),
    );

  const factsForReview = async (
    review: CareClinicianReview,
  ): Promise<CareReviewFacts> => {
    const appointment = await loadAppointment(review.appointmentId);
    const [intake, consents] = await Promise.all([
      appointment ? loadIntake(appointment.intakeId) : Promise.resolve(null),
      loadConsents(review.patientId),
    ]);
    return { review, appointment, intake, consents };
  };

  return {
    async listAssignedReviewFacts(clinicianUserId) {
      const { data, error } = await admin
        .from("care_clinician_reviews")
        .select(REVIEW_COLUMNS)
        .eq("assigned_clinician_user_id", clinicianUserId)
        .order("updated_at", { ascending: true });
      throwOnError(error, "care_clinician_review_lookup_failed");
      const reviews = (data ?? []).map((row) => asReview(row as Row));
      return Promise.all(reviews.map(factsForReview));
    },

    async loadAssignedReviewFacts({ reviewId, clinicianUserId }) {
      const { data, error } = await admin
        .from("care_clinician_reviews")
        .select(REVIEW_COLUMNS)
        .eq("id", reviewId)
        .eq("assigned_clinician_user_id", clinicianUserId)
        .maybeSingle();
      throwOnError(error, "care_clinician_review_lookup_failed");
      if (!data) return null;
      return factsForReview(asReview(data as Row));
    },
  };
}
