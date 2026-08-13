import { describe, expect, it, vi } from "vitest";
import { tebraExternalId, type TebraRemoteRecord } from "@shared/care/tebra";
import type { CareCapabilityState, CareCapabilityStatus } from "@shared/care/contracts";
import type { TebraPracticeClient } from "./tebra-client";
import type { ReadyTebraConfiguration, TebraConfiguration } from "./tebra-config";
import { createTebraGateway } from "./tebra-gateway";
import { createMemoryTebraLinkStore, type TebraLinkStore } from "./tebra-link-store";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222";
const PATIENT_EXTERNAL_ID = tebraExternalId("patient", PATIENT_ID);
const APPOINTMENT_EXTERNAL_ID = tebraExternalId("appointment", APPOINTMENT_ID);

const READY: ReadyTebraConfiguration = {
  state: "ready",
  endpoint: new URL("https://practice.example/soap"),
  username: "integration-user",
  password: "not-a-real-password",
  customerKey: "not-a-real-customer-key",
  practiceId: null,
  pollIntervalMinutes: 10,
  maxPagesPerRun: 20,
  overlapSeconds: 120,
};

const PATIENT = {
  localPatientId: PATIENT_ID,
  externalId: PATIENT_EXTERNAL_ID,
  firstName: "Test",
  lastName: "Person",
  dateOfBirth: "1990-02-28",
  email: "test.person@example.test",
  phone: "+15555550123",
  modifiedAt: "2026-08-12T12:00:00Z",
};

const APPOINTMENT = {
  localAppointmentId: APPOINTMENT_ID,
  localPatientId: PATIENT_ID,
  patientExternalId: PATIENT_EXTERNAL_ID,
  externalId: APPOINTMENT_EXTERNAL_ID,
  startsAt: "2026-08-20T15:00:00Z",
  endsAt: "2026-08-20T15:30:00Z",
  status: "scheduled" as const,
  modifiedAt: "2026-08-12T12:00:00Z",
};

function remote(tebraId: string, externalId: string | null): TebraRemoteRecord {
  return { tebraId, externalId, modifiedAt: "2026-08-12T12:00:00Z" };
}

function client(overrides: Partial<TebraPracticeClient> = {}): TebraPracticeClient {
  return {
    findPatientByExternalId: vi.fn(async () => null),
    createPatient: vi.fn(async () => remote("tebra-patient-1", PATIENT_EXTERNAL_ID)),
    updatePatient: vi.fn(async () => remote("tebra-patient-1", PATIENT_EXTERNAL_ID)),
    listPatientsModified: vi.fn(),
    findAppointmentByExternalId: vi.fn(async () => null),
    createAppointment: vi.fn(async () => remote("tebra-appt-1", APPOINTMENT_EXTERNAL_ID)),
    updateAppointment: vi.fn(async () => remote("tebra-appt-1", APPOINTMENT_EXTERNAL_ID)),
    listAppointmentsModified: vi.fn(),
    ...overrides,
  } as TebraPracticeClient;
}

export function careCapability(state: CareCapabilityState = "enabled") {
  return async (): Promise<CareCapabilityStatus> => ({
    rail: "care",
    state,
    enabled: state === "enabled",
    publicMessage: "Care is available in supported locations.",
    checkedAt: "2026-08-12T12:00:00.000Z",
  });
}

function gateway(input: {
  client?: TebraPracticeClient;
  links?: TebraLinkStore;
  config?: TebraConfiguration;
  audit?: ReturnType<typeof vi.fn>;
  loadCareCapability?: () => Promise<CareCapabilityStatus>;
}) {
  const audit = input.audit ?? vi.fn(async () => undefined);
  const links = input.links ?? createMemoryTebraLinkStore();
  const practice = input.client ?? client();
  return {
    audit,
    links,
    client: practice,
    gateway: createTebraGateway({
      config: input.config ?? READY,
      client: practice,
      links,
      loadCareCapability: input.loadCareCapability ?? careCapability(),
      audit,
      sleep: async () => undefined,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
    }),
  };
}

async function linkPatient(links: TebraLinkStore) {
  await links.saveLink({
    entity: "patient",
    localId: PATIENT_ID,
    externalId: PATIENT_EXTERNAL_ID,
    tebraId: "tebra-patient-1",
    linkedAt: "2026-08-12T11:00:00.000Z",
    lastSeenAt: "2026-08-12T11:00:00.000Z",
  });
}

