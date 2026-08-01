import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARE_ROUTE_CONTRACTS,
  type AnyPlatformRole,
  type CareRecordId,
} from "@shared/care/contracts";
import type {
  CareInstructionRecord,
  CareMessageThreadRecord,
  CareSupplyShipmentRecord,
  CareSupportRequestRecord,
} from "@shared/care/patient-services";
import {
  CARE_SERVICE_STORAGE_AVAILABLE,
  careServiceStorageMissing,
} from "@shared/care/patient-services";
import type { CareAccessDependencies } from "./access";
import type { CareEligibilityRepository } from "./eligibility-repository";
import type { CareIntakeRepository } from "./intake-repository";
import { registerCareIntakeApi } from "./intake-routes";
import {
  buildCareMessageRepository,
  CareServiceStorageUnavailableError,
  type CareInstructionRepository,
  type CareMessageRepository,
  type CareSupplyRepository,
  type CareSupportRepository,
} from "./patient-services-repository";
import {
  registerCareDiscoveryApi,
  registerCareInstructionApi,
  registerCareMessageApi,
  registerCareSupplyApi,
  registerCareSupportApi,
} from "./patient-services-routes";

const patientId = "patient-1" as CareRecordId;
const now = () => new Date("2026-07-30T12:00:00.000Z");

/**
 * A stand-in for the Care schema, holding only what the message write touches.
 *
 * The thread-ownership tests drive the real repository through the real route,
 * because the property under test is that nothing is inserted when the caller
 * names a conversation that is not theirs, and only the real repository decides
 * whether the insert runs.
 */
const supabase = vi.hoisted(() => {
  const state = {
    threads: [] as Array<{ id: string; patient_id: string }>,
    // Every filter the ownership lookup applied, so a test can prove the query
    // was scoped by patient_id rather than by thread id alone.
    lookupFilters: [] as Array<Record<string, unknown>>,
  };
  const insert = vi.fn((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({
        data: {
          id: "message-1",
          thread_id: row.thread_id,
          patient_id: row.patient_id,
          author_role: "patient",
          body: row.body,
          transmission: "not_enabled",
          recorded_at: row.recorded_at,
        },
        error: null,
      }),
    }),
  }));
  const from = vi.fn((table: string) => {
    if (table === "care_messages") return { insert };
    if (table !== "care_message_threads") {
      throw new Error(`unexpected_table:${table}`);
    }
    const filters: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        state.lookupFilters.push({ ...filters });
        const match = state.threads.find(
          (row) =>
            row.id === filters.id && row.patient_id === filters.patient_id,
        );
        return { data: match ?? null, error: null };
      },
    };
    return builder;
  });
  return { state, from, insert };
});

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({ from: supabase.from }),
}));

type PrincipalShape = "patient" | "clinician" | "anonymous";

function access(
  principal: PrincipalShape = "patient",
  enabled = true,
): CareAccessDependencies {
  const resolve = () => {
    if (principal === "anonymous") return null;
    if (principal === "clinician") {
      return {
        subjectId: "user-clinician",
        clinicianId: "clinician-1",
        roles: ["clinician"] as readonly AnyPlatformRole[],
      };
    }
    return {
      subjectId: "user-1",
      patientId,
      roles: ["care_patient"] as readonly AnyPlatformRole[],
    };
  };
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state: enabled ? ("enabled" as const) : ("pending_qa" as const),
      enabled,
      publicMessage: enabled
        ? "Enabled for isolated test."
        : "Care is completing quality review.",
      checkedAt: "2026-07-30T12:00:00.000Z",
    })),
    resolvePrincipal: vi.fn(async () => resolve()),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function instructionRepository(
  records: readonly CareInstructionRecord[] = [],
  available = true,
): CareInstructionRepository {
  return {
    listPatientInstructions: vi.fn(async () => ({
      storage: available
        ? CARE_SERVICE_STORAGE_AVAILABLE
        : careServiceStorageMissing(["care_patient_instructions"]),
      instructions: records,
    })),
  };
}

function supplyRepository(
  records: readonly CareSupplyShipmentRecord[] = [],
  available = true,
): CareSupplyRepository {
  return {
    listPatientSupplyShipments: vi.fn(async () => ({
      storage: available
        ? CARE_SERVICE_STORAGE_AVAILABLE
        : careServiceStorageMissing(["care_supply_shipments"]),
      shipments: records,
    })),
  };
}

