import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARE_CLINICAL_CAPABILITIES,
  CARE_CLINICAL_CAPABILITY_ENV_KEYS,
  type CareClinicalCapability,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import type { CareAppointment } from "@shared/care/appointments";
import type { CareRecordId, CareRole } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import {
  CARE_CLINICAL_OPERATIONS,
  CARE_CLINICAL_REFUSED_CODE,
  CareClinicalCapabilityDisabledError,
  evaluateCareClinicalWrite,
  requireCareClinicalCapability,
  runCareClinicalWrite,
} from "./clinical-write-gate";
import type { CareEligibilityRepository } from "./eligibility-repository";
import { registerCareEligibilityApi } from "./eligibility-routes";
import type { CareIntakeRepository } from "./intake-repository";
import { registerCareIntakeApi } from "./intake-routes";
import type { CarePrescriptionRepository } from "./prescription-repository";
import { registerCarePrescriptionApi } from "./prescription-routes";
import type { CareClinicianReviewRepository } from "./review-repository";
import { readCareClinicalCapabilityFlags } from "./review-detail";

/**
 * The adversarial bypass suite for the Care clinical write chokepoint.
 *
 * Every case here builds the Care API the way `server/index.ts` builds it: the
 * route modules are registered with NO gate options, so the gate falls back to
 * the real `readCareClinicalCapabilityFlags` reading the real `process.env`.
 * Nothing is injected, so nothing can be injected wrongly and pass.
 *
 * Every repository method THROWS if it is reached. Each Care handler wraps its
 * repository call in a try/catch that answers 503, so a handler that ran shows
 * up as 503 and a gate that refused shows up as 403. The two outcomes cannot be
 * confused, and "the repository was never called" is asserted directly as well.
 *
 * The principal carries the REAL role names, and by default all four of them,
 * so `requireCarePermission` is satisfied on every route under test. This
 * matters: with a wrong or missing role every request answers `care_forbidden`
 * and the suite proves nothing about the clinical gate. Each refusal below is
 * asserted to carry `care_clinical_capability_disabled`, which only the
 * clinical gate emits.
 *
 * Synthetic identifiers only. Nothing here names a real person, a real
 * clinician, a real pharmacy, or any real clinical content.
 */

const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const CLINICIAN = "22222222-2222-4222-8222-222222222222";
const PRESCRIPTION = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const REVIEW = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const ORDER = "77777777-7777-4777-8777-777777777777" as CareRecordId;
const PHARMACY = "88888888-8888-4888-8888-888888888888" as CareRecordId;
const APPOINTMENT = "99999999-9999-4999-8999-999999999999" as CareRecordId;
const INTAKE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CareRecordId;
const CLINICIAN_TARGET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = "2026-08-01T20:00:00.000Z";

const ALL_ROLES: readonly CareRole[] = [
  "care_patient",
  "clinician",
  "clinical_admin",
  "pharmacy_operations",
];

const FLAG_KEYS = CARE_CLINICAL_CAPABILITIES.map(
  (capability) => CARE_CLINICAL_CAPABILITY_ENV_KEYS[capability],
);

const ALL_ON: CareClinicalCapabilityFlags = {
  provider_actions: true,
  prescribing: true,
  clinical_fulfillment: true,
  external_communications: true,
  real_patient_data: true,
};

/** Turn a capability on the only way production can: the exact string "true". */
function enable(...capabilities: readonly CareClinicalCapability[]): void {
  for (const capability of capabilities) {
    process.env[CARE_CLINICAL_CAPABILITY_ENV_KEYS[capability]] = "true";
  }
}

function everyCapabilityExcept(
  excluded: CareClinicalCapability,
): CareClinicalCapability[] {
  return CARE_CLINICAL_CAPABILITIES.filter(
    (capability) => capability !== excluded,
  );
}

const clock = () => new Date(NOW);

