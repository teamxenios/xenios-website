import type { CareRecordId } from "@shared/care/contracts";
import {
  CARE_ADVERSE_EVENT_STORAGE_TABLES,
  CARE_LAB_STORAGE_TABLES,
  CARE_STORAGE_AVAILABLE,
  careStorageMissing,
  type CareAdverseEventRecord,
  type CareAdverseEventSeverity,
  type CareLabResultRecord,
  type CareLabResultStatus,
  type CareStorageState,
} from "@shared/care/safety";
import { getSupabaseAdmin } from "../supabase";

/**
 * The lab and adverse event read/write side.
 *
 * `/api/care/labs` and `/api/care/adverse-events` were declared in the route
 * contract with no handler behind them, so any caller that trusted the contract
 * got a 404 that reads as a permanent outage. These repositories close that
 * gap honestly: the Care schema has no lab or adverse event table yet, so a
 * read reports which table is missing instead of returning an empty list that
 * looks like "you have no results", and a write refuses rather than accepting a
 * safety report nothing can hold.
 *
 * The queries are written against the columns the domain model already
 * describes and are scoped in the query itself. Nothing here creates a table.
 * When the migration that adds these tables lands, these reads begin returning
 * records without another change, and a column that does not match surfaces as
 * a hard failure rather than as silently wrong data.
 */

export interface CareLabResultsPage {
  storage: CareStorageState;
  results: readonly CareLabResultRecord[];
}

export interface CareAdverseEventsPage {
  storage: CareStorageState;
  reports: readonly CareAdverseEventRecord[];
}

export interface CareLabRepository {
  listPatientLabResults(patientId: CareRecordId): Promise<CareLabResultsPage>;
  listReviewerLabResults(reviewerUserId: string): Promise<CareLabResultsPage>;
}

export interface CareAdverseEventRepository {
  listPatientAdverseEvents(
    patientId: CareRecordId,
  ): Promise<CareAdverseEventsPage>;
  listReviewerAdverseEvents(
    clinicianUserId: string,
  ): Promise<CareAdverseEventsPage>;
  recordAdverseEvent(input: {
    patientId: CareRecordId;
    patientReportedSeverity: CareAdverseEventSeverity;
    narrative: string;
    occurredAt: string | null;
    idempotencyKey: string;
    reportedAt: string;
  }): Promise<CareAdverseEventRecord>;
}

/**
 * Raised when a write cannot be persisted because the record that would hold it
 * does not exist. The route turns this into a refusal that names the missing
 * table, never into a success.
 */
export class CareStorageUnavailableError extends Error {
  readonly missingTables: readonly string[];

  constructor(missingTables: readonly string[]) {
    super("care_storage_unavailable");
    this.name = "CareStorageUnavailableError";
    this.missingTables = [...missingTables];
  }
}

type Row = Record<string, unknown>;
type QueryError = { code?: string | null; message?: string | null } | null;

/**
 * PostgREST reports an absent relation either with the Postgres code for an
 * undefined table or, when the schema cache is authoritative, with its own
 * not-found code and a message about the schema cache.
 */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

