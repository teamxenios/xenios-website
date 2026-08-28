import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "./access";
import type { CarePrescriptionRepository } from "./prescription-repository";
import { registerCarePrescriptionApi } from "./prescription-routes";
import type { CarePharmacyOrder, CarePrescription } from "@shared/care/prescriptions";
import type { CareRecordId, CareRole } from "@shared/care/contracts";

const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const CLINICIAN = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const OPERATOR = "44444444-4444-4444-8444-444444444444";
const PRESCRIPTION = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const REVIEW = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const ORDER = "77777777-7777-4777-8777-777777777777" as CareRecordId;
const PHARMACY = "88888888-8888-4888-8888-888888888888" as CareRecordId;

const prescription: CarePrescription = {
  id: PRESCRIPTION, patientId: PATIENT, appointmentId: REVIEW,
  clinicianReviewId: REVIEW, prescribingClinicianUserId: CLINICIAN,
  status: "draft", formulation: "real", concentration: "real", route: "real",
  quantity: "real", directions: "real", refills: 0,
  verifiedContentSourceId: REVIEW, version: 0, signedAt: null,
  supersedesPrescriptionId: null, createdAt: "2026-07-25T20:00:00Z",
  updatedAt: "2026-07-25T20:00:00Z",
};
const order: CarePharmacyOrder = {
  id: ORDER, patientId: PATIENT, prescriptionId: PRESCRIPTION,
  assignedPharmacyId: PHARMACY, patientStateCode: "IL",
  status: "pending_pharmacy", clarificationOpen: false,
  trackingReferencePresent: false, version: 0,
  createdAt: "2026-07-25T20:00:00Z", updatedAt: "2026-07-25T20:00:00Z",
};

function access(role: CareRole, subjectId: string): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care", state: "enabled", enabled: true,
      publicMessage: "test", checkedAt: "2026-07-25T20:00:00Z",
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId, patientId: role === "care_patient" ? PATIENT : undefined,
      roles: [role],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}
function repo(overrides: Partial<CarePrescriptionRepository> = {}): CarePrescriptionRepository {
  return {
    listPatientPrescriptions: vi.fn(async () => [prescription]),
    listAssignedPharmacyOrders: vi.fn(async () => [order]),
    loadReadiness: vi.fn(async () => ({
      medicalGroupVerified: false, clinicianCoverageVerified: false,
      patientSpecificContentVerified: false, pharmacyPartnerVerified: false,
      pharmacyIdentityVerified: false, pharmacyLicenseVerified: false,
      pharmacyStateCoverageVerified: false, pharmacyAgreementVerified: false,
      pharmacyIntegrationVerified: false, pharmacySupportVerified: false,
      publicActivationApproved: false,
    })),
    createDraft: vi.fn(async () => prescription),
    sign: vi.fn(async () => ({ ...prescription, status: "signed" })),
    assignPharmacy: vi.fn(async () => order),
    pharmacyAction: vi.fn(async () => ({ ...order, status: "received" })),
    resolveClarification: vi.fn(async () => ({
      ...order,
      status: "received",
      clarificationOpen: false,
    })),
    ...overrides,
  };
}
const CLINICAL_CAPABILITIES_ON = {
  provider_actions: true,
  prescribing: true,
  clinical_fulfillment: true,
  external_communications: true,
  real_patient_data: true,
} as const;

function appFor(role: CareRole, subjectId: string, repository = repo()) {
  const app = express();
  app.use(express.json());
  registerCarePrescriptionApi(
    app,
    access(role, subjectId),
    repository,
    () => new Date("2026-07-25T20:00:00Z"),
    { readFlags: () => CLINICAL_CAPABILITIES_ON },
  );
  return { app, repository };
}

