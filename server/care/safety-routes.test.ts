import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type {
  AnyPlatformRole,
  CareRecordId,
} from "@shared/care/contracts";
import type {
  CareAdverseEventRecord,
  CareLabResultRecord,
} from "@shared/care/safety";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import type { CareClinicianReviewRepository } from "./review-repository";
import {
  CareStorageUnavailableError,
  isMissingRelationError,
  lazyCareAdverseEventRepository,
  lazyCareLabRepository,
  type CareAdverseEventRepository,
  type CareLabRepository,
} from "./safety-repository";
import {
  registerCareAdverseEventApi,
  registerCareLabApi,
} from "./safety-routes";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const RESULT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const REVIEWER_ID = "33333333-3333-4333-8333-333333333333";
const REPORT_ID = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const WITHHELD_PANEL = "Withheld synthetic panel";

function labResult(
  overrides: Partial<CareLabResultRecord> = {},
): CareLabResultRecord {
  return {
    id: RESULT_ID,
    patientId: PATIENT_ID,
    reviewId: null,
    assignedReviewerUserId: REVIEWER_ID,
    panelName: "Synthetic panel A",
    status: "resulted",
    orderedAt: "2026-07-20T10:00:00.000Z",
    collectedAt: "2026-07-21T10:00:00.000Z",
    resultedAt: "2026-07-22T10:00:00.000Z",
    releasedToPatientAt: null,
    releasedByUserId: null,
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

function adverseEvent(
  overrides: Partial<CareAdverseEventRecord> = {},
): CareAdverseEventRecord {
  return {
    id: REPORT_ID,
    patientId: PATIENT_ID,
    status: "received",
    patientReportedSeverity: "moderate",
    narrativeRecorded: true,
    occurredAt: "2026-07-22T09:00:00.000Z",
    reportedAt: "2026-07-22T12:00:00.000Z",
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    ...overrides,
  };
}

const MISSING_LABS = {
  storage: { available: false, missingTables: ["care_lab_orders", "care_lab_results"] },
  results: [],
} as const;

const MISSING_REPORTS = {
  storage: { available: false, missingTables: ["care_adverse_events"] },
  reports: [],
} as const;

function labRepo(
  overrides: Partial<CareLabRepository> = {},
): CareLabRepository {
  return {
    listPatientLabResults: vi.fn(async () => MISSING_LABS),
    listReviewerLabResults: vi.fn(async () => MISSING_LABS),
    ...overrides,
  };
}

function eventRepo(
  overrides: Partial<CareAdverseEventRepository> = {},
): CareAdverseEventRepository {
  return {
    listPatientAdverseEvents: vi.fn(async () => MISSING_REPORTS),
    listReviewerAdverseEvents: vi.fn(async () => MISSING_REPORTS),
    recordAdverseEvent: vi.fn(async () => {
      throw new CareStorageUnavailableError(["care_adverse_events"]);
    }),
    ...overrides,
  };
}

function access(options: {
  roles: readonly AnyPlatformRole[] | null;
  subjectId?: string;
  patientId?: CareRecordId | null;
  careEnabled?: boolean;
}): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () =>
      options.careEnabled === false
        ? {
            rail: "care" as const,
            state: "pending_clinicians" as const,
            enabled: false,
            publicMessage: "Care is being prepared.",
            checkedAt: "2026-07-25T20:00:00.000Z",
          }
        : {
            rail: "care" as const,
            state: "enabled" as const,
            enabled: true,
            publicMessage: "Care is available in supported locations.",
            checkedAt: "2026-07-25T20:00:00.000Z",
          },
    ),
    resolvePrincipal: vi.fn(async () =>
      options.roles
        ? {
            subjectId: options.subjectId ?? REVIEWER_ID,
            roles: options.roles,
            ...(options.patientId === null
              ? {}
              : { patientId: options.patientId ?? PATIENT_ID }),
          }
        : null,
    ),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function app(
  dependencies: CareAccessDependencies,
  labs: CareLabRepository = labRepo(),
  events: CareAdverseEventRepository = eventRepo(),
) {
  const instance = express();
  instance.use(express.json());
  registerCareLabApi(instance, dependencies, labs);
  registerCareAdverseEventApi(
    instance,
    dependencies,
    events,
    () => new Date("2026-07-25T20:00:00.000Z"),
  );
  return instance;
}

const VALID_REPORT = {
  narrative: "Synthetic report body for testing only.",
  patientReportedSeverity: "moderate",
  occurredAt: "2026-07-22T09:00:00.000Z",
  idempotencyKey: "synthetic-key-0001",
};

describe("Care patient lab results route", () => {
  it("refuses an anonymous visitor before any repository read", async () => {
    const repository = labRepo();
    const response = await request(
      app(access({ roles: null }), repository),
    ).get("/api/care/labs");
    expect(response.status).toBe(401);
    expect(repository.listPatientLabResults).not.toHaveBeenCalled();
  });

  it.each([
    ["clinician"],
    ["pharmacy_operations"],
    ["clinical_admin"],
    ["lab_reviewer"],
    ["affiliate"],
    ["research_admin"],
  ] as const)("refuses a %s role before any repository read", async (role) => {
    const repository = labRepo();
    const response = await request(
      app(access({ roles: [role] }), repository),
    ).get("/api/care/labs");
    expect(response.status).toBe(403);
    expect(repository.listPatientLabResults).not.toHaveBeenCalled();
  });

  it("never returns a result the clinician has not released", async () => {
    const repository = labRepo({
      listPatientLabResults: vi.fn(async () => ({
        storage: { available: true, missingTables: [] },
        results: [
          labResult({ panelName: WITHHELD_PANEL }),
          labResult({
            id: "66666666-6666-4666-8666-666666666666" as CareRecordId,
            panelName: "Released synthetic panel",
            status: "released",
            releasedToPatientAt: "2026-07-23T10:00:00.000Z",
            releasedByUserId: REVIEWER_ID,
          }),
        ],
      })),
    });
    const response = await request(
      app(access({ roles: ["care_patient"] }), repository),
    ).get("/api/care/labs");
    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].panelName).toBe("Released synthetic panel");
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(WITHHELD_PANEL);
    expect(body).not.toContain(RESULT_ID);
    expect(response.body.awaitingRelease).toBe(1);
  });

  it("withholds a result marked released without a named releaser", async () => {
    const response = await request(
      app(
        access({ roles: ["care_patient"] }),
        labRepo({
          listPatientLabResults: vi.fn(async () => ({
            storage: { available: true, missingTables: [] },
            results: [
              labResult({
                panelName: WITHHELD_PANEL,
                status: "released",
                releasedToPatientAt: "2026-07-23T10:00:00.000Z",
              }),
            ],
          })),
        }),
      ),
    ).get("/api/care/labs");
    expect(response.body.results).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain(WITHHELD_PANEL);
  });

  it("names the missing record instead of reporting an empty result list", async () => {
    const response = await request(
      app(access({ roles: ["care_patient"] })),
    ).get("/api/care/labs");
    expect(response.status).toBe(200);
    expect(response.body.storage).toEqual({
      available: false,
      missingTables: ["care_lab_orders", "care_lab_results"],
    });
    expect(response.body.results).toEqual([]);
  });

  it("scopes the read to the signed in patient", async () => {
    const repository = labRepo();
    await request(app(access({ roles: ["care_patient"] }), repository)).get(
      "/api/care/labs",
    );
    expect(repository.listPatientLabResults).toHaveBeenCalledWith(PATIENT_ID);
  });

  it("stays unavailable when the principal carries no patient record", async () => {
    const repository = labRepo();
    const response = await request(
      app(access({ roles: ["care_patient"], patientId: null }), repository),
    ).get("/api/care/labs");
    expect(response.status).toBe(503);
    expect(repository.listPatientLabResults).not.toHaveBeenCalled();
  });

  it("stays unavailable while Care is not active", async () => {
    const repository = labRepo();
    const response = await request(
      app(access({ roles: ["care_patient"], careEnabled: false }), repository),
    ).get("/api/care/labs");
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
    expect(repository.listPatientLabResults).not.toHaveBeenCalled();
  });

  it("keeps the response out of the browser cache", async () => {
    const response = await request(
      app(access({ roles: ["care_patient"] })),
    ).get("/api/care/labs");
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("hides the adapter failure behind the standard unavailable response", async () => {
    const response = await request(
      app(
        access({ roles: ["care_patient"] }),
        labRepo({
          listPatientLabResults: vi.fn(async () => {
            throw new Error("care_lab_result_lookup_failed");
          }),
        }),
      ),
    ).get("/api/care/labs");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("lookup_failed");
  });
});

describe("Care lab reviewer queue route", () => {
  it("refuses an anonymous visitor before any repository read", async () => {
    const repository = labRepo();
    const response = await request(
      app(access({ roles: null }), repository),
    ).get("/api/care/labs/queue");
    expect(response.status).toBe(401);
    expect(repository.listReviewerLabResults).not.toHaveBeenCalled();
  });

  it.each([
    ["care_patient"],
    ["clinician"],
    ["clinical_admin"],
    ["pharmacy_operations"],
    ["affiliate"],
  ] as const)("refuses a %s role before any repository read", async (role) => {
    const repository = labRepo();
    const response = await request(
      app(access({ roles: [role] }), repository),
    ).get("/api/care/labs/queue");
    expect(response.status).toBe(403);
    expect(repository.listReviewerLabResults).not.toHaveBeenCalled();
  });

  it("serves the lab reviewer role that previously had no route", async () => {
    const repository = labRepo({
      listReviewerLabResults: vi.fn(async () => ({
        storage: { available: true, missingTables: [] },
        results: [labResult()],
      })),
    });
    const response = await request(
      app(access({ roles: ["lab_reviewer"] }), repository),
    ).get("/api/care/labs/queue");
    expect(response.status).toBe(200);
    expect(response.body.queue).toHaveLength(1);
    expect(response.body.queue[0].releasedToPatient).toBe(false);
    expect(repository.listReviewerLabResults).toHaveBeenCalledWith(REVIEWER_ID);
  });

  it("never sends a patient identifier to the reviewer browser", async () => {
    const response = await request(
      app(
        access({ roles: ["lab_reviewer"] }),
        labRepo({
          listReviewerLabResults: vi.fn(async () => ({
            storage: { available: true, missingTables: [] },
            results: [labResult()],
          })),
        }),
      ),
    ).get("/api/care/labs/queue");
    expect(JSON.stringify(response.body)).not.toContain(PATIENT_ID);
  });

  it("does not read the word queue as a patient lab read", async () => {
    const repository = labRepo();
    await request(app(access({ roles: ["lab_reviewer"] }), repository)).get(
      "/api/care/labs/queue",
    );
    expect(repository.listPatientLabResults).not.toHaveBeenCalled();
  });
});

describe("Care adverse event read routes", () => {
  it("refuses an anonymous visitor before any repository read", async () => {
    const repository = eventRepo();
    const response = await request(
      app(access({ roles: null }), labRepo(), repository),
    ).get("/api/care/adverse-events");
    expect(response.status).toBe(401);
    expect(repository.listPatientAdverseEvents).not.toHaveBeenCalled();
  });

  it.each([["clinician"], ["pharmacy_operations"], ["affiliate"]] as const)(
    "refuses a %s role on the patient read",
    async (role) => {
      const repository = eventRepo();
      const response = await request(
        app(access({ roles: [role] }), labRepo(), repository),
      ).get("/api/care/adverse-events");
      expect(response.status).toBe(403);
      expect(repository.listPatientAdverseEvents).not.toHaveBeenCalled();
    },
  );

  it.each([["care_patient"], ["pharmacy_operations"], ["affiliate"]] as const)(
    "refuses a %s role on the clinician read",
    async (role) => {
      const repository = eventRepo();
      const response = await request(
        app(access({ roles: [role] }), labRepo(), repository),
      ).get("/api/care/adverse-events/reported");
      expect(response.status).toBe(403);
      expect(repository.listReviewerAdverseEvents).not.toHaveBeenCalled();
    },
  );

  it("reports submission as unavailable while nothing can hold a report", async () => {
    const response = await request(
      app(access({ roles: ["care_patient"] })),
    ).get("/api/care/adverse-events");
    expect(response.status).toBe(200);
    expect(response.body.submissionAvailable).toBe(false);
    expect(response.body.storage.missingTables).toEqual(["care_adverse_events"]);
    expect(response.body.reports).toEqual([]);
  });

  it("reports submission as available once the record exists", async () => {
    const response = await request(
      app(
        access({ roles: ["care_patient"] }),
        labRepo(),
        eventRepo({
          listPatientAdverseEvents: vi.fn(async () => ({
            storage: { available: true, missingTables: [] },
            reports: [adverseEvent()],
          })),
        }),
      ),
    ).get("/api/care/adverse-events");
    expect(response.body.submissionAvailable).toBe(true);
    expect(response.body.reports).toHaveLength(1);
    expect(response.body.reports[0].acknowledged).toBe(false);
  });

  it("routes a report to the assigned clinician without a patient identifier", async () => {
    const repository = eventRepo({
      listReviewerAdverseEvents: vi.fn(async () => ({
        storage: { available: true, missingTables: [] },
        reports: [adverseEvent()],
      })),
    });
    const response = await request(
      app(access({ roles: ["clinician"] }), labRepo(), repository),
    ).get("/api/care/adverse-events/reported");
    expect(response.status).toBe(200);
    expect(response.body.reports).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain(PATIENT_ID);
    expect(repository.listReviewerAdverseEvents).toHaveBeenCalledWith(REVIEWER_ID);
  });
});

describe("Care adverse event submission", () => {
  it("refuses an anonymous submission before any repository write", async () => {
    const repository = eventRepo();
    const response = await request(
      app(access({ roles: null }), labRepo(), repository),
    )
      .post("/api/care/adverse-events")
      .send(VALID_REPORT);
    expect(response.status).toBe(401);
    expect(repository.recordAdverseEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["clinician"],
    ["pharmacy_operations"],
    ["clinical_admin"],
    ["lab_reviewer"],
    ["affiliate"],
  ] as const)("refuses a %s role before any repository write", async (role) => {
    const repository = eventRepo();
    const response = await request(
      app(access({ roles: [role] }), labRepo(), repository),
    )
      .post("/api/care/adverse-events")
      .send(VALID_REPORT);
    expect(response.status).toBe(403);
    expect(repository.recordAdverseEvent).not.toHaveBeenCalled();
  });

  it("fails loudly instead of accepting a report nothing can hold", async () => {
    const response = await request(
      app(access({ roles: ["care_patient"] })),
    )
      .post("/api/care/adverse-events")
      .send(VALID_REPORT);
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("care_adverse_event_not_recorded");
    expect(response.body.missingTables).toEqual(["care_adverse_events"]);
    expect(String(response.body.message)).toContain("was not recorded");
  });

  it("confirms a report only from a record the repository returned", async () => {
    const repository = eventRepo({
      recordAdverseEvent: vi.fn(async () => adverseEvent()),
    });
    const response = await request(
      app(access({ roles: ["care_patient"] }), labRepo(), repository),
    )
      .post("/api/care/adverse-events")
      .send(VALID_REPORT);
    expect(response.status).toBe(201);
    expect(response.body.report.adverseEventId).toBe(REPORT_ID);
    expect(repository.recordAdverseEvent).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      patientReportedSeverity: "moderate",
      narrative: VALID_REPORT.narrative,
      occurredAt: VALID_REPORT.occurredAt,
      idempotencyKey: VALID_REPORT.idempotencyKey,
      reportedAt: "2026-07-25T20:00:00.000Z",
    });
  });

  it("never echoes the submitted narrative back through the response", async () => {
    const response = await request(
      app(
        access({ roles: ["care_patient"] }),
        labRepo(),
        eventRepo({ recordAdverseEvent: vi.fn(async () => adverseEvent()) }),
      ),
    )
      .post("/api/care/adverse-events")
      .send(VALID_REPORT);
    expect(JSON.stringify(response.body)).not.toContain(VALID_REPORT.narrative);
    expect(response.body.report.narrativeRecorded).toBe(true);
  });

  it.each([
    ["an empty narrative", { ...VALID_REPORT, narrative: "" }],
    [
      "a severity outside the reported scale",
      { ...VALID_REPORT, patientReportedSeverity: "catastrophic" },
    ],
    ["an unexpected field", { ...VALID_REPORT, patientId: PATIENT_ID }],
    ["a malformed occurrence time", { ...VALID_REPORT, occurredAt: "yesterday" }],
    ["a missing idempotency key", { narrative: "x", patientReportedSeverity: "mild" }],
  ])("rejects %s without touching the repository", async (_label, body) => {
    const repository = eventRepo();
    const response = await request(
      app(access({ roles: ["care_patient"] }), labRepo(), repository),
    )
      .post("/api/care/adverse-events")
      .send(body);
    expect(response.status).toBe(400);
    expect(repository.recordAdverseEvent).not.toHaveBeenCalled();
  });

  it("hides an unexpected write failure behind the standard unavailable response", async () => {
    const response = await request(
      app(
        access({ roles: ["care_patient"] }),
        labRepo(),
        eventRepo({
          recordAdverseEvent: vi.fn(async () => {
            throw new Error("care_adverse_event_write_failed");
          }),
        }),
      ),
    )
      .post("/api/care/adverse-events")
      .send(VALID_REPORT);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("write_failed");
  });
});