export function isMissingRelationError(error: QueryError): boolean {
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

function asLabResult(row: Row): CareLabResultRecord {
  return {
    id: String(row.id) as CareRecordId,
    patientId: String(row.patient_id) as CareRecordId,
    reviewId: row.clinician_review_id
      ? (String(row.clinician_review_id) as CareRecordId)
      : null,
    assignedReviewerUserId: text(row.assigned_reviewer_user_id),
    panelName: String(row.panel_name ?? ""),
    status: row.status as CareLabResultStatus,
    orderedAt: String(row.ordered_at),
    collectedAt: text(row.collected_at),
    resultedAt: text(row.resulted_at),
    releasedToPatientAt: text(row.released_to_patient_at),
    releasedByUserId: text(row.released_by_user_id),
    updatedAt: String(row.updated_at),
  };
}

function asAdverseEvent(row: Row): CareAdverseEventRecord {
  return {
    id: String(row.id) as CareRecordId,
    patientId: String(row.patient_id) as CareRecordId,
    status: row.status as CareAdverseEventRecord["status"],
    patientReportedSeverity:
      row.patient_reported_severity as CareAdverseEventSeverity,
    narrativeRecorded: Boolean(text(row.narrative)),
    occurredAt: text(row.occurred_at),
    reportedAt: String(row.reported_at),
    acknowledgedAt: text(row.acknowledged_at),
    acknowledgedByUserId: text(row.acknowledged_by_user_id),
  };
}

const LAB_COLUMNS =
  "id,patient_id,clinician_review_id,assigned_reviewer_user_id,panel_name,status,ordered_at,collected_at,resulted_at,released_to_patient_at,released_by_user_id,updated_at";
const ADVERSE_EVENT_COLUMNS =
  "id,patient_id,status,patient_reported_severity,narrative,occurred_at,reported_at,acknowledged_at,acknowledged_by_user_id";

const LAB_STORAGE_MISSING: CareLabResultsPage = {
  storage: careStorageMissing(CARE_LAB_STORAGE_TABLES),
  results: [],
};

const ADVERSE_EVENT_STORAGE_MISSING: CareAdverseEventsPage = {
  storage: careStorageMissing(CARE_ADVERSE_EVENT_STORAGE_TABLES),
  reports: [],
};

type QueryResult = { data: Row[] | null; error: QueryError };

export function buildCareLabRepository(): CareLabRepository {
  const admin = getSupabaseAdmin();

  const toPage = ({ data, error }: QueryResult): CareLabResultsPage => {
    if (isMissingRelationError(error)) return LAB_STORAGE_MISSING;
    if (error) throw new Error("care_lab_result_lookup_failed");
    return {
      storage: CARE_STORAGE_AVAILABLE,
      results: (data ?? []).map(asLabResult),
    };
  };

  const scopedTo = async (
    column: "patient_id" | "assigned_reviewer_user_id",
    value: string,
  ): Promise<CareLabResultsPage> =>
    toPage(
      (await admin
        .from("care_lab_results")
        .select(LAB_COLUMNS)
        .eq(column, value)
        .order("updated_at", { ascending: false })) as QueryResult,
    );

  return {
    listPatientLabResults: (patientId) => scopedTo("patient_id", patientId),
    listReviewerLabResults: (reviewerUserId) =>
      scopedTo("assigned_reviewer_user_id", reviewerUserId),
  };
}

export function buildCareAdverseEventRepository(): CareAdverseEventRepository {
  const admin = getSupabaseAdmin();

  const toPage = ({ data, error }: QueryResult): CareAdverseEventsPage => {
    if (isMissingRelationError(error)) return ADVERSE_EVENT_STORAGE_MISSING;
    if (error) throw new Error("care_adverse_event_lookup_failed");
    return {
      storage: CARE_STORAGE_AVAILABLE,
      reports: (data ?? []).map(asAdverseEvent),
    };
  };

  const scopedTo = async (
    column: "patient_id" | "assigned_clinician_user_id",
    value: string,
  ): Promise<CareAdverseEventsPage> =>
    toPage(
      (await admin
        .from("care_adverse_events")
        .select(ADVERSE_EVENT_COLUMNS)
        .eq(column, value)
        .order("reported_at", { ascending: false })) as QueryResult,
    );

  return {
    listPatientAdverseEvents: (patientId) => scopedTo("patient_id", patientId),
    listReviewerAdverseEvents: (clinicianUserId) =>
      scopedTo("assigned_clinician_user_id", clinicianUserId),
    async recordAdverseEvent(input) {
      const { data, error } = await admin
        .from("care_adverse_events")
        .insert({
          patient_id: input.patientId,
          status: "received",
          patient_reported_severity: input.patientReportedSeverity,
          narrative: input.narrative,
          occurred_at: input.occurredAt,
          reported_at: input.reportedAt,
          idempotency_key: input.idempotencyKey,
        })
        .select(ADVERSE_EVENT_COLUMNS)
        .single();
      // A safety report is never quietly dropped. If nothing can hold it, the
      // caller is told so, with the missing record named.
      if (isMissingRelationError(error)) {
        throw new CareStorageUnavailableError(CARE_ADVERSE_EVENT_STORAGE_TABLES);
      }
      if (error || !data) throw new Error("care_adverse_event_write_failed");
      return asAdverseEvent(data as Row);
    },
  };
}

/**
 * Defer construction until the first authorized call, matching the clinician
 * review repository. Building eagerly would let an unconfigured Supabase client
 * decide the outcome at boot instead of inside the request.
 */
export function lazyCareLabRepository(
  build: () => CareLabRepository = buildCareLabRepository,
): CareLabRepository {
  let instance: CareLabRepository | null = null;
  const resolve = () => (instance ??= build());
  return {
    listPatientLabResults: (patientId) =>
      resolve().listPatientLabResults(patientId),
    listReviewerLabResults: (reviewerUserId) =>
      resolve().listReviewerLabResults(reviewerUserId),
  };
}

export function lazyCareAdverseEventRepository(
  build: () => CareAdverseEventRepository = buildCareAdverseEventRepository,
): CareAdverseEventRepository {
  let instance: CareAdverseEventRepository | null = null;
  const resolve = () => (instance ??= build());
  return {
    listPatientAdverseEvents: (patientId) =>
      resolve().listPatientAdverseEvents(patientId),
    listReviewerAdverseEvents: (clinicianUserId) =>
      resolve().listReviewerAdverseEvents(clinicianUserId),
    recordAdverseEvent: (input) => resolve().recordAdverseEvent(input),
  };
}