function access(
  roles: readonly CareRole[] = ALL_ROLES,
  subjectId = CLINICIAN,
): CareAccessDependencies {
  return {
    // The Care capability status is deliberately OPEN, which isolates the
    // clinical capability gate as the only thing that can refuse below.
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state: "enabled" as const,
      enabled: true,
      publicMessage: "Care enabled for test.",
      checkedAt: NOW,
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId,
      patientId: roles.includes("care_patient") ? PATIENT : undefined,
      roles,
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

class RepositoryReached extends Error {
  constructor(method: string) {
    super(`repository reached: ${method}`);
  }
}

/** A spy that fails the safety property simply by running. */
function tripwire(method: string) {
  return vi.fn(async () => {
    throw new RepositoryReached(method);
  });
}

interface Repositories {
  appointments: CareAppointmentRepository;
  prescriptions: CarePrescriptionRepository;
  intakes: CareIntakeRepository;
  eligibility: CareEligibilityRepository;
  reviews: CareClinicianReviewRepository;
}

function tripwireRepositories(): Repositories {
  return {
    appointments: {
      listPatientAppointments: tripwire("listPatientAppointments"),
      loadReadiness: tripwire("appointments.loadReadiness"),
      requestAppointment: tripwire("requestAppointment"),
      patientAction: tripwire("patientAction"),
      assignClinician: tripwire("assignClinician"),
      scheduleAppointment: tripwire("scheduleAppointment"),
      adminMarkNoShow: tripwire("adminMarkNoShow"),
      clinicianComplete: tripwire("clinicianComplete"),
      listAssignedReviews: tripwire("listAssignedReviews"),
      applyReviewAction: tripwire("applyReviewAction"),
    } as unknown as CareAppointmentRepository,
    prescriptions: {
      listPatientPrescriptions: tripwire("listPatientPrescriptions"),
      listAssignedPharmacyOrders: tripwire("listAssignedPharmacyOrders"),
      loadReadiness: tripwire("prescriptions.loadReadiness"),
      createDraft: tripwire("createDraft"),
      sign: tripwire("sign"),
      assignPharmacy: tripwire("assignPharmacy"),
      pharmacyAction: tripwire("pharmacyAction"),
      resolveClarification: tripwire("resolveClarification"),
    } as unknown as CarePrescriptionRepository,
    intakes: {
      loadCurrentIntake: tripwire("loadCurrentIntake"),
      loadApprovedDefinition: tripwire("loadApprovedDefinition"),
      loadLatestRevision: tripwire("loadLatestRevision"),
      startIntake: tripwire("startIntake"),
      autosave: tripwire("autosave"),
      submit: tripwire("submit"),
    } as unknown as CareIntakeRepository,
    eligibility: {
      loadContext: tripwire("loadContext"),
      recordEligibilityDecision: tripwire("recordEligibilityDecision"),
      recordLocation: tripwire("recordLocation"),
      changeWaitlist: tripwire("changeWaitlist"),
      recordConsent: tripwire("recordConsent"),
    } as unknown as CareEligibilityRepository,
    reviews: {
      listAssignedReviewFacts: tripwire("listAssignedReviewFacts"),
      loadAssignedReviewFacts: tripwire("loadAssignedReviewFacts"),
    } as unknown as CareClinicianReviewRepository,
  };
}

/** Every spy across every repository, so "zero rows written" can be asserted whole. */
function everySpy(repositories: Repositories) {
  return Object.values(repositories).flatMap((repository) =>
    Object.entries(repository as Record<string, unknown>).map(
      ([name, value]) => [name, value as ReturnType<typeof vi.fn>] as const,
    ),
  );
}

function expectNothingWritten(repositories: Repositories): void {
  const reached = everySpy(repositories)
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
  expect(reached).toEqual([]);
}

/**
 * The Care API as production wires it: no gate argument anywhere, so the guard
 * reads the real environment through the real reader.
 */
function productionShapedApp(
  roles: readonly CareRole[] = ALL_ROLES,
  subjectId = CLINICIAN,
) {
  const repositories = tripwireRepositories();
  const app = express();
  app.use(express.json());
  const deps = access(roles, subjectId);
  registerCareEligibilityApi(app, deps, repositories.eligibility, clock);
  registerCareIntakeApi(
    app,
    deps,
    repositories.eligibility,
    repositories.intakes,
    clock,
  );
  registerCareAppointmentApi(
    app,
    deps,
    repositories.appointments,
    clock,
    repositories.reviews,
  );
  registerCarePrescriptionApi(app, deps, repositories.prescriptions, clock);
  return { app, repositories };
}

interface ClinicalRoute {
  name: string;
  capability: CareClinicalCapability;
  requiredCapabilities?: readonly CareClinicalCapability[];
  call: (app: express.Express) => request.Test;
}

const draftPayload = {
  patientId: PATIENT,
  reviewId: REVIEW,
  formulation: "synthetic",
  concentration: "synthetic",
  route: "synthetic",
  quantity: "synthetic",
  directions: "synthetic",
  refills: 0,
  idempotencyKey: "adversarial-key-05",
};

/** The sixteen clinical WRITE routes. */
const CLINICAL_WRITES: readonly ClinicalRoute[] = [
  {
    name: "POST /api/care/intake",
    capability: "real_patient_data",
    call: (app) =>
      request(app).post("/api/care/intake").send({ idempotencyKey: "adversarial-key-01" }),
  },
  {
    name: "PATCH /api/care/intake/:id/autosave",
    capability: "real_patient_data",
    call: (app) =>
      request(app)
        .patch(`/api/care/intake/${INTAKE}/autosave`)
        .send({ expectedVersion: 0, responses: {}, idempotencyKey: "adversarial-key-02" }),
  },
  {
    name: "POST /api/care/intake/:id/submit",
    capability: "real_patient_data",
    call: (app) =>
      request(app)
        .post(`/api/care/intake/${INTAKE}/submit`)
        .send({ expectedVersion: 0, idempotencyKey: "adversarial-key-03" }),
  },
  {
    name: "POST /api/care/appointments",
    capability: "real_patient_data",
    call: (app) =>
      request(app)
        .post("/api/care/appointments")
        .send({ intakeId: INTAKE, idempotencyKey: "adversarial-key-appt-01" }),
  },
  {
    name: "POST /api/care/appointments/:id/action",
    capability: "real_patient_data",
    call: (app) =>
      request(app)
        .post(`/api/care/appointments/${APPOINTMENT}/action`)
        .send({ action: "cancel", expectedVersion: 0, idempotencyKey: "adversarial-key-appt-02" }),
  },
  {
    name: "POST /api/care/appointments/:id/assign",
    capability: "provider_actions",
    call: (app) =>
      request(app)
        .post(`/api/care/appointments/${APPOINTMENT}/assign`)
        .send({ clinicianUserId: CLINICIAN_TARGET, idempotencyKey: "adversarial-key-appt-03" }),
  },
  {
    name: "POST /api/care/appointments/:id/schedule",
    capability: "provider_actions",
    requiredCapabilities: ["provider_actions", "external_communications"],
    call: (app) =>
      request(app)
        .post(`/api/care/appointments/${APPOINTMENT}/schedule`)
        .send({
          expectedVersion: 0,
          providerKey: "synthetic-provider",
          providerSessionReference: "synthetic-session-reference",
          startsAt: NOW,
          endsAt: NOW,
          idempotencyKey: "adversarial-key-appt-04",
        }),
  },
  {
    name: "POST /api/care/appointments/:id/no-show",
    capability: "provider_actions",
    call: (app) =>
      request(app)
        .post(`/api/care/appointments/${APPOINTMENT}/no-show`)
        .send({ expectedVersion: 0, idempotencyKey: "adversarial-key-appt-05" }),
  },
  {
    name: "POST /api/care/appointments/:id/complete",
    capability: "provider_actions",
    call: (app) =>
      request(app)
        .post(`/api/care/appointments/${APPOINTMENT}/complete`)
        .send({ expectedVersion: 0, idempotencyKey: "adversarial-key-04" }),
  },
  {
    name: "POST /api/care/reviews/:id/action (approve)",
    capability: "provider_actions",
    call: (app) =>
      request(app)
        .post(`/api/care/reviews/${REVIEW}/action`)
        .send({ action: "approve", expectedVersion: 0, idempotencyKey: "adversarial-key-06" }),
  },
  {
    name: "POST /api/care/prescriptions",
    capability: "prescribing",
    call: (app) => request(app).post("/api/care/prescriptions").send(draftPayload),
  },
  {
    name: "POST /api/care/prescriptions/:id/sign",
    capability: "prescribing",
    call: (app) =>
      request(app)
        .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
        .send({ expectedVersion: 0, idempotencyKey: "adversarial-key-07" }),
  },
  {
    name: "POST /api/care/pharmacy/admin/prescriptions/:id/assign",
    capability: "clinical_fulfillment",
    call: (app) =>
      request(app)
        .post(`/api/care/pharmacy/admin/prescriptions/${PRESCRIPTION}/assign`)
        .send({ pharmacyId: PHARMACY, idempotencyKey: "adversarial-key-08" }),
  },
  {
    name: "POST /api/care/pharmacy/orders/:id/action",
    capability: "clinical_fulfillment",
    call: (app) =>
      request(app)
        .post(`/api/care/pharmacy/orders/${ORDER}/action`)
        .send({ action: "dispense", expectedVersion: 0, idempotencyKey: "adversarial-key-09" }),
  },
  {
    name: "POST /api/care/prescriptions/pharmacy-orders/:id/clarification/resolve",
    capability: "clinical_fulfillment",
    call: (app) =>
      request(app)
        .post(`/api/care/prescriptions/pharmacy-orders/${ORDER}/clarification/resolve`)
        .send({
          expectedVersion: 0,
          resolutionReference: "synthetic",
          idempotencyKey: "adversarial-key-10",
        }),
  },
  {
    name: "POST /api/care/pharmacy/admin/orders/:id/clarification/resolve",
    capability: "clinical_fulfillment",
    call: (app) =>
      request(app)
        .post(`/api/care/pharmacy/admin/orders/${ORDER}/clarification/resolve`)
        .send({
          expectedVersion: 0,
          resolutionReference: "synthetic",
          idempotencyKey: "adversarial-key-11",
        }),
  },
];

/** The four clinical READS. Each returns a real person's clinical content. */
const CLINICAL_READS: readonly ClinicalRoute[] = [
  {
    name: "GET /api/care/appointments",
    capability: "real_patient_data",
    call: (app) => request(app).get("/api/care/appointments"),
  },
  {
    name: "GET /api/care/intake",
    capability: "real_patient_data",
    call: (app) => request(app).get("/api/care/intake"),
  },
  {
    name: "GET /api/care/prescriptions",
    capability: "real_patient_data",
    call: (app) => request(app).get("/api/care/prescriptions"),
  },
  {
    name: "GET /api/care/pharmacy/orders",
    capability: "real_patient_data",
    call: (app) => request(app).get("/api/care/pharmacy/orders"),
  },
];

let warned: string[] = [];
const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of FLAG_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  warned = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
  vi.restoreAllMocks();
});

