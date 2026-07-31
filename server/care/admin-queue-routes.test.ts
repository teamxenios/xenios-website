import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAppointment } from "@shared/care/appointments";
import { CARE_CLINICAL_CAPABILITIES_DISABLED } from "@shared/care/clinical-actions";
import type {
  AnyPlatformRole,
  CareRecordId,
} from "@shared/care/contracts";
import type {
  CarePharmacyOrder,
  CarePrescription,
} from "@shared/care/prescriptions";
import type { CareAccessDependencies } from "./access";
import type { CareAdminQueueRepository } from "./admin-queue-repository";
import {
  CARE_ADMIN_QUEUE_ROUTES,
  registerCareAdminAppointmentQueueApi,
  registerCareAdminPharmacyQueueApi,
} from "./admin-queue-routes";
import type { CareAdminPrescriptionFacts } from "./admin-queues";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import type { CarePrescriptionRepository } from "./prescription-repository";
import { registerCarePrescriptionApi } from "./prescription-routes";
import type { CareClinicianReviewRepository } from "./review-repository";

const NOW = new Date("2026-07-26T18:00:00.000Z");
const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const INTAKE_ID = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const LOCATION_ID = "77777777-7777-4777-8777-777777777777" as CareRecordId;
const REVIEW_ID = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const CLINICIAN_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a";
const PRESCRIPTION_ID = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const ORDER_ID = "99999999-9999-4999-8999-999999999999" as CareRecordId;
const PHARMACY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CareRecordId;
const CONTENT_SOURCE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as CareRecordId;

const EVERY_QUEUE = [
  ["appointments", CARE_ADMIN_QUEUE_ROUTES.appointments],
  ["prescriptions", CARE_ADMIN_QUEUE_ROUTES.prescriptions],
  ["pharmacy orders", CARE_ADMIN_QUEUE_ROUTES.pharmacyOrders],
] as const;

function appointment(
  overrides: Partial<CareAppointment> = {},
): CareAppointment {
  return {
    id: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    intakeId: INTAKE_ID,
    patientLocationId: LOCATION_ID,
    patientStateCode: "IL",
    assignedClinicianUserId: null,
    clinicianCoverageId: null,
    status: "requested",
    startsAt: null,
    endsAt: null,
    telehealthReady: false,
    version: 0,
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T20:00:00.000Z",
    ...overrides,
  };
}

function prescriptionFacts(
  overrides: Partial<CarePrescription> = {},
  pharmacyOrderId: CareRecordId | null = null,
): CareAdminPrescriptionFacts {
  const prescription: CarePrescription = {
    id: PRESCRIPTION_ID,
    patientId: PATIENT_ID,
    appointmentId: APPOINTMENT_ID,
    clinicianReviewId: REVIEW_ID,
    prescribingClinicianUserId: CLINICIAN_ID,
    status: "signed",
    formulation: null,
    concentration: null,
    route: null,
    quantity: null,
    directions: null,
    refills: null,
    verifiedContentSourceId: CONTENT_SOURCE_ID,
    version: 1,
    signedAt: "2026-07-25T21:00:00.000Z",
    supersedesPrescriptionId: null,
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T21:00:00.000Z",
    ...overrides,
  };
  return { prescription, pharmacyOrderId };
}

function order(overrides: Partial<CarePharmacyOrder> = {}): CarePharmacyOrder {
  return {
    id: ORDER_ID,
    patientId: PATIENT_ID,
    prescriptionId: PRESCRIPTION_ID,
    assignedPharmacyId: PHARMACY_ID,
    patientStateCode: "IL",
    status: "pending_pharmacy",
    clarificationOpen: false,
    trackingReferencePresent: false,
    version: 0,
    createdAt: "2026-07-25T22:00:00.000Z",
    updatedAt: "2026-07-25T22:00:00.000Z",
    ...overrides,
  };
}

function repo(
  overrides: Partial<CareAdminQueueRepository> = {},
): CareAdminQueueRepository {
  return {
    listOpenAppointments: vi.fn(async () => [appointment()]),
    listSignedPrescriptions: vi.fn(async () => [prescriptionFacts()]),
    listPharmacyOrders: vi.fn(async () => [order()]),
    ...overrides,
  };
}

