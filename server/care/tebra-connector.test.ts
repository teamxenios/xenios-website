import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { TEBRA_ROUTE_CONTRACTS, tebraExternalId } from "@shared/care/tebra";
import type { CareCapabilityState, CareCapabilityStatus, CarePrincipal, CareRole } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import { UnconfiguredTebraPracticeClient, type TebraPracticeClient } from "./tebra-client";
import { createTebraConnector } from "./tebra-connector";
import { createMemoryTebraLinkStore } from "./tebra-link-store";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

const CONFIGURED = {
  CARE_ENABLED: "true",
  CARE_ENABLE_APPROVED: "true",
  CARE_TEBRA_SYNC_ENABLED: "true",
  CARE_TEBRA_SOAP_ENDPOINT: "https://practice.example/soap",
  CARE_TEBRA_USERNAME: "integration-user",
  CARE_TEBRA_PASSWORD: "not-a-real-password",
  CARE_TEBRA_CUSTOMER_KEY: "not-a-real-customer-key",
} satisfies NodeJS.ProcessEnv;

function capability(state: CareCapabilityState = "enabled") {
  return async (): Promise<CareCapabilityStatus> => ({
    rail: "care",
    state,
    enabled: state === "enabled",
    publicMessage: "",
    checkedAt: "2026-08-13T00:00:00.000Z",
  });
}

function connector(
  input: {
    env?: NodeJS.ProcessEnv;
    client?: TebraPracticeClient;
    state?: CareCapabilityState;
  } = {},
) {
  const audit = vi.fn(async () => undefined);
  const links = createMemoryTebraLinkStore();
  return {
    audit,
    links,
    connector: createTebraConnector({
      env: input.env ?? {},
      loadCareCapability: capability(input.state),
      links,
      audit,
      owner: "worker-a",
      client: input.client,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    }),
  };
}

function access(role: CareRole = "clinical_admin"): CareAccessDependencies {
  return {
    loadCapabilityStatus: async () => ({
      rail: "care",
      state: "enabled",
      enabled: true,
      publicMessage: "",
      checkedAt: "2026-08-13T00:00:00.000Z",
    }),
    resolvePrincipal: async () => ({ subjectId: ADMIN_ID, roles: [role] }) as CarePrincipal,
    recordAccessDecision: async () => undefined,
  };
}

describe("Assembled connector: safe by default", () => {
  it("defaults to the client that refuses, so an incomplete deployment cannot call out", async () => {
    const harness = connector({ env: CONFIGURED });

    expect(harness.connector.client).toBeInstanceOf(UnconfiguredTebraPracticeClient);
    await expect(harness.connector.status()).resolves.toMatchObject({
      state: "ready",
      transportBound: false,
      ready: false,
    });
  });

  it("is disabled entirely when Care's own switches are off", async () => {
    const harness = connector({ env: {} });

    expect(harness.connector.config.state).toBe("disabled");
    await expect(harness.connector.gateway.syncPatient({})).resolves.toMatchObject({
      ok: false,
      code: "tebra_disabled",
    });
    await expect(harness.connector.status()).resolves.toMatchObject({ ready: false });
  });

  it("reports not ready while the stored capability is held, even fully configured", async () => {
    const bound = {
      listPatientsModified: vi.fn(),
      listAppointmentsModified: vi.fn(),
    } as unknown as TebraPracticeClient;
    const harness = connector({ env: CONFIGURED, client: bound, state: "pending_qa" });

    await expect(harness.connector.status()).resolves.toMatchObject({
      state: "ready",
      transportBound: true,
      careEnabled: false,
      ready: false,
    });
  });

  it("starts nothing and registers nothing on assembly", async () => {
    const bound = {
      listPatientsModified: vi.fn(),
      listAppointmentsModified: vi.fn(),
    } as unknown as TebraPracticeClient;
    const harness = connector({ env: CONFIGURED, client: bound });

    expect(harness.connector.scheduler.isStarted()).toBe(false);
    expect(bound.listPatientsModified).not.toHaveBeenCalled();
    expect(harness.audit).not.toHaveBeenCalled();
  });

  it("refuses to start the scheduler when configuration could never allow a run", () => {
    const harness = connector({ env: {} });
    expect(harness.connector.scheduler.start()).toBe(false);
  });
});