describe("Tebra gateway readiness", () => {
  it("refuses before Care and the integration are both on", async () => {
    for (const [config, code] of [
      [{ state: "disabled" } as const, "tebra_disabled"],
      [{ state: "unconfigured" } as const, "tebra_unconfigured"],
      [{ state: "invalid", reason: "unsafe_endpoint" } as const, "tebra_invalid_configuration"],
    ]) {
      const harness = gateway({ config });
      await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
        ok: false,
        code,
        retryable: false,
      });
      expect(harness.client.createPatient).not.toHaveBeenCalled();
    }
  });

  it("refuses when the stored Care capability is not exactly enabled", async () => {
    // G10-1. The environment switches are on in READY, so this proves the
    // stored capability is a real second gate rather than decoration.
    for (const state of [
      "disabled",
      "pending_qa",
      "pending_clinicians",
      "pending_credentials",
    ] as const) {
      const harness = gateway({ loadCareCapability: careCapability(state) });
      await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
        ok: false,
        code: "care_disabled",
        retryable: false,
      });
      expect(harness.client.findPatientByExternalId).not.toHaveBeenCalled();
      expect(harness.client.createPatient).not.toHaveBeenCalled();
    }
  });

  it("refuses an appointment when the stored Care capability is held", async () => {
    const harness = gateway({ loadCareCapability: careCapability("pending_qa") });
    await linkPatient(harness.links);

    await expect(harness.gateway.syncAppointment(APPOINTMENT)).resolves.toEqual({
      ok: false,
      code: "care_disabled",
      retryable: false,
    });
    expect(harness.client.createAppointment).not.toHaveBeenCalled();
  });

  it("refuses when the capability lookup itself fails", async () => {
    const harness = gateway({
      loadCareCapability: async () => {
        throw new Error("care_capability_lookup_failed");
      },
    });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: false,
      code: "care_disabled",
      retryable: false,
    });
    expect(harness.client.createPatient).not.toHaveBeenCalled();
  });

  it("refuses a capability that claims another rail", async () => {
    const harness = gateway({
      loadCareCapability: async () =>
        ({
          rail: "research",
          state: "enabled",
          enabled: true,
          publicMessage: "",
          checkedAt: "2026-08-12T12:00:00.000Z",
        }) as unknown as CareCapabilityStatus,
    });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toMatchObject({
      ok: false,
      code: "care_disabled",
    });
  });

  it("refuses a payload that fails the shared contract without calling out", async () => {
    const harness = gateway({});
    await expect(
      harness.gateway.syncPatient({ ...PATIENT, dateOfBirth: "1990-02-30" }),
    ).resolves.toEqual({ ok: false, code: "tebra_invalid_payload", retryable: false });
    expect(harness.client.findPatientByExternalId).not.toHaveBeenCalled();
  });
});

describe("Tebra patient idempotency", () => {
  it("creates once and updates thereafter", async () => {
    const harness = gateway({});
    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toMatchObject({ ok: true });
    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toMatchObject({ ok: true });

    expect(harness.client.createPatient).toHaveBeenCalledTimes(1);
    expect(harness.client.updatePatient).toHaveBeenCalledTimes(1);
  });

  it("adopts a record it already created when the local link was never saved", async () => {
    // This is the crash window: the practice system has the patient, Xenios has
    // no link row. A second create here would be a duplicate chart.
    const practice = client({
      findPatientByExternalId: vi.fn(async () => remote("tebra-patient-1", PATIENT_EXTERNAL_ID)),
    });
    const harness = gateway({ client: practice });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: true,
      value: { tebraId: "tebra-patient-1" },
    });
    expect(practice.createPatient).not.toHaveBeenCalled();
    expect(practice.updatePatient).toHaveBeenCalledWith("tebra-patient-1", expect.anything());
    await expect(harness.links.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-patient-1",
    });
  });

  it("treats a record carrying someone else external id as a conflict", async () => {
    const practice = client({
      createPatient: vi.fn(async () =>
        remote("tebra-patient-9", tebraExternalId("patient", APPOINTMENT_ID)),
      ),
    });
    const harness = gateway({ client: practice });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: false,
      code: "tebra_conflict",
      retryable: false,
    });
    await expect(harness.links.findByLocalId("patient", PATIENT_ID)).resolves.toBeNull();
  });
});

