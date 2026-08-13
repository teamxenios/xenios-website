import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { tebraExternalId, type TebraRemoteRecord } from "@shared/care/tebra";
import type { CareCapabilityStatus } from "@shared/care/contracts";
import type { TebraPracticeClient, TebraRemotePage } from "./tebra-client";
import type { ReadyTebraConfiguration } from "./tebra-config";
import { createTebraGateway } from "./tebra-gateway";
import { createMemoryTebraLinkStore, type TebraLinkStore } from "./tebra-link-store";
import { runTebraSyncCycle } from "./tebra-sync";

/**
 * Adversarial probes for the gates that name this lane in the defensive QA
 * pack: G10-1 to G10-5 and G11-1, G11-2, G11-5. These are written to fail if a
 * later change quietly relaxes an invariant, not to restate the unit tests.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222";
const PATIENT_EXTERNAL_ID = tebraExternalId("patient", PATIENT_ID);
const NOW = new Date("2026-08-12T12:00:00.000Z");

/** Every non-test source file this lane owns. */
const LANE_SOURCES = [
  "shared/care/tebra.ts",
  "server/care/tebra-capability.ts",
  "server/care/tebra-config.ts",
  "server/care/tebra-client.ts",
  "server/care/tebra-link-store.ts",
  "server/care/tebra-redaction.ts",
  "server/care/tebra-retry.ts",
  "server/care/tebra-gateway.ts",
  "server/care/tebra-sync.ts",
  "server/care/tebra-admin.ts",
  "server/care/tebra-routes.ts",
  "server/care/tebra-scheduling-bridge.ts",
];

function laneSource(): { file: string; text: string }[] {
  return LANE_SOURCES.map((file) => ({
    file,
    text: readFileSync(join(REPO_ROOT, file), "utf8"),
  }));
}

const READY: ReadyTebraConfiguration = {
  state: "ready",
  endpoint: new URL("https://practice.example/soap"),
  username: "integration-user",
  password: "not-a-real-password",
  customerKey: "not-a-real-customer-key",
  practiceId: null,
  pollIntervalMinutes: 10,
  maxPagesPerRun: 5,
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
  externalId: tebraExternalId("appointment", APPOINTMENT_ID),
  startsAt: "2026-08-20T15:00:00Z",
  endsAt: "2026-08-20T15:30:00Z",
  status: "scheduled" as const,
  modifiedAt: "2026-08-12T12:00:00Z",
};

const careEnabled = async (): Promise<CareCapabilityStatus> => ({
  rail: "care",
  state: "enabled",
  enabled: true,
  publicMessage: "Care is available in supported locations.",
  checkedAt: "2026-08-12T12:00:00.000Z",
});

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
    createAppointment: vi.fn(async () => remote("tebra-appt-1", APPOINTMENT.externalId)),
    updateAppointment: vi.fn(async () => remote("tebra-appt-1", APPOINTMENT.externalId)),
    listAppointmentsModified: vi.fn(),
    ...overrides,
  } as TebraPracticeClient;
}

function gateway(input: { client?: TebraPracticeClient; links?: TebraLinkStore } = {}) {
  const audit = vi.fn(async () => undefined);
  const links = input.links ?? createMemoryTebraLinkStore();
  const practice = input.client ?? client();
  return {
    audit,
    links,
    client: practice,
    gateway: createTebraGateway({
      config: READY,
      client: practice,
      links,
      loadCareCapability: careEnabled,
      audit,
      sleep: async () => undefined,
      now: () => NOW,
    }),
  };
}

