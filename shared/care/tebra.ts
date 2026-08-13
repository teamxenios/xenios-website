import { z } from "zod";
import { CARE_APPOINTMENT_STATUSES } from "./appointments";

/**
 * Xenios Care to Tebra integration contracts.
 *
 * These types describe what Xenios sends to and reconciles with a Tebra
 * practice. They deliberately do not name any Tebra SOAP operation or WSDL
 * shape. Exact upstream operations live behind an injected practice client
 * until Xenios receives the current Tebra technical guide and credentials.
 */

export const TEBRA_SYNC_ENTITIES = ["patient", "appointment"] as const;
export type TebraSyncEntity = (typeof TEBRA_SYNC_ENTITIES)[number];

export const TEBRA_ENTITY_SLUGS: Readonly<Record<TebraSyncEntity, string>> = {
  patient: "care_patient",
  appointment: "care_appointment",
};

/**
 * Local Care record identifiers are already opaque. Keeping the same shape the
 * existing scheduling seam accepts means no new identifier vocabulary enters
 * Care, and nothing human readable travels inside an external key.
 */
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXTERNAL_ID = /^xenios:(care_patient|care_appointment):[A-Za-z0-9][A-Za-z0-9._:-]{0,96}$/;

export const TebraOpaqueIdSchema = z.string().trim().regex(OPAQUE_ID);
export const TebraExternalIdSchema = z.string().trim().regex(EXTERNAL_ID);

export function isTebraOpaqueId(value: string): boolean {
  return OPAQUE_ID.test(value);
}

export function isTebraExternalId(value: string): boolean {
  return EXTERNAL_ID.test(value);
}

/**
 * The external identifier is a pure function of the entity and the local Care
 * record id. Two runs of the same sync therefore produce the same key, which is
 * what makes create operations idempotent without a second lookup table.
 */
export function tebraExternalId(entity: TebraSyncEntity, localId: string): string {
  if (!OPAQUE_ID.test(localId)) throw new Error("tebra_invalid_local_id");
  return `xenios:${TEBRA_ENTITY_SLUGS[entity]}:${localId}`;
}

const RFC3339_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Strict instant parsing, matching the existing Care scheduling seam. Date.parse
 * alone accepts shapes a practice system will reject, so calendar validity is
 * checked before anything is queued for an upstream call.
 */
export function parseTebraInstant(value: string): number | null {
  const match = RFC3339_INSTANT.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12) return null;
  if (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return null;
  if (zone !== "Z") {
    if (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59) return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

export const TebraInstantSchema = z
  .string()
  .trim()
  .refine((value) => parseTebraInstant(value) !== null, { message: "invalid_instant" });

export const TebraDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseTebraInstant(`${value}T00:00:00Z`) !== null, {
    message: "invalid_date",
  });

/**
 * Minimum necessary demographic projection. This is the only structure in the
 * connector that carries identifying detail, and it exists solely to create or
 * update the matching record inside Tebra. It must never reach a log, an audit
 * row, an error envelope, a metric, or a handoff. See tebra-redaction.ts.
 */
export const TebraPatientProjectionSchema = z
  .object({
    localPatientId: TebraOpaqueIdSchema,
    externalId: TebraExternalIdSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    dateOfBirth: TebraDateSchema,
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
    modifiedAt: TebraInstantSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.externalId !== tebraExternalId("patient", value.localPatientId)) {
      context.addIssue({ code: "custom", message: "external_id_must_match_local_id" });
    }
  });

/**
 * Appointment scheduling stays opaque. No reason for visit, chart note,
 * diagnosis, medication, or free text is carried here, so the scheduling path
 * cannot quietly become a clinical channel.
 */
