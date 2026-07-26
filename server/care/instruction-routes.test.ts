import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "./access";
import type { CareInstructionRepository } from "./instruction-repository";
import { registerCareInstructionApi } from "./instruction-routes";
import type {
  CareInstructionSource,
  CarePatientInstruction,
  CareSupplyKit,
  CareSupplyReplacement,
  CareSupplySource,
} from "@shared/care/instructions";
import type { CareRecordId, CareRole } from "@shared/care/contracts";

const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const PRESCRIPTION = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const INSTRUCTION = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const SOURCE = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const KIT = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const REPLACEMENT = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const CLINICIAN = "77777777-7777-4777-8777-777777777777";
const OPERATOR = "88888888-8888-4888-8888-888888888888";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const stamp = "2026-07-25T20:00:00Z";

const instruction: CarePatientInstruction = {
  id: INSTRUCTION, patientId: PATIENT, prescriptionId: PRESCRIPTION,
  status: "released", sourceIds: [SOURCE], instructionContent: "verified content",
  version: 1, acknowledgedVersion: null, supersedesInstructionId: null,
  releasedAt: stamp, createdAt: stamp, updatedAt: stamp,
};
const source: CareInstructionSource = {
  id: SOURCE, patientId: PATIENT, prescriptionId: PRESCRIPTION,
  kind: "clinician_direction", version: 1, sourceReference: "source-ref",
  contentHash: "sha256:verified", content: "verified content",
  verified: true, supersededAt: null, createdAt: stamp,
};
const kit: CareSupplyKit = {
  id: KIT, patientId: PATIENT, prescriptionId: PRESCRIPTION, status: "released",
  productSpecificDevice: "verified device",
  verifiedSupplierReference: "verified supplier",
  supplySourceVerificationState: "verified",
  supplySourceVerifiedAt: stamp,
  replacementCadence: "verified cadence", version: 1,
  supersedesSupplyKitId: null, releasedAt: stamp, createdAt: stamp, updatedAt: stamp,
};
const replacement: CareSupplyReplacement = {
  id: REPLACEMENT, supplyKitId: KIT, patientId: PATIENT, status: "requested",
  version: 0, createdAt: stamp, updatedAt: stamp,
};
const supplySource: CareSupplySource = {
  id: SOURCE,
  legalName: "verified source",
  relationshipReference: "verified relationship",
  supportReference: "verified support",
  verificationState: "verified",
  verifiedAt: stamp,
  version: 1,
  createdAt: stamp,
  updatedAt: stamp,
};

function access(role: CareRole, subjectId: string): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care", state: "enabled", enabled: true,
      publicMessage: "test", checkedAt: stamp,
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId, roles: [role],
      patientId: role === "care_patient" ? PATIENT : undefined,
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function repo(overrides: Partial<CareInstructionRepository> = {}): CareInstructionRepository {
  return {
    listPatientInstructions: vi.fn(async () => [instruction]),
    listPatientSupplyKits: vi.fn(async () => [kit]),
    listPatientReplacements: vi.fn(async () => [replacement]),
    listAssignedReplacements: vi.fn(async () => [replacement]),
    loadReadiness: vi.fn(async () => ({
      prescriptionSigned: false, pharmacyLabelVerified: false,
      pharmacyInformationVerified: false, clinicianDirectionVerified: false,
      manufacturerMaterialVerified: false, patientInstructionContentVerified: false,
      patientInstructionReviewed: false,
      productSpecificDeviceVerified: false, supplySourceVerified: false,
      replacementCadenceVerified: false, publicActivationApproved: false,
    })),
    saveSupplySource: vi.fn(async () => supplySource),
    createSource: vi.fn(async () => source),
    createInstructionDraft: vi.fn(async () => ({ ...instruction, status: "draft" })),
    releaseInstruction: vi.fn(async () => instruction),
    acknowledgeInstruction: vi.fn(async () => ({ ...instruction, acknowledgedVersion: 1 })),
    createSupplyKit: vi.fn(async () => ({ ...kit, status: "verified" })),
    releaseSupplyKit: vi.fn(async () => kit),
    requestReplacement: vi.fn(async () => replacement),
    applyReplacementAction: vi.fn(async () => ({ ...replacement, status: "approved" })),
    ...overrides,
  };
}

function appFor(role: CareRole, subjectId: string, repository = repo()) {
  const app = express();
  app.use(express.json());
  registerCareInstructionApi(app, access(role, subjectId), repository, () => new Date(stamp));
  return { app, repository };
}