describe("adversarial: every clinical write refuses with all five flags unset", () => {
  it.each(CLINICAL_WRITES.map((route) => [route.name, route] as const))(
    "refuses %s and writes zero rows",
    async (_name, route) => {
      const { app, repositories } = productionShapedApp();
      const response = await route.call(app);

      // 403 and not 503 is the whole point: 503 would mean a handler ran and a
      // tripwire repository threw, which is a reached clinical write.
      expect(response.status).toBe(403);
      expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
      expect(response.body.capability).toBe(route.capability);
      expect(response.body.requiredCapabilities).toEqual(
        route.requiredCapabilities ?? [route.capability],
      );
      expectNothingWritten(repositories);
    },
  );

  it("refuses all sixteen clinical writes in one pass and writes zero rows across every repository", async () => {
    const { app, repositories } = productionShapedApp();
    const responses = await Promise.all(
      CLINICAL_WRITES.map((route) => route.call(app)),
    );

    expect(responses).toHaveLength(16);
    expect(responses.map((response) => response.status)).toEqual(
      new Array(16).fill(403),
    );
    expectNothingWritten(repositories);
  });
});

describe("adversarial: every clinical read refuses with all five flags unset", () => {
  it.each(CLINICAL_READS.map((route) => [route.name, route] as const))(
    "refuses %s and reads nothing",
    async (_name, route) => {
      const { app, repositories } = productionShapedApp();
      const response = await route.call(app);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
      expect(response.body.capability).toBe("real_patient_data");
      expect(response.text).not.toContain("prescriptionContent");
      expectNothingWritten(repositories);
    },
  );
});