export const TebraAppointmentProjectionSchema = z
  .object({
    localAppointmentId: TebraOpaqueIdSchema,
    localPatientId: TebraOpaqueIdSchema,
    patientExternalId: TebraExternalIdSchema,
    externalId: TebraExternalIdSchema,
    startsAt: TebraInstantSchema,
    endsAt: TebraInstantSchema,
    // Mirrors the existing Care vocabulary exactly rather than maintaining a
    // parallel list that can drift. A hand-written enum here missed checked_in,
    // which would have rejected a real checked-in appointment as an invalid
    // payload. Translating Care status to whatever Tebra calls it belongs in
    // the practice client, once the technical guide says what that is.
    status: z.enum(CARE_APPOINTMENT_STATUSES),
    modifiedAt: TebraInstantSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.externalId !== tebraExternalId("appointment", value.localAppointmentId)) {
      context.addIssue({ code: "custom", message: "external_id_must_match_local_id" });
    }
    if (value.patientExternalId !== tebraExternalId("patient", value.localPatientId)) {
      context.addIssue({ code: "custom", message: "patient_external_id_must_match_local_id" });
    }
    const startsAt = parseTebraInstant(value.startsAt);
    const endsAt = parseTebraInstant(value.endsAt);
    if (startsAt === null || endsAt === null || endsAt <= startsAt) {
      context.addIssue({ code: "custom", message: "ends_at_must_follow_starts_at" });
    }
  });

export type TebraPatientProjection = z.infer<typeof TebraPatientProjectionSchema>;
export type TebraAppointmentProjection = z.infer<typeof TebraAppointmentProjectionSchema>;

/**
 * What a practice client is allowed to hand back: correlation keys and a
 * modification stamp, never demographics. A client implementation therefore
 * cannot widen the amount of identifying data flowing back into Xenios.
 */
export interface TebraRemoteRecord {
  tebraId: string;
  externalId: string | null;
  modifiedAt: string;
}

export interface TebraSyncCursor {
  entity: TebraSyncEntity;
  fromModifiedAt: string;
  toModifiedAt: string;
  continuationToken?: string | null;
}

export interface TebraSyncSummary {
  entity: TebraSyncEntity;
  ranAt: string;
  pages: number;
  scanned: number;
  reconciled: number;
  unlinked: number;
  failed: number;
  cursorAdvanced: boolean;
  cursor: TebraSyncCursor;
}

export interface TebraSyncSkipped {
  entity: TebraSyncEntity;
  skipped: true;
  reason: "lease_held" | "not_ready" | "care_disabled";
}

export type TebraSyncOutcome = TebraSyncSummary | TebraSyncSkipped;

export function isTebraSyncSkipped(outcome: TebraSyncOutcome): outcome is TebraSyncSkipped {
  return (outcome as TebraSyncSkipped).skipped === true;
}

export const TEBRA_FAILURE_CODES = [
  // Care itself is held: either the two runtime approvals are off (tebra_disabled)
  // or the stored Care capability is not exactly enabled (care_disabled). Both
  // are refusals by the Care rail rather than by the integration.
  "tebra_disabled",
  "care_disabled",
  "tebra_unconfigured",
  "tebra_invalid_configuration",
  "tebra_unavailable",
  "tebra_invalid_payload",
  "tebra_conflict",
  "tebra_not_linked",
] as const;

export type TebraFailureCode = (typeof TEBRA_FAILURE_CODES)[number];

export type TebraOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TebraFailureCode; retryable: boolean };

export interface TebraIntegrationStatus {
  integration: "tebra";
  state: "disabled" | "unconfigured" | "invalid" | "ready";
  /** True only when configuration, transport, and the stored Care capability all allow a run. */
  ready: boolean;
  transportBound: boolean;
  /** The stored Care capability, so an operator can see which gate is holding. */
  careEnabled: boolean;
  pollIntervalMinutes: number | null;
  cursors: readonly {
    entity: TebraSyncEntity;
    fromModifiedAt: string | null;
    toModifiedAt: string | null;
  }[];
  checkedAt: string;
}

/**
 * Admin-only surfaces. They sit under the existing /api/care namespace so the
 * Care no-store, noindex, and permission middleware already applies.
 */
export const TEBRA_ROUTE_CONTRACTS = {
  status: "/api/care/integrations/tebra/status",
  sync: "/api/care/integrations/tebra/sync",
} as const;