function messageRepository(
  overrides: Partial<CareMessageRepository> = {},
  records: readonly CareMessageThreadRecord[] = [],
  available = true,
): CareMessageRepository {
  return {
    listPatientThreads: vi.fn(async () => ({
      storage: available
        ? CARE_SERVICE_STORAGE_AVAILABLE
        : careServiceStorageMissing(["care_message_threads", "care_messages"]),
      threads: records,
    })),
    recordPatientMessage: vi.fn(async () => {
      throw new CareServiceStorageUnavailableError([
        "care_message_threads",
        "care_messages",
      ]);
    }),
    ...overrides,
  };
}

function supportRepository(
  overrides: Partial<CareSupportRepository> = {},
  records: readonly CareSupportRequestRecord[] = [],
  available = true,
): CareSupportRepository {
  return {
    listPatientSupportRequests: vi.fn(async () => ({
      storage: available
        ? CARE_SERVICE_STORAGE_AVAILABLE
        : careServiceStorageMissing(["care_support_requests"]),
      requests: records,
    })),
    recordSupportRequest: vi.fn(async () => {
      throw new CareServiceStorageUnavailableError(["care_support_requests"]);
    }),
    ...overrides,
  };
}

function app(register: (instance: Express) => void): Express {
  const instance = express();
  instance.use(express.json());
  register(instance);
  return instance;
}

const instruction: CareInstructionRecord = {
  id: "instruction-1" as CareRecordId,
  patientId,
  prescriptionId: null,
  title: "How to store your medication",
  category: "medication_use",
  version: "v1",
  publishedAt: "2026-07-28T10:00:00.000Z",
  publishedByUserId: "clinician-1",
  acknowledgedAt: null,
  bodyRecorded: true,
  updatedAt: "2026-07-28T10:00:00.000Z",
};

describe("Care instructions route", () => {
  it("refuses an anonymous caller before the repository is touched", async () => {
    const repository = instructionRepository([instruction]);
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(instance, access("anonymous"), repository),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("care_auth_required");
    expect(repository.listPatientInstructions).not.toHaveBeenCalled();
  });

  it("refuses a clinician before the repository is touched", async () => {
    const repository = instructionRepository([instruction]);
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(instance, access("clinician"), repository),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("care_forbidden");
    expect(repository.listPatientInstructions).not.toHaveBeenCalled();
  });

  it("returns a published instruction scoped to the caller's own record", async () => {
    const repository = instructionRepository([instruction]);
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(instance, access(), repository),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(200);
    expect(repository.listPatientInstructions).toHaveBeenCalledWith(patientId);
    expect(response.body.instructions).toHaveLength(1);
    expect(response.body.instructions[0].title).toBe(
      "How to store your medication",
    );
    expect(response.body.storage.available).toBe(true);
  });

  it("withholds an unpublished draft even when the repository returns it", async () => {
    const repository = instructionRepository([
      { ...instruction, publishedAt: null, publishedByUserId: null },
    ]);
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(instance, access(), repository),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(200);
    expect(response.body.instructions).toEqual([]);
    expect(response.body.awaitingPublication).toBe(1);
  });

  it("names the missing table instead of reporting an empty list", async () => {
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(
          instance,
          access(),
          instructionRepository([], false),
        ),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(200);
    expect(response.body.storage).toEqual({
      available: false,
      missingTables: ["care_patient_instructions"],
    });
  });

  it("answers 503 rather than an empty list when the read fails", async () => {
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(instance, access(), {
          listPatientInstructions: vi.fn(async () => {
            throw new Error("care_instruction_lookup_failed");
          }),
        }),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain(
      "care_instruction_lookup_failed",
    );
  });

  it("answers 503 while the Care capability is not enabled", async () => {
    const repository = instructionRepository([instruction]);
    const response = await request(
      app((instance) =>
        registerCareInstructionApi(
          instance,
          access("patient", false),
          repository,
        ),
      ),
    ).get(CARE_ROUTE_CONTRACTS.instructions);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
    expect(repository.listPatientInstructions).not.toHaveBeenCalled();
  });
});

