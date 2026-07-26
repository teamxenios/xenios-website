import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type {
  CareAdverseEvent,
  CareLabCase,
  CareMessage,
  CareMessageConversation,
} from "@shared/care/communications";
import type { CareRecordId, CareRole } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import type { CareCommunicationRepository } from "./communication-repository";
import { registerCareCommunicationApi } from "./communication-routes";

const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const APPOINTMENT = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const THREAD = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const MESSAGE = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const LAB = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const EVENT = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const CLINICIAN = "77777777-7777-4777-8777-777777777777";
const REVIEWER = "88888888-8888-4888-8888-888888888888";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const SUPPORT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const stamp = "2026-07-25T20:00:00Z";

const message: CareMessage = {
  id: MESSAGE,
  threadId: THREAD,
  patientId: PATIENT,
  senderUserId: "patient-user",
  senderKind: "care_patient",
  body: "Private patient message",
  createdAt: stamp,
};
const conversation: CareMessageConversation = {
  thread: {
    id: THREAD,
    patientId: PATIENT,
    appointmentId: APPOINTMENT,
    assignedClinicianUserId: CLINICIAN,
    status: "open",
    subjectCategory: "patient_question",
    version: 0,
    createdAt: stamp,
    updatedAt: stamp,
  },
  messages: [message],
};
const labCase: CareLabCase = {
  id: LAB,
  patientId: PATIENT,
  appointmentId: APPOINTMENT,
  status: "awaiting_order_reference",
  hasProviderReference: false,
  hasOrderReference: false,
  hasResultReference: false,
  hasSecureObjectReference: false,
  reviewedAt: null,
  version: 0,
  createdAt: stamp,
  updatedAt: stamp,
};
const adverseEvent: CareAdverseEvent = {
  id: EVENT,
  patientId: PATIENT,
  category: "adverse_event",
  urgency: "urgent",
  summary: "Private issue",
  status: "reported",
  assignedOwnerUserId: SUPPORT,
  assignedOwnerRole: "clinical_support",
  acknowledgedAt: null,
  escalatedAt: null,
  closedAt: null,
  version: 0,
  createdAt: stamp,
  updatedAt: stamp,
};

function access(role: CareRole, subjectId: string): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care",
      state: "enabled",
      enabled: true,
      publicMessage: "test",
      checkedAt: stamp,
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId,
      roles: [role],
      patientId: role === "care_patient" ? PATIENT : undefined,
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function repo(
  overrides: Partial<CareCommunicationRepository> = {},
): CareCommunicationRepository {
  return {
    listPatientConversations: vi.fn(async () => [conversation]),
    listClinicianConversations: vi.fn(async () => [conversation]),
    createMessageThread: vi.fn(async () => conversation),
    postMessage: vi.fn(async () => message),
    listPatientLabCases: vi.fn(async () => [labCase]),
    listAssignedLabCases: vi.fn(async () => [labCase]),
    createLabCase: vi.fn(async () => labCase),
    assignLabReviewer: vi.fn(async () => undefined),
    applyLabAction: vi.fn(async () => ({
      ...labCase,
      status: "order_reference_recorded",
    })),
    listPatientAdverseEvents: vi.fn(async () => [adverseEvent]),
    listAssignedAdverseEvents: vi.fn(async () => [adverseEvent]),
    reportAdverseEvent: vi.fn(async () => adverseEvent),
    assignAdverseEventOwner: vi.fn(async () => undefined),
    applyAdverseEventAction: vi.fn(async () => ({
      ...adverseEvent,
      status: "acknowledged",
    })),
    ...overrides,
  };
}

function appFor(
  role: CareRole,
  subjectId: string,
  repository = repo(),
) {
  const app = express();
  app.use(express.json());
  registerCareCommunicationApi(
    app,
    access(role, subjectId),
    repository,
    () => new Date(stamp),
  );
  return { app, repository };
}

describe("Care PR6 communication routes", () => {
  it("binds patient message, lab, and issue reads and writes to the patient principal", async () => {
    const { app, repository } = appFor("care_patient", "patient-user");
    expect((await request(app).get("/api/care/messages")).status).toBe(200);
    expect((await request(app).get("/api/care/labs")).status).toBe(200);
    await request(app).post(`/api/care/messages/${THREAD}`).send({
      body: "Private patient reply",
      idempotencyKey: "patient-message-1",
    });
    await request(app).post("/api/care/adverse-events").send({
      category: "adverse_event",
      urgency: "urgent",
      summary: "Private issue",
      emergencyGuidanceAcknowledged: true,
      idempotencyKey: "adverse-report-1",
    });
    expect(repository.listPatientConversations).toHaveBeenCalledWith(PATIENT);
    expect(repository.listPatientLabCases).toHaveBeenCalledWith(PATIENT);
    expect(repository.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD,
        actorUserId: "patient-user",
      }),
    );
    expect(repository.reportAdverseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: PATIENT,
        patientUserId: "patient-user",
      }),
    );
  });

  it("uses the authenticated clinician identity and rejects body actor injection", async () => {
    const { app, repository } = appFor("clinician", CLINICIAN);
    const response = await request(app)
      .post(`/api/care/messages/clinician/${THREAD}`)
      .send({
        body: "Private clinician response",
        idempotencyKey: "clinician-message-1",
        actorUserId: "attacker",
      });
    expect(response.status).toBe(400);
    expect(repository.postMessage).not.toHaveBeenCalled();
  });

  it("binds lab review actions to the authenticated assigned reviewer", async () => {
    const { app, repository } = appFor("lab_reviewer", REVIEWER);
    await request(app)
      .post(`/api/care/labs/reviewer/${LAB}/action`)
      .send({
        expectedVersion: 0,
        action: "record_order_reference",
        providerReference: "real-provider-reference",
        orderReference: "real-order-reference",
        resultReference: null,
        secureObjectReference: null,
        idempotencyKey: "lab-action-1",
      });
    expect(repository.applyLabAction).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerUserId: REVIEWER }),
    );
  });

  it("keeps adverse-event acknowledgment and escalation owner-bound", async () => {
    const { app, repository } = appFor("clinical_support", SUPPORT);
    expect(
      (await request(app).get("/api/care/adverse-events/support/assigned"))
        .status,
    ).toBe(200);
    await request(app)
      .post(`/api/care/adverse-events/support/${EVENT}/action`)
      .send({
        expectedVersion: 0,
        action: "acknowledge",
        idempotencyKey: "adverse-action-1",
      });
    expect(repository.listAssignedAdverseEvents).toHaveBeenCalledWith(SUPPORT);
    expect(repository.applyAdverseEventAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: SUPPORT }),
    );
  });

  it("returns stable safe 503 without repository error text", async () => {
    const { app } = appFor("care_patient", "patient-user", repo({
      listPatientConversations: vi.fn(async () => {
        throw new Error("private adapter details");
      }),
    }));
    const response = await request(app).get("/api/care/messages");
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("private adapter details");
    expect(response.body).toMatchObject({ ok: false });
  });

  it("keeps clinical-admin assignment separate from patient and provider roles", async () => {
    const { app, repository } = appFor("clinical_admin", ADMIN);
    const response = await request(app)
      .post(`/api/care/adverse-events/admin/${EVENT}/assign`)
      .send({
        ownerUserId: SUPPORT,
        ownerRole: "clinical_support",
        idempotencyKey: "adverse-assign-1",
      });
    expect(response.status).toBe(201);
    expect(repository.assignAdverseEventOwner).toHaveBeenCalledWith(
      expect.objectContaining({ adminUserId: ADMIN }),
    );
  });
});
