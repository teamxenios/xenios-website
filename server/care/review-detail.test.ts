import { describe, expect, it } from "vitest";
import type { CareAppointment } from "@shared/care/appointments";
import type { CareConsentStatus } from "@shared/care/consent";
import { CARE_CLINICAL_CAPABILITIES_DISABLED } from "@shared/care/clinical-actions";
import {
  CARE_CLINICIAN_REVIEW_ACTIONS,
  type CareClinicianReview,
} from "@shared/care/clinician-review";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareClinicalIntake } from "@shared/care/intake";
import {
  careReviewActionStates,
  careReviewIntakeState,
  readCareClinicalCapabilityFlags,
  sortCareReviewQueue,
  toCareReviewDetail,
  toCareReviewQueueItem,
  type CareReviewFacts,
} from "./review-detail";

const EM_DASH = String.fromCharCode(0x2014);
const REVIEW_ID = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const INTAKE_ID = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const CLINICIAN_ID = "55555555-5555-4555-8555-555555555555";

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

function appointment(overrides: Partial<CareAppointment> = {}): CareAppointment {
  return {
    id: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    intakeId: INTAKE_ID,
    patientLocationId: "77777777-7777-4777-8777-777777777777" as CareRecordId,
    patientStateCode: "IL",
    assignedClinicianUserId: CLINICIAN_ID,
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

function intake(overrides: Partial<CareClinicalIntake> = {}): CareClinicalIntake {
  return {
    id: INTAKE_ID,
    patientId: PATIENT_ID,
    definitionId: "88888888-8888-4888-8888-888888888888" as CareRecordId,
    definitionVersion: "2026.07",
    telehealthConsentEventId: "99999999-9999-4999-8999-999999999999" as CareRecordId,
    privacyConsentEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CareRecordId,
    status: "submitted",
    version: 1,
    createdAt: "2026-07-25T20:00:00.000Z",
    submittedAt: "2026-07-25T21:00:00.000Z",
    ...overrides,
  };
}

function consent(
  kind: CareConsentStatus["kind"],
  satisfied: boolean,
): CareConsentStatus {
  return {
    kind,
    requiredDocument: null,
    activeEvent: null,
    satisfied,
    reason: satisfied ? "active" : "not_granted",
  };
}

function facts(overrides: Partial<CareReviewFacts> = {}): CareReviewFacts {
  return {
    review: review(),
    appointment: appointment(),
    intake: intake(),
    consents: [consent("telehealth", true), consent("privacy_notice", true)],
    ...overrides,
  };
}

describe("Care clinician review projections", () => {
  it("carries no patient, clinician, or location identifier into the projection", () => {
    const identifiers = [PATIENT_ID, CLINICIAN_ID, "IL", INTAKE_ID, APPOINTMENT_ID];
    const queueJson = JSON.stringify(toCareReviewQueueItem(facts()));
    const detailJson = JSON.stringify(toCareReviewDetail(facts()));
    for (const identifier of identifiers) {
      expect(queueJson).not.toContain(identifier);
      expect(detailJson).not.toContain(identifier);
    }
    expect(queueJson).toContain(REVIEW_ID);
  });

  it("projects appointment, intake, and consent state without clinical content", () => {
    const detail = toCareReviewDetail(
      facts({
        appointment: appointment({
          status: "completed",
          startsAt: "2026-07-26T15:00:00.000Z",
          endsAt: "2026-07-26T15:30:00.000Z",
          telehealthReady: true,
        }),
      }),
    );
    expect(detail.appointment).toEqual({
      status: "completed",
      scheduled: true,
      completed: true,
      telehealthReady: true,
    });
    expect(detail.intake).toEqual({
      state: "submitted",
      definitionVersion: "2026.07",
      submittedAt: "2026-07-25T21:00:00.000Z",
    });
    expect(detail.consent).toEqual([
      { kind: "telehealth", satisfied: true, reason: "active" },
      { kind: "privacy_notice", satisfied: true, reason: "active" },
    ]);
    expect(detail).not.toHaveProperty("responses");
  });

  it("reports honest missing and incomplete states rather than an assumed one", () => {
    const empty = toCareReviewDetail(
      facts({ appointment: null, intake: null, consents: [] }),
    );
    expect(empty.appointmentStatus).toBeNull();
    expect(empty.appointment.scheduled).toBe(false);
    expect(empty.intakeState).toBe("missing");
    expect(empty.consentComplete).toBe(false);
    expect(careReviewIntakeState(intake({ status: "draft" }))).toBe("in_progress");

    const partial = toCareReviewQueueItem(
      facts({
        consents: [consent("telehealth", true), consent("privacy_notice", false)],
      }),
    );
    expect(partial.consentComplete).toBe(false);
  });

  it("orders the queue oldest first and pushes decided reviews to the end", () => {
    const ordered = sortCareReviewQueue([
      toCareReviewQueueItem(
        facts({ review: review({ status: "decided", updatedAt: "2026-07-01T00:00:00.000Z" }) }),
      ),
      toCareReviewQueueItem(
        facts({ review: review({ updatedAt: "2026-07-20T00:00:00.000Z" }) }),
      ),
      toCareReviewQueueItem(
        facts({ review: review({ updatedAt: "2026-07-10T00:00:00.000Z" }) }),
      ),
    ]);
    expect(ordered.map((item) => item.updatedAt)).toEqual([
      "2026-07-10T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    ]);
  });
});

describe("Care clinical action availability", () => {
  const detail = toCareReviewDetail(facts());

  it("disables every review action while the capability flags are false", () => {
    const states = careReviewActionStates({
      detail,
      careEnabled: true,
      flags: CARE_CLINICAL_CAPABILITIES_DISABLED,
    });
    expect(states).toHaveLength(CARE_CLINICIAN_REVIEW_ACTIONS.length);
    for (const state of states) {
      expect(state.enabled).toBe(false);
      expect(state.blockedReason).toBe("capability_disabled");
      expect(state.explanation.length).toBeGreaterThan(0);
      expect(state.explanation).not.toContain(EM_DASH);
    }
  });

  it("keeps actions disabled when Care itself is not active, whatever the flags say", () => {
    const states = careReviewActionStates({
      detail,
      careEnabled: false,
      flags: {
        provider_actions: true,
        prescribing: true,
        clinical_fulfillment: true,
        external_communications: true,
        real_patient_data: true,
      },
    });
    for (const state of states) {
      expect(state.enabled).toBe(false);
      expect(state.blockedReason).toBe("care_not_active");
    }
  });

  it("still refuses a decision until the appointment is completed", () => {
    const states = careReviewActionStates({
      detail,
      careEnabled: true,
      flags: {
        ...CARE_CLINICAL_CAPABILITIES_DISABLED,
        provider_actions: true,
      },
    });
    const approve = states.find((state) => state.action === "approve");
    const start = states.find((state) => state.action === "review");
    expect(approve?.enabled).toBe(false);
    expect(approve?.blockedReason).toBe("appointment_completion_required");
    expect(start?.enabled).toBe(true);
  });

  it("refuses to change a decided review", () => {
    const decided = toCareReviewDetail(
      facts({
        review: review({ status: "decided", finalDecision: "approved" }),
        appointment: appointment({ status: "completed" }),
      }),
    );
    const states = careReviewActionStates({
      detail: decided,
      careEnabled: true,
      flags: {
        ...CARE_CLINICAL_CAPABILITIES_DISABLED,
        provider_actions: true,
        clinical_fulfillment: true,
        external_communications: true,
      },
    });
    for (const state of states) {
      expect(state.enabled).toBe(false);
      expect(state.blockedReason).toBe("review_already_decided");
    }
  });
});

describe("Care clinical capability flag reader", () => {
  it("defaults every capability to false", () => {
    expect(readCareClinicalCapabilityFlags({})).toEqual(
      CARE_CLINICAL_CAPABILITIES_DISABLED,
    );
  });

  it("treats anything other than the exact string true as false", () => {
    const flags = readCareClinicalCapabilityFlags({
      CARE_PROVIDER_ACTIONS_ENABLED: "TRUE",
      CARE_PRESCRIBING_ENABLED: "1",
      CARE_CLINICAL_FULFILLMENT_ENABLED: "yes",
      CARE_EXTERNAL_COMMUNICATIONS_ENABLED: "",
      CARE_REAL_PATIENT_DATA_ENABLED: " true",
    });
    expect(flags).toEqual(CARE_CLINICAL_CAPABILITIES_DISABLED);
  });
});