describe("Care PR4 prescription and pharmacy routes", () => {
  it("binds patient prescription reads to the authorized patient", async () => {
    const { app, repository } = appFor("care_patient", "patient-user");
    expect((await request(app).get("/api/care/prescriptions")).status).toBe(200);
    expect(repository.listPatientPrescriptions).toHaveBeenCalledWith(PATIENT);
  });
  it("never accepts a clinician identity from the draft body", async () => {
    const { app, repository } = appFor("clinician", CLINICIAN);
    const response = await request(app).post("/api/care/prescriptions").send({
      patientId: PATIENT, reviewId: REVIEW, formulation: "formulation",
      concentration: "concentration", route: "route", quantity: "quantity",
      directions: "directions", refills: 0, supersedesPrescriptionId: null,
      idempotencyKey: "draft-key-1", clinicianUserId: "attacker",
    });
    expect(response.status).toBe(400);
    expect(repository.createDraft).not.toHaveBeenCalled();
  });
  it("uses the authorized clinician identity to sign", async () => {
    const { app, repository } = appFor("clinician", CLINICIAN);
    const response = await request(app)
      .post(`/api/care/prescriptions/${PRESCRIPTION}/sign`)
      .send({ expectedVersion: 0, idempotencyKey: "sign-key-1" });
    expect(response.status).toBe(200);
    expect(repository.sign).toHaveBeenCalledWith(expect.objectContaining({ clinicianUserId: CLINICIAN }));
  });
  it("binds pharmacy queues and actions to the authorized operator", async () => {
    const { app, repository } = appFor("pharmacy_operations", OPERATOR);
    expect((await request(app).get("/api/care/pharmacy/orders")).status).toBe(200);
    await request(app).post(`/api/care/pharmacy/orders/${ORDER}/action`).send({
      action: "receive", expectedVersion: 0, clarificationReference: null,
      trackingReference: null, idempotencyKey: "receive-key-1",
    });
    expect(repository.listAssignedPharmacyOrders).toHaveBeenCalledWith(OPERATOR);
    expect(repository.pharmacyAction).toHaveBeenCalledWith(expect.objectContaining({ operatorUserId: OPERATOR }));
  });
  it("binds assignment to the authorized clinical admin", async () => {
    const { app, repository } = appFor("clinical_admin", ADMIN);
    const response = await request(app)
      .post(`/api/care/pharmacy/admin/prescriptions/${PRESCRIPTION}/assign`)
      .send({ pharmacyId: PHARMACY, idempotencyKey: "assign-key-1" });
    expect(response.status).toBe(200);
    expect(repository.assignPharmacy).toHaveBeenCalledWith(expect.objectContaining({ adminUserId: ADMIN }));
  });
  it("binds clarification resolution to the authorized clinician or clinical admin", async () => {
    for (const [role, subjectId, path] of [
      [
        "clinician",
        CLINICIAN,
        `/api/care/prescriptions/pharmacy-orders/${ORDER}/clarification/resolve`,
      ],
      [
        "clinical_admin",
        ADMIN,
        `/api/care/pharmacy/admin/orders/${ORDER}/clarification/resolve`,
      ],
    ] as const) {
      const { app, repository } = appFor(role, subjectId);
      const response = await request(app).post(path).send({
        expectedVersion: 2,
        resolutionReference: "private-clinical-response-reference",
        idempotencyKey: `resolve-${role}`,
      });
      expect(response.status).toBe(200);
      expect(repository.resolveClarification).toHaveBeenCalledWith(
        expect.objectContaining({ resolverUserId: subjectId }),
      );
    }
  });
  it("passes exact readiness identifiers without aggregating unrelated records", async () => {
    const { app, repository } = appFor("clinical_admin", ADMIN);
    const response = await request(app).get(
      `/api/care/pharmacy/admin/readiness?stateCode=IL&clinicianUserId=${CLINICIAN}&pharmacyId=${PHARMACY}&prescriptionId=${PRESCRIPTION}`,
    );
    expect(response.status).toBe(200);
    expect(repository.loadReadiness).toHaveBeenCalledWith({
      stateCode: "IL",
      clinicianUserId: CLINICIAN,
      pharmacyId: PHARMACY,
      prescriptionId: PRESCRIPTION,
    });
  });
  it("returns stable safe 503 JSON and no adapter text", async () => {
    const { app } = appFor("care_patient", "patient-user", repo({
      listPatientPrescriptions: vi.fn(async () => { throw new Error("secret adapter failure"); }),
    }));
    const response = await request(app).get("/api/care/prescriptions");
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("secret adapter failure");
    expect(response.body).toMatchObject({ ok: false });
  });
});
