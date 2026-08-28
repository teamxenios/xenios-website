import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import type { CareAppointment } from "@shared/care/appointments";
import type { CareClinicianReview } from "@shared/care/clinician-review";
import type { CareRecordId, CareRole } from "@shared/care/contracts";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const INTAKE_ID = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const REVIEW_ID = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const CLINICIAN_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

function appointment(overrides: Partial<CareAppointment> = {}): CareAppointment {
  return {
    id: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    intakeId: INTAKE_ID,
    patientLocationId: "77777777-7777-4777-8777-777777777777" as CareRecordId,
    patientStateCode: "IL",
    assignedClinicianUserId: CLINICIAN_ID,
    clinicianCoverageId: "88888888-8888-4888-8888-888888888888" as CareRecordId,
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

function repo(overrides: Partial<CareAppointmentRepository> = {}): CareAppointmentRepository {
  return {
    listPatientAppointments: vi.fn(async () => [appointment()]),
    listAssignedReviews: vi.fn(async () => [review()]),
    loadReadiness: vi.fn(async () => ({
      medicalGroupVerified: false,
      clinicianRecordVerified: false,
      clinicianLicenseVerified: false,
      clinicianCredentialsVerified: false,
      clinicianCoverageVerified: false,
      operationalClinicianReady: false,
      supportedStateVerified: false,
      telehealthProviderVerified: false,
      schedulingProviderVerified: false,
      remindersConfigured: false,
      publicActivationApproved: false,
    })),
    requestAppointment: vi.fn(async () => appointment()),
    assignClinician: vi.fn(async () => appointment()),
    scheduleAppointment: vi.fn(async () =>
      appointment({
        status: "scheduled",
        startsAt: "2026-08-01T16:00:00.000Z",
        endsAt: "2026-08-01T16:30:00.000Z",
        telehealthReady: true,
      }),
    ),
    patientAction: vi.fn(async () => appointment({ status: "cancelled" })),
    clinicianComplete: vi.fn(async () => appointment({ status: "completed" })),
    adminMarkNoShow: vi.fn(async () => appointment({ status: "no_show" })),
    applyReviewAction: vi.fn(async () => review({ status: "in_review" })),
    ...overrides,
  };
}

function access(role: CareRole, subjectId: string): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care",
      state: "enabled",
      enabled: true,
      publicMessage: "Care enabled for test.",
      checkedAt: "2026-07-25T20:00:00.000Z",
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId,
      patientId: role === "care_patient" ? PATIENT_ID : undefined,
      roles: [role],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

const CLINICAL_CAPABILITIES_ON = {
  provider_actions: true,
  prescribing: true,
  clinical_fulfillment: true,
  external_communications: true,
  real_patient_data: true,
} as const;

function app(repository: CareAppointmentRepository, role: CareRole, subjectId: string) {
  const instance = express();
  instance.use(express.json());
  registerCareAppointmentApi(
    instance,
    access(role, subjectId),
    repository,
    () => new Date("2026-07-25T20:00:00.000Z"),
    undefined,
    { readFlags: () => CLINICAL_CAPABILITIES_ON },
  );
  return instance;
}

describe("Care PR 3 appointment and review routes", () => {
  it("binds appointment creation to the authenticated patient", async () => {
    const repository = repo();
    const response = await request(app(repository, "care_patient", "patient-user"))
      .post("/api/care/appointments")
      .send({ intakeId: INTAKE_ID, idempotencyKey: "request-key-1" });
    expect(response.status).toBe(201);
    expect(repository.requestAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT_ID, intakeId: INTAKE_ID }),
    );
  });

  it("never accepts a patient id from the request body", async () => {
    const repository = repo();
    const response = await request(app(repository, "care_patient", "patient-user"))
      .post(`/api/care/appointments/${APPOINTMENT_ID}/action`)
      .send({
        patientId: "99999999-9999-4999-8999-999999999999",
        action: "cancel",
        expectedVersion: 0,
        idempotencyKey: "cancel-key-1",
      });
    expect(response.status).toBe(400);
    expect(repository.patientAction).not.toHaveBeenCalled();
  });

  it("does not expose provider session references in a scheduling response", async () => {
    const repository = repo();
    const response = await request(app(repository, "clinical_admin", ADMIN_ID))
      .post(`/api/care/appointments/${APPOINTMENT_ID}/schedule`)
      .send({
        expectedVersion: 0,
        providerKey: "configured-provider",
        providerSessionReference: "private-provider-session-123",
        startsAt: "2026-08-01T16:00:00.000Z",
        endsAt: "2026-08-01T16:30:00.000Z",
        idempotencyKey: "schedule-key-1",
      });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("private-provider-session-123");
  });

  it("returns exact required-input labels only to the Care administrator route", async () => {
    const repository = repo();
    const response = await request(app(repository, "clinical_admin", ADMIN_ID))
      .get("/api/care/appointments/admin/readiness?stateCode=IL");
    expect(response.status).toBe(200);
    expect(response.body.readiness).toMatchObject({
      softwareReady: true,
      operationalReady: false,
      publicReady: false,
    });
    expect(response.body.readiness.requiredInputs).toContain("MEDICAL GROUP REQUIRED");
    expect(response.body.readiness.requiredInputs).toContain(
      "CARE ACTIVATION APPROVAL REQUIRED",
    );
  });

  it("rejects a non-Care-admin principal before assignment", async () => {
    const repository = repo();
    const response = await request(app(repository, "care_patient", "patient-user"))
      .post(`/api/care/appointments/${APPOINTMENT_ID}/assign`)
      .send({ clinicianUserId: CLINICIAN_ID, idempotencyKey: "assign-key-1" });
    expect(response.status).toBe(403);
    expect(repository.assignClinician).not.toHaveBeenCalled();
  });

  it("binds clinician review actions to the authenticated human clinician", async () => {
    const repository = repo();
    const response = await request(app(repository, "clinician", CLINICIAN_ID))
      .post(`/api/care/reviews/${REVIEW_ID}/action`)
      .send({
        action: "review",
        expectedVersion: 0,
        idempotencyKey: "review-key-1",
      });
    expect(response.status).toBe(200);
    expect(repository.applyReviewAction).toHaveBeenCalledWith(
      expect.objectContaining({ clinicianUserId: CLINICIAN_ID, action: "review" }),
    );
  });

  it("rejects attempts to inject an AI actor into a clinician decision", async () => {
    const repository = repo();
    const response = await request(app(repository, "clinician", CLINICIAN_ID))
      .post(`/api/care/reviews/${REVIEW_ID}/action`)
      .send({
        action: "approve",
        actorKind: "ai",
        expectedVersion: 0,
        idempotencyKey: "decision-key-1",
      });
    expect(response.status).toBe(400);
    expect(repository.applyReviewAction).not.toHaveBeenCalled();
  });

  it("fails closed with stable 503 JSON when a dependency fails", async () => {
    const repository = repo({
      listPatientAppointments: vi.fn(async () => {
        throw new Error("adapter host and secret detail");
      }),
    });
    const response = await request(app(repository, "care_patient", "patient-user"))
      .get("/api/care/appointments");
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: "care_temporarily_unavailable",
    });
    expect(JSON.stringify(response.body)).not.toContain("adapter");
  });
});
