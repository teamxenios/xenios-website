import { describe, expect, it, vi } from "vitest";
import { tebraExternalId } from "@shared/care/tebra";
import {
  createMemoryTebraLinkStore,
  createPersistentTebraLinkStore,
  isConsistentTebraLink,
  type TebraEntityLink,
  type TebraLinkRowGateway,
} from "./tebra-link-store";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function link(overrides: Partial<TebraEntityLink> = {}): TebraEntityLink {
  return {
    entity: "patient",
    localId: PATIENT_ID,
    externalId: tebraExternalId("patient", PATIENT_ID),
    tebraId: "tebra-patient-1",
    linkedAt: "2026-08-12T11:00:00.000Z",
    lastSeenAt: "2026-08-12T11:00:00.000Z",
    ...overrides,
  };
}

describe("Tebra link consistency", () => {
  it("accepts a link whose external id is the one the connector derives today", () => {
    expect(isConsistentTebraLink(link())).toBe(true);
  });

  it("rejects a link that points a patient at a different record", () => {
    expect(
      isConsistentTebraLink(link({ externalId: tebraExternalId("patient", OTHER_ID) })),
    ).toBe(false);
    expect(isConsistentTebraLink(link({ externalId: "xenios:care_patient:someone else" }))).toBe(
      false,
    );
    expect(isConsistentTebraLink(link({ entity: "appointment" }))).toBe(false);
  });
});

describe("Memory link store", () => {
  it("finds a saved link by either key and keeps the two views in step", async () => {
    const store = createMemoryTebraLinkStore();
    await store.saveLink(link());
    await store.saveLink(link({ tebraId: "tebra-patient-2" }));

    await expect(store.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-patient-2",
    });
    await expect(
      store.findByExternalId("patient", tebraExternalId("patient", PATIENT_ID)),
    ).resolves.toMatchObject({ tebraId: "tebra-patient-2" });
  });

  it("refuses to store an inconsistent link at all", async () => {
    const store = createMemoryTebraLinkStore();
    await expect(
      store.saveLink(link({ externalId: tebraExternalId("patient", OTHER_ID) })),
    ).rejects.toThrow("tebra_conflict");
  });

  it("keeps entity namespaces separate", async () => {
    const store = createMemoryTebraLinkStore();
    await store.saveLink(link());
    await expect(store.findByLocalId("appointment", PATIENT_ID)).resolves.toBeNull();
  });
});

describe("Sync lease", () => {
  const request = {
    leaseKey: "care:tebra:sync:patient",
    expiresAt: "2026-08-12T12:10:00.000Z",
    now: "2026-08-12T12:00:00.000Z",
  };

  it("lets one owner hold it and refuses a second", async () => {
    const store = createMemoryTebraLinkStore();
    await expect(store.acquireLease({ ...request, owner: "worker-a" })).resolves.toBe(true);
    await expect(store.acquireLease({ ...request, owner: "worker-b" })).resolves.toBe(false);
  });

  it("lets the same owner renew", async () => {
    const store = createMemoryTebraLinkStore();
    await store.acquireLease({ ...request, owner: "worker-a" });
    await expect(store.acquireLease({ ...request, owner: "worker-a" })).resolves.toBe(true);
  });

  it("frees itself once expired, so a dead holder does not block sync forever", async () => {
    const store = createMemoryTebraLinkStore();
    await store.acquireLease({ ...request, owner: "worker-a" });
    await expect(
      store.acquireLease({
        leaseKey: request.leaseKey,
        owner: "worker-b",
        expiresAt: "2026-08-12T12:25:00.000Z",
        now: "2026-08-12T12:15:00.000Z",
      }),
    ).resolves.toBe(true);
  });

  it("only the holder can release it", async () => {
    const store = createMemoryTebraLinkStore();
    await store.acquireLease({ ...request, owner: "worker-a" });
    await store.releaseLease({ leaseKey: request.leaseKey, owner: "worker-b" });
    await expect(store.acquireLease({ ...request, owner: "worker-b" })).resolves.toBe(false);

    await store.releaseLease({ leaseKey: request.leaseKey, owner: "worker-a" });
    await expect(store.acquireLease({ ...request, owner: "worker-b" })).resolves.toBe(true);
  });
});

describe("Persistent link store", () => {
  function gatewayDouble(overrides: Partial<TebraLinkRowGateway> = {}): TebraLinkRowGateway {
    return {
      selectLinkByLocalId: vi.fn(async () => null),
      selectLinkByExternalId: vi.fn(async () => null),
      upsertLink: vi.fn(async () => undefined),
      selectCursor: vi.fn(async () => null),
      upsertCursor: vi.fn(async () => undefined),
      tryAcquireLease: vi.fn(async () => true),
      releaseLease: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it("ignores a stored row whose mapping does not check out", async () => {
    const poisoned = link({ externalId: tebraExternalId("patient", OTHER_ID) });
    const store = createPersistentTebraLinkStore(
      gatewayDouble({
        selectLinkByLocalId: vi.fn(async () => poisoned),
        selectLinkByExternalId: vi.fn(async () => poisoned),
      }),
    );

    await expect(store.findByLocalId("patient", PATIENT_ID)).resolves.toBeNull();
    await expect(store.findByExternalId("patient", poisoned.externalId)).resolves.toBeNull();
  });

  it("refuses to write an inconsistent row", async () => {
    const gateway = gatewayDouble();
    const store = createPersistentTebraLinkStore(gateway);
    await expect(
      store.saveLink(link({ externalId: tebraExternalId("patient", OTHER_ID) })),
    ).rejects.toThrow("tebra_conflict");
    expect(gateway.upsertLink).not.toHaveBeenCalled();
  });

  it("delegates the lease to a single atomic gateway call", async () => {
    const gateway = gatewayDouble({ tryAcquireLease: vi.fn(async () => false) });
    const store = createPersistentTebraLinkStore(gateway);
    const request = {
      leaseKey: "care:tebra:sync:patient",
      owner: "worker-a",
      expiresAt: "2026-08-12T12:10:00.000Z",
      now: "2026-08-12T12:00:00.000Z",
    };

    await expect(store.acquireLease(request)).resolves.toBe(false);
    expect(gateway.tryAcquireLease).toHaveBeenCalledWith(request);
  });
});
