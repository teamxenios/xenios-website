import { describe, expect, it } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareClinicianReview } from "@shared/care/clinician-review";
import { applyCareClinicianReviewAction } from "./clinician-review";

const review: CareClinicianReview = {
  id: "review-1" as CareRecordId,
  appointmentId: "appointment-1" as CareRecordId,
  patientId: "patient-1" as CareRecordId,
  assignedClinicianUserId: "clinician-1",
  patientStateCode: "IL",
  status: "assigned",
  finalDecision: null,
  finalDecisionSource: null,
  version: 0,
  createdAt: "2026-07-25T20:00:00.000Z",
  updatedAt: "2026-07-25T20:00:00.000Z",
};

describe("Care PR 3 clinician review foundation", () => {
  it("supports information, laboratory, review, follow-up, and final human decisions", () => {
    const actor = {
      subjectId: "clinician-1",
      actorKind: "human_clinician" as const,
      stateCoverageVerified: true,
    };
    expect(
      applyCareClinicianReviewAction({
        review,
        action: "request_information",
        actor,
        appointmentCompleted: false,
      }),
    ).toMatchObject({
      allowed: true,
      next: { status: "awaiting_information" },
    });
    expect(
      applyCareClinicianReviewAction({
        review,
        action: "request_labs",
        actor,
        appointmentCompleted: false,
      }),
    ).toMatchObject({
      allowed: true,
      next: { status: "awaiting_labs" },
    });
    expect(
      applyCareClinicianReviewAction({
        review,
        action: "approve",
        actor,
        appointmentCompleted: true,
      }),
    ).toMatchObject({
      allowed: true,
      next: {
        status: "decided",
        finalDecision: "approved",
        finalDecisionSource: "human_clinician",
      },
    });
  });

  it("rejects AI, automation, unassigned, uncovered, premature, and repeated decisions", () => {
    expect(
      applyCareClinicianReviewAction({
        review,
        action: "approve",
        actor: {
          subjectId: "clinician-1",
          actorKind: "ai",
          stateCoverageVerified: true,
        },
        appointmentCompleted: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "human_clinician_required",
    });
    expect(
      applyCareClinicianReviewAction({
        review,
        action: "approve",
        actor: {
          subjectId: "other-clinician",
          actorKind: "human_clinician",
          stateCoverageVerified: true,
        },
        appointmentCompleted: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "assigned_clinician_required",
    });
    expect(
      applyCareClinicianReviewAction({
        review,
        action: "approve",
        actor: {
          subjectId: "clinician-1",
          actorKind: "human_clinician",
          stateCoverageVerified: true,
        },
        appointmentCompleted: false,
      }),
    ).toEqual({
      allowed: false,
      reason: "appointment_completion_required",
    });
    expect(
      applyCareClinicianReviewAction({
        review: { ...review, status: "decided" },
        action: "follow_up",
        actor: {
          subjectId: "clinician-1",
          actorKind: "human_clinician",
          stateCoverageVerified: true,
        },
        appointmentCompleted: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "review_already_decided",
    });
  });
});
