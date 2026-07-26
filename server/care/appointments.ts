import type {
  CareAppointment,
  CareAppointmentActor,
  CareAppointmentTransitionInput,
} from "@shared/care/appointments";

export type CareAppointmentTransitionGate =
  | { allowed: true; next: CareAppointment }
  | {
      allowed: false;
      reason:
        | "invalid_transition"
        | "patient_mismatch"
        | "clinical_admin_required"
        | "assigned_clinician_required"
        | "state_coverage_required"
        | "schedule_details_required";
    };

const transitions: Readonly<
  Record<CareAppointment["status"], readonly CareAppointmentTransitionInput["action"][]>
> = {
  requested: ["schedule", "cancel"],
  scheduled: ["reschedule", "cancel", "check_in", "no_show"],
  checked_in: ["complete", "cancel"],
  completed: [],
  cancelled: [],
  no_show: ["reschedule"],
};

function actorGate(
  appointment: CareAppointment,
  action: CareAppointmentTransitionInput["action"],
  actor: CareAppointmentActor,
): CareAppointmentTransitionGate | null {
  if (action === "cancel" || action === "check_in") {
    if (actor.kind === "patient") {
      return actor.patientId === appointment.patientId
        ? null
        : { allowed: false, reason: "patient_mismatch" };
    }
    if (action === "cancel" && actor.kind === "clinical_admin") return null;
    return { allowed: false, reason: "patient_mismatch" };
  }
  if (action === "schedule" || action === "reschedule" || action === "no_show") {
    return actor.kind === "clinical_admin"
      ? null
      : { allowed: false, reason: "clinical_admin_required" };
  }
  if (
    actor.kind !== "human_clinician" ||
    actor.subjectId !== appointment.assignedClinicianUserId
  ) {
    return { allowed: false, reason: "assigned_clinician_required" };
  }
  if (!actor.stateCoverageVerified) {
    return { allowed: false, reason: "state_coverage_required" };
  }
  return null;
}

export function transitionCareAppointment(
  input: CareAppointmentTransitionInput,
): CareAppointmentTransitionGate {
  if (!transitions[input.appointment.status].includes(input.action)) {
    return { allowed: false, reason: "invalid_transition" };
  }
  const actorDenied = actorGate(
    input.appointment,
    input.action,
    input.actor,
  );
  if (actorDenied) return actorDenied;

  let status: CareAppointment["status"] = input.appointment.status;
  if (input.action === "schedule" || input.action === "reschedule") {
    const startsAt = input.startsAt ?? null;
    const endsAt = input.endsAt ?? null;
    if (
      !startsAt ||
      !endsAt ||
      Date.parse(endsAt) <= Date.parse(startsAt) ||
      input.telehealthReady !== true
    ) {
      return { allowed: false, reason: "schedule_details_required" };
    }
    return {
      allowed: true,
      next: {
        ...input.appointment,
        status: "scheduled",
        startsAt,
        endsAt,
        telehealthReady: true,
        version: input.appointment.version + 1,
      },
    };
  }
  if (input.action === "cancel") status = "cancelled";
  if (input.action === "check_in") status = "checked_in";
  if (input.action === "complete") status = "completed";
  if (input.action === "no_show") status = "no_show";
  return {
    allowed: true,
    next: {
      ...input.appointment,
      status,
      version: input.appointment.version + 1,
    },
  };
}
