import type { CareAdverseEventAction } from "./communications";
import type {
  CareAdverseEvent,
  CareAdverseEventCategory,
  CareAdverseEventUrgency,
  CareLabCase,
  CareMessage,
  CareMessageConversation,
  CareMessageThread,
} from "@shared/care/communications";
import type { CareRecordId } from "@shared/care/contracts";
import { getSupabaseAdmin } from "../supabase";
import type { CareLabAction } from "./communications";

type Row = Record<string, unknown>;
const asId = (value: unknown) => String(value) as CareRecordId;
const throwOnError = (error: { message?: string } | null, code: string) => {
  if (error) throw new Error(code);
};

function asMessage(row: Row): CareMessage {
  return {
    id: asId(row.id),
    threadId: asId(row.thread_id),
    patientId: asId(row.patient_id),
    senderUserId: String(row.sender_user_id),
    senderKind: row.sender_kind as CareMessage["senderKind"],
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

function asConversation(row: Row): CareMessageConversation {
  return {
    thread: {
      id: asId(row.id),
      patientId: asId(row.patient_id),
      appointmentId: asId(row.appointment_id),
      assignedClinicianUserId: String(row.assigned_clinician_user_id),
      status: row.status as CareMessageThread["status"],
      subjectCategory: String(row.subject_category),
      version: Number(row.version),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    },
    messages: ((row.care_messages ?? []) as Row[]).map(asMessage),
  };
}

function asLabCase(row: Row): CareLabCase {
  return {
    id: asId(row.id),
    patientId: asId(row.patient_id),
    appointmentId: row.appointment_id ? asId(row.appointment_id) : null,
    status: row.status as CareLabCase["status"],
    hasProviderReference: Boolean(row.provider_reference),
    hasOrderReference: Boolean(row.order_reference),
    hasResultReference: Boolean(row.result_reference),
    hasSecureObjectReference: Boolean(row.secure_object_reference),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asAdverseEvent(
  row: Row,
  assignment?: Row,
): CareAdverseEvent {
  return {
    id: asId(row.id),
    patientId: asId(row.patient_id),
    category: row.category as CareAdverseEvent["category"],
    urgency: row.urgency as CareAdverseEvent["urgency"],
    summary: String(row.summary),
    status: row.status as CareAdverseEvent["status"],
    assignedOwnerUserId: assignment?.owner_user_id
      ? String(assignment.owner_user_id)
      : null,
    assignedOwnerRole: assignment?.owner_role
      ? (String(assignment.owner_role) as CareAdverseEvent["assignedOwnerRole"])
      : null,
    acknowledgedAt: row.acknowledged_at
      ? String(row.acknowledged_at)
      : null,
    escalatedAt: row.escalated_at ? String(row.escalated_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const THREAD_COLUMNS =
  "id,patient_id,appointment_id,assigned_clinician_user_id,status,subject_category,version,created_at,updated_at,care_messages(id,thread_id,patient_id,sender_user_id,sender_kind,body,created_at)";
const LAB_COLUMNS =
  "id,patient_id,appointment_id,status,provider_reference,order_reference,result_reference,secure_object_reference,reviewed_at,version,created_at,updated_at";
const ADVERSE_COLUMNS =
  "id,patient_id,category,urgency,summary,status,acknowledged_at,escalated_at,closed_at,version,created_at,updated_at";

export interface CareCommunicationRepository {
  listPatientConversations(patientId: CareRecordId): Promise<CareMessageConversation[]>;
  listClinicianConversations(clinicianUserId: string): Promise<CareMessageConversation[]>;
  createMessageThread(input: {
    patientId: CareRecordId;
    appointmentId: CareRecordId;
    subjectCategory: string;
    patientUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareMessageConversation>;
  postMessage(input: {
    threadId: CareRecordId;
    actorUserId: string;
    body: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareMessage>;
  listPatientLabCases(patientId: CareRecordId): Promise<CareLabCase[]>;
  listAssignedLabCases(reviewerUserId: string): Promise<CareLabCase[]>;
  createLabCase(input: {
    patientId: CareRecordId;
    appointmentId: CareRecordId | null;
    adminUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareLabCase>;
  assignLabReviewer(input: {
    labCaseId: CareRecordId;
    reviewerUserId: string;
    adminUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void>;
  applyLabAction(input: {
    labCaseId: CareRecordId;
    reviewerUserId: string;
    expectedVersion: number;
    action: CareLabAction;
    providerReference: string | null;
    orderReference: string | null;
    resultReference: string | null;
    secureObjectReference: string | null;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareLabCase>;
  listPatientAdverseEvents(patientId: CareRecordId): Promise<CareAdverseEvent[]>;
  listAssignedAdverseEvents(ownerUserId: string): Promise<CareAdverseEvent[]>;
  reportAdverseEvent(input: {
    patientId: CareRecordId;
    patientUserId: string;
    category: CareAdverseEventCategory;
    urgency: CareAdverseEventUrgency;
    summary: string;
    emergencyGuidanceAcknowledged: boolean;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAdverseEvent>;
  assignAdverseEventOwner(input: {
    adverseEventId: CareRecordId;
    ownerUserId: string;
    ownerRole: "clinician" | "clinical_support";
    adminUserId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void>;
  applyAdverseEventAction(input: {
    adverseEventId: CareRecordId;
    actorUserId: string;
    expectedVersion: number;
    action: CareAdverseEventAction;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareAdverseEvent>;
}

export function buildCareCommunicationRepository(): CareCommunicationRepository {
  const admin = getSupabaseAdmin();
  const getConversation = async (threadId: CareRecordId) => {
    const result = await admin
      .from("care_message_threads")
      .select(THREAD_COLUMNS)
      .eq("id", threadId)
      .single();
    throwOnError(result.error, "care_message_thread_lookup_failed");
    return asConversation(result.data as Row);
  };
  const listAdverse = async (query: {
    patientId?: CareRecordId;
    ownerUserId?: string;
  }) => {
    let ids: string[] | null = null;
    const assignmentByEvent = new Map<string, Row>();
    if (query.ownerUserId) {
      const assignments = await admin
        .from("care_adverse_event_assignments")
        .select("adverse_event_id,owner_user_id,owner_role")
        .eq("owner_user_id", query.ownerUserId)
        .is("revoked_at", null);
      throwOnError(assignments.error, "care_adverse_assignment_lookup_failed");
      for (const row of assignments.data ?? []) {
        ids ??= [];
        ids.push(String(row.adverse_event_id));
        assignmentByEvent.set(String(row.adverse_event_id), row as Row);
      }
      if (!ids?.length) return [];
    }
    let request = admin
      .from("care_adverse_events")
      .select(ADVERSE_COLUMNS)
      .order("updated_at", { ascending: false });
    if (query.patientId) request = request.eq("patient_id", query.patientId);
    if (ids) request = request.in("id", ids);
    const events = await request;
    throwOnError(events.error, "care_adverse_event_lookup_failed");
    if (!query.ownerUserId && (events.data?.length ?? 0) > 0) {
      const eventIds = (events.data ?? []).map((row) => String(row.id));
      const assignments = await admin
        .from("care_adverse_event_assignments")
        .select("adverse_event_id,owner_user_id,owner_role")
        .in("adverse_event_id", eventIds)
        .is("revoked_at", null);
      throwOnError(assignments.error, "care_adverse_assignment_lookup_failed");
      for (const row of assignments.data ?? []) {
        assignmentByEvent.set(String(row.adverse_event_id), row as Row);
      }
    }
    return (events.data ?? []).map((row) =>
      asAdverseEvent(
        row as Row,
        assignmentByEvent.get(String(row.id)),
      ),
    );
  };
  return {
    async listPatientConversations(patientId) {
      const result = await admin
        .from("care_message_threads")
        .select(THREAD_COLUMNS)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false });
      throwOnError(result.error, "care_message_thread_lookup_failed");
      return (result.data ?? []).map((row) => asConversation(row as Row));
    },
    async listClinicianConversations(clinicianUserId) {
      const result = await admin
        .from("care_message_threads")
        .select(THREAD_COLUMNS)
        .eq("assigned_clinician_user_id", clinicianUserId)
        .order("updated_at", { ascending: false });
      throwOnError(result.error, "care_message_thread_lookup_failed");
      return (result.data ?? []).map((row) => asConversation(row as Row));
    },
    async createMessageThread(input) {
      const result = await admin.rpc("care_create_message_thread", {
        p_patient_id: input.patientId,
        p_appointment_id: input.appointmentId,
        p_subject_category: input.subjectCategory,
        p_patient_user_id: input.patientUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_message_thread_write_failed");
      return getConversation(asId((result.data as Row).id));
    },
    async postMessage(input) {
      const result = await admin.rpc("care_post_message", {
        p_thread_id: input.threadId,
        p_actor_user_id: input.actorUserId,
        p_body: input.body,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_message_write_failed");
      return asMessage(result.data as Row);
    },
    async listPatientLabCases(patientId) {
      const result = await admin
        .from("care_lab_cases")
        .select(LAB_COLUMNS)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false });
      throwOnError(result.error, "care_lab_lookup_failed");
      return (result.data ?? []).map((row) => asLabCase(row as Row));
    },
    async listAssignedLabCases(reviewerUserId) {
      const assignments = await admin
        .from("care_lab_assignments")
        .select("lab_case_id")
        .eq("reviewer_user_id", reviewerUserId)
        .is("revoked_at", null);
      throwOnError(assignments.error, "care_lab_assignment_lookup_failed");
      const ids = (assignments.data ?? []).map((row) => String(row.lab_case_id));
      if (!ids.length) return [];
      const result = await admin
        .from("care_lab_cases")
        .select(LAB_COLUMNS)
        .in("id", ids)
        .order("updated_at", { ascending: false });
      throwOnError(result.error, "care_lab_lookup_failed");
      return (result.data ?? []).map((row) => asLabCase(row as Row));
    },
    async createLabCase(input) {
      const result = await admin.rpc("care_create_lab_case", {
        p_patient_id: input.patientId,
        p_appointment_id: input.appointmentId,
        p_admin_user_id: input.adminUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_lab_write_failed");
      return asLabCase(result.data as Row);
    },
    async assignLabReviewer(input) {
      const result = await admin.rpc("care_assign_lab_reviewer", {
        p_lab_case_id: input.labCaseId,
        p_reviewer_user_id: input.reviewerUserId,
        p_admin_user_id: input.adminUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_lab_assignment_write_failed");
    },
    async applyLabAction(input) {
      const result = await admin.rpc("care_apply_lab_action", {
        p_lab_case_id: input.labCaseId,
        p_reviewer_user_id: input.reviewerUserId,
        p_expected_version: input.expectedVersion,
        p_action: input.action,
        p_provider_reference: input.providerReference,
        p_order_reference: input.orderReference,
        p_result_reference: input.resultReference,
        p_secure_object_reference: input.secureObjectReference,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_lab_write_failed");
      return asLabCase(result.data as Row);
    },
    listPatientAdverseEvents: (patientId) => listAdverse({ patientId }),
    listAssignedAdverseEvents: (ownerUserId) => listAdverse({ ownerUserId }),
    async reportAdverseEvent(input) {
      const result = await admin.rpc("care_report_adverse_event", {
        p_patient_id: input.patientId,
        p_patient_user_id: input.patientUserId,
        p_category: input.category,
        p_urgency: input.urgency,
        p_summary: input.summary,
        p_emergency_guidance_acknowledged:
          input.emergencyGuidanceAcknowledged,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_adverse_event_write_failed");
      return asAdverseEvent(result.data as Row);
    },
    async assignAdverseEventOwner(input) {
      const result = await admin.rpc("care_assign_adverse_event_owner", {
        p_adverse_event_id: input.adverseEventId,
        p_owner_user_id: input.ownerUserId,
        p_owner_role: input.ownerRole,
        p_admin_user_id: input.adminUserId,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_adverse_assignment_write_failed");
    },
    async applyAdverseEventAction(input) {
      const result = await admin.rpc("care_apply_adverse_event_action", {
        p_adverse_event_id: input.adverseEventId,
        p_actor_user_id: input.actorUserId,
        p_expected_version: input.expectedVersion,
        p_action: input.action,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      throwOnError(result.error, "care_adverse_event_write_failed");
      return asAdverseEvent(result.data as Row);
    },
  };
}
