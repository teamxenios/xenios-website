import type {
  CarePharmacyAction,
  CarePharmacyOrder,
  CarePrescription,
  CarePrescriptionReadinessFacts,
} from "@shared/care/prescriptions";
import type { CareRecordId } from "@shared/care/contracts";
import { getSupabaseAdmin } from "../supabase";

type Row = Record<string, unknown>;

export interface CarePrescriptionRepository {
  listPatientPrescriptions(patientId: CareRecordId): Promise<CarePrescription[]>;
  listAssignedPharmacyOrders(operatorUserId: string): Promise<CarePharmacyOrder[]>;
  loadReadiness(input: {
    stateCode: string | null;
    clinicianUserId: string | null;
    pharmacyId: CareRecordId | null;
    prescriptionId: CareRecordId | null;
  }): Promise<CarePrescriptionReadinessFacts>;
  createDraft(input: {
    patientId: CareRecordId;
    reviewId: CareRecordId;
    clinicianUserId: string;
    formulation: string;
    concentration: string;
    route: string;
    quantity: string;
    directions: string;
    refills: number;
    supersedesPrescriptionId: CareRecordId | null;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePrescription>;
  sign(input: {
    prescriptionId: CareRecordId;
    clinicianUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePrescription>;
  assignPharmacy(input: {
    prescriptionId: CareRecordId;
    pharmacyId: CareRecordId;
    adminUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePharmacyOrder>;
  pharmacyAction(input: {
    orderId: CareRecordId;
    operatorUserId: string;
    expectedVersion: number;
    action: CarePharmacyAction;
    clarificationReference: string | null;
    trackingReference: string | null;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePharmacyOrder>;
  resolveClarification(input: {
    orderId: CareRecordId;
    resolverUserId: string;
    expectedVersion: number;
    resolutionReference: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePharmacyOrder>;
}

const asId = (value: unknown) => String(value) as CareRecordId;

function asPrescription(row: Row): CarePrescription {
  const source = (row.care_prescription_content_sources ?? {}) as Row;
  return {
    id: asId(row.id),
    patientId: asId(row.patient_id),
    appointmentId: asId(row.appointment_id),
    clinicianReviewId: asId(row.clinician_review_id),
    prescribingClinicianUserId: String(row.prescribing_clinician_user_id),
    status: row.status as CarePrescription["status"],
    formulation: source.formulation ? String(source.formulation) : null,
    concentration: source.concentration ? String(source.concentration) : null,
    route: source.route ? String(source.route) : null,
    quantity: source.quantity ? String(source.quantity) : null,
    directions: source.directions ? String(source.directions) : null,
    refills: source.refills === undefined ? null : Number(source.refills),
    verifiedContentSourceId: row.verified_content_source_id
      ? asId(row.verified_content_source_id)
      : null,
    version: Number(row.version),
    signedAt: row.signed_at ? String(row.signed_at) : null,
    supersedesPrescriptionId: row.supersedes_prescription_id
      ? asId(row.supersedes_prescription_id)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asOrder(row: Row): CarePharmacyOrder {
  return {
    id: asId(row.id),
    patientId: asId(row.patient_id),
    prescriptionId: asId(row.prescription_id),
    assignedPharmacyId: asId(row.assigned_pharmacy_id),
    patientStateCode: String(row.patient_state_code),
    status: row.status as CarePharmacyOrder["status"],
    clarificationOpen: Boolean(row.clarification_open),
    trackingReferencePresent: Boolean(row.tracking_reference),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function throwOnError(error: { message?: string } | null, code: string) {
  if (error) throw new Error(code);
}

const PRESCRIPTION_COLUMNS =
  "id,patient_id,appointment_id,clinician_review_id,prescribing_clinician_user_id,verified_content_source_id,status,version,signed_at,supersedes_prescription_id,created_at,updated_at,care_prescription_content_sources(formulation,concentration,route,quantity,directions,refills)";
const ORDER_COLUMNS =
  "id,patient_id,prescription_id,assigned_pharmacy_id,patient_state_code,status,clarification_open,tracking_reference,version,created_at,updated_at";

export function buildCarePrescriptionRepository(): CarePrescriptionRepository {
  const admin = getSupabaseAdmin();
  return {
    async listPatientPrescriptions(patientId) {
      const { data, error } = await admin
        .from("care_prescriptions")
        .select(PRESCRIPTION_COLUMNS)
        .eq("patient_id", patientId)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      throwOnError(error, "care_prescription_lookup_failed");
      return (data ?? []).map((row) => asPrescription(row as Row));
    },
    async listAssignedPharmacyOrders(operatorUserId) {
      const operators = await admin
        .from("care_pharmacy_operators")
        .select("pharmacy_id")
        .eq("user_id", operatorUserId)
        .eq("active", true)
        .is("revoked_at", null);
      throwOnError(operators.error, "care_pharmacy_operator_lookup_failed");
      const pharmacyIds = (operators.data ?? []).map((row) => String(row.pharmacy_id));
      if (pharmacyIds.length === 0) return [];
      const { data, error } = await admin
        .from("care_pharmacy_orders")
        .select(ORDER_COLUMNS)
        .in("assigned_pharmacy_id", pharmacyIds)
        .order("updated_at", { ascending: false });
      throwOnError(error, "care_pharmacy_order_lookup_failed");
      return (data ?? []).map((row) => asOrder(row as Row));
    },
    async loadReadiness(input) {
      const now = new Date().toISOString();
      const { data, error } = await admin.rpc("care_prescription_readiness", {
        p_clinician_user_id: input.clinicianUserId,
        p_pharmacy_id: input.pharmacyId,
        p_state_code: input.stateCode,
        p_prescription_id: input.prescriptionId,
        p_as_of: now,
      });
      throwOnError(error, "care_prescription_readiness_lookup_failed");
      const facts = (data ?? {}) as Row;
      return {
        medicalGroupVerified: Boolean(facts.medical_group_verified),
        clinicianCoverageVerified: Boolean(facts.clinician_coverage_verified),
        patientSpecificContentVerified: Boolean(
          facts.patient_specific_content_verified,
        ),
        pharmacyPartnerVerified: Boolean(facts.pharmacy_partner_verified),
        pharmacyIdentityVerified: Boolean(facts.pharmacy_identity_verified),
        pharmacyLicenseVerified: Boolean(facts.pharmacy_license_verified),
        pharmacyStateCoverageVerified: Boolean(
          facts.pharmacy_state_coverage_verified,
        ),
        pharmacyAgreementVerified: Boolean(facts.pharmacy_agreement_verified),
        pharmacyIntegrationVerified: Boolean(
          facts.pharmacy_integration_verified,
        ),
        pharmacySupportVerified: Boolean(facts.pharmacy_support_verified),
        publicActivationApproved: false,
      };
    },
    async createDraft(input) {
      const { data, error } = await admin.rpc("care_create_prescription_draft", {
        p_patient_id: input.patientId,
        p_review_id: input.reviewId,
        p_clinician_user_id: input.clinicianUserId,
        p_formulation: input.formulation,
        p_concentration: input.concentration,
        p_route: input.route,
        p_quantity: input.quantity,
        p_directions: input.directions,
        p_refills: input.refills,
        p_supersedes_prescription_id: input.supersedesPrescriptionId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_prescription_draft_failed");
      const source = await admin
        .from("care_prescription_content_sources")
        .select("formulation,concentration,route,quantity,directions,refills")
        .eq("id", (data as Row).verified_content_source_id)
        .single();
      throwOnError(source.error, "care_prescription_content_lookup_failed");
      return asPrescription({
        ...(data as Row),
        care_prescription_content_sources: source.data,
      });
    },
    async sign(input) {
      const { data, error } = await admin.rpc("care_sign_prescription", {
        p_prescription_id: input.prescriptionId,
        p_clinician_user_id: input.clinicianUserId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_prescription_sign_failed");
      const source = await admin
        .from("care_prescription_content_sources")
        .select("formulation,concentration,route,quantity,directions,refills")
        .eq("id", (data as Row).verified_content_source_id)
        .single();
      throwOnError(source.error, "care_prescription_content_lookup_failed");
      return asPrescription({ ...(data as Row), care_prescription_content_sources: source.data });
    },
    async assignPharmacy(input) {
      const { data, error } = await admin.rpc("care_assign_pharmacy_order", {
        p_prescription_id: input.prescriptionId,
        p_pharmacy_id: input.pharmacyId,
        p_admin_user_id: input.adminUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_pharmacy_assignment_failed");
      return asOrder(data as Row);
    },
    async pharmacyAction(input) {
      const { data, error } = await admin.rpc("care_apply_pharmacy_order_action", {
        p_order_id: input.orderId,
        p_operator_user_id: input.operatorUserId,
        p_expected_version: input.expectedVersion,
        p_action: input.action,
        p_clarification_reference: input.clarificationReference,
        p_tracking_reference: input.trackingReference,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(error, "care_pharmacy_order_write_failed");
      return asOrder(data as Row);
    },
    async resolveClarification(input) {
      const { data, error } = await admin.rpc(
        "care_resolve_pharmacy_clarification",
        {
          p_order_id: input.orderId,
          p_resolver_user_id: input.resolverUserId,
          p_expected_version: input.expectedVersion,
          p_resolution_reference: input.resolutionReference,
          p_idempotency_key: input.idempotencyKey,
          p_occurred_at: input.occurredAt,
        },
      );
      throwOnError(error, "care_clarification_resolution_failed");
      return asOrder(data as Row);
    },
  };
}
