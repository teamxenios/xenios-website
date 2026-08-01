import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  CARE_CLINICAL_CAPABILITIES_DISABLED,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import type { CareAppointment } from "@shared/care/appointments";
import type { CareRecordId, CareRole } from "@shared/care/contracts";
import type { CareClinicalIntake } from "@shared/care/intake";
import type { CarePharmacyOrder, CarePrescription } from "@shared/care/prescriptions";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import {
  CARE_CLINICAL_OPERATIONS,
  CARE_CLINICAL_REFUSED_CODE,
  CareClinicalCapabilityDisabledError,
  careClinicalOperationCapability,
  evaluateCareClinicalWrite,
  runCareClinicalWrite,
  type CareClinicalRefusalEvent,
} from "./clinical-write-gate";
import type { CareEligibilityRepository } from "./eligibility-repository";
import { registerCareEligibilityApi } from "./eligibility-routes";
import type { CareIntakeRepository } from "./intake-repository";
import { registerCareIntakeApi } from "./intake-routes";
import type { CarePrescriptionRepository } from "./prescription-repository";
import { registerCarePrescriptionApi } from "./prescription-routes";
import { readCareClinicalCapabilityFlags } from "./review-detail";

// Synthetic identifiers only. Nothing here names a real person, a real
// clinician, a real pharmacy, or any real clinical content.
const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const CLINICIAN = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const OPERATOR = "44444444-4444-4444-8444-444444444444";
const PRESCRIPTION = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const REVIEW = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const ORDER = "77777777-7777-4777-8777-777777777777" as CareRecordId;
const PHARMACY = "88888888-8888-4888-8888-888888888888" as CareRecordId;
const APPOINTMENT = "99999999-9999-4999-8999-999999999999" as CareRecordId;
const INTAKE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CareRecordId;
const DEFINITION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as CareRecordId;
const CONSENT_EVENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as CareRecordId;
const NOW = "2026-08-01T20:00:00.000Z";

const ALL_OFF: CareClinicalCapabilityFlags = CARE_CLINICAL_CAPABILITIES_DISABLED;
const ALL_ON: CareClinicalCapabilityFlags = {
  provider_actions: true,
  prescribing: true,
  clinical_fulfillment: true,
  external_communications: true,
  real_patient_data: true,
};