describe("Assembled connector: the admin surfaces", () => {
  function app(role: CareRole = "clinical_admin") {
    const harness = connector({ env: CONFIGURED });
    const handlers = harness.connector.handlers(access(role));
    const instance = express();
    instance.use(express.json());
    instance.get(TEBRA_ROUTE_CONTRACTS.status, handlers.requireAdmin, handlers.status);
    instance.post(TEBRA_ROUTE_CONTRACTS.sync, handlers.requireAdmin, handlers.sync);
    return instance;
  }

  it("serves status to a clinical admin through the assembled service", async () => {
    const response = await request(app()).get(TEBRA_ROUTE_CONTRACTS.status);

    expect(response.status).toBe(200);
    expect(response.body.integration).toMatchObject({ integration: "tebra", ready: false });
    // The assembled path must not leak configuration into an operator surface.
    const serialized = JSON.stringify(response.body);
    for (const secret of [
      CONFIGURED.CARE_TEBRA_PASSWORD,
      CONFIGURED.CARE_TEBRA_CUSTOMER_KEY,
      CONFIGURED.CARE_TEBRA_USERNAME,
      "practice.example",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("still refuses a role that does not administer", async () => {
    const response = await request(app("clinician")).post(TEBRA_ROUTE_CONTRACTS.sync).send({});
    expect(response.status).toBe(403);
  });
});

describe("Assembled connector: the scheduling seam", () => {
  it("routes a booking through the same gateway, link and audit as a sync", async () => {
    const bound = {
      findAppointmentByExternalId: vi.fn(async () => null),
      createAppointment: vi.fn(async () => ({
        tebraId: "tebra-appt-1",
        externalId: tebraExternalId("appointment", APPOINTMENT_ID),
        modifiedAt: "2026-08-13T00:00:00Z",
      })),
    } as unknown as TebraPracticeClient;

    const harness = connector({ env: CONFIGURED, client: bound });
    await harness.links.saveLink({
      entity: "patient",
      localId: PATIENT_ID,
      externalId: tebraExternalId("patient", PATIENT_ID),
      tebraId: "tebra-patient-1",
      linkedAt: "2026-08-13T00:00:00.000Z",
      lastSeenAt: "2026-08-13T00:00:00.000Z",
    });

    const transport = harness.connector.schedulingTransport(async () => PATIENT_ID);
    await expect(
      transport.createAppointment(new URL("https://unused.example/"), "unused", {
        appointmentId: APPOINTMENT_ID,
        startsAt: "2026-08-20T15:00:00Z",
        endsAt: "2026-08-20T15:30:00Z",
      }),
    ).resolves.toEqual({ externalAppointmentId: "tebra-appt-1" });

    // The same link row the sync path would have written.
    await expect(harness.links.findByLocalId("appointment", APPOINTMENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-appt-1",
    });
    expect(harness.audit).toHaveBeenCalledWith(
      "care.tebra.appointment_linked",
      expect.objectContaining({ entity: "appointment", success: true }),
    );
  });

  it("degrades to the concierge fallback while the stored capability is held", async () => {
    const bound = {
      findAppointmentByExternalId: vi.fn(),
      createAppointment: vi.fn(),
    } as unknown as TebraPracticeClient;
    const harness = connector({ env: CONFIGURED, client: bound, state: "pending_qa" });

    const transport = harness.connector.schedulingTransport(async () => PATIENT_ID);
    await expect(
      transport.createAppointment(new URL("https://unused.example/"), "unused", {
        appointmentId: APPOINTMENT_ID,
        startsAt: "2026-08-20T15:00:00Z",
        endsAt: "2026-08-20T15:30:00Z",
      }),
    ).rejects.toThrow("care_disabled");
    expect(bound.createAppointment).not.toHaveBeenCalled();
  });
});

describe("Assembled connector: manual and scheduled passes do not double", () => {
  it("refuses a manual sync while the scheduled trigger holds the lease", async () => {
    const bound = {
      listPatientsModified: vi.fn(async () => ({
        records: [],
        nextCursor: {
          entity: "patient" as const,
          fromModifiedAt: "2026-08-13T00:00:00.000Z",
          toModifiedAt: "2026-08-13T00:00:00.000Z",
          continuationToken: null,
        },
        hasMore: false,
      })),
      listAppointmentsModified: vi.fn(),
    } as unknown as TebraPracticeClient;

    const harness = connector({ env: CONFIGURED, client: bound });
    await harness.links.acquireLease({
      leaseKey: "care:tebra:sync:patient",
      owner: "worker-a:scheduled",
      expiresAt: "2026-08-13T00:10:00.000Z",
      now: "2026-08-13T00:00:00.000Z",
    });

    const result = await harness.connector.admin.sync("patient");
    expect(result.outcomes[0]).toEqual({
      entity: "patient",
      skipped: true,
      reason: "lease_held",
    });
    expect(bound.listPatientsModified).not.toHaveBeenCalled();
  });
});