function calls(repository: CareAdminQueueRepository) {
  return [
    repository.listOpenAppointments,
    repository.listSignedPrescriptions,
    repository.listPharmacyOrders,
  ];
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
        ? { subjectId: options.subjectId ?? ADMIN_ID, roles: options.roles }
        : null,
    ),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function app(
  repository: CareAdminQueueRepository,
  dependencies: CareAccessDependencies,
  flags = CARE_CLINICAL_CAPABILITIES_DISABLED,
) {
  const instance = express();
  instance.use(express.json());
  const options = {
    repository,
    now: () => NOW,
    readFlags: () => flags,
  };
  registerCareAdminAppointmentQueueApi(instance, dependencies, options);
  registerCareAdminPharmacyQueueApi(instance, dependencies, options);
  return instance;
}

const asAdmin = (repository: CareAdminQueueRepository, path: string) =>
  request(app(repository, access({ roles: ["clinical_admin"] }))).get(path);

describe("Care admin queue authorization", () => {
  it.each(EVERY_QUEUE)(
    "refuses an anonymous visitor on the %s queue before any repository read",
    async (_name, path) => {
      const repository = repo();
      const response = await request(
        app(repository, access({ roles: null })),
      ).get(path);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("care_auth_required");
      for (const call of calls(repository)) expect(call).not.toHaveBeenCalled();
    },
  );

  // Every role that is NOT a Care administrator, including the roles that own
  // the self-scoped reads these queues deliberately do not widen.
  it.each(
    EVERY_QUEUE.flatMap(([name, path]) =>
      (
        [
          "care_patient",
          "clinician",
          "pharmacy_operations",
          "affiliate",
          "lab_reviewer",
          "clinical_support",
          "care_security_admin",
          "research_admin",
        ] as const
      ).map((role) => [name, path, role] as const),
    ),
  )("refuses a %s queue read by a %s role", async (_name, path, role) => {
    const repository = repo();
    const response = await request(
      app(repository, access({ roles: [role] })),
    ).get(path);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("care_forbidden");
    for (const call of calls(repository)) expect(call).not.toHaveBeenCalled();
  });

  it.each(EVERY_QUEUE)(
    "keeps the %s queue closed while Care is not active",
    async (_name, path) => {
      const repository = repo();
      const response = await request(
        app(
          repository,
          access({ roles: ["clinical_admin"], careEnabled: false }),
        ),
      ).get(path);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("care_disabled");
      for (const call of calls(repository)) expect(call).not.toHaveBeenCalled();
    },
  );

  it.each(EVERY_QUEUE)(
    "stays unavailable rather than guessing when the %s read fails",
    async (_name, path) => {
      const failing = repo({
        listOpenAppointments: vi.fn(async () => {
          throw new Error("care_appointment_lookup_failed");
        }),
        listSignedPrescriptions: vi.fn(async () => {
          throw new Error("care_prescription_lookup_failed");
        }),
        listPharmacyOrders: vi.fn(async () => {
          throw new Error("care_pharmacy_order_lookup_failed");
        }),
      });
      const response = await asAdmin(failing, path);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("care_temporarily_unavailable");
      expect(JSON.stringify(response.body)).not.toContain("lookup_failed");
    },
  );

  it.each(EVERY_QUEUE)(
    "never writes from the %s queue read",
    async (_name, path) => {
      const instance = app(repo(), access({ roles: ["clinical_admin"] }));
      for (const method of ["post", "put", "patch", "delete"] as const) {
        const response = await request(instance)[method](path);
        expect(response.status).toBe(404);
      }
    },
  );
});