describe("Tebra appointment linkage", () => {
  it("refuses an appointment whose patient is not linked yet", async () => {
    const harness = gateway({});
    await expect(harness.gateway.syncAppointment(APPOINTMENT)).resolves.toEqual({
      ok: false,
      code: "tebra_not_linked",
      retryable: false,
    });
    expect(harness.client.createAppointment).not.toHaveBeenCalled();
  });

  it("creates once for a linked patient and updates thereafter", async () => {
    const harness = gateway({});
    await linkPatient(harness.links);

    await expect(harness.gateway.syncAppointment(APPOINTMENT)).resolves.toMatchObject({ ok: true });
    await expect(harness.gateway.syncAppointment(APPOINTMENT)).resolves.toMatchObject({ ok: true });
    expect(harness.client.createAppointment).toHaveBeenCalledTimes(1);
    expect(harness.client.updateAppointment).toHaveBeenCalledTimes(1);
  });
});

describe("Tebra retries", () => {
  it("retries an availability failure and succeeds without duplicating", async () => {
    const create = vi
      .fn<[], Promise<TebraRemoteRecord>>()
      .mockRejectedValueOnce(new Error("tebra_unavailable"))
      .mockResolvedValue(remote("tebra-patient-1", PATIENT_EXTERNAL_ID));
    const find = vi
      .fn<[], Promise<TebraRemoteRecord | null>>()
      .mockResolvedValue(null);
    const harness = gateway({
      client: client({ createPatient: create, findPatientByExternalId: find }),
    });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toMatchObject({ ok: true });
    // The retry repeats the lookup first, which is what keeps it safe.
    expect(find).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a conflict", async () => {
    const create = vi.fn(async () => {
      throw new Error("tebra_conflict");
    });
    const harness = gateway({ client: client({ createPatient: create }) });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: false,
      code: "tebra_conflict",
      retryable: false,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives up after the bounded number of attempts", async () => {
    const create = vi.fn(async () => {
      throw new Error("tebra_unavailable");
    });
    const harness = gateway({ client: client({ createPatient: create }) });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: false,
      code: "tebra_unavailable",
      retryable: true,
    });
    expect(create).toHaveBeenCalledTimes(3);
  });
});

describe("Tebra audit and redaction", () => {
  it("records only opaque identifiers and never the demographics it sent", async () => {
    const harness = gateway({});
    await harness.gateway.syncPatient(PATIENT);

    expect(harness.audit).toHaveBeenCalledWith(
      "care.tebra.patient_linked",
      expect.objectContaining({
        operation: "sync",
        entity: "patient",
        localId: PATIENT_ID,
        success: true,
      }),
    );

    const serialized = JSON.stringify(harness.audit.mock.calls);
    for (const value of [
      PATIENT.firstName,
      PATIENT.lastName,
      PATIENT.dateOfBirth,
      PATIENT.email,
      PATIENT.phone,
      READY.password,
      READY.customerKey,
    ]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("reduces an upstream fault that quotes patient data to a bare code", async () => {
    const harness = gateway({
      client: client({
        createPatient: vi.fn(async () => {
          throw new Error("SOAP fault: patient Test Person 1990-02-28 rejected");
        }),
      }),
    });

    const result = await harness.gateway.syncPatient(PATIENT);
    expect(result).toEqual({ ok: false, code: "tebra_unavailable", retryable: true });

    const everythingSaid = JSON.stringify([result, harness.audit.mock.calls]);
    expect(everythingSaid).not.toContain("Test Person");
    expect(everythingSaid).not.toContain("1990-02-28");
    expect(everythingSaid).not.toContain("SOAP fault");
  });

  it("does not report success when the action could not be audited", async () => {
    const audit = vi.fn(async () => {
      throw new Error("care_audit_failed");
    });
    const harness = gateway({ audit });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: false,
      code: "tebra_unavailable",
      retryable: true,
    });
    // The link is stored, so the retry re-audits instead of calling out again.
    await expect(harness.links.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-patient-1",
    });
  });

  it("does not claim a link it could not store", async () => {
    const links = createMemoryTebraLinkStore();
    const failing: TebraLinkStore = {
      ...links,
      saveLink: vi.fn(async () => {
        throw new Error("store_unavailable");
      }),
    };
    const harness = gateway({ links: failing });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toEqual({
      ok: false,
      code: "tebra_unavailable",
      retryable: true,
    });
  });
});
