import { describe, expect, it } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CareAdverseEvent,
  CareLabCase,
  CareMessageThread,
} from "@shared/care/communications";
import {
  advanceCareAdverseEvent,
  advanceCareLabCase,
  canUseCareMessageThread,
  emergencyGuidanceForCareIssue,
} from "./communications";

const id = (value: string) => value as CareRecordId;
const stamp = "2026-07-25T20:00:00Z";
const thread: CareMessageThread = {
  id: id("thread-1"),
  patientId: id("patient-1"),
  appointmentId: id("appointment-1"),
  assignedClinicianUserId: "clinician-1",
  status: "open",
  subjectCategory: "patient_question",
  version: 0,
  createdAt: stamp,
  updatedAt: stamp,
};
const labCase: CareLabCase = {
  id: id("lab-1"),
  patientId: id("patient-1"),
  appointmentId: null,
  status: "awaiting_order_reference",
  hasProviderReference: true,
  hasOrderReference: true,
  hasResultReference: false,
  hasSecureObjectReference: false,
  reviewedAt: null,
  version: 0,
  createdAt: stamp,
  updatedAt: stamp,
};
const adverseEvent: CareAdverseEvent = {
  id: id("event-1"),
  patientId: id("patient-1"),
  category: "adverse_event",
  urgency: "urgent",
  summary: "Private issue summary",
  status: "reported",
  assignedOwnerUserId: "support-1",
  assignedOwnerRole: "clinical_support",
  acknowledgedAt: null,
  escalatedAt: null,
  closedAt: null,
  version: 0,
  createdAt: stamp,
  updatedAt: stamp,
};

describe("Care PR6 messaging boundary", () => {
  it("allows only the owning patient and exactly assigned clinician", () => {
    expect(canUseCareMessageThread({
      thread,
      principal: {
        subjectId: "patient-user",
        patientId: "patient-1",
        roles: ["care_patient"],
      },
    })).toBe(true);
    expect(canUseCareMessageThread({
      thread,
      principal: { subjectId: "clinician-1", roles: ["clinician"] },
    })).toBe(true);
    expect(canUseCareMessageThread({
      thread,
      principal: {
        subjectId: "other",
        patientId: "patient-2",
        roles: ["care_patient", "clinician"],
      },
    })).toBe(false);
  });
});

describe("Care PR6 laboratory boundary", () => {
  it("requires real reference metadata in order and never creates interpretation", () => {
    expect(advanceCareLabCase(
      { ...labCase, hasProviderReference: false },
      "record_order_reference",
    )).toBeNull();
    expect(advanceCareLabCase(labCase, "record_order_reference")).toMatchObject({
      status: "order_reference_recorded",
      version: 1,
    });
    expect(JSON.stringify(labCase)).not.toMatch(/normal range|diagnosis|interpret/i);
  });
});

describe("Care PR6 adverse-event boundary", () => {
  it("allows only the assigned owner to acknowledge, escalate, or close", () => {
    expect(advanceCareAdverseEvent({
      adverseEvent,
      actorUserId: "other",
      action: "acknowledge",
      occurredAt: stamp,
    })).toBeNull();
    expect(advanceCareAdverseEvent({
      adverseEvent,
      actorUserId: "support-1",
      action: "acknowledge",
      occurredAt: stamp,
    })).toMatchObject({ status: "acknowledged", acknowledgedAt: stamp });
  });

  it("provides emergency direction without diagnosis or treatment advice", () => {
    expect(emergencyGuidanceForCareIssue()).toContain(
      "contact local emergency services now",
    );
    expect(emergencyGuidanceForCareIssue()).toContain(
      "does not provide diagnosis or treatment advice",
    );
  });
});