describe("Care admin appointment queue", () => {
  it("gives the administrator the work list their write contracts need", async () => {
    const repository = repo({
      listOpenAppointments: vi.fn(async () => [
        appointment(),
        appointment({
          id: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b" as CareRecordId,
          assignedClinicianUserId: CLINICIAN_ID,
        }),
        appointment({
          id: "2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c" as CareRecordId,
          status: "scheduled",
          assignedClinicianUserId: CLINICIAN_ID,
          startsAt: "2026-07-26T16:00:00.000Z",
          endsAt: "2026-07-26T16:30:00.000Z",
        }),
      ]),
    });
    const response = await asAdmin(
      repository,
      CARE_ADMIN_QUEUE_ROUTES.appointments,
    );
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.queue.map((item: { bucket: string }) => item.bucket)).toEqual([
      "needs_assignment",
      "needs_scheduling",
      "no_show_candidate",
    ]);
    expect(response.body.summary).toEqual({
      total: 3,
      needsAssignment: 1,
      needsScheduling: 1,
      scheduled: 0,
      awaitingCompletion: 0,
      noShowCandidates: 1,
    });
    expect(response.body.queue[0].appointmentId).toBe(APPOINTMENT_ID);
    expect(response.body.queue[0].version).toBe(0);
  });

  it("shows a truthful empty queue rather than an invented appointment", async () => {
    const response = await asAdmin(
      repo({ listOpenAppointments: vi.fn(async () => []) }),
      CARE_ADMIN_QUEUE_ROUTES.appointments,
    );
    expect(response.status).toBe(200);
    expect(response.body.queue).toEqual([]);
    expect(response.body.summary.total).toBe(0);
  });

  it("never sends a patient identifier, clinician identity, or state code", async () => {
    const response = await asAdmin(
      repo({
        listOpenAppointments: vi.fn(async () => [
          appointment({ assignedClinicianUserId: CLINICIAN_ID }),
        ]),
      }),
      CARE_ADMIN_QUEUE_ROUTES.appointments,
    );
    const body = JSON.stringify(response.body);
    for (const secret of [PATIENT_ID, CLINICIAN_ID, INTAKE_ID, LOCATION_ID, '"IL"']) {
      expect(body).not.toContain(secret);
    }
  });

  it("sets no-store so a queue is never cached", async () => {
    const response = await asAdmin(
      repo(),
      CARE_ADMIN_QUEUE_ROUTES.appointments,
    );
    expect(response.headers["cache-control"]).toContain("no-store");
  });
});

describe("Care admin prescription queue", () => {
  it("lists the signed prescriptions the assign contract can act on", async () => {
    const response = await asAdmin(
      repo({
        listSignedPrescriptions: vi.fn(async () => [
          prescriptionFacts(),
          prescriptionFacts(
            { id: "6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b" as CareRecordId },
            ORDER_ID,
          ),
        ]),
      }),
      CARE_ADMIN_QUEUE_ROUTES.prescriptions,
    );
    expect(response.status).toBe(200);
    expect(response.body.queue[0]).toMatchObject({
      prescriptionId: PRESCRIPTION_ID,
      bucket: "awaiting_pharmacy_assignment",
      pharmacyAssigned: false,
      status: "signed",
    });
    expect(response.body.summary).toEqual({
      total: 2,
      awaitingPharmacyAssignment: 1,
      pharmacyAssigned: 1,
    });
  });

  it("carries no prescription content and no patient identifier", async () => {
    const response = await asAdmin(
      repo(),
      CARE_ADMIN_QUEUE_ROUTES.prescriptions,
    );
    const body = JSON.stringify(response.body);
    for (const secret of [PATIENT_ID, CLINICIAN_ID, REVIEW_ID, CONTENT_SOURCE_ID]) {
      expect(body).not.toContain(secret);
    }
    for (const field of ["formulation", "concentration", "directions", "refills"]) {
      expect(body).not.toContain(field);
    }
  });

  it("shows a truthful empty queue", async () => {
    const response = await asAdmin(
      repo({ listSignedPrescriptions: vi.fn(async () => []) }),
      CARE_ADMIN_QUEUE_ROUTES.prescriptions,
    );
    expect(response.body.queue).toEqual([]);
    expect(response.body.summary.awaitingPharmacyAssignment).toBe(0);
  });
});

