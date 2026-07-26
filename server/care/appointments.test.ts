import { describe, expect, it } from "vitest";
import type {
  CareAppointment,
  CareAppointmentActor,
} from "@shared/care/appointments";
import type { CareRecordId } from "@shared/care/contracts";
import { transitionCareAppointment } from "./appointments";

const patientId = "patient-1" as CareRecordId;
const appointment: CareAppointment = {
  id: "appointment-1" as CareRecordId,
  patientId,
  intakeId: "intake-1" as CareRecordId,
  patientLocationId: "location-1" as CareRecordId,
  patientStateCode: "IL",
  assignedClinicianUserId: "clinician-1",
  clinicianCoverageId: "coverage-1" as CareRecordId,
  status: "requested",
  startsAt: null,
  endsAt: null,
  telehealthReady: false,
  version: 0,
  createdAt: "2026-07-25T20:00:00.000Z",
  updatedAt: "2026-07-25T20:00:00.000Z",
};

const admin: CareAppointmentActor = {
  kind: "clinical_admin",
  subjectId: "admin-1",
};

describe("Care PR 3 appointment transition foundation", () => {
  it("requires a real scheduling window and configured telehealth session", () => {
    expect(
      transitionCareAppointment({
        appointment,
        action: "schedule",
        actor: admin,
        startsAt: "2026-08-01T17:00:00.000Z",
        endsAt: "2026-08-01T16:00:00.000Z",
        telehealthReady: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "schedule_details_required",
    });
    expect(
      transitionCareAppointment({
        appointment,
        action: "schedule",
        actor: admin,
        startsAt: "2026-08-01T16:00:00.000Z",
        endsAt: "2026-08-01T17:00:00.000Z",
        telehealthReady: false,
      }),
    ).toEqual({
      allowed: false,
      reason: "schedule_details_required",
    });
  });

  it("supports schedule, reschedule, check-in, completion, no-show, and cancellation", () => {
    const scheduledGate = transitionCareAppointment({
      appointment,
      action: "schedule",
      actor: admin,
      startsAt: "2026-08-01T16:00:00.000Z",
      endsAt: "2026-08-01T17:00:00.000Z",
      telehealthReady: true,
    });
    expect(scheduledGate.allowed).toBe(true);
    if (!scheduledGate.allowed) return;

    const checkedIn = transitionCareAppointment({
      appointment: scheduledGate.next,
      action: "check_in",
      actor: { kind: "patient", patientId },
    });
    expect(checkedIn.allowed && checkedIn.next.status).toBe("checked_in");
    if (!checkedIn.allowed) return;

    const completed = transitionCareAppointment({
      appointment: checkedIn.next,
      action: "complete",
      actor: {
        kind: "human_clinician",
        subjectId: "clinician-1",
        stateCoverageVerified: true,
      },
    });
    expect(completed.allowed && completed.next.status).toBe("completed");

    const noShow = transitionCareAppointment({
      appointment: scheduledGate.next,
      action: "no_show",
      actor: admin,
    });
    expect(noShow.allowed && noShow.next.status).toBe("no_show");
    if (!noShow.allowed) return;
    expect(
      transitionCareAppointment({
        appointment: noShow.next,
        action: "reschedule",
        actor: admin,
        startsAt: "2026-08-02T16:00:00.000Z",
        endsAt: "2026-08-02T17:00:00.000Z",
        telehealthReady: true,
      }).allowed,
    ).toBe(true);

    expect(
      transitionCareAppointment({
        appointment: scheduledGate.next,
        action: "cancel",
        actor: { kind: "patient", patientId },
      }),
    ).toMatchObject({ allowed: true, next: { status: "cancelled" } });
  });

  it("rejects wrong-patient, unassigned, uncovered, and invalid actors", () => {
    const scheduled = { ...appointment, status: "scheduled" as const };
    expect(
      transitionCareAppointment({
        appointment: scheduled,
        action: "check_in",
        actor: {
          kind: "patient",
          patientId: "other-patient" as CareRecordId,
        },
      }),
    ).toEqual({ allowed: false, reason: "patient_mismatch" });
    expect(
      transitionCareAppointment({
        appointment: { ...scheduled, status: "checked_in" },
        action: "complete",
        actor: {
          kind: "human_clinician",
          subjectId: "other-clinician",
          stateCoverageVerified: true,
        },
      }),
    ).toEqual({
      allowed: false,
      reason: "assigned_clinician_required",
    });
    expect(
      transitionCareAppointment({
        appointment: { ...scheduled, status: "checked_in" },
        action: "complete",
        actor: {
          kind: "human_clinician",
          subjectId: "clinician-1",
          stateCoverageVerified: false,
        },
      }),
    ).toEqual({
      allowed: false,
      reason: "state_coverage_required",
    });
  });
});
