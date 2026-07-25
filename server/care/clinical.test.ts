import { describe, expect, it } from "vitest";
import type { CareAppointment, ClinicianReview } from "@shared/care/clinical";
import {
  applyClinicianReviewAction,
  createClinicalIntakeDraft,
  evaluateEligibility,
  transitionAppointment,
} from "./clinical";

const verified = {
  patientId: "patient-1",
  physicalState: "TX",
  locationVerifiedAt: "2026-07-25T10:00:00Z",
  identityVerifiedAt: "2026-07-25T10:01:00Z",
  consentId: "consent-1",
};

const policy = {
  capabilityEnabled: true,
  supportedStates: ["TX"],
  clinicianStates: ["TX"],
  serviceStates: ["TX"],
};

describe("server-verified Care eligibility", () => {
  it("rejects unsupported states without making a nationwide claim", () => {
    expect(
      evaluateEligibility({ ...verified, physicalState: "NY" }, policy, new Date("2026-07-25T12:00:00Z")),
    ).toMatchObject({ eligible: false, reason: "unsupported_state", auditRequired: true });
  });

  it("requires location, coverage, identity, consent, and an enabled capability", () => {
    expect(evaluateEligibility(verified, policy, new Date())).toMatchObject({ eligible: true, reason: "eligible" });
    expect(evaluateEligibility({ ...verified, consentId: null }, policy, new Date())).toMatchObject({
      eligible: false,
      reason: "consent_required",
    });
    expect(evaluateEligibility(verified, { ...policy, capabilityEnabled: false }, new Date())).toMatchObject({
      eligible: false,
      reason: "care_disabled",
    });
  });
});

describe("separate clinical intake", () => {
  it("is versioned, consent-bound, and contains no invented medical questions", () => {
    const draft = createClinicalIntakeDraft({
      id: "care-intake-1",
      patientId: "patient-1",
      definitionVersion: "partner-pending-v0",
      consentId: "consent-1",
      createdAt: new Date("2026-07-25T12:00:00Z"),
    });
    expect(draft.sections).toEqual(["partner_defined"]);
    expect(draft).not.toHaveProperty("researchAssessmentId");
    expect(draft).not.toHaveProperty("questions");
  });
});

describe("provider-neutral appointments", () => {
  const appointment: CareAppointment = {
    id: "care-appointment-1" as CareAppointment["id"],
    patientId: "patient-1",
    clinicianId: null,
    state: "requested",
    startsAt: null,
    mode: "telehealth",
    providerDisplayName: null,
  };

  it("supports scheduling, cancellation, check-in, completion, rescheduling, and no-show states", () => {
    const scheduled = transitionAppointment(appointment, "scheduled", "2026-08-01T12:00:00Z");
    expect(scheduled.providerDisplayName).toBeNull();
    expect(transitionAppointment(scheduled, "checked_in").state).toBe("checked_in");
    expect(transitionAppointment(scheduled, "cancelled").state).toBe("cancelled");
    const noShow = transitionAppointment(scheduled, "no_show");
    expect(transitionAppointment(noShow, "scheduled", "2026-08-02T12:00:00Z").state).toBe("scheduled");
  });
});

describe("assigned human clinician review", () => {
  const review: ClinicianReview = {
    id: "care-review-1" as ClinicianReview["id"],
    patientId: "patient-1",
    assignedClinicianId: "clinician-1",
    status: "assigned",
    lastAction: null,
    finalDecisionSource: null,
  };

  it("rejects unassigned clinicians and automated or AI decisions", () => {
    expect(() =>
      applyClinicianReviewAction(review, { clinicianId: "clinician-2", actorType: "human_clinician" }, "approve"),
    ).toThrow("assigned_clinician_required");
    expect(() =>
      applyClinicianReviewAction(review, { clinicianId: "clinician-1", actorType: "ai" }, "approve"),
    ).toThrow("human_clinician_required");
  });

  it("supports review actions and records final decisions as human", () => {
    expect(
      applyClinicianReviewAction(review, { clinicianId: "clinician-1", actorType: "human_clinician" }, "request_labs"),
    ).toMatchObject({ status: "awaiting_labs", finalDecisionSource: null });
    expect(
      applyClinicianReviewAction(review, { clinicianId: "clinician-1", actorType: "human_clinician" }, "no_treatment"),
    ).toMatchObject({ status: "decided", finalDecisionSource: "human_clinician" });
  });
});
