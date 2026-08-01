import type { CareAppointment } from "@shared/care/appointments";
import type { CareConsentStatus } from "@shared/care/consent";
import {
  CARE_CLINICAL_CAPABILITIES,
  CARE_CLINICAL_CAPABILITIES_DISABLED,
  CARE_CLINICAL_CAPABILITY_ENV_KEYS,
  careReviewActionState,
  type CareClinicalActionState,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import {
  CARE_CLINICIAN_REVIEW_ACTIONS,
  type CareClinicianReview,
} from "@shared/care/clinician-review";
import type { CareClinicalIntake } from "@shared/care/intake";
import type {
  CareReviewDetail,
  CareReviewIntakeState,
  CareReviewQueueItem,
} from "@shared/care/review-queue";

/**
 * Everything the server may know about one assigned review. The projections
 * below are the only thing that reaches the browser, and they deliberately
 * drop the patient id, the clinician user id, the state code, and every
 * intake answer.
 */
export interface CareReviewFacts {
  review: CareClinicianReview;
  appointment: CareAppointment | null;
  intake: CareClinicalIntake | null;
  consents: readonly CareConsentStatus[];
}

export function careReviewIntakeState(
  intake: CareClinicalIntake | null,
): CareReviewIntakeState {
  if (!intake) return "missing";
  return intake.status === "submitted" ? "submitted" : "in_progress";
}

function consentComplete(consents: readonly CareConsentStatus[]): boolean {
  return consents.length > 0 && consents.every((consent) => consent.satisfied);
}

/**
 * The narrowest review projection: only what can be derived from the review
 * record itself, and nothing that would need a second lookup to be true.
 *
 * It exists because the assigned review LIST route has the review record and
 * nothing else. Projecting that record through `toCareReviewQueueItem` would
 * have to invent an appointment status, an intake state, and a consent answer
 * out of absent data, and a projection that reports "intake missing" when it
 * simply did not look is a worse defect than the one it fixes. So the list
 * route gets the honest subset, and the queue route, which does load the rest,
 * gets the full item.
 *
 * The type is a `Pick` of `CareReviewQueueItem` rather than a new shape, so it
 * is a subset by construction and cannot drift into carrying a field the queue
 * item does not have.
 */
export type CareReviewListItem = Pick<
  CareReviewQueueItem,
  "reviewId" | "status" | "decision" | "version" | "updatedAt"
>;

/**
 * Workflow state only. The patient id, the assigned clinician identity, the
 * patient state code, and the decision source are all dropped here, which is
 * the whole point: the caller receives what it needs to render a work list and
 * nothing that identifies a person or describes their care.
 */
export function toCareReviewListItem(
  review: CareClinicianReview,
): CareReviewListItem {
  return {
    reviewId: review.id,
    status: review.status,
    decision: review.finalDecision,
    version: review.version,
    updatedAt: review.updatedAt,
  };
}

export function toCareReviewQueueItem(
  facts: CareReviewFacts,
): CareReviewQueueItem {
  return {
    // Composed from the list item, so the two projections cannot disagree
    // about the fields they share and the list item stays a strict subset.
    ...toCareReviewListItem(facts.review),
    appointmentStatus: facts.appointment?.status ?? null,
    intakeState: careReviewIntakeState(facts.intake),
    consentComplete: consentComplete(facts.consents),
  };
}

export function toCareReviewDetail(facts: CareReviewFacts): CareReviewDetail {
  const appointment = facts.appointment;
  return {
    ...toCareReviewQueueItem(facts),
    decisionSource: facts.review.finalDecisionSource,
    appointment: {
      status: appointment?.status ?? null,
      scheduled: Boolean(appointment?.startsAt) && Boolean(appointment?.endsAt),
      completed: appointment?.status === "completed",
      telehealthReady: appointment?.telehealthReady === true,
    },
    intake: {
      state: careReviewIntakeState(facts.intake),
      definitionVersion: facts.intake?.definitionVersion ?? null,
      submittedAt: facts.intake?.submittedAt ?? null,
    },
    consent: facts.consents.map((consent) => ({
      kind: consent.kind,
      satisfied: consent.satisfied,
      reason: consent.reason,
    })),
  };
}

/**
 * Oldest untouched review first, decided reviews last. Deterministic so the
 * queue does not reshuffle between two reads of the same data.
 */
export function sortCareReviewQueue(
  items: readonly CareReviewQueueItem[],
): CareReviewQueueItem[] {
  return [...items].sort((left, right) => {
    const leftDecided = left.status === "decided" ? 1 : 0;
    const rightDecided = right.status === "decided" ? 1 : 0;
    if (leftDecided !== rightDecided) return leftDecided - rightDecided;
    const byUpdated = left.updatedAt.localeCompare(right.updatedAt);
    return byUpdated !== 0 ? byUpdated : left.reviewId.localeCompare(right.reviewId);
  });
}

/** Every review action with its truthful availability and explanation. */
export function careReviewActionStates(input: {
  detail: Pick<CareReviewDetail, "status" | "appointment">;
  careEnabled: boolean;
  flags: CareClinicalCapabilityFlags;
}): CareClinicalActionState[] {
  return CARE_CLINICIAN_REVIEW_ACTIONS.map((action) =>
    careReviewActionState({
      action,
      careEnabled: input.careEnabled,
      flags: input.flags,
      reviewDecided: input.detail.status === "decided",
      appointmentCompleted: input.detail.appointment.completed,
    }),
  );
}

/**
 * Read the clinical capability flags from the environment. Every flag is false
 * unless it is set to the exact string "true", so a missing, empty, or
 * mistyped value keeps the capability off.
 */
export function readCareClinicalCapabilityFlags(
  env: NodeJS.ProcessEnv = process.env,
): CareClinicalCapabilityFlags {
  const flags: Record<string, boolean> = {
    ...CARE_CLINICAL_CAPABILITIES_DISABLED,
  };
  for (const capability of CARE_CLINICAL_CAPABILITIES) {
    flags[capability] = env[CARE_CLINICAL_CAPABILITY_ENV_KEYS[capability]] === "true";
  }
  return flags as CareClinicalCapabilityFlags;
}