function access(roles: readonly CareRole[], subjectId: string): CareAccessDependencies {
  return {
    // Gate two, the Care capability status, is deliberately OPEN in these
    // cases. That isolates the new third gate: anything refused below is
    // refused by the clinical capability flag and by nothing else.
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

const appointment: CareAppointment = {
  id: APPOINTMENT,
  patientId: PATIENT,
  intakeId: INTAKE,
  assignedClinicianUserId: CLINICIAN,
  patientStateCode: "IL",
  status: "completed",
  startsAt: NOW,
  endsAt: NOW,
  telehealthReady: true,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as CareAppointment;

function appointmentRepo(): CareAppointmentRepository {
  return {
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
}

const prescription: CarePrescription = {
  id: PRESCRIPTION,
  patientId: PATIENT,
  appointmentId: APPOINTMENT,
  clinicianReviewId: REVIEW,
  prescribingClinicianUserId: CLINICIAN,
  status: "draft",
  formulation: "synthetic",
  concentration: "synthetic",
  route: "synthetic",
  quantity: "synthetic",
  directions: "synthetic",
  refills: 0,
  verifiedContentSourceId: REVIEW,
  version: 0,
  signedAt: null,
  supersedesPrescriptionId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const order: CarePharmacyOrder = {
  id: ORDER,
  patientId: PATIENT,
  prescriptionId: PRESCRIPTION,
  assignedPharmacyId: PHARMACY,
  patientStateCode: "IL",
  status: "pending_pharmacy",
  clarificationOpen: false,
  trackingReferencePresent: false,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

function prescriptionRepo(): CarePrescriptionRepository {
  return {
    listPatientPrescriptions: vi.fn(async () => [prescription]),
    listAssignedPharmacyOrders: vi.fn(async () => [order]),
    loadReadiness: vi.fn(async () => ({}) as never),
    createDraft: vi.fn(async () => prescription),
    sign: vi.fn(async () => prescription),
    assignPharmacy: vi.fn(async () => order),
    pharmacyAction: vi.fn(async () => order),
    resolveClarification: vi.fn(async () => order),
  } as unknown as CarePrescriptionRepository;
}

const intake: CareClinicalIntake = {
  id: INTAKE,
  patientId: PATIENT,
  definitionId: DEFINITION,
  definitionVersion: 1,
  status: "draft",
  version: 0,
  telehealthConsentEventId: CONSENT_EVENT,
  privacyConsentEventId: CONSENT_EVENT,
  createdAt: NOW,
  submittedAt: null,
} as unknown as CareClinicalIntake;

function intakeRepo(): CareIntakeRepository {
  return {
    loadCurrentIntake: vi.fn(async () => intake),
    loadApprovedDefinition: vi.fn(async () => null),
    loadLatestRevision: vi.fn(async () => null),
    startIntake: vi.fn(async () => intake),
    autosave: vi.fn(async () => ({}) as never),
    submit: vi.fn(async () => intake),
  } as unknown as CareIntakeRepository;
}

function eligibilityRepo(): CareEligibilityRepository {
  return {
    loadContext: vi.fn(async () => ({}) as never),
    recordEligibilityDecision: vi.fn(async () => undefined),
    recordLocation: vi.fn(async () => undefined),
    changeWaitlist: vi.fn(async () => ({}) as never),
    recordConsent: vi.fn(async () => ({}) as never),
  } as unknown as CareEligibilityRepository;
}

interface Harness {
  app: express.Express;
  appointments: CareAppointmentRepository;
  prescriptions: CarePrescriptionRepository;
  intakes: CareIntakeRepository;
  eligibility: CareEligibilityRepository;
  refusals: CareClinicalRefusalEvent[];
}

/**
 * One app with every Care route module registered, so a crafted request can
 * be aimed at any of them. `flags` is the ONLY thing that varies between the
 * refusal cases and the success case.
 */
function harness(
  flags: CareClinicalCapabilityFlags,
  roles: readonly CareRole[] = ["care_patient", "clinician", "clinical_admin", "pharmacy_operations"],
  subjectId = CLINICIAN,
): Harness {
  const refusals: CareClinicalRefusalEvent[] = [];
  const gate = {
    readFlags: () => flags,
    recordRefusal: (event: CareClinicalRefusalEvent) => refusals.push(event),
    now: () => new Date(NOW),
  };
  const app = express();
  app.use(express.json());
  const deps = access(roles, subjectId);
  const appointments = appointmentRepo();
  const prescriptions = prescriptionRepo();
  const intakes = intakeRepo();
  const eligibility = eligibilityRepo();
  const clock = () => new Date(NOW);
  registerCareEligibilityApi(app, deps, eligibility, clock);
  registerCareIntakeApi(app, deps, eligibility, intakes, clock, gate);
  registerCareAppointmentApi(app, deps, appointments, clock, undefined, gate);
  registerCarePrescriptionApi(app, deps, prescriptions, clock, gate);
  return { app, appointments, prescriptions, intakes, eligibility, refusals };
}

describe("Care clinical write chokepoint", () => {
  // 1. A read that would return real patient clinical content.
  it("refuses a clinical read while real patient data is disabled, and reads nothing", async () => {
    const h = harness(ALL_OFF);
    const intakeRead = await request(h.app).get("/api/care/intake");
    const prescriptionRead = await request(h.app).get("/api/care/prescriptions");

    expect(intakeRead.status).toBe(403);
    expect(intakeRead.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expect(intakeRead.body.capability).toBe("real_patient_data");
    expect(prescriptionRead.status).toBe(403);
    expect(h.intakes.loadCurrentIntake).not.toHaveBeenCalled();
    expect(h.intakes.loadApprovedDefinition).not.toHaveBeenCalled();
    expect(h.prescriptions.listPatientPrescriptions).not.toHaveBeenCalled();
  });

  // 2. Approve.
  it("refuses an approve decision while provider actions are disabled, and writes nothing", async () => {
    const h = harness(ALL_OFF);
    const response = await request(h.app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "approve", expectedVersion: 0, idempotencyKey: "approve-key-1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expect(response.body.capability).toBe("provider_actions");
    expect(h.appointments.applyReviewAction).not.toHaveBeenCalled();
  });

  // 3. Decline.
  it("refuses a decline decision while provider actions are disabled, and writes nothing", async () => {
    const h = harness(ALL_OFF);
    const response = await request(h.app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "decline", expectedVersion: 0, idempotencyKey: "decline-key-1" });

    expect(response.status).toBe(403);
    expect(response.body.capability).toBe("provider_actions");
    expect(h.appointments.applyReviewAction).not.toHaveBeenCalled();
  });

  // 4. A crafted request straight at the API, with no browser involved at all.
  it("refuses every clinical write aimed directly at the API, and writes nothing", async () => {
    const h = harness(ALL_OFF);
    const attempts = [
      request(h.app).post("/api/care/intake").send({ idempotencyKey: "direct-key-01" }),
      request(h.app)
        .patch(`/api/care/intake/${INTAKE}/autosave`)
        .send({ expectedVersion: 0, responses: {}, idempotencyKey: "direct-key-02" }),
      request(h.app)
        .post(`/api/care/intake/${INTAKE}/submit`)
        .send({ expectedVersion: 0, idempotencyKey: "direct-key-03" }),
      request(h.app)
        .post(`/api/care/appointments/${APPOINTMENT}/complete`)
        .send({ expectedVersion: 0, idempotencyKey: "direct-key-04" }),
      request(h.app).post("/api/care/prescriptions").send({
        patientId: PATIENT,
        reviewId: REVIEW,
        formulation: "synthetic",
        concentration: "synthetic",
        route: "synthetic",
        quantity: "synthetic",
        directions: "synthetic",
        refills: 0,
        idempotencyKey: "direct-key-05",
      }),
      request(h.app)
        .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
        .send({ expectedVersion: 0, idempotencyKey: "direct-key-06" }),
      request(h.app)
        .post(`/api/care/pharmacy/admin/prescriptions/${PRESCRIPTION}/assign`)
        .send({ pharmacyId: PHARMACY, idempotencyKey: "direct-key-07" }),
      request(h.app)
        .post(`/api/care/pharmacy/orders/${ORDER}/action`)
        .send({ action: "dispense", expectedVersion: 0, idempotencyKey: "direct-key-08" }),
      request(h.app)
        .post(`/api/care/prescriptions/pharmacy-orders/${ORDER}/clarification/resolve`)
        .send({ expectedVersion: 0, resolutionReference: "synthetic", idempotencyKey: "direct-key-09" }),
      request(h.app)
        .post(`/api/care/pharmacy/admin/orders/${ORDER}/clarification/resolve`)
        .send({ expectedVersion: 0, resolutionReference: "synthetic", idempotencyKey: "direct-key-10" }),
    ];
    const responses = await Promise.all(attempts);

    expect(responses).toHaveLength(10);
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    }
    expect(h.intakes.startIntake).not.toHaveBeenCalled();
    expect(h.intakes.autosave).not.toHaveBeenCalled();
    expect(h.intakes.submit).not.toHaveBeenCalled();
    expect(h.appointments.clinicianComplete).not.toHaveBeenCalled();
    expect(h.prescriptions.createDraft).not.toHaveBeenCalled();
    expect(h.prescriptions.sign).not.toHaveBeenCalled();
    expect(h.prescriptions.assignPharmacy).not.toHaveBeenCalled();
    expect(h.prescriptions.pharmacyAction).not.toHaveBeenCalled();
    expect(h.prescriptions.resolveClarification).not.toHaveBeenCalled();
  });

  // 5. A background or async caller, with no HTTP request behind it.
  it("refuses a background clinical mutation and never runs the work", async () => {
    const refusals: CareClinicalRefusalEvent[] = [];
    const repository = prescriptionRepo();
    // Stands in for any non-HTTP caller: a job, a queue consumer, a
    // reconciliation pass. There is no Care background job today, so this
    // proves the seam a future one has to use.
    const backgroundSign = () =>
      runCareClinicalWrite(
        { operation: "prescription.sign", actorSubjectId: null },
        () =>
          repository.sign({
            prescriptionId: PRESCRIPTION,
            clinicianUserId: CLINICIAN,
            expectedVersion: 0,
            idempotencyKey: "background-key-1",
            occurredAt: NOW,
          }),
        { readFlags: () => ALL_OFF, recordRefusal: (e) => refusals.push(e), now: () => new Date(NOW) },
      );

    await expect(backgroundSign()).rejects.toBeInstanceOf(
      CareClinicalCapabilityDisabledError,
    );
    expect(repository.sign).not.toHaveBeenCalled();
    expect(refusals).toEqual([
      {
        operation: "prescription.sign",
        reviewAction: null,
        capability: "prescribing",
        reason: "capability_disabled",
        actorSubjectId: null,
        surface: "background",
        occurredAt: NOW,
      },
    ]);
  });

  // 6. The authorized, enabled path still works.
  it("carries out an authorized clinical write once the capability is enabled", async () => {
    const h = harness(ALL_ON);
    const approve = await request(h.app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "approve", expectedVersion: 0, idempotencyKey: "enabled-key-1" });
    const sign = await request(h.app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "enabled-key-2" });

    expect(approve.status).toBe(200);
    expect(sign.status).toBe(200);
    expect(h.appointments.applyReviewAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approve", clinicianUserId: CLINICIAN }),
    );
    expect(h.prescriptions.sign).toHaveBeenCalledTimes(1);
    expect(h.refusals).toEqual([]);
  });

  // 7. The permission gate is untouched and still runs first.
  it("refuses an unauthorized role before the capability gate is even consulted", async () => {
    const h = harness(ALL_ON, ["care_patient"], PATIENT);
    const approve = await request(h.app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "approve", expectedVersion: 0, idempotencyKey: "role-key-1" });
    const sign = await request(h.app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "role-key-2" });

    expect(approve.status).toBe(403);
    expect(approve.body.code).toBe("care_forbidden");
    expect(sign.status).toBe(403);
    expect(sign.body.code).toBe("care_forbidden");
    expect(h.appointments.applyReviewAction).not.toHaveBeenCalled();
    expect(h.prescriptions.sign).not.toHaveBeenCalled();
    // Refused by the permission gate, so the capability gate never spoke.
    expect(h.refusals).toEqual([]);
  });

  // 8. Every refusal is recorded, and the record carries no clinical content.
  it("records an audit event on refusal that carries no patient or clinical content", async () => {
    const h = harness(ALL_OFF);
    await request(h.app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "request_information", expectedVersion: 0, idempotencyKey: "audit-key-1" });
    await request(h.app)
      .post("/api/care/prescriptions")
      .send({
        patientId: PATIENT,
        reviewId: REVIEW,
        formulation: "synthetic",
        concentration: "synthetic",
        route: "synthetic",
        quantity: "synthetic",
        directions: "synthetic",
        refills: 0,
        idempotencyKey: "audit-key-2",
      });

    expect(h.refusals).toEqual([
      {
        operation: "review.action",
        reviewAction: "request_information",
        capability: "external_communications",
        reason: "capability_disabled",
        actorSubjectId: CLINICIAN,
        surface: "http",
        occurredAt: NOW,
      },
      {
        operation: "prescription.create_draft",
        reviewAction: null,
        capability: "prescribing",
        reason: "capability_disabled",
        actorSubjectId: CLINICIAN,
        surface: "http",
        occurredAt: NOW,
      },
    ]);
    const serialized = JSON.stringify(h.refusals);
    for (const secret of [PATIENT, REVIEW, "synthetic", "audit-key-1"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  // 9. A control the browser draws as disabled, attempted anyway.
  it("still refuses an action the browser renders as disabled when it is crafted by hand", async () => {
    // The read surface reports the action as unusable.
    const h = harness(ALL_OFF);
    const flags = ALL_OFF;
    expect(flags.provider_actions).toBe(false);

    // A caller that ignores the browser entirely and posts the action anyway,
    // with a well formed body and the correct clinician role, is still refused.
    const response = await request(h.app)
      .post(`/api/care/reviews/${REVIEW}/action`)
      .send({ action: "no_treatment", expectedVersion: 0, idempotencyKey: "crafted-key-1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(CARE_CLINICAL_REFUSED_CODE);
    expect(h.appointments.applyReviewAction).not.toHaveBeenCalled();
    expect(h.refusals.map((event) => event.reason)).toEqual(["capability_disabled"]);
  });
});

describe("Care clinical write chokepoint, failing closed", () => {
  it("refuses an operation that is not in the map", () => {
    const decision = evaluateCareClinicalWrite(
      { operation: "prescription.sign_but_sneakier" },
      ALL_ON,
    );
    expect(decision).toEqual({
      allowed: false,
      operation: "prescription.sign_but_sneakier",
      capability: null,
      reason: "unknown_operation",
    });
  });

  it("refuses a review action that is not a known clinician action", () => {
    const decision = evaluateCareClinicalWrite(
      { operation: "review.action", reviewAction: "approve_everything" },
      ALL_ON,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("unknown_review_action");
  });

  it("refuses a review action that is missing entirely", () => {
    expect(
      evaluateCareClinicalWrite({ operation: "review.action" }, ALL_ON).allowed,
    ).toBe(false);
  });

  it("refuses when a flag object is missing the capability", () => {
    const partial = { prescribing: true } as unknown as CareClinicalCapabilityFlags;
    expect(
      evaluateCareClinicalWrite({ operation: "intake.submit" }, partial).allowed,
    ).toBe(false);
  });

  it("treats a missing, empty, or mistyped environment value as off", () => {
    const off = ["", "TRUE", "True", "1", "yes", "true "];
    for (const value of off) {
      const flags = readCareClinicalCapabilityFlags({
        CARE_PRESCRIBING_ENABLED: value,
      } as NodeJS.ProcessEnv);
      expect(flags.prescribing).toBe(false);
      expect(
        evaluateCareClinicalWrite({ operation: "prescription.sign" }, flags).allowed,
      ).toBe(false);
    }
    const missing = readCareClinicalCapabilityFlags({} as NodeJS.ProcessEnv);
    expect(
      evaluateCareClinicalWrite({ operation: "prescription.sign" }, missing).allowed,
    ).toBe(false);
    const exact = readCareClinicalCapabilityFlags({
      CARE_PRESCRIBING_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(
      evaluateCareClinicalWrite({ operation: "prescription.sign" }, exact).allowed,
    ).toBe(true);
  });

  it("keeps a refusal a refusal even when the audit sink throws", async () => {
    const repository = prescriptionRepo();
    await expect(
      runCareClinicalWrite(
        { operation: "prescription.sign" },
        () => repository.sign({} as never),
        {
          readFlags: () => ALL_OFF,
          recordRefusal: () => {
            throw new Error("audit sink unavailable");
          },
        },
      ),
    ).rejects.toBeInstanceOf(CareClinicalCapabilityDisabledError);
    expect(repository.sign).not.toHaveBeenCalled();
  });

  it("maps every operation to one of the five named capabilities", () => {
    for (const operation of CARE_CLINICAL_OPERATIONS) {
      const capability = careClinicalOperationCapability(operation);
      if (operation === "review.action") {
        expect(capability).toBeNull();
        continue;
      }
      expect(Object.keys(ALL_ON)).toContain(capability);
    }
  });
});

describe("Care nonclinical routes stay usable with every clinical capability off", () => {
  it("keeps eligibility, waitlist, consent, and scheduling working", async () => {
    const h = harness(ALL_OFF);
    const slotRequest = await request(h.app)
      .post("/api/care/appointments")
      .send({ intakeId: INTAKE, idempotencyKey: "nonclinical-key-1" });
    const patientAction = await request(h.app)
      .post(`/api/care/appointments/${APPOINTMENT}/action`)
      .send({ action: "cancel", expectedVersion: 0, idempotencyKey: "nonclinical-key-2" });
    const assign = await request(h.app)
      .post(`/api/care/appointments/${APPOINTMENT}/assign`)
      .send({ clinicianUserId: ADMIN, idempotencyKey: "nonclinical-key-3" });
    const schedule = await request(h.app)
      .post(`/api/care/appointments/${APPOINTMENT}/schedule`)
      .send({
        expectedVersion: 0,
        providerKey: "synthetic-provider",
        providerSessionReference: "synthetic-session-reference",
        startsAt: NOW,
        endsAt: NOW,
        idempotencyKey: "nonclinical-key-4",
      });
    const noShow = await request(h.app)
      .post(`/api/care/appointments/${APPOINTMENT}/no-show`)
      .send({ expectedVersion: 0, idempotencyKey: "nonclinical-key-5" });
    const location = await request(h.app)
      .post("/api/care/eligibility/location")
      .send({ stateCode: "IL", source: "patient_attestation", idempotencyKey: "nonclinical-key-6" });

    expect(slotRequest.status).toBe(201);
    expect(patientAction.status).toBe(200);
    expect(assign.status).toBe(200);
    expect(schedule.status).toBe(200);
    expect(noShow.status).toBe(200);
    // The eligibility write reaches its handler. It answers 503 only because
    // this harness gives it a stub context, never because a clinical
    // capability refused it.
    expect(location.status).not.toBe(403);
    expect(h.appointments.requestAppointment).toHaveBeenCalledTimes(1);
    expect(h.appointments.assignClinician).toHaveBeenCalledTimes(1);
    expect(h.appointments.scheduleAppointment).toHaveBeenCalledTimes(1);
    expect(h.appointments.adminMarkNoShow).toHaveBeenCalledTimes(1);
    expect(h.eligibility.recordLocation).toHaveBeenCalledTimes(1);
    expect(h.refusals).toEqual([]);
  });

  it("lets a person revoke a consent with every clinical capability off", async () => {
    const h = harness(ALL_OFF);
    const response = await request(h.app).post("/api/care/consents").send({
      kind: "telehealth",
      documentVersion: "v1",
      action: "revoked",
      idempotencyKey: "nonclinical-key-7",
    });

    expect(response.status).toBe(201);
    expect(h.eligibility.recordConsent).toHaveBeenCalledTimes(1);
    expect(h.refusals).toEqual([]);
  });
});

describe("Care clinical capability gate leaves the other two gates in place", () => {
  it("still refuses when Care itself is not enabled, whatever the flags say", async () => {
    const app = express();
    app.use(express.json());
    const deps = access(["clinician"], CLINICIAN);
    deps.loadCapabilityStatus = vi.fn(async () => ({
      rail: "care" as const,
      state: "pending_qa" as const,
      enabled: false,
      publicMessage: "Care is being prepared.",
      checkedAt: NOW,
    }));
    const repository = prescriptionRepo();
    registerCarePrescriptionApi(app, deps, repository, () => new Date(NOW), {
      readFlags: () => ALL_ON,
    });

    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "care-off-key-1" });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
    expect(repository.sign).not.toHaveBeenCalled();
  });
});
