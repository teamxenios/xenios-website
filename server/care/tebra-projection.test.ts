import { describe, expect, it } from "vitest";
import {
  CARE_APPOINTMENT_STATUSES,
  type CareAppointment,
} from "@shared/care/appointments";
import type { CareRecordId } from "@shared/care/contracts";
import { TebraAppointmentProjectionSchema, tebraExternalId } from "@shared/care/tebra";
import { buildTebraAppointmentProjection } from "./tebra-projection";

const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;

function appointment(overrides: Partial<CareAppointment> = {}): CareAppointment {
  return {
    id: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    intakeId: "33333333-3333-4333-8333-333333333333" as CareRecordId,
    patientLocationId: "77777777-7777-4777-8777-777777777777" as CareRecordId,
    patientStateCode: "IL",
    assignedClinicianUserId: "55555555-5555-4555-8555-555555555555",
    clinicianCoverageId: null,
    status: "scheduled",
    startsAt: "2026-08-20T15:00:00.000Z",
    endsAt: "2026-08-20T15:30:00.000Z",
    telehealthReady: true,
    version: 3,
    createdAt: "2026-08-12T11:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

describe("Appointment projection", () => {
  it("carries identifiers, the window and the status, and nothing else", () => {
    const result = buildTebraAppointmentProjection(appointment());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({
      localAppointmentId: APPOINTMENT_ID,
      localPatientId: PATIENT_ID,
      patientExternalId: tebraExternalId("patient", PATIENT_ID),
      externalId: tebraExternalId("appointment", APPOINTMENT_ID),
      startsAt: "2026-08-20T15:00:00.000Z",
      endsAt: "2026-08-20T15:30:00.000Z",
      status: "scheduled",
      modifiedAt: "2026-08-12T12:00:00.000Z",
    });
  });

  it("leaves behind every clinical and routing field on the Care record", () => {
    const result = buildTebraAppointmentProjection(appointment());
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);

    // The clinician, the intake, the location and the state code are Care's
    // business, not the practice system's scheduling payload.
    for (const leak of [
      "55555555-5555-4555-8555-555555555555",
      "33333333-3333-4333-8333-333333333333",
      "77777777-7777-4777-8777-777777777777",
      "IL",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("accepts every status the Care contract defines", () => {
    // Totality. A hand-written enum in the connector previously missed
    // checked_in, which would have refused a real appointment as an invalid
    // payload. This fails if either vocabulary drifts from the other.
    for (const status of CARE_APPOINTMENT_STATUSES) {
      const result = buildTebraAppointmentProjection(appointment({ status }));
      expect(`${status}:${result.ok}`).toBe(`${status}:true`);
    }
  });

  it("refuses an appointment that has not been scheduled yet", () => {
    // Defaulting a time here would book a real slot in the practice calendar
    // for a visit nobody scheduled.
    for (const times of [
      { startsAt: null, endsAt: null },
      { startsAt: "2026-08-20T15:00:00.000Z", endsAt: null },
      { startsAt: null, endsAt: "2026-08-20T15:30:00.000Z" },
    ]) {
      const result = buildTebraAppointmentProjection(appointment(times));
      expect(result).toEqual({
        ok: false,
        code: "tebra_invalid_payload",
        reason: "not_scheduled",
      });
    }
  });

  it("refuses a record whose identifiers are not opaque", () => {
    const result = buildTebraAppointmentProjection(
      appointment({ patientId: "Test Person" as CareRecordId }),
    );
    expect(result).toEqual({
      ok: false,
      code: "tebra_invalid_payload",
      reason: "identifier_not_opaque",
    });
  });

  it("refuses a window that does not end after it starts", () => {
    const result = buildTebraAppointmentProjection(
      appointment({ endsAt: "2026-08-20T15:00:00.000Z" }),
    );
    expect(result).toEqual({
      ok: false,
      code: "tebra_invalid_payload",
      reason: "failed_contract",
    });
  });

  it("produces something the gateway contract already accepts", () => {
    const result = buildTebraAppointmentProjection(appointment());
    if (!result.ok) return;
    expect(TebraAppointmentProjectionSchema.safeParse(result.value).success).toBe(true);
  });
});
