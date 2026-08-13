import type { CareAppointment } from "@shared/care/appointments";
import {
  TebraAppointmentProjectionSchema,
  tebraExternalId,
  type TebraAppointmentProjection,
  type TebraFailureCode,
} from "@shared/care/tebra";

/**
 * Builds the outbound projection from a real Care record.
 *
 * Only the appointment builder lives here. Care carries no shared demographic
 * type, so a patient builder would have to invent one, which is the same
 * mistake as inventing a SOAP operation: a guessed shape that later reads as
 * agreed. The lane that owns the patient record builds that projection against
 * the validated contract in shared/care/tebra.ts instead.
 */

export type TebraProjectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TebraFailureCode; reason: TebraProjectionRefusal };

export const TEBRA_PROJECTION_REFUSALS = [
  "not_scheduled",
  "identifier_not_opaque",
  "failed_contract",
] as const;

export type TebraProjectionRefusal = (typeof TEBRA_PROJECTION_REFUSALS)[number];

function refuse<T>(
  code: TebraFailureCode,
  reason: TebraProjectionRefusal,
): TebraProjectionResult<T> {
  return { ok: false, code, reason };
}

/**
 * A Care appointment carries nullable times because a requested visit has not
 * been scheduled yet. Sending one upstream with invented times would create a
 * real slot in the practice calendar for a visit nobody booked, so an
 * unscheduled appointment is refused rather than defaulted.
 *
 * Nothing clinical is read from the record. Only the identifiers, the window,
 * and the status travel.
 */
export function buildTebraAppointmentProjection(
  appointment: Pick<CareAppointment, "id" | "patientId" | "startsAt" | "endsAt" | "status" | "updatedAt">,
): TebraProjectionResult<TebraAppointmentProjection> {
  if (!appointment.startsAt || !appointment.endsAt) {
    return refuse("tebra_invalid_payload", "not_scheduled");
  }

  let externalId: string;
  let patientExternalId: string;
  try {
    externalId = tebraExternalId("appointment", String(appointment.id));
    patientExternalId = tebraExternalId("patient", String(appointment.patientId));
  } catch {
    return refuse("tebra_invalid_payload", "identifier_not_opaque");
  }

  const candidate = {
    localAppointmentId: String(appointment.id),
    localPatientId: String(appointment.patientId),
    patientExternalId,
    externalId,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    modifiedAt: appointment.updatedAt,
  };

  // Parsed through the same contract the gateway enforces, so a record that
  // would be refused downstream is refused here, where the caller can see why.
  const parsed = TebraAppointmentProjectionSchema.safeParse(candidate);
  if (!parsed.success) return refuse("tebra_invalid_payload", "failed_contract");

  return { ok: true, value: parsed.data };
}
