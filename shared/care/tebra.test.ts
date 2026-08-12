import { describe, expect, it } from "vitest";
import {
  TebraAppointmentProjectionSchema,
  TebraPatientProjectionSchema,
  isTebraExternalId,
  parseTebraInstant,
  tebraExternalId,
} from "./tebra";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222";

function patient(overrides: Record<string, unknown> = {}) {
  return {
    localPatientId: PATIENT_ID,
    externalId: tebraExternalId("patient", PATIENT_ID),
    firstName: "Test",
    lastName: "Person",
    dateOfBirth: "1990-02-28",
    modifiedAt: "2026-08-12T12:00:00Z",
    ...overrides,
  };
}

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    localAppointmentId: APPOINTMENT_ID,
    localPatientId: PATIENT_ID,
    patientExternalId: tebraExternalId("patient", PATIENT_ID),
    externalId: tebraExternalId("appointment", APPOINTMENT_ID),
    startsAt: "2026-08-20T15:00:00Z",
    endsAt: "2026-08-20T15:30:00Z",
    status: "scheduled",
    modifiedAt: "2026-08-12T12:00:00Z",
    ...overrides,
  };
}

describe("Tebra external identifiers", () => {
  it("derives the same key for the same record every time", () => {
    expect(tebraExternalId("patient", PATIENT_ID)).toBe(
      tebraExternalId("patient", PATIENT_ID),
    );
    expect(tebraExternalId("patient", PATIENT_ID)).toBe(
      `xenios:care_patient:${PATIENT_ID}`,
    );
  });

  it("keeps patient and appointment keyspaces apart", () => {
    expect(tebraExternalId("patient", PATIENT_ID)).not.toBe(
      tebraExternalId("appointment", PATIENT_ID),
    );
  });

  it("refuses a local id that is not opaque", () => {
    expect(() => tebraExternalId("patient", "Jane Doe 1990")).toThrow("tebra_invalid_local_id");
    expect(() => tebraExternalId("patient", "")).toThrow("tebra_invalid_local_id");
    expect(isTebraExternalId("xenios:medications:abc")).toBe(false);
  });
});

describe("Tebra instants", () => {
  it("rejects calendar dates that Date.parse would accept or coerce", () => {
    expect(parseTebraInstant("2026-02-30T00:00:00Z")).toBeNull();
    expect(parseTebraInstant("2026-13-01T00:00:00Z")).toBeNull();
    expect(parseTebraInstant("2026-08-12T25:00:00Z")).toBeNull();
    expect(parseTebraInstant("2026-08-12")).toBeNull();
    expect(parseTebraInstant("2026-08-12T12:00:00Z")).not.toBeNull();
    expect(parseTebraInstant("2026-08-12T12:00:00-05:00")).not.toBeNull();
  });
});

describe("Tebra projections", () => {
  it("accepts a minimum necessary patient", () => {
    expect(TebraPatientProjectionSchema.safeParse(patient()).success).toBe(true);
  });

  it("refuses an external id that does not belong to the local record", () => {
    const mismatched = patient({ externalId: tebraExternalId("patient", APPOINTMENT_ID) });
    expect(TebraPatientProjectionSchema.safeParse(mismatched).success).toBe(false);
  });

  it("refuses extra fields, so clinical detail cannot ride along", () => {
    const widened = patient({ diagnosis: "redacted", chartNote: "redacted" });
    expect(TebraPatientProjectionSchema.safeParse(widened).success).toBe(false);
  });

  it("refuses an appointment whose patient key does not match its patient id", () => {
    const crossed = appointment({
      patientExternalId: tebraExternalId("patient", APPOINTMENT_ID),
    });
    expect(TebraAppointmentProjectionSchema.safeParse(crossed).success).toBe(false);
  });

  it("refuses an appointment that does not end after it starts", () => {
    expect(
      TebraAppointmentProjectionSchema.safeParse(
        appointment({ endsAt: "2026-08-20T15:00:00Z" }),
      ).success,
    ).toBe(false);
  });

  it("refuses a reason for visit or any other free text on an appointment", () => {
    expect(
      TebraAppointmentProjectionSchema.safeParse(
        appointment({ reason: "follow up on labs" }),
      ).success,
    ).toBe(false);
  });
});
