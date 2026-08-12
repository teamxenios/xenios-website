import { describe, expect, it, vi } from "vitest";
import { tebraExternalId } from "@shared/care/tebra";
import { UnconfiguredTebraPracticeClient, type TebraPracticeClient } from "./tebra-client";
import type { ReadyTebraConfiguration } from "./tebra-config";
import { createTebraAdminService, isBoundTebraClient } from "./tebra-admin";
import { createMemoryTebraLinkStore } from "./tebra-link-store";

const NOW = new Date("2026-08-12T12:00:00.000Z");

const READY: ReadyTebraConfiguration = {
  state: "ready",
  endpoint: new URL("https://practice.example/soap"),
  username: "integration-user",
  password: "not-a-real-password",
  customerKey: "not-a-real-customer-key",
  practiceId: "practice-9182",
  pollIntervalMinutes: 10,
  maxPagesPerRun: 5,
  overlapSeconds: 120,
};

function emptyPage(entity: "patient" | "appointment") {
  return {
    records: [],
    nextCursor: {
      entity,
      fromModifiedAt: NOW.toISOString(),
      toModifiedAt: NOW.toISOString(),
      continuationToken: null,
    },
    hasMore: false,
  };
}

function boundClient(): TebraPracticeClient {
  return {
    findPatientByExternalId: vi.fn(),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    listPatientsModified: vi.fn(async () => emptyPage("patient")),
    findAppointmentByExternalId: vi.fn(),
    createAppointment: vi.fn(),
    updateAppointment: vi.fn(),
    listAppointmentsModified: vi.fn(async () => emptyPage("appointment")),
  } as unknown as TebraPracticeClient;
}

function admin(client: TebraPracticeClient = boundClient()) {
  const links = createMemoryTebraLinkStore();
  return {
    links,
    client,
    service: createTebraAdminService({
      config: READY,
      client,
      links,
      owner: "worker-a",
      now: () => NOW,
    }),
  };
}

describe("Transport binding", () => {
  it("knows the default client is not a real transport", () => {
    expect(isBoundTebraClient(new UnconfiguredTebraPracticeClient())).toBe(false);
    expect(isBoundTebraClient(boundClient())).toBe(true);
  });

  it("every call on the default client fails safe rather than reaching out", async () => {
    const client = new UnconfiguredTebraPracticeClient();
    await expect(client.findPatientByExternalId()).rejects.toThrow("tebra_unavailable");
    await expect(client.createPatient()).rejects.toThrow("tebra_unavailable");
    await expect(client.listAppointmentsModified()).rejects.toThrow("tebra_unavailable");
  });
});

describe("Admin status", () => {
  it("reports both cursors and stays free of credentials", async () => {
    const harness = admin();
    await harness.links.saveCursor({
      entity: "patient",
      fromModifiedAt: "2026-08-12T11:48:00.000Z",
      toModifiedAt: "2026-08-12T11:58:00.000Z",
      continuationToken: null,
    });

    const status = await harness.service.status();
    expect(status.cursors).toEqual([
      {
        entity: "patient",
        fromModifiedAt: "2026-08-12T11:48:00.000Z",
        toModifiedAt: "2026-08-12T11:58:00.000Z",
      },
      { entity: "appointment", fromModifiedAt: null, toModifiedAt: null },
    ]);

    const serialized = JSON.stringify(status);
    for (const secret of [READY.password, READY.customerKey, READY.username, "practice-9182"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("is not ready while only the default client is bound", async () => {
    const harness = admin(new UnconfiguredTebraPracticeClient());
    await expect(harness.service.status()).resolves.toMatchObject({
      state: "ready",
      transportBound: false,
      ready: false,
    });
  });
});

describe("Manual sync", () => {
  it("runs patients before appointments so a new patient links first", async () => {
    const harness = admin();
    const order: string[] = [];
    (harness.client.listPatientsModified as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        order.push("patient");
        return emptyPage("patient");
      },
    );
    (harness.client.listAppointmentsModified as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        order.push("appointment");
        return emptyPage("appointment");
      },
    );

    const result = await harness.service.sync();
    expect(order).toEqual(["patient", "appointment"]);
    expect(result.outcomes).toHaveLength(2);
  });

  it("runs only the entity it was asked for", async () => {
    const harness = admin();
    const result = await harness.service.sync("appointment");

    expect(result.outcomes).toHaveLength(1);
    expect(harness.client.listPatientsModified).not.toHaveBeenCalled();
    expect(harness.client.listAppointmentsModified).toHaveBeenCalledTimes(1);
  });

  it("uses the same lease a scheduled pass would, so the two cannot overlap", async () => {
    const harness = admin();
    await harness.links.acquireLease({
      leaseKey: "care:tebra:sync:patient",
      owner: "scheduled-worker",
      expiresAt: "2026-08-12T12:09:00.000Z",
      now: NOW.toISOString(),
    });

    const result = await harness.service.sync("patient");
    expect(result.outcomes[0]).toEqual({
      entity: "patient",
      skipped: true,
      reason: "lease_held",
    });
    expect(harness.client.listPatientsModified).not.toHaveBeenCalled();
  });

  it("does not sync while the integration is not configured", async () => {
    const client = boundClient();
    const service = createTebraAdminService({
      config: { state: "unconfigured" },
      client,
      links: createMemoryTebraLinkStore(),
      owner: "worker-a",
      now: () => NOW,
    });

    const result = await service.sync();
    expect(result.outcomes).toEqual([
      { entity: "patient", skipped: true, reason: "not_ready" },
      { entity: "appointment", skipped: true, reason: "not_ready" },
    ]);
    expect(client.listPatientsModified).not.toHaveBeenCalled();
  });
});

describe("Link namespacing", () => {
  it("keeps the appointment and patient key spaces from colliding", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(tebraExternalId("appointment", id)).not.toBe(tebraExternalId("patient", id));
  });
});
