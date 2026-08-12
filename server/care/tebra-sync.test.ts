import { describe, expect, it, vi } from "vitest";
import {
  isTebraSyncSkipped,
  tebraExternalId,
  type TebraSyncCursor,
  type TebraSyncSummary,
} from "@shared/care/tebra";
import type { TebraPracticeClient, TebraRemotePage } from "./tebra-client";
import type { ReadyTebraConfiguration } from "./tebra-config";
import { createMemoryTebraLinkStore, type TebraLinkStore } from "./tebra-link-store";
import { runTebraSyncCycle, tebraSyncLeaseKey } from "./tebra-sync";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_EXTERNAL_ID = tebraExternalId("patient", PATIENT_ID);
const NOW = new Date("2026-08-12T12:00:00.000Z");

const READY: ReadyTebraConfiguration = {
  state: "ready",
  endpoint: new URL("https://practice.example/soap"),
  username: "integration-user",
  password: "not-a-real-password",
  customerKey: "not-a-real-customer-key",
  practiceId: null,
  pollIntervalMinutes: 10,
  maxPagesPerRun: 3,
  overlapSeconds: 120,
};

function page(overrides: Partial<TebraRemotePage> = {}): TebraRemotePage {
  return {
    records: [],
    nextCursor: {
      entity: "patient",
      fromModifiedAt: NOW.toISOString(),
      toModifiedAt: NOW.toISOString(),
      continuationToken: null,
    },
    hasMore: false,
    ...overrides,
  };
}

function client(pages: TebraRemotePage[]): TebraPracticeClient {
  let index = 0;
  return {
    findPatientByExternalId: vi.fn(),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    listPatientsModified: vi.fn(async () => pages[Math.min(index++, pages.length - 1)]),
    findAppointmentByExternalId: vi.fn(),
    createAppointment: vi.fn(),
    updateAppointment: vi.fn(),
    listAppointmentsModified: vi.fn(async () => page()),
  } as unknown as TebraPracticeClient;
}

async function linkPatient(links: TebraLinkStore, tebraId = "tebra-patient-1") {
  await links.saveLink({
    entity: "patient",
    localId: PATIENT_ID,
    externalId: PATIENT_EXTERNAL_ID,
    tebraId,
    linkedAt: "2026-08-12T11:00:00.000Z",
    lastSeenAt: "2026-08-12T11:00:00.000Z",
  });
}

function run(input: {
  client: TebraPracticeClient;
  links: TebraLinkStore;
  owner?: string;
  audit?: ReturnType<typeof vi.fn>;
  config?: ReadyTebraConfiguration | { state: "unconfigured" };
}) {
  return runTebraSyncCycle({
    entity: "patient",
    config: (input.config ?? READY) as ReadyTebraConfiguration,
    client: input.client,
    links: input.links,
    owner: input.owner ?? "worker-a",
    audit: input.audit,
    now: () => NOW,
  });
}

describe("Tebra sync readiness and leasing", () => {
  it("does not poll while the integration is not ready", async () => {
    const practice = client([page()]);
    const outcome = await run({
      client: practice,
      links: createMemoryTebraLinkStore(),
      config: { state: "unconfigured" },
    });

    expect(outcome).toEqual({ entity: "patient", skipped: true, reason: "not_ready" });
    expect(practice.listPatientsModified).not.toHaveBeenCalled();
  });

  it("skips when another worker holds the lease", async () => {
    const links = createMemoryTebraLinkStore();
    await links.acquireLease({
      leaseKey: tebraSyncLeaseKey("patient"),
      owner: "worker-b",
      expiresAt: "2026-08-12T12:09:00.000Z",
      now: NOW.toISOString(),
    });
    const practice = client([page()]);

    const outcome = await run({ client: practice, links });
    expect(outcome).toEqual({ entity: "patient", skipped: true, reason: "lease_held" });
    expect(practice.listPatientsModified).not.toHaveBeenCalled();
  });

  it("releases the lease even when the practice call throws", async () => {
    const links = createMemoryTebraLinkStore();
    const practice = client([]);
    (practice.listPatientsModified as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("tebra_unavailable"),
    );

    const outcome = await run({ client: practice, links });
    expect(isTebraSyncSkipped(outcome)).toBe(false);
    expect((outcome as TebraSyncSummary).failed).toBe(1);

    await expect(
      links.acquireLease({
        leaseKey: tebraSyncLeaseKey("patient"),
        owner: "worker-b",
        expiresAt: "2026-08-12T12:10:00.000Z",
        now: NOW.toISOString(),
      }),
    ).resolves.toBe(true);
  });
});