describe("Care supplies route", () => {
  const shipment: CareSupplyShipmentRecord = {
    id: "shipment-1" as CareRecordId,
    patientId,
    pharmacyOrderId: null,
    status: "packed",
    itemCount: 3,
    carrierName: null,
    trackingRecorded: false,
    shippedAt: "2026-07-29T10:00:00.000Z",
    deliveredAt: null,
    updatedAt: "2026-07-29T10:00:00.000Z",
  };

  it("refuses an anonymous caller before the repository is touched", async () => {
    const repository = supplyRepository([shipment]);
    const response = await request(
      app((instance) =>
        registerCareSupplyApi(instance, access("anonymous"), repository),
      ),
    ).get(CARE_ROUTE_CONTRACTS.supplies);
    expect(response.status).toBe(401);
    expect(repository.listPatientSupplyShipments).not.toHaveBeenCalled();
  });

  it("refuses a clinician before the repository is touched", async () => {
    const repository = supplyRepository([shipment]);
    const response = await request(
      app((instance) =>
        registerCareSupplyApi(instance, access("clinician"), repository),
      ),
    ).get(CARE_ROUTE_CONTRACTS.supplies);
    expect(response.status).toBe(403);
    expect(repository.listPatientSupplyShipments).not.toHaveBeenCalled();
  });

  it("never reports a shipment as shipped ahead of its recorded status", async () => {
    const response = await request(
      app((instance) =>
        registerCareSupplyApi(instance, access(), supplyRepository([shipment])),
      ),
    ).get(CARE_ROUTE_CONTRACTS.supplies);
    expect(response.status).toBe(200);
    expect(response.body.shipments[0].status).toBe("packed");
    expect(response.body.shipments[0].shippedAt).toBeNull();
    expect(response.body.shipments[0].trackingAvailable).toBe(false);
  });

  it("names the missing table instead of reporting an empty list", async () => {
    const response = await request(
      app((instance) =>
        registerCareSupplyApi(instance, access(), supplyRepository([], false)),
      ),
    ).get(CARE_ROUTE_CONTRACTS.supplies);
    expect(response.body.storage.missingTables).toEqual([
      "care_supply_shipments",
    ]);
  });
});

