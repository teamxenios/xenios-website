import type { CareRecordId } from "@shared/care/contracts";
import {
  CARE_INSTRUCTION_STORAGE_TABLES,
  CARE_MESSAGE_STORAGE_TABLES,
  CARE_SERVICE_STORAGE_AVAILABLE,
  CARE_SUPPLY_STORAGE_TABLES,
  CARE_SUPPORT_STORAGE_TABLES,
  CARE_TRANSMISSION_STATE,
  careServiceStorageMissing,
  type CareInstructionCategory,
  type CareInstructionRecord,
  type CareMessageRecord,
  type CareMessageThreadRecord,
  type CareMessageThreadStatus,
  type CareServiceStorageState,
  type CareSupplyShipmentRecord,
  type CareSupplyShipmentStatus,
  type CareSupportRequestRecord,
  type CareSupportRequestStatus,
  type CareSupportTopic,
} from "@shared/care/patient-services";
import { getSupabaseAdmin } from "../supabase";

/**
 * The read and write side of the patient service surfaces.
 *
 * The Care schema has no instruction, supply, message, or support table yet.
 * That is reported rather than hidden: a read returns which table is missing
 * instead of an empty list that looks like "you have none", and a write refuses
 * rather than accepting a message or a request that nothing can hold.
 *
 * Every query is scoped to the patient inside the query itself, so a repository
 * caller that lost track of whose record it was reading still cannot read
 * someone else's. Nothing here creates a table. When the migration that adds
 * them lands, these reads start returning records without another change, and a
 * column that does not match surfaces as a hard failure rather than as silently
 * wrong data.
 */

export interface CareInstructionsPage {
  storage: CareServiceStorageState;
  instructions: readonly CareInstructionRecord[];
}

export interface CareSuppliesPage {
  storage: CareServiceStorageState;
  shipments: readonly CareSupplyShipmentRecord[];
}

export interface CareMessageThreadsPage {
  storage: CareServiceStorageState;
  threads: readonly CareMessageThreadRecord[];
}

export interface CareSupportRequestsPage {
  storage: CareServiceStorageState;
  requests: readonly CareSupportRequestRecord[];
}

export interface CareInstructionRepository {
  listPatientInstructions(patientId: CareRecordId): Promise<CareInstructionsPage>;
}

export interface CareSupplyRepository {
  listPatientSupplyShipments(patientId: CareRecordId): Promise<CareSuppliesPage>;
}

export interface CareMessageRepository {
  listPatientThreads(patientId: CareRecordId): Promise<CareMessageThreadsPage>;
  recordPatientMessage(input: {
    patientId: CareRecordId;
    threadId: CareRecordId | null;
    subject: string | null;
    body: string;
    idempotencyKey: string;
    recordedAt: string;
  }): Promise<CareMessageRecord>;
}

export interface CareSupportRepository {
  listPatientSupportRequests(
    patientId: CareRecordId,
  ): Promise<CareSupportRequestsPage>;
  recordSupportRequest(input: {
    patientId: CareRecordId;
    topic: CareSupportTopic;
    body: string;
    idempotencyKey: string;
    recordedAt: string;
  }): Promise<CareSupportRequestRecord>;
}

/**
 * Raised when a write cannot be persisted because the record that would hold it
 * does not exist. The route turns this into a refusal that names the missing
 * table, never into a success.
 */
export class CareServiceStorageUnavailableError extends Error {
  readonly missingTables: readonly string[];

  constructor(missingTables: readonly string[]) {
    super("care_service_storage_unavailable");
    this.name = "CareServiceStorageUnavailableError";
    this.missingTables = [...missingTables];
  }
}

type Row = Record<string, unknown>;
type QueryError = { code?: string | null; message?: string | null } | null;
type QueryResult = { data: Row[] | null; error: QueryError };

/**
 * PostgREST reports an absent relation either with the Postgres code for an
 * undefined table or, when the schema cache is authoritative, with its own
 * not-found code and a message about the schema cache.
 */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