describe("Care safety route registration", () => {
  function appointmentRepository(): CareAppointmentRepository {
    return {
      listPatientAppointments: vi.fn(async () => []),
      listAssignedReviews: vi.fn(async () => []),
      loadReadiness: vi.fn(async () => {
        throw new Error("not_used");
      }),
      requestAppointment: vi.fn(),
      assignClinician: vi.fn(),
      scheduleAppointment: vi.fn(),
      patientAction: vi.fn(),
      clinicianComplete: vi.fn(),
      adminMarkNoShow: vi.fn(),
      applyReviewAction: vi.fn(),
    } as unknown as CareAppointmentRepository;
  }

  function reviewRepository(): CareClinicianReviewRepository {
    return {
      listAssignedReviewFacts: vi.fn(async () => []),
      loadAssignedReviewFacts: vi.fn(async () => null),
    };
  }

  /**
   * The registration point the production server already calls. The Care
   * module index and the server entry point are protected seams, so the two
   * declared contracts are served from the module that already owns the care
   * episode.
   */
  function wired() {
    const instance = express();
    instance.use(express.json());
    registerCareAppointmentApi(
      instance,
      access({ roles: ["care_patient"] }),
      appointmentRepository(),
      () => new Date("2026-07-25T20:00:00.000Z"),
      reviewRepository(),
      labRepo(),
      eventRepo(),
    );
    return instance;
  }

  it("serves both declared contracts through the registered Care API", async () => {
    const labs = await request(wired()).get("/api/care/labs");
    const events = await request(wired()).get("/api/care/adverse-events");
    expect(labs.status).toBe(200);
    expect(events.status).toBe(200);
    expect(labs.body.storage.missingTables).toEqual([
      "care_lab_orders",
      "care_lab_results",
    ]);
  });

  it("serves the declared contracts by default, with no repository supplied", async () => {
    const instance = express();
    instance.use(express.json());
    registerCareAppointmentApi(
      instance,
      access({ roles: null }),
      appointmentRepository(),
    );
    // 401 rather than 404 is the whole point: the contract now has a handler.
    for (const path of [
      "/api/care/labs",
      "/api/care/labs/queue",
      "/api/care/adverse-events",
      "/api/care/adverse-events/reported",
    ]) {
      expect((await request(instance).get(path)).status).toBe(401);
    }
    expect(
      (await request(instance).post("/api/care/adverse-events").send(VALID_REPORT))
        .status,
    ).toBe(401);
  });

  it("keeps the existing review queue working alongside the new routes", async () => {
    const instance = express();
    instance.use(express.json());
    registerCareAppointmentApi(
      instance,
      access({ roles: ["clinician"] }),
      appointmentRepository(),
      () => new Date("2026-07-25T20:00:00.000Z"),
      reviewRepository(),
      labRepo(),
      eventRepo(),
    );
    const reviews = await request(instance).get("/api/care/reviews/queue");
    expect(reviews.status).toBe(200);
    expect(reviews.body.queue).toEqual([]);
    // The appointment route is still registered, so the added parameters did
    // not displace anything this module already served.
    expect(
      (await request(instance).get("/api/care/appointments")).status,
    ).not.toBe(404);
  });

  it("builds each production repository only on the first authorized call", async () => {
    const buildLabs = vi.fn(() => labRepo());
    const buildEvents = vi.fn(() => eventRepo());
    const labs = lazyCareLabRepository(buildLabs);
    const events = lazyCareAdverseEventRepository(buildEvents);
    expect(buildLabs).not.toHaveBeenCalled();
    expect(buildEvents).not.toHaveBeenCalled();
    await labs.listPatientLabResults(PATIENT_ID);
    await labs.listReviewerLabResults(REVIEWER_ID);
    await events.listPatientAdverseEvents(PATIENT_ID);
    await events.listReviewerAdverseEvents(REVIEWER_ID);
    expect(buildLabs).toHaveBeenCalledTimes(1);
    expect(buildEvents).toHaveBeenCalledTimes(1);
  });

  it("answers with the standard unavailable response when a repository cannot be built", async () => {
    const instance = express();
    instance.use(express.json());
    registerCareLabApi(
      instance,
      access({ roles: ["care_patient"] }),
      lazyCareLabRepository(() => {
        throw new Error("Supabase admin not configured");
      }),
    );
    const response = await request(instance).get("/api/care/labs");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("Supabase");
  });
});

describe("Missing record detection", () => {
  it.each([
    ["the Postgres undefined table code", { code: "42P01", message: "" }],
    ["the schema cache code", { code: "PGRST205", message: "" }],
    [
      "a schema cache message",
      { code: null, message: "Could not find the table 'public.care_lab_results' in the schema cache" },
    ],
    [
      "a relation message",
      { code: null, message: 'relation "public.care_adverse_events" does not exist' },
    ],
  ])("recognizes %s", (_label, error) => {
    expect(isMissingRelationError(error)).toBe(true);
  });

  it.each([
    ["no error", null],
    ["a permission failure", { code: "42501", message: "permission denied" }],
    [
      "a missing column",
      { code: "42703", message: 'column "panel_name" does not exist' },
    ],
  ])("does not mistake %s for a missing record", (_label, error) => {
    expect(isMissingRelationError(error)).toBe(false);
  });
});