describe("Care PR5 instruction and supply routes", () => {
  it("binds instruction, supply, acknowledgment, and replacement reads/writes to the patient principal", async () => {
    const { app, repository } = appFor("care_patient", "patient-user");
    expect((await request(app).get("/api/care/instructions")).status).toBe(200);
    expect((await request(app).get("/api/care/supplies")).status).toBe(200);
    await request(app).post(`/api/care/instructions/${INSTRUCTION}/acknowledge`)
      .send({ instructionVersion: 1, idempotencyKey: "acknowledge-1" });
    await request(app).post(`/api/care/supplies/${KIT}/replacements`)
      .send({ idempotencyKey: "replacement-1" });
    expect(repository.listPatientInstructions).toHaveBeenCalledWith(PATIENT);
    expect(repository.acknowledgeInstruction).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT }),
    );
    expect(repository.requestReplacement).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT }),
    );
  });

  it("uses the authenticated clinician identity and rejects body actor injection", async () => {
    const { app, repository } = appFor("clinician", CLINICIAN);
    const response = await request(app)
      .post("/api/care/instructions/sources/clinician")
      .send({
        patientId: PATIENT, prescriptionId: PRESCRIPTION,
        kind: "clinician_direction", sourceReference: "source-reference",
        contentHash: "sha256:verified", content: "verified content",
        idempotencyKey: "source-key-1", actorUserId: "attacker",
      });
    expect(response.status).toBe(400);
    expect(repository.createSource).not.toHaveBeenCalled();
  });

  it("keeps pharmacy, clinician, and administrator source kinds separated", async () => {
    const clinicianApp = appFor("clinician", CLINICIAN).app;
    expect((await request(clinicianApp)
      .post("/api/care/instructions/sources/clinician")
      .send({
        patientId: PATIENT, prescriptionId: PRESCRIPTION,
        kind: "pharmacy_label", sourceReference: "source-reference",
        contentHash: "sha256:verified", content: "verified content",
        idempotencyKey: "source-key-2",
      })).status).toBe(400);
    const pharmacyApp = appFor("pharmacy_operations", OPERATOR).app;
    expect((await request(pharmacyApp)
      .post("/api/care/instructions/sources/pharmacy")
      .send({
        patientId: PATIENT, prescriptionId: PRESCRIPTION,
        kind: "pharmacy_label", sourceReference: "source-reference",
        contentHash: "sha256:verified", content: "verified content",
        idempotencyKey: "source-key-3",
      })).status).toBe(201);
    const adminApp = appFor("clinical_admin", ADMIN).app;
    expect((await request(adminApp)
      .post("/api/care/instructions/sources/admin")
      .send({
        patientId: null, prescriptionId: null, kind: "general_education",
        sourceReference: "source-reference", contentHash: "sha256:verified",
        content: "verified content", idempotencyKey: "source-key-4",
      })).status).toBe(201);
  });

  it("binds pharmacy replacement queues and actions to the operator principal", async () => {
    const { app, repository } = appFor("pharmacy_operations", OPERATOR);
    expect((await request(app).get("/api/care/supplies/pharmacy/replacements")).status).toBe(200);
    await request(app)
      .post(`/api/care/supplies/pharmacy/replacements/${REPLACEMENT}/action`)
      .send({ expectedVersion: 0, action: "approve", idempotencyKey: "approve-key-1" });
    expect(repository.listAssignedReplacements).toHaveBeenCalledWith(OPERATOR);
    expect(repository.applyReplacementAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: OPERATOR }),
    );
  });

  it("binds supply-source configuration and verification to the clinical administrator", async () => {
    const { app, repository } = appFor("clinical_admin", ADMIN);
    const response = await request(app)
      .post("/api/care/supplies/admin/sources")
      .send({
        supplySourceId: null,
        legalName: "verified source",
        relationshipReference: "verified relationship",
        supportReference: "verified support",
        verificationState: "verified",
        expectedVersion: 0,
        idempotencyKey: "supply-source-1",
      });
    expect(response.status).toBe(201);
    expect(repository.saveSupplySource).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN,
        expectedVersion: 0,
        idempotencyKey: "supply-source-1",
      }),
    );
    const missingConcurrency = await request(app)
      .post("/api/care/supplies/admin/sources")
      .send({
        supplySourceId: SOURCE,
        legalName: "verified source",
        relationshipReference: "verified relationship",
        supportReference: "verified support",
        verificationState: "verified",
      });
    expect(missingConcurrency.status).toBe(400);
    expect(repository.saveSupplySource).toHaveBeenCalledTimes(1);
  });

  it("returns stable safe 503 without repository error text", async () => {
    const { app } = appFor("care_patient", "patient-user", repo({
      listPatientInstructions: vi.fn(async () => {
        throw new Error("private adapter details");
      }),
    }));
    const response = await request(app).get("/api/care/instructions");
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("private adapter details");
    expect(response.body).toMatchObject({ ok: false });
  });
});