export function isMissingCareServiceRelation(error: QueryError): boolean {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  if (MISSING_RELATION_CODES.has(code)) return true;
  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function recordId(value: unknown): CareRecordId {
  return String(value) as CareRecordId;
}

function optionalRecordId(value: unknown): CareRecordId | null {
  return value ? (String(value) as CareRecordId) : null;
}

function asInstruction(row: Row): CareInstructionRecord {
  return {
    id: recordId(row.id),
    patientId: recordId(row.patient_id),
    prescriptionId: optionalRecordId(row.prescription_id),
    title: String(row.title ?? ""),
    category: row.category as CareInstructionCategory,
    version: String(row.version ?? ""),
    publishedAt: text(row.published_at),
    publishedByUserId: text(row.published_by_user_id),
    acknowledgedAt: text(row.acknowledged_at),
    bodyRecorded: Boolean(text(row.body)),
    updatedAt: String(row.updated_at),
  };
}

function asShipment(row: Row): CareSupplyShipmentRecord {
  return {
    id: recordId(row.id),
    patientId: recordId(row.patient_id),
    pharmacyOrderId: optionalRecordId(row.pharmacy_order_id),
    status: row.status as CareSupplyShipmentStatus,
    itemCount: Number(row.item_count ?? 0),
    carrierName: text(row.carrier_name),
    trackingRecorded: Boolean(text(row.tracking_reference)),
    shippedAt: text(row.shipped_at),
    deliveredAt: text(row.delivered_at),
    updatedAt: String(row.updated_at),
  };
}

function asThread(row: Row): CareMessageThreadRecord {
  const from = text(row.last_message_from);
  return {
    id: recordId(row.id),
    patientId: recordId(row.patient_id),
    assignedClinicianUserId: text(row.assigned_clinician_user_id),
    subject: String(row.subject ?? ""),
    status: row.status as CareMessageThreadStatus,
    messageCount: Number(row.message_count ?? 0),
    lastMessageAt: text(row.last_message_at),
    lastMessageFrom:
      from === "patient" || from === "clinician" ? from : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function asMessage(row: Row): CareMessageRecord {
  return {
    id: recordId(row.id),
    threadId: recordId(row.thread_id),
    patientId: recordId(row.patient_id),
    authorRole: row.author_role === "clinician" ? "clinician" : "patient",
    bodyRecorded: Boolean(text(row.body)),
    transmission: CARE_TRANSMISSION_STATE,
    recordedAt: String(row.recorded_at),
  };
}

function asSupportRequest(row: Row): CareSupportRequestRecord {
  return {
    id: recordId(row.id),
    patientId: recordId(row.patient_id),
    topic: row.topic as CareSupportTopic,
    status: row.status as CareSupportRequestStatus,
    bodyRecorded: Boolean(text(row.body)),
    assignedToUserId: text(row.assigned_to_user_id),
    recordedAt: String(row.recorded_at),
    resolvedAt: text(row.resolved_at),
    updatedAt: String(row.updated_at),
  };
}

const INSTRUCTION_COLUMNS =
  "id,patient_id,prescription_id,title,category,version,published_at,published_by_user_id,acknowledged_at,body,updated_at";
const SUPPLY_COLUMNS =
  "id,patient_id,pharmacy_order_id,status,item_count,carrier_name,tracking_reference,shipped_at,delivered_at,updated_at";
const THREAD_COLUMNS =
  "id,patient_id,assigned_clinician_user_id,subject,status,message_count,last_message_at,last_message_from,created_at,updated_at";
const MESSAGE_COLUMNS =
  "id,thread_id,patient_id,author_role,body,transmission,recorded_at";
const SUPPORT_COLUMNS =
  "id,patient_id,topic,status,body,assigned_to_user_id,recorded_at,resolved_at,updated_at";

const INSTRUCTIONS_MISSING: CareInstructionsPage = {
  storage: careServiceStorageMissing(CARE_INSTRUCTION_STORAGE_TABLES),
  instructions: [],
};

const SUPPLIES_MISSING: CareSuppliesPage = {
  storage: careServiceStorageMissing(CARE_SUPPLY_STORAGE_TABLES),
  shipments: [],
};

const THREADS_MISSING: CareMessageThreadsPage = {
  storage: careServiceStorageMissing(CARE_MESSAGE_STORAGE_TABLES),
  threads: [],
};

const SUPPORT_MISSING: CareSupportRequestsPage = {
  storage: careServiceStorageMissing(CARE_SUPPORT_STORAGE_TABLES),
  requests: [],
};

export function buildCareInstructionRepository(): CareInstructionRepository {
  const admin = getSupabaseAdmin();
  return {
    async listPatientInstructions(patientId) {
      const { data, error } = (await admin
        .from("care_patient_instructions")
        .select(INSTRUCTION_COLUMNS)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false })) as QueryResult;
      if (isMissingCareServiceRelation(error)) return INSTRUCTIONS_MISSING;
      if (error) throw new Error("care_instruction_lookup_failed");
      return {
        storage: CARE_SERVICE_STORAGE_AVAILABLE,
        instructions: (data ?? []).map(asInstruction),
      };
    },
  };
}

export function buildCareSupplyRepository(): CareSupplyRepository {
  const admin = getSupabaseAdmin();
  return {
    async listPatientSupplyShipments(patientId) {
      const { data, error } = (await admin
        .from("care_supply_shipments")
        .select(SUPPLY_COLUMNS)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false })) as QueryResult;
      if (isMissingCareServiceRelation(error)) return SUPPLIES_MISSING;
      if (error) throw new Error("care_supply_lookup_failed");
      return {
        storage: CARE_SERVICE_STORAGE_AVAILABLE,
        shipments: (data ?? []).map(asShipment),
      };
    },
  };
}

