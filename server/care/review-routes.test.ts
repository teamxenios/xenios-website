import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAppointment } from "@shared/care/appointments";
import type { CareConsentStatus } from "@shared/care/consent";
import { CARE_CLINICAL_CAPABILITIES_DISABLED } from "@shared/care/clinical-actions";
import type { CareClinicianReview } from "@shared/care/clinician-review";
import type {
  AnyPlatformRole,
  CareRecordId,
} from "@shared/care/contracts";
import type { CareClinicalIntake } from "@shared/care/intake";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import type { CareReviewFacts } from "./review-detail";
import {
  lazyCareClinicianReviewRepository,
  type CareClinicianReviewRepository,
} from "./review-repository";
import { registerCareClinicianReviewApi } from "./review-routes";

const REVIEW_ID = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const OTHER_REVIEW_ID = "4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b" as CareRecordId;
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const INTAKE_ID = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const CLINICIAN_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_CLINICIAN_ID = "5b5b5b5b-5b5b-4b5b-8b5b-5b5b5b5b5b5b";

function review(overrides: Partial<CareClinicianReview> = {}): CareClinicianReview {
  return {
    id: REVIEW_ID,
    appointmentId: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    assignedClinicianUserId: CLINICIAN_ID,
    patientStateCode: "IL",
    status: "assigned",
    finalDecision: null,
    finalDecisionSource: null,
    version: 0,
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T20:00:00.000Z",
    ...overrides,
  };
}

function appointment(overrides: Partial<CareAppointment> = {}): CareAppointment {
  return {
    id: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    intakeId: INTAKE_ID,
    patientLocationId: "77777777-7777-4777-8777-777777777777" as CareRecordId,
    patientStateCode: "IL",
    assignedClinicianUserId: CLINICIAN_ID,
    clinicianCoverageId: null,
    status: "scheduled",
    startsAt: "2026-07-26T15:00:00.000Z",
    endsAt: "2026-07-26T15:30:00.000Z",
    telehealthReady: true,
    version: 1,
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T20:00:00.000Z",
    ...overrides,
  };
}

function intake(): CareClinicalIntake {
  return {
    id: INTAKE_ID,
    patientId: PATIENT_ID,
    definitionId: "88888888-8888-4888-8888-888888888888" as CareRecordId,
    definitionVersion: "2026.07",
    telehealthConsentEventId: "99999999-9999-4999-8999-999999999999" as CareRecordId,
    privacyConsentEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CareRecordId,
    status: "submitted",
    version: 1,
    createdAt: "2026-07-25T20:00:00.000Z",
    submittedAt: "2026-07-25T21:00:00.000Z",
  };
}

function consent(kind: CareConsentStatus["kind"]): CareConsentStatus {
  return {
    kind,
    requiredDocument: null,
    activeEvent: null,
    satisfied: true,
    reason: "active",
  };
}

function facts(overrides: Partial<CareReviewFacts> = {}): CareReviewFacts {
  return {
    review: review(),
    appointment: appointment(),
    intake: intake(),
    consents: [consent("telehealth"), consent("privacy_notice")],
    ...overrides,
  };
}

function repo(
  overrides: Partial<CareClinicianReviewRepository> = {},
): CareClinicianReviewRepository {
  return {
    listAssignedReviewFacts: vi.fn(async () => [facts()]),
    loadAssignedReviewFacts: vi.fn(async () => facts()),
    ...overrides,
  };
}

function access(options: {
  roles: readonly AnyPlatformRole[] | null;
  subjectId?: string;
  careEnabled?: boolean;
}): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () =>
      options.careEnabled === false
        ? {
            rail: "care" as const,
            state: "pending_clinicians" as const,
            enabled: false,
            publicMessage: "Clinician coverage is being prepared.",
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
            subjectId: options.subjectId ?? CLINICIAN_ID,
            roles: options.roles,
          }
        : null,
    ),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function app(
  repository: CareClinicianReviewRepository,
  dependencies: CareAccessDependencies,
  flags = CARE_CLINICAL_CAPABILITIES_DISABLED,
) {
  const instance = express();
  instance.use(express.json());
  registerCareClinicianReviewApi(instance, dependencies, repository, () => flags);
  return instance;
}