describe("adversarial: non-canonical environment values are all denied", () => {
  // Only the exact string "true" enables a capability. Everything a deployment
  // could plausibly typo, pad, or shell-quote into place stays off.
  const NON_CANONICAL = [
    ["1", "the numeral one"],
    ["TRUE", "upper case"],
    ["True", "title case"],
    ["yes", "the word yes"],
    [" true ", "space padded"],
    ["", "empty string"],
    ["true\n", "trailing newline"],
    ["TRUE ", "upper case with a trailing space"],
    ["\ttrue", "leading tab"],
    ["0", "the numeral zero"],
    ["false", "the literal false"],
  ] as const;

  it.each(NON_CANONICAL.map(([value, label]) => [label, value] as const))(
    "denies prescribing when CARE_PRESCRIBING_ENABLED is %s",
    async (_label, value) => {
      process.env.CARE_PRESCRIBING_ENABLED = value;
      const { app, repositories } = productionShapedApp();
      const response = await request(app)
        .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
        .send({ expectedVersion: 0, idempotencyKey: "non-canonical-key-1" });

      expect(readCareClinicalCapabilityFlags().prescribing).toBe(false);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
      expectNothingWritten(repositories);
    },
  );

  it("denies prescribing when the environment key is unset entirely", async () => {
    expect(process.env.CARE_PRESCRIBING_ENABLED).toBeUndefined();
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "unset-key-1" });

    expect(response.status).toBe(403);
    expectNothingWritten(repositories);
  });

  it("accepts only the exact string true, which is the control for the eleven denials above", async () => {
    enable("prescribing");
    expect(readCareClinicalCapabilityFlags().prescribing).toBe(true);
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "canonical-key-1" });

    // The gate opened, the handler ran, and the tripwire repository threw,
    // which the route converts to a safe 503. Not a 403.
    expect(response.status).toBe(503);
    expect(repositories.prescriptions.sign).toHaveBeenCalledTimes(1);
  });
});

describe("adversarial: an unknown operation is denied with all five flags on", () => {
  const UNKNOWN_OPERATIONS = [
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
    "PRESCRIPTION.SIGN",
    "prescription.create_draft ",
    " prescription.sign",
    "prescription.sign\n",
    "",
  ] as const;

  it.each(UNKNOWN_OPERATIONS.map((operation) => [operation] as const))(
    "refuses the operation %j even with every capability enabled",
    (operation) => {
      const decision = evaluateCareClinicalWrite({ operation }, ALL_ON);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("unknown_operation");
      expect(decision.capability).toBeNull();
    },
  );

  it("never runs the work for an unknown operation, even with every capability enabled", async () => {
    enable(...CARE_CLINICAL_CAPABILITIES);
    const work = vi.fn(async () => "written");

    await expect(
      runCareClinicalWrite({ operation: "__proto__" }, work),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);
    await expect(
      runCareClinicalWrite({ operation: "constructor" }, work),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);
    expect(work).not.toHaveBeenCalled();
  });

  it("refuses an unknown review action with every capability enabled", async () => {
    enable(...CARE_CLINICAL_CAPABILITIES);
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "approve_everything", expectedVersion: 0, idempotencyKey: "unknown-action-1" });

    // A request naming an action outside the closed set is malformed rather
    // than blocked by a capability, so it answers 400. It still never reaches
    // the repository, which is the property under test.
    expect(response.status).toBe(400);
    expect(repositories.appointments.applyReviewAction).not.toHaveBeenCalled();
  });
});

describe("adversarial: capability downgrade on review.action", () => {
  // The review action resolves its capability per action. Turning on the one
  // capability an attacker can most plausibly get (outbound communication)
  // must not open the provider decision actions.
  const PROVIDER_ACTIONS = ["review", "follow_up", "approve", "decline", "no_treatment"] as const;

  it.each(PROVIDER_ACTIONS.map((action) => [action] as const))(
    "refuses %s when only external_communications is enabled",
    async (action) => {
      enable("external_communications");
      const { app, repositories } = productionShapedApp();
      const response = await request(app)
        .post(`/api/care/reviews/${REVIEW}/action`)
        .send({ action, expectedVersion: 0, idempotencyKey: `downgrade-${action}` });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
      expect(response.body.capability).toBe("provider_actions");
      expectNothingWritten(repositories);
    },
  );

  it("refuses request_labs when only external_communications is enabled", async () => {
    enable("external_communications");
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "request_labs", expectedVersion: 0, idempotencyKey: "downgrade-labs" });

    expect(response.status).toBe(403);
    expect(response.body.capability).toBe("clinical_fulfillment");
    expectNothingWritten(repositories);
  });

  it("lets exactly the one action external_communications maps to through, which proves the flag was live", async () => {
    enable("external_communications");
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "request_information", expectedVersion: 0, idempotencyKey: "downgrade-info" });

    expect(response.status).toBe(503);
    expect(repositories.appointments.applyReviewAction).toHaveBeenCalledTimes(1);
  });
});