describe("Care messages route", () => {
  it("refuses an anonymous caller on both the read and the write", async () => {
    const repository = messageRepository();
    const instance = app((target) =>
      registerCareMessageApi(target, access("anonymous"), repository, now),
    );
    const read = await request(instance).get(CARE_ROUTE_CONTRACTS.messages);
    const write = await request(instance)
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ body: "Hello", idempotencyKey: "idem-key-0001" });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(repository.listPatientThreads).not.toHaveBeenCalled();
    expect(repository.recordPatientMessage).not.toHaveBeenCalled();
  });

  it("refuses a clinician on both the read and the write", async () => {
    const repository = messageRepository();
    const instance = app((target) =>
      registerCareMessageApi(target, access("clinician"), repository, now),
    );
    const read = await request(instance).get(CARE_ROUTE_CONTRACTS.messages);
    const write = await request(instance)
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ body: "Hello", idempotencyKey: "idem-key-0001" });
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(repository.listPatientThreads).not.toHaveBeenCalled();
    expect(repository.recordPatientMessage).not.toHaveBeenCalled();
  });

  it("says plainly that nothing is transmitted", async () => {
    const response = await request(
      app((instance) =>
        registerCareMessageApi(instance, access(), messageRepository(), now),
      ),
    ).get(CARE_ROUTE_CONTRACTS.messages);
    expect(response.status).toBe(200);
    expect(response.body.transmission).toBe("not_enabled");
    expect(response.body.notice).toContain("does not send");
  });

  it("closes the send control when nothing can hold a message", async () => {
    const response = await request(
      app((instance) =>
        registerCareMessageApi(
          instance,
          access(),
          messageRepository({}, [], false),
          now,
        ),
      ),
    ).get(CARE_ROUTE_CONTRACTS.messages);
    expect(response.body.sendAvailable).toBe(false);
    expect(response.body.storage.missingTables).toEqual([
      "care_message_threads",
      "care_messages",
    ]);
  });

  it("fails loudly rather than accepting a message nothing can hold", async () => {
    const response = await request(
      app((instance) =>
        registerCareMessageApi(instance, access(), messageRepository(), now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ body: "A question", idempotencyKey: "idem-key-0001" });
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("care_message_not_recorded");
    expect(response.body.missingTables).toEqual([
      "care_message_threads",
      "care_messages",
    ]);
    expect(response.body.message).toContain("was not recorded");
  });

  it("confirms a recorded message as recorded, never as sent", async () => {
    const repository = messageRepository({
      recordPatientMessage: vi.fn(async () => ({
        id: "message-1" as CareRecordId,
        threadId: "thread-1" as CareRecordId,
        patientId,
        authorRole: "patient" as const,
        bodyRecorded: true,
        transmission: "not_enabled" as const,
        recordedAt: "2026-07-30T12:00:00.000Z",
      })),
    });
    const response = await request(
      app((instance) =>
        registerCareMessageApi(instance, access(), repository, now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ body: "A question", idempotencyKey: "idem-key-0001" });
    expect(response.status).toBe(201);
    expect(response.body.message.transmission).toBe("not_enabled");
    expect(response.body.message).not.toHaveProperty("sentAt");
    expect(repository.recordPatientMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        body: "A question",
        recordedAt: "2026-07-30T12:00:00.000Z",
      }),
    );
  });

  it("rejects a write with no body before the repository is touched", async () => {
    const repository = messageRepository();
    const response = await request(
      app((instance) =>
        registerCareMessageApi(instance, access(), repository, now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ idempotencyKey: "idem-key-0001" });
    expect(response.status).toBe(400);
    expect(repository.recordPatientMessage).not.toHaveBeenCalled();
  });

  it("ignores a patient identifier supplied by the caller", async () => {
    const repository = messageRepository({
      recordPatientMessage: vi.fn(async () => ({
        id: "message-1" as CareRecordId,
        threadId: "thread-1" as CareRecordId,
        patientId,
        authorRole: "patient" as const,
        bodyRecorded: true,
        transmission: "not_enabled" as const,
        recordedAt: "2026-07-30T12:00:00.000Z",
      })),
    });
    const response = await request(
      app((instance) =>
        registerCareMessageApi(instance, access(), repository, now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({
        body: "A question",
        idempotencyKey: "idem-key-0001",
        patientId: "someone-else",
      });
    // The strict schema rejects the extra field outright rather than letting a
    // caller name a patient the principal is not.
    expect(response.status).toBe(400);
    expect(repository.recordPatientMessage).not.toHaveBeenCalled();
  });
});

describe("Care message thread ownership", () => {
  // The thread id is the only identifier the caller may name, and the read side
  // of this module already scopes every query by patient_id. This is the write
  // side held to the same rule: a well-formed thread id from a legitimate
  // patient is a claim about whose conversation it is, not a fact.
  const OWN_THREAD = "11111111-1111-4111-8111-111111111111";
  const FOREIGN_THREAD = "22222222-2222-4222-8222-222222222222";
  const UNKNOWN_THREAD = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    supabase.state.threads = [
      { id: OWN_THREAD, patient_id: patientId },
      // Real, in use, and someone else's.
      { id: FOREIGN_THREAD, patient_id: "patient-2" },
    ];
    supabase.state.lookupFilters = [];
    supabase.insert.mockClear();
    supabase.from.mockClear();
  });

  function live(): Express {
    return app((instance) =>
      registerCareMessageApi(
        instance,
        access(),
        buildCareMessageRepository(),
        now,
      ),
    );
  }

  function post(threadId: string | null) {
    return request(live())
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ threadId, body: "A question", idempotencyKey: "idem-key-0001" });
  }

  it("writes nothing into another patient's thread", async () => {
    const response = await post(FOREIGN_THREAD);
    expect(response.status).toBe(403);
    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("care_message_thread_not_owned");
    // The property that matters: the row never reached the other patient's
    // clinical conversation.
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("scopes the ownership lookup by patient rather than by thread id alone", async () => {
    await post(FOREIGN_THREAD);
    expect(supabase.state.lookupFilters).toEqual([
      { id: FOREIGN_THREAD, patient_id: patientId },
    ]);
  });

  it("does not report back that the other patient's thread exists", async () => {
    const response = await post(FOREIGN_THREAD);
    expect(JSON.stringify(response.body)).not.toContain(FOREIGN_THREAD);
    // An unknown thread answers exactly as a foreign one does, so the refusal
    // cannot be used to enumerate other people's conversations.
    const unknown = await post(UNKNOWN_THREAD);
    expect(unknown.status).toBe(response.status);
    expect(unknown.body.code).toBe(response.body.code);
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("records a message in the caller's own thread", async () => {
    const response = await post(OWN_THREAD);
    expect(response.status).toBe(201);
    expect(response.body.message.transmission).toBe("not_enabled");
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ thread_id: OWN_THREAD, patient_id: patientId }),
    );
  });

  it("records a message that names no thread at all", async () => {
    const response = await post(null);
    expect(response.status).toBe(201);
    // Nothing to check ownership of, so no lookup runs and the write proceeds.
    expect(supabase.state.lookupFilters).toEqual([]);
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ thread_id: null, patient_id: patientId }),
    );
  });
});