describe("Care clinician review queue route", () => {
  it("returns the assigned clinician's queue with a plain summary", async () => {
    const repository = repo();
    const response = await request(
      app(repository, access({ roles: ["clinician"] })),
    ).get("/api/care/reviews/queue");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.queue).toHaveLength(1);
    expect(response.body.summary).toEqual({
      total: 1,
      openWithClinician: 1,
      waitingOnSomeoneElse: 0,
      decided: 0,
    });
    expect(repository.listAssignedReviewFacts).toHaveBeenCalledWith(CLINICIAN_ID);
  });

  it("returns an honest empty queue rather than an invented one", async () => {
    const response = await request(
      app(
        repo({ listAssignedReviewFacts: vi.fn(async () => []) }),
        access({ roles: ["clinician"] }),
      ),
    ).get("/api/care/reviews/queue");
    expect(response.status).toBe(200);
    expect(response.body.queue).toEqual([]);
    expect(response.body.summary.total).toBe(0);
  });

  it("never sends a patient identifier, clinician identity, or state code", async () => {
    const response = await request(
      app(repo(), access({ roles: ["clinician"] })),
    ).get("/api/care/reviews/queue");
    const body = JSON.stringify(response.body);
    for (const secret of [PATIENT_ID, CLINICIAN_ID, INTAKE_ID, APPOINTMENT_ID, '"IL"']) {
      expect(body).not.toContain(secret);
    }
  });

  it("refuses an anonymous visitor before any repository read", async () => {
    const repository = repo();
    const response = await request(
      app(repository, access({ roles: null })),
    ).get("/api/care/reviews/queue");
    expect(response.status).toBe(401);
    expect(repository.listAssignedReviewFacts).not.toHaveBeenCalled();
  });

  it.each([
    ["care_patient"],
    ["pharmacy_operations"],
    ["clinical_admin"],
    ["affiliate"],
    ["research_admin"],
  ] as const)("refuses a %s role", async (role) => {
    const repository = repo();
    const response = await request(
      app(repository, access({ roles: [role] })),
    ).get("/api/care/reviews/queue");
    expect(response.status).toBe(403);
    expect(repository.listAssignedReviewFacts).not.toHaveBeenCalled();
  });

  it("stays unavailable while Care is not active", async () => {
    const repository = repo();
    const response = await request(
      app(repository, access({ roles: ["clinician"], careEnabled: false })),
    ).get("/api/care/reviews/queue");
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
    expect(repository.listAssignedReviewFacts).not.toHaveBeenCalled();
  });

  it("does not read the word queue as a review id", async () => {
    const repository = repo();
    await request(app(repository, access({ roles: ["clinician"] }))).get(
      "/api/care/reviews/queue",
    );
    expect(repository.loadAssignedReviewFacts).not.toHaveBeenCalled();
  });
});