describe("adversarial: a forged capability claim in the request is ignored", () => {
  // Four vectors, named together so none of them is quietly dropped later:
  // headers, body, query, and path. The capability comes from the deployment
  // environment and from nowhere else, so a caller cannot assert it.
  const FORGED_HEADERS = {
    "x-care-capability": "prescribing",
    "x-care-flags": JSON.stringify(ALL_ON),
    "x-care-clinical-capability": "prescribing",
    CARE_PRESCRIBING_ENABLED: "true",
    "care-prescribing-enabled": "true",
  } as const;

  it("ignores a capability claimed in request headers", async () => {
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .set(FORGED_HEADERS)
      .send({ expectedVersion: 0, idempotencyKey: "forged-headers-1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expect(response.body.capability).toBe("prescribing");
    expectNothingWritten(repositories);
  });

  it("ignores a capability claimed in the request body", async () => {
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({
        expectedVersion: 0,
        idempotencyKey: "forged-body-1",
        capability: "prescribing",
        capabilities: ALL_ON,
        flags: ALL_ON,
        CARE_PRESCRIBING_ENABLED: "true",
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expectNothingWritten(repositories);
  });

  it("ignores a capability claimed in the query string", async () => {
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(
        `/api/care/prescriptions/${PRESCRIPTION}/sign?capability=prescribing&CARE_PRESCRIBING_ENABLED=true&flags[prescribing]=true`,
      )
      .send({ expectedVersion: 0, idempotencyKey: "forged-query-1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expectNothingWritten(repositories);
  });

  it("ignores a capability claimed in the path", async () => {
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post("/api/care/prescriptions/CARE_PRESCRIBING_ENABLED=true/sign")
      .send({ expectedVersion: 0, idempotencyKey: "forged-path-1" });

    // 403 and not 400 also proves the ordering: the clinical gate refuses
    // before the handler ever validates the identifier.
    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expectNothingWritten(repositories);
  });

  it("ignores headers, body, query, and path claimed all at once", async () => {
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(
        "/api/care/prescriptions/CARE_PRESCRIBING_ENABLED=true/sign?CARE_PRESCRIBING_ENABLED=true",
      )
      .set(FORGED_HEADERS)
      .send({
        expectedVersion: 0,
        idempotencyKey: "forged-all-1",
        flags: ALL_ON,
        CARE_PRESCRIBING_ENABLED: "true",
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expectNothingWritten(repositories);
    expect(process.env.CARE_PRESCRIBING_ENABLED).toBeUndefined();
  });

  it("ignores a forged review action capability supplied beside the real action", async () => {
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .set({ "x-care-capability": "provider_actions" })
      .send({
        action: "approve",
        expectedVersion: 0,
        idempotencyKey: "forged-review-1",
        capability: "provider_actions",
      });

    expect(response.status).toBe(403);
    expect(response.body.capability).toBe("provider_actions");
    expectNothingWritten(repositories);
  });
});

describe("adversarial: a forged flag object cannot open the gate", () => {
  it("refuses a flag object carrying the capability only on its prototype", () => {
    const inherited = Object.create({ prescribing: true }) as CareClinicalCapabilityFlags;

    expect(inherited.prescribing).toBe(true);
    expect(
      evaluateCareClinicalWrite({ operation: "prescription.sign" }, inherited).allowed,
    ).toBe(false);
  });

  it("refuses a flag object built from a __proto__ payload", () => {
    const payload = JSON.parse('{"__proto__":{"prescribing":true}}') as CareClinicalCapabilityFlags;

    expect(
      evaluateCareClinicalWrite({ operation: "prescription.sign" }, payload).allowed,
    ).toBe(false);
  });

  it("refuses a flag object built from a constructor.prototype payload", () => {
    const payload = JSON.parse(
      '{"constructor":{"prototype":{"prescribing":true}}}',
    ) as CareClinicalCapabilityFlags;

    expect(
      evaluateCareClinicalWrite({ operation: "prescription.sign" }, payload).allowed,
    ).toBe(false);
  });

  it("keeps every capability off even when Object.prototype itself is polluted", () => {
    const polluted = Object.prototype as unknown as Record<string, unknown>;
    try {
      for (const capability of CARE_CLINICAL_CAPABILITIES) {
        polluted[capability] = true;
      }
      const flags = readCareClinicalCapabilityFlags({} as NodeJS.ProcessEnv);
      for (const capability of CARE_CLINICAL_CAPABILITIES) {
        expect(Object.prototype.hasOwnProperty.call(flags, capability)).toBe(true);
        expect(flags[capability]).toBe(false);
      }
      expect(
        evaluateCareClinicalWrite({ operation: "prescription.sign" }, flags).allowed,
      ).toBe(false);
    } finally {
      for (const capability of CARE_CLINICAL_CAPABILITIES) {
        delete polluted[capability];
      }
    }
  });

  /** One operation that depends on each of the five capabilities, and nothing else. */
  const OPERATION_FOR_CAPABILITY: Readonly<
    Record<CareClinicalCapability, { operation: string; reviewAction?: string }>
  > = {
    prescribing: { operation: "prescription.sign" },
    clinical_fulfillment: { operation: "pharmacy.order_action" },
    real_patient_data: { operation: "intake.submit" },
    provider_actions: { operation: "appointment.clinician_complete" },
    external_communications: {
      operation: "review.action",
      reviewAction: "request_information",
    },
  };

  it.each(
    CARE_CLINICAL_CAPABILITIES.map((capability) => [capability] as const),
  )("refuses a flag object missing %s entirely", (capability) => {
    const partial = { ...ALL_ON } as Record<string, boolean>;
    delete partial[capability];
    const decision = evaluateCareClinicalWrite(
      OPERATION_FOR_CAPABILITY[capability],
      partial as unknown as CareClinicalCapabilityFlags,
    );

    expect(decision.capability).toBe(capability);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("capability_disabled");
  });

  it.each(
    CARE_CLINICAL_CAPABILITIES.map((capability) => [capability] as const),
  )("allows the same operation once %s is present and true, so the case above is not vacuous", (capability) => {
    const decision = evaluateCareClinicalWrite(
      OPERATION_FOR_CAPABILITY[capability],
      ALL_ON,
    );

    expect(decision.capability).toBe(capability);
    expect(decision.allowed).toBe(true);
  });

  const TRUTHY_NOT_TRUE = [
    ["the string true", "true"],
    ["the string TRUE", "TRUE"],
    ["the numeral one", 1],
    ["a non empty object", {}],
    ["a non empty array", [1]],
    ["a truthy string", "yes"],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a boxed Boolean", new Boolean(true)],
  ] as const;

  it.each(TRUTHY_NOT_TRUE.map(([label, value]) => [label, value] as const))(
    "refuses when the flag is %s rather than the boolean true",
    (_label, value) => {
      const flags = { ...ALL_ON, prescribing: value } as unknown as CareClinicalCapabilityFlags;
      const decision = evaluateCareClinicalWrite({ operation: "prescription.sign" }, flags);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("capability_disabled");
      expect(decision.capability).toBe("prescribing");
    },
  );
});

describe("adversarial: the disabled outbound communication path", () => {
  // `external_communications` is one of the canonical five, and
  // CARE_REVIEW_ACTION_CAPABILITY maps request_information to it. With it off,
  // the notification path must refuse, write nothing, and dispatch nothing.
  it("refuses request_information with external_communications off and the other four ON", async () => {
    enable(...everyCapabilityExcept("external_communications"));
    const { app, repositories } = productionShapedApp();
    const response = await request(app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({
        action: "request_information",
        expectedVersion: 0,
        idempotencyKey: "outbound-key-1",
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expect(response.body.capability).toBe("external_communications");
    // Not passing for the wrong reason: everything except the outbound flag is on.
    for (const capability of everyCapabilityExcept("external_communications")) {
      expect(readCareClinicalCapabilityFlags()[capability]).toBe(true);
    }
    expect(readCareClinicalCapabilityFlags().external_communications).toBe(false);
    expectNothingWritten(repositories);
  });

  it("dispatches nothing on the background outbound path with external_communications off and the other four ON", async () => {
    enable(...everyCapabilityExcept("external_communications"));
    const dispatch = vi.fn(async () => "sent to the patient");

    await expect(
      runCareClinicalWrite(
        { operation: "review.action", reviewAction: "request_information" },
        dispatch,
      ),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("turns the same outbound path on when external_communications alone is enabled, which proves the case above was not vacuous", async () => {
    enable("external_communications");
    const dispatch = vi.fn(async () => "sent to the patient");

    await expect(
      runCareClinicalWrite(
        { operation: "review.action", reviewAction: "request_information" },
        dispatch,
      ),
    ).resolves.toBe("sent to the patient");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("adversarial: a failing audit sink cannot convert a refusal into an allow", () => {
  it("still refuses on the Express middleware when the audit sink throws", async () => {
    const repositories = tripwireRepositories();
    const app = express();
    app.use(express.json());
    registerCarePrescriptionApi(
      app,
      access(),
      repositories.prescriptions,
      clock,
      {
        recordRefusal: () => {
          throw new Error("audit sink unavailable");
        },
      },
    );

    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "audit-throw-key-1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expectNothingWritten(repositories);
  });

  it("still refuses every clinical write on the Express middleware when the audit sink throws", async () => {
    const repositories = tripwireRepositories();
    const app = express();
    app.use(express.json());
    const gate = {
      recordRefusal: () => {
        throw new Error("audit sink unavailable");
      },
    };
    const deps = access();
    registerCareIntakeApi(app, deps, repositories.eligibility, repositories.intakes, clock, gate);
    registerCareAppointmentApi(app, deps, repositories.appointments, clock, repositories.reviews, gate);
    registerCarePrescriptionApi(app, deps, repositories.prescriptions, clock, gate);

    const responses = await Promise.all(
      CLINICAL_WRITES.map((route) => route.call(app)),
    );

    expect(responses.map((response) => response.status)).toEqual(
      new Array(16).fill(403),
    );
    expectNothingWritten(repositories);
  });

  it("still refuses on runCareClinicalWrite when the audit sink throws", async () => {
    const work = vi.fn(async () => "written");

    await expect(
      runCareClinicalWrite({ operation: "prescription.sign" }, work, {
        recordRefusal: () => {
          throw new Error("audit sink unavailable");
        },
      }),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);
    expect(work).not.toHaveBeenCalled();
  });

  it("still refuses when the default console audit sink itself throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("stderr unavailable");
    });
    const work = vi.fn(async () => "written");

    await expect(
      runCareClinicalWrite({ operation: "prescription.sign" }, work),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);
    expect(work).not.toHaveBeenCalled();
  });

  it("records only bounded refusal metadata and no raw actor or clinical identifiers", async () => {
    const { app } = productionShapedApp();
    await request(app).post("/api/care/prescriptions").send(draftPayload);

    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("care_clinical_write_refused");
    for (const secret of [
      CLINICIAN,
      PATIENT,
      APPOINTMENT,
      INTAKE,
      REVIEW,
      PRESCRIPTION,
      ORDER,
      PHARMACY,
      "synthetic",
      draftPayload.idempotencyKey,
    ]) {
      expect(warned[0]).not.toContain(secret);
    }
    expect(warned[0]).not.toContain("actorSubjectId");
    expect(warned[0]).not.toContain("patientId");
    expect(warned[0]).not.toContain("appointmentId");
    expect(warned[0]).not.toContain("intakeId");
  });

  it("does not echo identifier-shaped unknown operation or action inputs", async () => {
    const maliciousInput = [
      CLINICIAN,
      PATIENT,
      APPOINTMENT,
      INTAKE,
      "actorSubjectId",
      "patientId",
      "appointmentId",
      "intakeId",
    ].join(":");
    const work = vi.fn(async () => "written");

    await expect(
      runCareClinicalWrite(
        { operation: maliciousInput, reviewAction: maliciousInput },
        work,
      ),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);

    expect(work).not.toHaveBeenCalled();
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('"operation":null');
    expect(warned[0]).toContain('"reviewAction":null');
    expect(warned[0]).not.toContain(maliciousInput);
    for (const identifier of [CLINICIAN, PATIENT, APPOINTMENT, INTAKE]) {
      expect(warned[0]).not.toContain(identifier);
    }
    expect(warned[0]).not.toContain("actorSubjectId");
    expect(warned[0]).not.toContain("patientId");
    expect(warned[0]).not.toContain("appointmentId");
    expect(warned[0]).not.toContain("intakeId");
  });
});

describe("adversarial: appointment capability boundaries", () => {
  const appointment = {
    id: APPOINTMENT,
    patientId: PATIENT,
    intakeId: INTAKE,
    assignedClinicianUserId: CLINICIAN,
    patientStateCode: "IL",
    status: "scheduled",
    startsAt: NOW,
    endsAt: NOW,
    telehealthReady: true,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as CareAppointment;

  function workingApp() {
    const appointments = {
      listPatientAppointments: vi.fn(async () => [appointment]),
      loadReadiness: vi.fn(async () => ({}) as never),
      requestAppointment: vi.fn(async () => appointment),
      patientAction: vi.fn(async () => appointment),
      assignClinician: vi.fn(async () => appointment),
      scheduleAppointment: vi.fn(async () => appointment),
      adminMarkNoShow: vi.fn(async () => appointment),
      clinicianComplete: vi.fn(async () => appointment),
      listAssignedReviews: vi.fn(async () => []),
      applyReviewAction: vi.fn(async () => ({}) as never),
    } as unknown as CareAppointmentRepository;
    const eligibility = {
      loadContext: vi.fn(async () => ({}) as never),
      recordEligibilityDecision: vi.fn(async () => undefined),
      recordLocation: vi.fn(async () => undefined),
      changeWaitlist: vi.fn(async () => ({ id: ORDER }) as never),
      recordConsent: vi.fn(async () => ({ id: ORDER }) as never),
    } as unknown as CareEligibilityRepository;
    const app = express();
    app.use(express.json());
    const deps = access();
    registerCareEligibilityApi(app, deps, eligibility, clock);
    registerCareAppointmentApi(app, deps, appointments, clock, tripwireRepositories().reviews);
    return { app, appointments, eligibility };
  }

  const schedule = (app: express.Express, suffix: string) =>
    request(app)
      .post(`/api/care/appointments/${APPOINTMENT}/schedule`)
      .send({
        expectedVersion: 0,
        providerKey: "tebra",
        providerSessionReference: "tebra-session-reference-0001",
        startsAt: NOW,
        endsAt: NOW,
        idempotencyKey: `tebra-key-${suffix}`,
      });

  it("refuses the external scheduling handoff with all five flags off", async () => {
    const { app, appointments } = workingApp();
    const response = await schedule(app, "off");

    for (const capability of CARE_CLINICAL_CAPABILITIES) {
      expect(readCareClinicalCapabilityFlags()[capability]).toBe(false);
    }
    expect(response.status).toBe(403);
    expect(response.body.requiredCapabilities).toEqual([
      "provider_actions",
      "external_communications",
    ]);
    expect(response.body.missingCapabilities).toEqual([
      "provider_actions",
      "external_communications",
    ]);
    expect(appointments.scheduleAppointment).not.toHaveBeenCalled();
  });

  it("requires provider actions and external communications independently", async () => {
    enable("provider_actions");
    const providerOnly = workingApp();
    const providerOnlyResponse = await schedule(providerOnly.app, "provider-only");
    expect(providerOnlyResponse.status).toBe(403);
    expect(providerOnlyResponse.body.missingCapabilities).toEqual([
      "external_communications",
    ]);
    expect(providerOnly.appointments.scheduleAppointment).not.toHaveBeenCalled();

    delete process.env.CARE_PROVIDER_ACTIONS_ENABLED;
    enable("external_communications");
    const communicationOnly = workingApp();
    const communicationOnlyResponse = await schedule(
      communicationOnly.app,
      "communication-only",
    );
    expect(communicationOnlyResponse.status).toBe(403);
    expect(communicationOnlyResponse.body.missingCapabilities).toEqual([
      "provider_actions",
    ]);
    expect(communicationOnly.appointments.scheduleAppointment).not.toHaveBeenCalled();
  });

  it("reaches the scheduling repository only when both required capabilities are exact true", async () => {
    enable("provider_actions", "external_communications");
    const { app, appointments } = workingApp();
    const response = await schedule(app, "both-on");

    expect(response.status).toBe(200);
    expect(appointments.scheduleAppointment).toHaveBeenCalledTimes(1);
    expect(appointments.scheduleAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: "tebra",
        providerSessionReference: "tebra-session-reference-0001",
      }),
    );
  });

  it("refuses every other appointment mutation with all five flags off", async () => {
    const { app, appointments } = workingApp();
    const slot = await request(app)
      .post("/api/care/appointments")
      .send({ intakeId: INTAKE, idempotencyKey: "nonclinical-key-1" });
    const cancel = await request(app)
      .post(`/api/care/appointments/${APPOINTMENT}/action`)
      .send({ action: "cancel", expectedVersion: 0, idempotencyKey: "nonclinical-key-2" });
    const assign = await request(app)
      .post(`/api/care/appointments/${APPOINTMENT}/assign`)
      .send({ clinicianUserId: CLINICIAN_TARGET, idempotencyKey: "nonclinical-key-3" });
    const noShow = await request(app)
      .post(`/api/care/appointments/${APPOINTMENT}/no-show`)
      .send({ expectedVersion: 0, idempotencyKey: "nonclinical-key-4" });

    expect([slot.status, cancel.status, assign.status, noShow.status]).toEqual([
      403, 403, 403, 403,
    ]);
    expect(appointments.requestAppointment).not.toHaveBeenCalled();
    expect(appointments.patientAction).not.toHaveBeenCalled();
    expect(appointments.assignClinician).not.toHaveBeenCalled();
    expect(appointments.adminMarkNoShow).not.toHaveBeenCalled();
  });

  it("lets request, cancel, and check-in use real patient data alone because the current path has no dispatcher", async () => {
    enable("real_patient_data");
    const { app, appointments } = workingApp();
    const slot = await request(app)
      .post("/api/care/appointments")
      .send({ intakeId: INTAKE, idempotencyKey: "patient-only-key-1" });
    const cancel = await request(app)
      .post(`/api/care/appointments/${APPOINTMENT}/action`)
      .send({ action: "cancel", expectedVersion: 0, idempotencyKey: "patient-only-key-2" });
    const checkIn = await request(app)
      .post(`/api/care/appointments/${APPOINTMENT}/action`)
      .send({ action: "check_in", expectedVersion: 0, idempotencyKey: "patient-only-key-3" });

    expect(readCareClinicalCapabilityFlags().external_communications).toBe(false);
    expect([slot.status, cancel.status, checkIn.status]).toEqual([201, 200, 200]);
    expect(appointments.requestAppointment).toHaveBeenCalledTimes(1);
    expect(appointments.patientAction).toHaveBeenCalledTimes(2);
  });

  it("lets a person revoke a consent with all five flags off", async () => {
    const { app, eligibility } = workingApp();
    const response = await request(app).post("/api/care/consents").send({
      kind: "telehealth",
      documentVersion: "v1",
      action: "revoked",
      idempotencyKey: "consent-revoke-key-1",
    });

    expect(response.status).toBe(201);
    expect(eligibility.recordConsent).toHaveBeenCalledTimes(1);
  });

  it("keeps the eligibility location write reaching its repository with all five flags off", async () => {
    const { app, eligibility } = workingApp();
    const response = await request(app)
      .post("/api/care/eligibility/location")
      .send({ stateCode: "IL", source: "patient_attestation", idempotencyKey: "eligibility-key-1" });

    expect(response.status).not.toBe(403);
    expect(eligibility.recordLocation).toHaveBeenCalledTimes(1);
  });
});

describe("adversarial: the two gates beneath this one still run first", () => {
  it("refuses a wrong role with care_forbidden, never with the clinical code", async () => {
    const { app, repositories } = productionShapedApp(["care_patient"], PATIENT);
    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "wrong-role-key-1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("care_forbidden");
    expect(response.body.code).not.toBe(CARE_CLINICAL_REFUSED_CODE);
    expectNothingWritten(repositories);
  });

  it("refuses with care_disabled when Care itself is off, even with all five flags on", async () => {
    enable(...CARE_CLINICAL_CAPABILITIES);
    const repositories = tripwireRepositories();
    const deps = access();
    deps.loadCapabilityStatus = vi.fn(async () => ({
      rail: "care" as const,
      state: "pending_qa" as const,
      enabled: false,
      publicMessage: "Care is being prepared.",
      checkedAt: NOW,
    }));
    const app = express();
    app.use(express.json());
    registerCarePrescriptionApi(app, deps, repositories.prescriptions, clock);

    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "care-off-key-1" });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
    expectNothingWritten(repositories);
  });
});

describe("adversarial: one guard, both shapes, every operation", () => {
  it("exposes the operation it gates on the middleware it returns", () => {
    const middleware = requireCareClinicalCapability("prescription.sign");

    expect(middleware.careClinicalOperation).toBe("prescription.sign");
  });

  it("refuses every named clinical operation on the background shape with all five flags unset", async () => {
    const work = vi.fn(async () => "written");
    for (const operation of CARE_CLINICAL_OPERATIONS) {
      const input =
        operation === "review.action"
          ? { operation, reviewAction: "approve" }
          : { operation };
      await expect(runCareClinicalWrite(input, work)).rejects.toBeInstanceOf(
        CareClinicalCapabilityDisabledError,
      );
    }
    expect(work).not.toHaveBeenCalled();
  });

  it("allows every named clinical operation on the background shape once all five flags are the exact string true", async () => {
    enable(...CARE_CLINICAL_CAPABILITIES);
    const work = vi.fn(async () => "written");
    for (const operation of CARE_CLINICAL_OPERATIONS) {
      const input =
        operation === "review.action"
          ? { operation, reviewAction: "approve" }
          : { operation };
      await expect(runCareClinicalWrite(input, work)).resolves.toBe("written");
    }
    expect(work).toHaveBeenCalledTimes(CARE_CLINICAL_OPERATIONS.length);
  });
});
