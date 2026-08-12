import { describe, expect, it, vi } from "vitest";
import { tebraExternalId } from "@shared/care/tebra";
import type { TebraGateway } from "./tebra-gateway";
import {
  createTebraSchedulingTransport,
  type CareSchedulingTransport,
} from "./tebra-scheduling-bridge";
import { createTebraSchedulingAdapter, type TebraSchedulingTransport } from "./tebra-scheduling";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222";
const ENDPOINT = new URL("https://practice.example/v1/appointments");

const REQUEST = {
  appointmentId: APPOINTMENT_ID,
  startsAt: "2026-08-20T15:00:00Z",
  endsAt: "2026-08-20T15:30:00Z",
};

function transport(input: {
  gateway?: Partial<TebraGateway>;
  patientId?: string | null;
} = {}): CareSchedulingTransport {
  return createTebraSchedulingTransport({
    gateway: {
      syncPatient: vi.fn(),
      syncAppointment: vi.fn(async () => ({ ok: true, value: { tebraId: "tebra-appt-1" } })),
      ...input.gateway,
    } as TebraGateway,
    resolvePatientId: vi.fn(async () =>
      input.patientId === undefined ? PATIENT_ID : input.patientId,
    ),
    now: () => new Date("2026-08-12T12:00:00.000Z"),
  });
}

describe("Scheduling bridge", () => {
  it("satisfies the transport the existing Care scheduling adapter asks for", () => {
    // A compile-time check. If either side drifts, this assignment stops
    // building, which is the point of writing it down.
    const bound: TebraSchedulingTransport = transport();
    expect(typeof bound.createAppointment).toBe("function");
  });

  it("books through the same external id and link the sync path uses", async () => {
    const syncAppointment = vi.fn(async () => ({
      ok: true as const,
      value: { tebraId: "tebra-appt-1" },
    }));
    const bound = transport({ gateway: { syncAppointment } });

    await expect(
      bound.createAppointment(ENDPOINT, "unused-key", REQUEST),
    ).resolves.toEqual({ externalAppointmentId: "tebra-appt-1" });

    expect(syncAppointment).toHaveBeenCalledWith({
      localAppointmentId: APPOINTMENT_ID,
      localPatientId: PATIENT_ID,
      patientExternalId: tebraExternalId("patient", PATIENT_ID),
      externalId: tebraExternalId("appointment", APPOINTMENT_ID),
      startsAt: REQUEST.startsAt,
      endsAt: REQUEST.endsAt,
      status: "scheduled",
      modifiedAt: "2026-08-12T12:00:00.000Z",
    });
  });

  it("carries no clinical detail into the practice call", async () => {
    const syncAppointment = vi.fn(async () => ({
      ok: true as const,
      value: { tebraId: "tebra-appt-1" },
    }));
    const bound = transport({ gateway: { syncAppointment } });
    await bound.createAppointment(ENDPOINT, "unused-key", REQUEST);

    const sent = syncAppointment.mock.calls[0][0] as Record<string, unknown>;
    for (const field of ["reason", "note", "diagnosis", "medication", "firstName", "lastName"]) {
      expect(sent).not.toHaveProperty(field);
    }
  });

  it("refuses when the patient is not resolvable", async () => {
    const syncAppointment = vi.fn();
    const bound = transport({ patientId: null, gateway: { syncAppointment } });

    await expect(bound.createAppointment(ENDPOINT, "unused-key", REQUEST)).rejects.toThrow(
      "tebra_not_linked",
    );
    expect(syncAppointment).not.toHaveBeenCalled();
  });

  it("raises only a safe code when the gateway refuses", async () => {
    const bound = transport({
      gateway: {
        syncAppointment: vi.fn(async () => ({
          ok: false as const,
          code: "tebra_conflict" as const,
          retryable: false,
        })),
      },
    });

    await expect(bound.createAppointment(ENDPOINT, "unused-key", REQUEST)).rejects.toThrow(
      "tebra_conflict",
    );
  });
});

describe("Scheduling bridge under the existing adapter", () => {
  const ENV = {
    CARE_ENABLED: "true",
    CARE_ENABLE_APPROVED: "true",
    CARE_TEBRA_SCHEDULING_ENABLED: "true",
    CARE_TEBRA_BASE_URL: "https://practice.example/",
    CARE_TEBRA_API_KEY: "not-a-real-scheduling-key",
  } satisfies NodeJS.ProcessEnv;

  const enabledCapability = async () =>
    ({
      rail: "care" as const,
      state: "enabled" as const,
      enabled: true,
      publicMessage: "Care is available in supported locations.",
      checkedAt: "2026-08-12T12:00:00.000Z",
    });

  it("schedules end to end without the existing adapter being changed", async () => {
    const adapter = createTebraSchedulingAdapter({
      env: ENV,
      transport: transport(),
      loadCareCapability: enabledCapability,
    });

    await expect(adapter.schedule(REQUEST)).resolves.toEqual({
      ok: true,
      externalAppointmentId: "tebra-appt-1",
    });
  });

  it("falls back to concierge scheduling when the connector refuses", async () => {
    const adapter = createTebraSchedulingAdapter({
      env: ENV,
      transport: transport({ patientId: null }),
      loadCareCapability: enabledCapability,
    });

    await expect(adapter.schedule(REQUEST)).resolves.toEqual({
      ok: false,
      code: "tebra_unavailable",
      fallback: "concierge_required",
    });
  });

  it("still refuses to reach the connector while Care is held", async () => {
    const syncAppointment = vi.fn();
    const adapter = createTebraSchedulingAdapter({
      env: { ...ENV, CARE_ENABLE_APPROVED: "false" },
      transport: transport({ gateway: { syncAppointment } }),
      loadCareCapability: enabledCapability,
    });

    await expect(adapter.schedule(REQUEST)).resolves.toMatchObject({
      ok: false,
      code: "care_disabled",
    });
    expect(syncAppointment).not.toHaveBeenCalled();
  });
});