export function buildCareMessageRepository(): CareMessageRepository {
  const admin = getSupabaseAdmin();
  return {
    async listPatientThreads(patientId) {
      const { data, error } = (await admin
        .from("care_message_threads")
        .select(THREAD_COLUMNS)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false })) as QueryResult;
      if (isMissingCareServiceRelation(error)) return THREADS_MISSING;
      if (error) throw new Error("care_message_thread_lookup_failed");
      return {
        storage: CARE_SERVICE_STORAGE_AVAILABLE,
        threads: (data ?? []).map(asThread),
      };
    },
    async recordPatientMessage(input) {
      const { data, error } = await admin
        .from("care_messages")
        .insert({
          thread_id: input.threadId,
          patient_id: input.patientId,
          author_role: "patient",
          subject: input.subject,
          body: input.body,
          // Stored on the row, not decided at read time, so a message written
          // today can never later be mistaken for one that was delivered.
          transmission: CARE_TRANSMISSION_STATE,
          recorded_at: input.recordedAt,
          idempotency_key: input.idempotencyKey,
        })
        .select(MESSAGE_COLUMNS)
        .single();
      // A communication record is never quietly dropped. If nothing can hold
      // it, the caller is told so, with the missing record named.
      if (isMissingCareServiceRelation(error)) {
        throw new CareServiceStorageUnavailableError(
          CARE_MESSAGE_STORAGE_TABLES,
        );
      }
      if (error || !data) throw new Error("care_message_write_failed");
      return asMessage(data as Row);
    },
  };
}

export function buildCareSupportRepository(): CareSupportRepository {
  const admin = getSupabaseAdmin();
  return {
    async listPatientSupportRequests(patientId) {
      const { data, error } = (await admin
        .from("care_support_requests")
        .select(SUPPORT_COLUMNS)
        .eq("patient_id", patientId)
        .order("recorded_at", { ascending: false })) as QueryResult;
      if (isMissingCareServiceRelation(error)) return SUPPORT_MISSING;
      if (error) throw new Error("care_support_lookup_failed");
      return {
        storage: CARE_SERVICE_STORAGE_AVAILABLE,
        requests: (data ?? []).map(asSupportRequest),
      };
    },
    async recordSupportRequest(input) {
      const { data, error } = await admin
        .from("care_support_requests")
        .insert({
          patient_id: input.patientId,
          topic: input.topic,
          status: "received",
          body: input.body,
          recorded_at: input.recordedAt,
          idempotency_key: input.idempotencyKey,
        })
        .select(SUPPORT_COLUMNS)
        .single();
      if (isMissingCareServiceRelation(error)) {
        throw new CareServiceStorageUnavailableError(
          CARE_SUPPORT_STORAGE_TABLES,
        );
      }
      if (error || !data) throw new Error("care_support_write_failed");
      return asSupportRequest(data as Row);
    },
  };
}

/**
 * Defer construction until the first authorized call, matching the clinician
 * review repository. Building eagerly would let an unconfigured Supabase client
 * decide the outcome at boot instead of inside the request.
 */
export function lazyCareInstructionRepository(
  build: () => CareInstructionRepository = buildCareInstructionRepository,
): CareInstructionRepository {
  let instance: CareInstructionRepository | null = null;
  const resolve = () => (instance ??= build());
  return {
    listPatientInstructions: (patientId) =>
      resolve().listPatientInstructions(patientId),
  };
}

export function lazyCareSupplyRepository(
  build: () => CareSupplyRepository = buildCareSupplyRepository,
): CareSupplyRepository {
  let instance: CareSupplyRepository | null = null;
  const resolve = () => (instance ??= build());
  return {
    listPatientSupplyShipments: (patientId) =>
      resolve().listPatientSupplyShipments(patientId),
  };
}

export function lazyCareMessageRepository(
  build: () => CareMessageRepository = buildCareMessageRepository,
): CareMessageRepository {
  let instance: CareMessageRepository | null = null;
  const resolve = () => (instance ??= build());
  return {
    listPatientThreads: (patientId) => resolve().listPatientThreads(patientId),
    recordPatientMessage: (input) => resolve().recordPatientMessage(input),
  };
}

export function lazyCareSupportRepository(
  build: () => CareSupportRepository = buildCareSupportRepository,
): CareSupportRepository {
  let instance: CareSupportRepository | null = null;
  const resolve = () => (instance ??= build());
  return {
    listPatientSupportRequests: (patientId) =>
      resolve().listPatientSupportRequests(patientId),
    recordSupportRequest: (input) => resolve().recordSupportRequest(input),
  };
}