describe("Care admin pharmacy order queue", () => {
  it("shows order workflow state without widening the pharmacy read", async () => {
    const response = await asAdmin(
      repo({
        listPharmacyOrders: vi.fn(async () => [
          order(),
          order({
            id: "9b9b9b9b-9b9b-4b9b-8b9b-9b9b9b9b9b9b" as CareRecordId,
            status: "accepted",
            clarificationOpen: true,
          }),
        ]),
      }),
      CARE_ADMIN_QUEUE_ROUTES.pharmacyOrders,
    );
    expect(response.status).toBe(200);
    expect(response.body.queue[0].bucket).toBe("clarification_open");
    expect(response.body.summary).toEqual({
      total: 2,
      awaitingPharmacy: 1,
      clarificationOpen: 1,
      inFulfillment: 0,
      closed: 0,
    });
    const body = JSON.stringify(response.body);
    for (const secret of [PATIENT_ID, PHARMACY_ID, PRESCRIPTION_ID, '"IL"']) {
      expect(body).not.toContain(secret);
    }
  });

  it("shows a truthful empty queue", async () => {
    const response = await asAdmin(
      repo({ listPharmacyOrders: vi.fn(async () => []) }),
      CARE_ADMIN_QUEUE_ROUTES.pharmacyOrders,
    );
    expect(response.body.queue).toEqual([]);
    expect(response.body.summary.total).toBe(0);
  });
});

/**
 * The wiring test. These exercise the REAL registrars server/index.ts calls,
 * rather than the isolated ones the tests above use, so the queues cannot be
 * left unmounted in production while their own tests pass. The admin queue
 * repository is left at its default, and Supabase is not configured here, so
 * it throws on first use, which is exactly the failure the queue must survive
 * safely.
 */
describe("Care admin queues through the real Care registrars", () => {
  function wired(dependencies: CareAccessDependencies) {
    const instance = express();
    instance.use(express.json());
    // These registrars never reach their own repositories on an admin queue
    // request, so an empty stand-in keeps the wiring under test.
    registerCareAppointmentApi(
      instance,
      dependencies,
      {} as CareAppointmentRepository,
      () => NOW,
      {} as CareClinicianReviewRepository,
    );
    registerCarePrescriptionApi(
      instance,
      dependencies,
      {} as CarePrescriptionRepository,
      () => NOW,
    );
    return instance;
  }

  it.each(EVERY_QUEUE)(
    "registers the %s queue behind care:administer",
    async (_name, path) => {
      const anonymous = await request(wired(access({ roles: null }))).get(path);
      expect(anonymous.status).toBe(401);
      const patient = await request(
        wired(access({ roles: ["care_patient"] })),
      ).get(path);
      expect(patient.status).toBe(403);
    },
  );

  it.each(EVERY_QUEUE)(
    "fails the %s queue closed when the database is not configured",
    async (_name, path) => {
      const response = await request(
        wired(access({ roles: ["clinical_admin"] })),
      ).get(path);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("care_temporarily_unavailable");
      // No adapter error text, and never an invented empty success.
      expect(JSON.stringify(response.body)).not.toContain("Supabase");
      expect(response.body.queue).toBeUndefined();
    },
  );
});

describe("Care admin queue clinical controls", () => {
  it.each(EVERY_QUEUE)(
    "returns every %s control disabled with a plain reason",
    async (_name, path) => {
      const response = await asAdmin(
        repo({
          listPharmacyOrders: vi.fn(async () => [
            order({ clarificationOpen: true }),
          ]),
        }),
        path,
      );
      const actions = response.body.queue.flatMap(
        (item: { actions: unknown[] }) => item.actions,
      );
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions as {
        enabled: boolean;
        blockedReason: string;
        explanation: string;
      }[]) {
        expect(action.enabled).toBe(false);
        expect(action.blockedReason).toBe("capability_disabled");
        expect(action.explanation.length).toBeGreaterThan(0);
      }
    },
  );

  it("keeps every control disabled even when the workflow would allow it", async () => {
    const response = await asAdmin(
      repo({
        listOpenAppointments: vi.fn(async () => [
          appointment({
            status: "scheduled",
            assignedClinicianUserId: CLINICIAN_ID,
            startsAt: "2026-07-26T16:00:00.000Z",
            endsAt: "2026-07-26T16:30:00.000Z",
          }),
        ]),
      }),
      CARE_ADMIN_QUEUE_ROUTES.appointments,
    );
    const [item] = response.body.queue;
    expect(item.bucket).toBe("no_show_candidate");
    expect(
      item.actions.every((action: { enabled: boolean }) => !action.enabled),
    ).toBe(true);
  });
});
