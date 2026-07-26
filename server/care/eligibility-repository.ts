import type {
  CareEligibilityContext,
  CareEligibilityDecision,
  CarePatientLocation,
  CareWaitlistEvent,
} from "@shared/care/eligibility";
import type { CareConsentKind, CareConsentStatus } from "@shared/care/consent";
import type { CareRecordId } from "@shared/care/contracts";
import { getSupabaseAdmin } from "../supabase";
import { resolveCareConsentStatus } from "./consent";

export interface CareEligibilityRepository {
  loadContext(
    patientId: CareRecordId,
    capabilityEnabled: boolean,
  ): Promise<CareEligibilityContext>;
  recordLocation(input: {
    patientId: CareRecordId;
    stateCode: string;
    source: CarePatientLocation["source"];
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CarePatientLocation>;
  recordEligibilityDecision(
    decision: CareEligibilityDecision,
    locationId: CareRecordId | null,
  ): Promise<void>;
  changeWaitlist(input: {
    patientId: CareRecordId;
    stateCode: string;
    action: "joined" | "withdrawn";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareWaitlistEvent>;
  recordConsent(input: {
    patientId: CareRecordId;
    kind: CareConsentKind;
    documentVersion: string;
    action: "granted" | "revoked";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareConsentStatus>;
}

type Row = Record<string, unknown>;

function asRecordId(value: unknown): CareRecordId {
  return String(value) as CareRecordId;
}

function asLocation(row: Row): CarePatientLocation {
  return {
    id: asRecordId(row.id),
    patientId: asRecordId(row.patient_id),
    stateCode: String(row.state_code),
    source: row.source as CarePatientLocation["source"],
    attestedAt: String(row.attested_at),
    supersedesLocationId: row.supersedes_location_id
      ? asRecordId(row.supersedes_location_id)
      : null,
  };
}

function throwOnError(error: { message?: string } | null, code: string) {
  if (error) throw new Error(code);
}

export function buildCareEligibilityRepository(): CareEligibilityRepository {
  const admin = getSupabaseAdmin();

  const loadConsent = async (
    patientId: CareRecordId,
    kind: CareConsentKind,
  ): Promise<CareConsentStatus> => {
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

    return resolveCareConsentStatus(
      kind,
      document
        ? {
            id: asRecordId(document.id),
            kind,
            version: String(document.version),
            contentHash: String(document.content_hash),
            status: document.status as "approved",
            approvedAt: String(document.approved_at),
            effectiveAt: String(document.effective_at),
          }
        : null,
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
  };

  return {
    async loadContext(patientId, capabilityEnabled) {
      const [
        patientResult,
        locationResult,
        telehealthConsent,
        privacyConsent,
      ] = await Promise.all([
        admin
          .from("care_patients")
          .select("identity_state, identity_verified_at")
          .eq("id", patientId)
          .maybeSingle(),
        admin
          .from("care_patient_locations")
          .select(
            "id, patient_id, state_code, source, attested_at, supersedes_location_id",
          )
          .eq("patient_id", patientId)
          .order("attested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        loadConsent(patientId, "telehealth"),
        loadConsent(patientId, "privacy_notice"),
      ]);
      throwOnError(patientResult.error, "care_patient_lookup_failed");
      throwOnError(locationResult.error, "care_location_lookup_failed");
      if (!patientResult.data) throw new Error("care_patient_not_found");

      const location = locationResult.data
        ? asLocation(locationResult.data as Row)
        : null;
      let coverage = null;
      if (location) {
        const [stateResult, clinicianResult] = await Promise.all([
          admin
            .from("care_supported_states")
            .select(
              "state_code, supported_state_active, service_coverage_active, waitlist_enabled",
            )
            .eq("state_code", location.stateCode)
            .maybeSingle(),
          admin.rpc("care_active_clinician_count", {
            p_state_code: location.stateCode,
            p_as_of: new Date().toISOString(),
          }),
        ]);
        throwOnError(stateResult.error, "care_state_coverage_lookup_failed");
        throwOnError(
          clinicianResult.error,
          "care_clinician_coverage_lookup_failed",
        );
        if (stateResult.data) {
          coverage = {
            stateCode: String(stateResult.data.state_code),
            supportedStateActive: Boolean(
              stateResult.data.supported_state_active,
            ),
            serviceCoverageActive: Boolean(
              stateResult.data.service_coverage_active,
            ),
            waitlistEnabled: Boolean(stateResult.data.waitlist_enabled),
            activeClinicianCount: Number(clinicianResult.data ?? 0),
          };
        }
      }

      return {
        patientId,
        capabilityEnabled,
        location,
        identity: {
          patientId,
          state: patientResult.data.identity_state,
          verifiedAt: patientResult.data.identity_verified_at,
        },
        coverage,
        telehealthConsent,
        privacyConsent,
      };
    },

    async recordLocation(input) {
      const { data: prior, error: priorError } = await admin
        .from("care_patient_locations")
        .select("id")
        .eq("patient_id", input.patientId)
        .order("attested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      throwOnError(priorError, "care_location_lookup_failed");

      const { data, error } = await admin
        .from("care_patient_locations")
        .insert({
          patient_id: input.patientId,
          state_code: input.stateCode,
          source: input.source,
          attested_at: input.occurredAt,
          supersedes_location_id: prior?.id ?? null,
          idempotency_key: input.idempotencyKey,
        })
        .select(
          "id, patient_id, state_code, source, attested_at, supersedes_location_id",
        )
        .single();
      if (error?.code === "23505") {
        const replay = await admin
          .from("care_patient_locations")
          .select(
            "id, patient_id, state_code, source, attested_at, supersedes_location_id",
          )
          .eq("patient_id", input.patientId)
          .eq("idempotency_key", input.idempotencyKey)
          .single();
        throwOnError(replay.error, "care_location_replay_failed");
        return asLocation(replay.data as Row);
      }
      throwOnError(error, "care_location_write_failed");
      return asLocation(data as Row);
    },

    async recordEligibilityDecision(decision, locationId) {
      const { error } = await admin.from("care_eligibility_checks").insert({
        patient_id: decision.patientId,
        location_id: locationId,
        outcome: decision.outcome,
        reason: decision.reason,
        state_code: decision.stateCode,
        care_eligibility_cleared: false,
        evaluated_at: decision.evaluatedAt,
      });
      throwOnError(error, "care_eligibility_audit_failed");
    },

    async changeWaitlist(input) {
      const { data, error } = await admin
        .from("care_waitlist_events")
        .insert({
          patient_id: input.patientId,
          state_code: input.stateCode,
          action: input.action,
          idempotency_key: input.idempotencyKey,
          occurred_at: input.occurredAt,
        })
        .select("id, patient_id, state_code, action, occurred_at")
        .single();
      const resolved =
        error?.code === "23505"
          ? await admin
              .from("care_waitlist_events")
              .select("id, patient_id, state_code, action, occurred_at")
              .eq("patient_id", input.patientId)
              .eq("idempotency_key", input.idempotencyKey)
              .single()
          : { data, error };
      throwOnError(resolved.error, "care_waitlist_write_failed");
      const row = resolved.data as Row;
      return {
        id: asRecordId(row.id),
        patientId: asRecordId(row.patient_id),
        stateCode: String(row.state_code),
        action: row.action as "joined" | "withdrawn",
        occurredAt: String(row.occurred_at),
      };
    },

    async recordConsent(input) {
      let documentQuery = admin
        .from("care_consent_documents")
        .select("id")
        .eq("kind", input.kind)
        .eq("version", input.documentVersion);
      documentQuery =
        input.action === "granted"
          ? documentQuery.eq("status", "approved")
          : documentQuery.in("status", ["approved", "superseded"]);
      const documentResult = await documentQuery.maybeSingle();
      throwOnError(
        documentResult.error,
        "care_consent_document_lookup_failed",
      );
      if (!documentResult.data) {
        throw new Error("care_consent_document_unavailable");
      }

      const { error } = await admin.from("care_consent_events").insert({
        patient_id: input.patientId,
        document_id: documentResult.data.id,
        kind: input.kind,
        document_version: input.documentVersion,
        action: input.action,
        idempotency_key: input.idempotencyKey,
        occurred_at: input.occurredAt,
      });
      if (error?.code !== "23505") {
        throwOnError(error, "care_consent_write_failed");
      }
      return loadConsent(input.patientId, input.kind);
    },
  };
}
