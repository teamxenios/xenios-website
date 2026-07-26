import type {
  CareClinicianDecision,
  CareClinicianReview,
  CareClinicianReviewAction,
  CareClinicianReviewActor,
} from "@shared/care/clinician-review";

export type CareClinicianReviewGate =
  | { allowed: true; next: CareClinicianReview }
  | {
      allowed: false;
      reason:
        | "human_clinician_required"
        | "assigned_clinician_required"
        | "state_coverage_required"
        | "appointment_completion_required"
        | "review_already_decided";
    };

const decisionForAction: Partial<
  Record<CareClinicianReviewAction, CareClinicianDecision>
> = {
  approve: "approved",
  decline: "declined",
  no_treatment: "no_treatment",
};

const statusForAction: Record<
  CareClinicianReviewAction,
  CareClinicianReview["status"]
> = {
  review: "in_review",
  request_information: "awaiting_information",
  request_labs: "awaiting_labs",
  follow_up: "follow_up",
  approve: "decided",
  decline: "decided",
  no_treatment: "decided",
};

export function applyCareClinicianReviewAction(input: {
  review: CareClinicianReview;
  action: CareClinicianReviewAction;
  actor: CareClinicianReviewActor;
  appointmentCompleted: boolean;
}): CareClinicianReviewGate {
  if (input.actor.actorKind !== "human_clinician") {
    return { allowed: false, reason: "human_clinician_required" };
  }
  if (input.actor.subjectId !== input.review.assignedClinicianUserId) {
    return { allowed: false, reason: "assigned_clinician_required" };
  }
  if (!input.actor.stateCoverageVerified) {
    return { allowed: false, reason: "state_coverage_required" };
  }
  if (input.review.status === "decided") {
    return { allowed: false, reason: "review_already_decided" };
  }
  const decision = decisionForAction[input.action] ?? null;
  if (decision && !input.appointmentCompleted) {
    return { allowed: false, reason: "appointment_completion_required" };
  }
  return {
    allowed: true,
    next: {
      ...input.review,
      status: statusForAction[input.action],
      finalDecision: decision,
      finalDecisionSource: decision ? "human_clinician" : null,
      version: input.review.version + 1,
    },
  };
}
