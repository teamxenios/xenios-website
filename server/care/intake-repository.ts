import type {
  CareClinicalIntake,
  CareIntakeDefinition,
  CareIntakeResponseValue,
  CareIntakeRevision,
} from "@shared/care/intake";
import type { CareRecordId } from "@shared/care/contracts";
import { getSupabaseAdmin } from "../supabase";

export interface CareIntakeRepository {
  loadApprovedDefinition(): Promise<CareIntakeDefinition | null>;
  loadCurrentIntake(
    patientId: CareRecordId,
  ): Promise<CareClinicalIntake | null>;
  loadLatestRevision(
    patientId: CareRecordId,
    intakeId: CareRecordId,
  ): Promise<CareIntakeRevision | null>;
  startIntake(input: {
    patientId: CareRecordId;
    definition: CareIntakeDefinition;
    telehealthConsentEventId: CareRecordId;
    privacyConsentEventId: CareRecordId;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareClinicalIntake>;
  autosave(input: {
    patientId: CareRecordId;
    intakeId: CareRecordId;
    expectedVersion: number;
    responses: Readonly<Record<string, CareIntakeResponseValue>>;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareIntakeRevision>;
  submit(input: {
    patientId: CareRecordId;
    intakeId: CareRecordId;
    expectedVersion: number;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareClinicalIntake>;
}

type Row = Record<string, unknown>;

function id(value: unknown): CareRecordId {
  return String(value) as CareRecordId;
}

function intakeFromRow(row: Row): CareClinicalIntake {
  return {
    id: id(row.id),
    patientId: id(row.patient_id),
    definitionId: id(row.definition_id),
    definitionVersion: String(row.definition_version),
    telehealthConsentEventId: id(row.telehealth_consent_event_id),
    privacyConsentEventId: id(row.privacy_consent_event_id),
    status: row.status as CareClinicalIntake["status"],
    version: Number(row.version),
    createdAt: String(row.created_at),
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
  };
}

function fail(error: { code?: string; message?: string } | null, code: string) {
  if (error) throw new Error(code);
}

export function buildCareIntakeRepository(): CareIntakeRepository {
  const admin = getSupabaseAdmin();
  const intakeColumns =
    "id, patient_id, definition_id, definition_version, telehealth_consent_event_id, privacy_consent_event_id, status, version, created_at, submitted_at";

  return {
    async loadApprovedDefinition() {
      const { data, error } = await admin
        .from("care_intake_definitions")
        .select("id, version, status, schema_hash, fields, approved_at")
        .eq("status", "approved")
        .maybeSingle();
      fail(error, "care_intake_definition_lookup_failed");
      return data
        ? {
            id: id(data.id),
            version: String(data.version),
            status: data.status,
            schemaHash: String(data.schema_hash),
            fields: data.fields ?? [],
            approvedAt: String(data.approved_at),
          }
        : null;
    },

    async loadCurrentIntake(patientId) {
      const { data, error } = await admin
        .from("care_intakes")
        .select(intakeColumns)
        .eq("patient_id", patientId)
        .in("status", ["draft", "submitted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fail(error, "care_intake_lookup_failed");
      return data ? intakeFromRow(data as Row) : null;
    },

    async loadLatestRevision(patientId, intakeId) {
      const { data, error } = await admin
        .from("care_intake_revisions")
        .select(
          "id, intake_id, patient_id, version, responses, idempotency_key, created_at",
        )
        .eq("patient_id", patientId)
        .eq("intake_id", intakeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      fail(error, "care_intake_revision_lookup_failed");
      if (!data) return null;
      return {
        id: id(data.id),
        intakeId: id(data.intake_id),
        patientId: id(data.patient_id),
        version: Number(data.version),
        responses:
          (data.responses as Record<string, CareIntakeResponseValue>) ?? {},
        idempotencyKey: String(data.idempotency_key),
        createdAt: String(data.created_at),
      };
    },

    async startIntake(input) {
      const { data, error } = await admin
        .from("care_intakes")
        .insert({
          patient_id: input.patientId,
          definition_id: input.definition.id,
          definition_version: input.definition.version,
          telehealth_consent_event_id: input.telehealthConsentEventId,
          privacy_consent_event_id: input.privacyConsentEventId,
          status: "draft",
          version: 0,
          start_idempotency_key: input.idempotencyKey,
          created_at: input.occurredAt,
        })
        .select(intakeColumns)
        .single();
      if (error?.code === "23505") {
        const replay = await admin
          .from("care_intakes")
          .select(intakeColumns)
          .eq("patient_id", input.patientId)
          .eq("start_idempotency_key", input.idempotencyKey)
          .single();
        fail(replay.error, "care_intake_start_replay_failed");
        return intakeFromRow(replay.data as Row);
      }
      fail(error, "care_intake_start_failed");
      return intakeFromRow(data as Row);
    },

    async autosave(input) {
      const { data, error } = await admin.rpc("care_intake_autosave", {
        p_intake_id: input.intakeId,
        p_patient_id: input.patientId,
        p_expected_version: input.expectedVersion,
        p_responses: input.responses,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      fail(error, "care_intake_autosave_failed");
      const row = (Array.isArray(data) ? data[0] : data) as Row;
      return {
        id: id(row.id),
        intakeId: id(row.intake_id),
        patientId: id(row.patient_id),
        version: Number(row.version),
        responses:
          (row.responses as Record<string, CareIntakeResponseValue>) ?? {},
        idempotencyKey: input.idempotencyKey,
        createdAt: String(row.created_at),
      };
    },

    async submit(input) {
      const { data, error } = await admin.rpc("care_intake_submit", {
        p_intake_id: input.intakeId,
        p_patient_id: input.patientId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_occurred_at: input.occurredAt,
      });
      fail(error, "care_intake_submit_failed");
      const row = (Array.isArray(data) ? data[0] : data) as Row;
      return intakeFromRow(row);
    },
  };
}