describe("Care support route", () => {
  it("refuses an anonymous caller on both the read and the write", async () => {
    const repository = supportRepository();
    const instance = app((target) =>
      registerCareSupportApi(target, access("anonymous"), repository, now),
    );
    const read = await request(instance).get(CARE_ROUTE_CONTRACTS.support);
    const write = await request(instance)
      .post(CARE_ROUTE_CONTRACTS.support)
      .send({ topic: "billing", body: "Hi", idempotencyKey: "idem-key-0001" });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(repository.listPatientSupportRequests).not.toHaveBeenCalled();
    expect(repository.recordSupportRequest).not.toHaveBeenCalled();
  });

  it("refuses a clinician on both the read and the write", async () => {
    const repository = supportRepository();
    const instance = app((target) =>
      registerCareSupportApi(target, access("clinician"), repository, now),
    );
    const read = await request(instance).get(CARE_ROUTE_CONTRACTS.support);
    const write = await request(instance)
      .post(CARE_ROUTE_CONTRACTS.support)
      .send({ topic: "billing", body: "Hi", idempotencyKey: "idem-key-0001" });
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(repository.listPatientSupportRequests).not.toHaveBeenCalled();
    expect(repository.recordSupportRequest).not.toHaveBeenCalled();
  });

  it("states that support is not a clinical channel", async () => {
    const response = await request(
      app((instance) =>
        registerCareSupportApi(instance, access(), supportRepository(), now),
      ),
    ).get(CARE_ROUTE_CONTRACTS.support);
    expect(response.status).toBe(200);
    expect(response.body.scopeNotice).toContain("not a clinical channel");
    expect(response.body.transmission).toBe("not_enabled");
  });

  it("fails loudly rather than accepting a request nothing can hold", async () => {
    const response = await request(
      app((instance) =>
        registerCareSupportApi(instance, access(), supportRepository(), now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.support)
      .send({
        topic: "billing",
        body: "A question",
        idempotencyKey: "idem-key-0001",
      });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_support_request_not_recorded");
    expect(response.body.missingTables).toEqual(["care_support_requests"]);
    expect(response.body.message).toContain("was not recorded");
  });

  it("rejects a topic outside the declared set", async () => {
    const repository = supportRepository();
    const response = await request(
      app((instance) =>
        registerCareSupportApi(instance, access(), repository, now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.support)
      .send({
        topic: "clinical",
        body: "A question",
        idempotencyKey: "idem-key-0001",
      });
    expect(response.status).toBe(400);
    expect(repository.recordSupportRequest).not.toHaveBeenCalled();
  });

  it("reports that nobody has taken a recorded request", async () => {
    const repository = supportRepository({
      recordSupportRequest: vi.fn(async () => ({
        id: "support-1" as CareRecordId,
        patientId,
        topic: "billing" as const,
        status: "received" as const,
        bodyRecorded: true,
        assignedToUserId: null,
        recordedAt: "2026-07-30T12:00:00.000Z",
        resolvedAt: null,
        updatedAt: "2026-07-30T12:00:00.000Z",
      })),
    });
    const response = await request(
      app((instance) =>
        registerCareSupportApi(instance, access(), repository, now),
      ),
    )
      .post(CARE_ROUTE_CONTRACTS.support)
      .send({
        topic: "billing",
        body: "A question",
        idempotencyKey: "idem-key-0001",
      });
    expect(response.status).toBe(201);
    expect(response.body.request.assigned).toBe(false);
    expect(response.body.request.transmission).toBe("not_enabled");
  });
});

describe("Care discovery route", () => {
  it("answers a caller with no Care role rather than 404", async () => {
    const response = await request(
      app((instance) => registerCareDiscoveryApi(instance, access("anonymous"))),
    ).get(CARE_ROUTE_CONTRACTS.discovery);
    expect(response.status).toBe(200);
    expect(response.body.discovery.intent).toBe("learn_about_care");
    expect(response.body.discovery.recordingAvailable).toBe(false);
    expect(response.body.discovery.storage.missingTables).toEqual([
      "care_discovery_events",
    ]);
  });

  it("never reflects or records a subject identifier the caller supplied", async () => {
    const deps = access("anonymous");
    const response = await request(
      app((instance) => registerCareDiscoveryApi(instance, deps)),
    ).get(`${CARE_ROUTE_CONTRACTS.discovery}?subjectId=subject-1`);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("subject-1");
    // No principal is resolved and no access decision is recorded, because no
    // subject is identified in the first place.
    expect(deps.resolvePrincipal).not.toHaveBeenCalled();
    expect(deps.recordAccessDecision).not.toHaveBeenCalled();
  });

  it("reports the Care capability state without a clinical claim", async () => {
    const response = await request(
      app((instance) =>
        registerCareDiscoveryApi(instance, access("anonymous", false)),
      ),
    ).get(CARE_ROUTE_CONTRACTS.discovery);
    expect(response.status).toBe(200);
    expect(response.body.capability.enabled).toBe(false);
    expect(response.body.capability.publicMessage).toBe(
      "Care is completing quality review.",
    );
  });

  it("answers 503 when the capability state cannot be read", async () => {
    const deps = access("anonymous");
    deps.loadCapabilityStatus = vi.fn(async () => {
      throw new Error("capability_lookup_failed");
    });
    const response = await request(
      app((instance) => registerCareDiscoveryApi(instance, deps)),
    ).get(CARE_ROUTE_CONTRACTS.discovery);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain(
      "capability_lookup_failed",
    );
  });

  it("does not accept a write", async () => {
    const response = await request(
      app((instance) => registerCareDiscoveryApi(instance, access("anonymous"))),
    )
      .post(CARE_ROUTE_CONTRACTS.discovery)
      .send({ subjectId: "subject-1", consentedAt: "2026-07-30T12:00:00.000Z" });
    expect(response.status).toBe(404);
  });
});

describe("Care patient service wiring", () => {
  // The defect this closes is that the contract declared a path and nothing
  // served it, so the failure mode to guard is a 404, not a wrong body. These
  // assertions drive the registrar the server entry point actually calls.
  function wired(): Express {
    return app((instance) =>
      registerCareIntakeApi(
        instance,
        access("anonymous"),
        {
          loadContext: vi.fn(),
          recordLocation: vi.fn(),
          recordEligibilityDecision: vi.fn(),
          changeWaitlist: vi.fn(),
        } as unknown as CareEligibilityRepository,
        {
          loadCurrentIntake: vi.fn(),
          loadApprovedDefinition: vi.fn(),
          loadLatestRevision: vi.fn(),
          startIntake: vi.fn(),
          autosave: vi.fn(),
          submit: vi.fn(),
        } as unknown as CareIntakeRepository,
        now,
        instructionRepository(),
        supplyRepository(),
        messageRepository(),
        supportRepository(),
      ),
    );
  }

  it("serves every declared patient surface instead of a 404", async () => {
    const instance = wired();
    for (const path of [
      CARE_ROUTE_CONTRACTS.instructions,
      CARE_ROUTE_CONTRACTS.supplies,
      CARE_ROUTE_CONTRACTS.messages,
      CARE_ROUTE_CONTRACTS.support,
    ]) {
      const response = await request(instance).get(path);
      // Anonymous, so the guard answers. The point is that a handler exists.
      expect(response.status, path).toBe(401);
    }
    const write = await request(instance)
      .post(CARE_ROUTE_CONTRACTS.messages)
      .send({ body: "Hello", idempotencyKey: "idem-key-0001" });
    expect(write.status).toBe(401);
    const supportWrite = await request(instance)
      .post(CARE_ROUTE_CONTRACTS.support)
      .send({ topic: "billing", body: "Hi", idempotencyKey: "idem-key-0001" });
    expect(supportWrite.status).toBe(401);
  });

  it("serves discovery to a caller holding no Care role", async () => {
    const response = await request(wired()).get(CARE_ROUTE_CONTRACTS.discovery);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("does not let a service path shadow an intake route", async () => {
    const response = await request(wired()).get(CARE_ROUTE_CONTRACTS.intake);
    expect(response.status).toBe(401);
  });
});