describe("Care clinician review detail route", () => {
  it("returns the review, appointment, intake, and consent state", async () => {
    const response = await request(
      app(repo(), access({ roles: ["clinician"] })),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(response.status).toBe(200);
    expect(response.body.detail.reviewId).toBe(REVIEW_ID);
    expect(response.body.detail.appointment).toEqual({
      status: "scheduled",
      scheduled: true,
      completed: false,
      telehealthReady: true,
    });
    expect(response.body.detail.intake.state).toBe("submitted");
    expect(response.body.detail.consent).toHaveLength(2);
    expect(response.body.detail.consentComplete).toBe(true);
  });

  it("returns every clinical action disabled with a plain explanation", async () => {
    const response = await request(
      app(repo(), access({ roles: ["clinician"] })),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(response.body.actions).toHaveLength(7);
    for (const action of response.body.actions) {
      expect(action.enabled).toBe(false);
      expect(action.blockedReason).toBe("capability_disabled");
      expect(String(action.explanation).length).toBeGreaterThan(0);
    }
  });

  it("scopes the read to the requesting clinician", async () => {
    const repository = repo();
    await request(
      app(repository, access({ roles: ["clinician"], subjectId: CLINICIAN_ID })),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(repository.loadAssignedReviewFacts).toHaveBeenCalledWith({
      reviewId: REVIEW_ID,
      clinicianUserId: CLINICIAN_ID,
    });
  });

  it("reports a review assigned to another clinician as not found", async () => {
    const response = await request(
      app(
        repo({
          loadAssignedReviewFacts: vi.fn(async () =>
            facts({
              review: review({ assignedClinicianUserId: OTHER_CLINICIAN_ID }),
            }),
          ),
        }),
        access({ roles: ["clinician"], subjectId: CLINICIAN_ID }),
      ),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("care_review_not_found");
  });

  it("reports a missing review as not found without leaking existence", async () => {
    const response = await request(
      app(
        repo({ loadAssignedReviewFacts: vi.fn(async () => null) }),
        access({ roles: ["clinician"] }),
      ),
    ).get(`/api/care/reviews/${OTHER_REVIEW_ID}`);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(OTHER_REVIEW_ID);
  });

  it("rejects a malformed review id", async () => {
    const repository = repo();
    const response = await request(
      app(repository, access({ roles: ["clinician"] })),
    ).get("/api/care/reviews/not-a-uuid");
    expect(response.status).toBe(400);
    expect(repository.loadAssignedReviewFacts).not.toHaveBeenCalled();
  });

  it("refuses an anonymous visitor and a member on the detail route too", async () => {
    const anonymous = await request(
      app(repo(), access({ roles: null })),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    const member = await request(
      app(repo(), access({ roles: ["care_patient"] })),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(anonymous.status).toBe(401);
    expect(member.status).toBe(403);
  });

  it("keeps every response private to the browser cache", async () => {
    const response = await request(
      app(repo(), access({ roles: ["clinician"] })),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("falls back to unavailable when the repository fails", async () => {
    const response = await request(
      app(
        repo({
          loadAssignedReviewFacts: vi.fn(async () => {
            throw new Error("care_clinician_review_lookup_failed");
          }),
        }),
        access({ roles: ["clinician"] }),
      ),
    ).get(`/api/care/reviews/${REVIEW_ID}`);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("lookup_failed");
  });
});

describe("Care clinician review wiring", () => {
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

  function wiredApp(reviewRepository: CareClinicianReviewRepository) {
    const instance = express();
    instance.use(express.json());
    registerCareAppointmentApi(
      instance,
      access({ roles: ["clinician"] }),
      appointmentRepository(),
      () => new Date("2026-07-25T20:00:00.000Z"),
      reviewRepository,
    );
    return instance;
  }

  it("serves the queue and the detail through the registered Care appointment API", async () => {
    const reviewRepository = repo();
    const queue = await request(wiredApp(reviewRepository)).get(
      "/api/care/reviews/queue",
    );
    const detail = await request(wiredApp(reviewRepository)).get(
      `/api/care/reviews/${REVIEW_ID}`,
    );
    expect(queue.status).toBe(200);
    expect(queue.body.queue).toHaveLength(1);
    expect(detail.status).toBe(200);
    expect(detail.body.detail.reviewId).toBe(REVIEW_ID);
  });

  it("keeps the existing assigned review list route working", async () => {
    const response = await request(wiredApp(repo())).get("/api/care/reviews");
    expect(response.status).toBe(200);
    expect(response.body.reviews).toEqual([]);
  });

  it("builds the production repository only on the first authorized read", () => {
    const build = vi.fn(() => repo());
    const lazy = lazyCareClinicianReviewRepository(build);
    expect(build).not.toHaveBeenCalled();
    void lazy.listAssignedReviewFacts(CLINICIAN_ID);
    void lazy.listAssignedReviewFacts(CLINICIAN_ID);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("answers with the standard unavailable response when the repository cannot be built", async () => {
    const response = await request(
      wiredApp(
        lazyCareClinicianReviewRepository(() => {
          throw new Error("Supabase admin not configured");
        }),
      ),
    ).get("/api/care/reviews/queue");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("Supabase");
  });
});