describe("G10-2 no invented SOAP surface", () => {
  it("names no endpoint, WSDL, or operation anywhere in lane source", () => {
    // The technical guide is not in hand. A plausible looking operation name
    // shipped now would read as verified later, which is the actual risk.
    const forbidden: [RegExp, string][] = [
      [/https?:\/\//, "a hard coded URL"],
      [/\.asmx\b/i, "an asmx endpoint"],
      [/\?wsdl\b/i, "a WSDL reference"],
      [/soap[:_]?envelope/i, "a SOAP envelope"],
      [/xmlns/i, "an XML namespace"],
      [/\bkareo\b/i, "a vendor host name"],
      [/\b(Get|Create|Update|Delete)(Patients?|Appointments?|Encounters?|Charges?)\b/, "a guessed operation name"],
    ];

    const offenders: string[] = [];
    for (const { file, text } of laneSource()) {
      for (const [pattern, label] of forbidden) {
        if (pattern.test(text)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the practice client an interface with a refusing default", async () => {
    const text = readFileSync(join(REPO_ROOT, "server/care/tebra-client.ts"), "utf8");
    expect(text).toContain("export interface TebraPracticeClient");
    // No transport library is reachable from the lane, so nothing can dial out.
    for (const module of ["node:http", "node:https", "axios", "node-fetch", "soap", "strong-soap"]) {
      for (const { file, text: source } of laneSource()) {
        expect(`${file}:${source.includes(`"${module}"`)}`).toBe(`${file}:false`);
      }
    }
    expect(text).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("G10-3 credentials never appear anywhere durable", () => {
  it("holds no credential assignment in lane source", () => {
    const credentialish =
      /\b(password|passwd|secret|customerKey|customer_key|apiKey|api_key)\s*[=:]\s*["'][^"']{6,}/i;
    for (const { file, text } of laneSource()) {
      expect(`${file}:${credentialish.test(text)}`).toBe(`${file}:false`);
    }
  });

  it("reports a configuration problem as a closed enum, never the offending value", async () => {
    const { parseTebraConfiguration, TEBRA_CONFIGURATION_PROBLEMS } = await import("./tebra-config");
    const config = parseTebraConfiguration({
      CARE_ENABLED: "true",
      CARE_ENABLE_APPROVED: "true",
      CARE_TEBRA_SYNC_ENABLED: "true",
      CARE_TEBRA_SOAP_ENDPOINT: "https://operator:hunter2@practice.example/soap",
      CARE_TEBRA_USERNAME: "integration-user",
      CARE_TEBRA_PASSWORD: "not-a-real-password",
      CARE_TEBRA_CUSTOMER_KEY: "not-a-real-customer-key",
    });

    expect(config.state).toBe("invalid");
    if (config.state !== "invalid") return;
    expect(TEBRA_CONFIGURATION_PROBLEMS).toContain(config.reason);
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("practice.example");
  });

  it("keeps the delivered handoff and heartbeat free of credentials", () => {
    const patterns = [
      /\b(password|passwd|secret|customerKey|customer_key)\s*[=:]\s*["']?[^\s"',}]{6,}/i,
      /\bsk-[A-Za-z0-9_-]{16,}/,
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /\bpostgres(ql)?:\/\/[^\s"']+:[^\s"']+@/i,
    ];
    for (const name of ["HANDOFF.json", "TEBRA-A.heartbeat.json"]) {
      const path = join(REPO_ROOT, name);
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      for (const pattern of patterns) {
        expect(`${name}:${pattern.test(text)}`).toBe(`${name}:false`);
      }
    }
  });
});

describe("G10-4 external identifiers are opaque and stable", () => {
  it("derives from the record id alone, so changing anything identifying changes nothing", () => {
    const first = tebraExternalId("patient", PATIENT_ID);
    expect(first).toBe(tebraExternalId("patient", PATIENT_ID));
    expect(first).not.toContain("@");
    expect(first).not.toContain(" ");
    expect(first).toBe(`xenios:care_patient:${PATIENT_ID}`);
  });

  it("refuses to build a key out of anything that looks personal", () => {
    for (const candidate of [
      "person@example.test",
      "Test Person",
      "1990-02-28 Test",
      "+1 555 555 0123",
      "123-45-6789 ",
    ]) {
      expect(() => tebraExternalId("patient", candidate)).toThrow("tebra_invalid_local_id");
    }
  });
});

describe("G10-5 polling is idempotent and single flight", () => {
  function page(records: TebraRemoteRecord[], hasMore = false): TebraRemotePage {
    return {
      records,
      nextCursor: {
        entity: "patient",
        fromModifiedAt: NOW.toISOString(),
        toModifiedAt: NOW.toISOString(),
        continuationToken: null,
      },
      hasMore,
    };
  }

  function poller(links: TebraLinkStore, pages: TebraRemotePage[], owner = "worker-a") {
    let index = 0;
    const practice = {
      listPatientsModified: vi.fn(async () => pages[Math.min(index++, pages.length - 1)]),
      listAppointmentsModified: vi.fn(async () => page([])),
    } as unknown as TebraPracticeClient;
    return {
      practice,
      run: () =>
        runTebraSyncCycle({
          entity: "patient",
          config: READY,
          client: practice,
          links,
          loadCareCapability: careEnabled,
          owner,
          now: () => NOW,
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

  it("replaying the same window creates nothing new", async () => {
    const links = createMemoryTebraLinkStore();
    await linkPatient(links);
    const records = [remote("tebra-patient-1", PATIENT_EXTERNAL_ID)];

    const first = await poller(links, [page(records)]).run();
    const second = await poller(links, [page(records)]).run();

    expect(first).toMatchObject({ reconciled: 1, unlinked: 0 });
    expect(second).toMatchObject({ reconciled: 1, unlinked: 0 });
    // Still exactly one link, pointing where it always did.
    await expect(links.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-patient-1",
      linkedAt: "2026-08-12T11:00:00.000Z",
    });
  });

  it("does not advance the cursor past a record whose write did not land", async () => {
    // G10-5's silent-loss case: a cursor that moves over a failed durable write
    // means that record is never seen again.
    const links = createMemoryTebraLinkStore();
    await linkPatient(links);
    const failing: TebraLinkStore = {
      ...links,
      saveLink: vi.fn(async () => {
        throw new Error("store_unavailable");
      }),
    };

    const outcome = await poller(failing, [
      page([remote("tebra-patient-1", PATIENT_EXTERNAL_ID)]),
    ]).run();

    expect(outcome).toMatchObject({ failed: 1, reconciled: 0, cursorAdvanced: false });
    await expect(links.loadCursor("patient")).resolves.toBeNull();
  });

  it("a second worker cannot run while the first holds the lease", async () => {
    const links = createMemoryTebraLinkStore();
    const a = poller(links, [page([])], "worker-a");
    const b = poller(links, [page([])], "worker-b");

    const [first, second] = await Promise.all([a.run(), b.run()]);
    const skipped = [first, second].filter((o) => "skipped" in o);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ reason: "lease_held" });
  });

  it("survives a client that returns a malformed page instead of records", async () => {
    const links = createMemoryTebraLinkStore();
    const broken = {
      listPatientsModified: vi.fn(async () => ({ hasMore: false }) as unknown as TebraRemotePage),
    } as unknown as TebraPracticeClient;

    const outcome = await runTebraSyncCycle({
      entity: "patient",
      config: READY,
      client: broken,
      links,
      loadCareCapability: careEnabled,
      owner: "worker-a",
      now: () => NOW,
    });

    expect(outcome).toMatchObject({ failed: 1, cursorAdvanced: false });
    await expect(links.loadCursor("patient")).resolves.toBeNull();
  });

  it("does not poll at all while the stored Care capability is held", async () => {
    const links = createMemoryTebraLinkStore();
    const practice = {
      listPatientsModified: vi.fn(),
    } as unknown as TebraPracticeClient;

    const outcome = await runTebraSyncCycle({
      entity: "patient",
      config: READY,
      client: practice,
      links,
      loadCareCapability: async () => ({
        rail: "care",
        state: "pending_qa",
        enabled: false,
        publicMessage: "Care is completing quality review.",
        checkedAt: NOW.toISOString(),
      }),
      owner: "worker-a",
      now: () => NOW,
    });

    expect(outcome).toEqual({ entity: "patient", skipped: true, reason: "care_disabled" });
    expect(practice.listPatientsModified).not.toHaveBeenCalled();
    // It also must not have taken the lease it was never allowed to use.
    await expect(
      links.acquireLease({
        leaseKey: "care:tebra:sync:patient",
        owner: "someone-else",
        expiresAt: "2026-08-12T12:10:00.000Z",
        now: NOW.toISOString(),
      }),
    ).resolves.toBe(true);
  });
});

describe("G11-1 every audit event carries opaque fields only", () => {
  const ALLOWED_KEYS = [
    "attempts",
    "code",
    "entity",
    "externalId",
    "localId",
    "operation",
    "success",
    "tebraId",
  ];

  it("emits a known set of events, each with the same allowed key set", async () => {
    const seen = new Map<string, string[]>();
    const record = async (harness: ReturnType<typeof gateway>) => {
      for (const [event, detail] of harness.audit.mock.calls as unknown as [
        string,
        Record<string, unknown>,
      ][]) {
        seen.set(event, Object.keys(detail).sort());
      }
    };

    const ok = gateway();
    await ok.gateway.syncPatient(PATIENT);
    await record(ok);

    const failing = gateway({
      client: client({
        createPatient: vi.fn(async () => {
          throw new Error("upstream said something about a person");
        }),
      }),
    });
    await failing.gateway.syncPatient(PATIENT);
    await record(failing);

    const appointment = gateway();
    await appointment.links.saveLink({
      entity: "patient",
      localId: PATIENT_ID,
      externalId: PATIENT_EXTERNAL_ID,
      tebraId: "tebra-patient-1",
      linkedAt: NOW.toISOString(),
      lastSeenAt: NOW.toISOString(),
    });
    await appointment.gateway.syncAppointment(APPOINTMENT);
    await record(appointment);

    expect([...seen.keys()].sort()).toEqual([
      "care.tebra.appointment_linked",
      "care.tebra.patient_failed",
      "care.tebra.patient_linked",
    ]);
    for (const [event, keys] of seen) {
      expect(`${event}:${keys.join(",")}`).toBe(`${event}:${ALLOWED_KEYS.join(",")}`);
    }
  });
});

describe("G11-2 redaction is an allow list", () => {
  it("drops an unexpected field the practice client attaches to a record", async () => {
    const hostile = {
      tebraId: "tebra-patient-1",
      externalId: PATIENT_EXTERNAL_ID,
      modifiedAt: "2026-08-12T12:00:00Z",
      // Fields a real SOAP response could carry and a deny list would miss.
      patientFullName: "Test Person",
      homePhone: "+15555550123",
      insuranceMemberId: "XYZ-99887766",
      notes: "clinical detail that must not travel",
    } as unknown as TebraRemoteRecord;

    const harness = gateway({
      client: client({ createPatient: vi.fn(async () => hostile) }),
    });

    await expect(harness.gateway.syncPatient(PATIENT)).resolves.toMatchObject({ ok: true });

    const stored = await harness.links.findByLocalId("patient", PATIENT_ID);
    expect(Object.keys(stored ?? {}).sort()).toEqual([
      "entity",
      "externalId",
      "lastSeenAt",
      "linkedAt",
      "localId",
      "tebraId",
    ]);

    const everythingSaid = JSON.stringify([stored, harness.audit.mock.calls]);
    for (const leak of ["Test Person", "+15555550123", "XYZ-99887766", "clinical detail"]) {
      expect(everythingSaid).not.toContain(leak);
    }
  });
});