describe("Tebra sync cursors", () => {
  it("opens the first window one interval back plus the overlap", async () => {
    const links = createMemoryTebraLinkStore();
    const practice = client([page()]);
    await run({ client: practice, links });

    const cursor = (practice.listPatientsModified as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TebraSyncCursor;
    expect(cursor.toModifiedAt).toBe(NOW.toISOString());
    expect(cursor.fromModifiedAt).toBe(new Date("2026-08-12T11:48:00.000Z").toISOString());
  });

  it("reaches back past the previous close so a boundary change is not missed", async () => {
    const links = createMemoryTebraLinkStore();
    await links.saveCursor({
      entity: "patient",
      fromModifiedAt: "2026-08-12T11:40:00.000Z",
      toModifiedAt: "2026-08-12T11:50:00.000Z",
      continuationToken: null,
    });
    const practice = client([page()]);
    await run({ client: practice, links });

    const cursor = (practice.listPatientsModified as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TebraSyncCursor;
    expect(cursor.fromModifiedAt).toBe("2026-08-12T11:48:00.000Z");
    expect(cursor.toModifiedAt).toBe(NOW.toISOString());
  });

  it("finishes an interrupted window before opening a new one", async () => {
    const links = createMemoryTebraLinkStore();
    const resumed: TebraSyncCursor = {
      entity: "patient",
      fromModifiedAt: "2026-08-12T11:00:00.000Z",
      toModifiedAt: "2026-08-12T11:10:00.000Z",
      continuationToken: "page-2",
    };
    await links.saveCursor(resumed);
    const practice = client([page()]);
    await run({ client: practice, links });

    expect(practice.listPatientsModified).toHaveBeenCalledWith(resumed);
  });

  it("keeps the window open while the client reports more pages", async () => {
    const links = createMemoryTebraLinkStore();
    const practice = client([
      page({ hasMore: true, nextCursor: { ...page().nextCursor, continuationToken: "p2" } }),
      page({ hasMore: true, nextCursor: { ...page().nextCursor, continuationToken: "p3" } }),
      page({ hasMore: false }),
    ]);

    const outcome = (await run({ client: practice, links })) as TebraSyncSummary;
    expect(outcome.pages).toBe(3);
    expect(outcome.cursor.continuationToken).toBeNull();
    await expect(links.loadCursor("patient")).resolves.toMatchObject({
      continuationToken: null,
    });
  });

  it("stops at the page ceiling and leaves the window resumable", async () => {
    const links = createMemoryTebraLinkStore();
    const practice = client([
      page({ hasMore: true, nextCursor: { ...page().nextCursor, continuationToken: "p2" } }),
    ]);

    const outcome = (await run({ client: practice, links })) as TebraSyncSummary;
    expect(outcome.pages).toBe(READY.maxPagesPerRun);
    await expect(links.loadCursor("patient")).resolves.toMatchObject({
      continuationToken: "p2",
    });
  });

  it("does not advance the cursor when the very first page fails", async () => {
    const links = createMemoryTebraLinkStore();
    const practice = client([]);
    (practice.listPatientsModified as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );

    const outcome = (await run({ client: practice, links })) as TebraSyncSummary;
    expect(outcome.cursorAdvanced).toBe(false);
    await expect(links.loadCursor("patient")).resolves.toBeNull();
  });
});

describe("Tebra sync reconciliation", () => {
  it("touches only records Xenios already linked", async () => {
    const links = createMemoryTebraLinkStore();
    await linkPatient(links);
    const practice = client([
      page({
        records: [
          { tebraId: "tebra-patient-1", externalId: PATIENT_EXTERNAL_ID, modifiedAt: "2026-08-12T11:55:00Z" },
          { tebraId: "tebra-patient-2", externalId: null, modifiedAt: "2026-08-12T11:56:00Z" },
          {
            tebraId: "tebra-patient-3",
            externalId: tebraExternalId("patient", "33333333-3333-4333-8333-333333333333"),
            modifiedAt: "2026-08-12T11:57:00Z",
          },
        ],
      }),
    ]);

    const outcome = (await run({ client: practice, links })) as TebraSyncSummary;
    expect(outcome.scanned).toBe(3);
    expect(outcome.reconciled).toBe(1);
    expect(outcome.unlinked).toBe(2);
    await expect(links.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      lastSeenAt: NOW.toISOString(),
    });
  });

  it("refuses to reconcile when the remote id no longer matches the link", async () => {
    const links = createMemoryTebraLinkStore();
    await linkPatient(links, "tebra-patient-1");
    const practice = client([
      page({
        records: [
          { tebraId: "tebra-patient-CHANGED", externalId: PATIENT_EXTERNAL_ID, modifiedAt: "2026-08-12T11:55:00Z" },
        ],
      }),
    ]);

    const outcome = (await run({ client: practice, links })) as TebraSyncSummary;
    expect(outcome.reconciled).toBe(0);
    expect(outcome.unlinked).toBe(1);
    await expect(links.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-patient-1",
    });
  });

  it("reports counts only, with nothing about the records themselves", async () => {
    const audit = vi.fn(async () => undefined);
    const links = createMemoryTebraLinkStore();
    await linkPatient(links);
    const practice = client([
      page({
        records: [
          { tebraId: "tebra-patient-1", externalId: PATIENT_EXTERNAL_ID, modifiedAt: "2026-08-12T11:55:00Z" },
        ],
      }),
    ]);

    await run({ client: practice, links, audit });
    expect(audit).toHaveBeenCalledWith(
      "care.tebra.sync_completed",
      expect.objectContaining({ entity: "patient", scanned: 1, reconciled: 1, unlinked: 0 }),
    );
    const serialized = JSON.stringify(audit.mock.calls);
    expect(serialized).not.toContain("tebra-patient-1");
  });

  it("keeps running when the summary cannot be recorded", async () => {
    const audit = vi.fn(async () => {
      throw new Error("audit sink down");
    });
    const links = createMemoryTebraLinkStore();
    const outcome = await run({ client: client([page()]), links, audit });
    expect(isTebraSyncSkipped(outcome)).toBe(false);
  });
});
