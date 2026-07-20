// xenios research: the Guide and evidence domain contract.
//
// Pure types and pure functions. No I/O, no clock, no storage.
//
// Three founder rules are encoded STRUCTURALLY here rather than left to a runtime
// check that a future caller could forget:
//
//   1. AI CANNOT PUBLISH. `transitionGuide` is overloaded so that an automated actor
//      is only accepted for a target in `AutomatedReachableState`. A call passing an
//      automated actor and a target of scientific_review, claims_review,
//      quality_review, legal_review, founder_review, approved, published, updated,
//      correction_pending, or withdrawn matches NO overload and fails to compile.
//      The runtime guard below is defense in depth for untyped callers, not the
//      primary defense.
//   2. A REGULATORY STATEMENT CANNOT EXIST WITHOUT A DATE, A JURISDICTION, AND A
//      SOURCE, because all three are required fields of `RegulatoryStatement`.
//   3. A CORRECTION SUPERSEDES WITHOUT ERASING. `Correction` names the revision it
//      supersedes and the revision that replaces it; revision history is append only
//      and no function in this file mutates or removes a past revision.
//
// NO DOSING appears anywhere in this file, including in comments and examples.

import type { MemberGoal } from "./catalog";
import type { GuideSummaryDto } from "./commerce-api";

// ---------------------------------------------------------------------------
// Evidence grades
// ---------------------------------------------------------------------------

/**
 * A grade belongs to a single CLAIM. There is deliberately no product grade and no
 * Guide grade in this file, so a surface cannot render "this product is grade B".
 */
export type EvidenceGrade = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "PROHIBITED";

export const EVIDENCE_GRADES: readonly EvidenceGrade[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "PROHIBITED",
] as const;

export const EVIDENCE_GRADE_LABELS: Record<EvidenceGrade, string> = {
  A: "Established",
  B: "Supported Human",
  C: "Early Human",
  D: "Preclinical",
  E: "Supplier Reported",
  F: "Traditional",
  G: "Unverified",
  PROHIBITED: "Prohibited",
};

/**
 * Strength ordering. A lower rank is a stronger claim.
 *
 * PROHIBITED sits at the bottom so a ceiling comparison can never conclude that a
 * prohibited claim is "too strong" for its sources. A prohibited claim is blocked by
 * its own rule instead.
 */
const GRADE_RANK: Record<EvidenceGrade, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  PROHIBITED: 8,
};

/** True when `grade` is stronger than `ceiling` and therefore not permitted. */
export function gradeExceeds(grade: EvidenceGrade, ceiling: EvidenceGrade): boolean {
  return GRADE_RANK[grade] < GRADE_RANK[ceiling];
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type SourceKind =
  | "fda"
  | "clinical_trial_registry"
  | "systematic_review"
  | "human_trial"
  | "preclinical_study"
  | "manufacturer"
  | "supplier"
  | "retailer_or_vendor"
  | "traditional"
  | "other";

export const SOURCE_KINDS: readonly SourceKind[] = [
  "fda",
  "clinical_trial_registry",
  "systematic_review",
  "human_trial",
  "preclinical_study",
  "manufacturer",
  "supplier",
  "retailer_or_vendor",
  "traditional",
  "other",
] as const;

/**
 * Source kinds that count as human evidence.
 *
 * A retailer or vendor page is NOT on this list and never will be. A page that sells
 * something is a commercial document, so it may be recorded as provenance but it can
 * never lift a claim to A, B, or C.
 */
export const HUMAN_EVIDENCE_KINDS: readonly SourceKind[] = [
  "fda",
  "clinical_trial_registry",
  "systematic_review",
  "human_trial",
] as const;

/**
 * The strongest grade a single source of this kind can support.
 *
 * An unrecognized kind caps at G, so adding a source kind without deciding its
 * ceiling degrades safely instead of silently permitting an A.
 */
export function maxGradeForSource(kind: SourceKind): EvidenceGrade {
  switch (kind) {
    case "fda":
    case "systematic_review":
      return "A";
    case "clinical_trial_registry":
    case "human_trial":
      return "B";
    case "preclinical_study":
      return "D";
    case "manufacturer":
    case "supplier":
    case "retailer_or_vendor":
      return "E";
    case "traditional":
      return "F";
    case "other":
      return "G";
    default:
      return "G";
  }
}

export interface EvidenceSource {
  id: string;
  kind: SourceKind;
  citation: string;
  url: string | null;
  /** A source a named human has checked. An unverified source still carries its kind. */
  verified: boolean;
  recordedAt: string;
  recordedBy: string;
}

/**
 * A regulatory statement. Jurisdiction, date, and source are REQUIRED fields, so a
 * statement missing any of the three cannot be constructed.
 */
export interface RegulatoryStatement {
  id: string;
  text: string;
  jurisdiction: string;
  statedAt: string;
  sourceId: string;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export interface EvidenceClaim {
  id: string;
  guideSlug: string;
  text: string;
  grade: EvidenceGrade;
  sourceIds: string[];
  /** Whether this claim would be rendered to an ordinary member. */
  memberVisible: boolean;
  gradedAt: string;
  /** The named human who set the grade. A grade has an author, never "the system". */
  gradedBy: string;
}

export type ClaimGradeViolation =
  | "missing_source"
  | "unknown_source_reference"
  | "human_evidence_required"
  | "grade_exceeds_source_ceiling"
  | "prohibited_claim_member_visible";

export interface ClaimGradeResult {
  ok: boolean;
  violations: ClaimGradeViolation[];
}

/**
 * Validate one claim's grade against the sources it cites.
 *
 * Fails closed and accumulates every violation rather than returning on the first,
 * so a reviewer sees the whole problem at once.
 */
export function validateClaimGrade(
  claim: EvidenceClaim,
  sources: readonly EvidenceSource[],
): ClaimGradeResult {
  const violations: ClaimGradeViolation[] = [];
  const add = (v: ClaimGradeViolation): void => {
    if (!violations.includes(v)) violations.push(v);
  };

  const cited: EvidenceSource[] = [];
  claim.sourceIds.forEach((id) => {
    const found = sources.find((s) => s.id === id);
    if (found) {
      cited.push(found);
    } else {
      add("unknown_source_reference");
    }
  });

  if (claim.grade === "PROHIBITED" && claim.memberVisible) {
    add("prohibited_claim_member_visible");
  }

  if (cited.length === 0) {
    add("missing_source");
    // With nothing cited the ceiling is G, so anything stronger is also a violation.
    if (gradeExceeds(claim.grade, "G")) add("grade_exceeds_source_ceiling");
    return { ok: violations.length === 0, violations };
  }

  const needsHumanEvidence = claim.grade === "A" || claim.grade === "B" || claim.grade === "C";
  if (needsHumanEvidence) {
    const hasHumanEvidence = cited.some((s) => HUMAN_EVIDENCE_KINDS.includes(s.kind));
    if (!hasHumanEvidence) add("human_evidence_required");
  }

  // The ceiling is the STRONGEST ceiling among the cited sources, so one good trial
  // lifts the claim even when weaker provenance is also recorded alongside it.
  let ceiling: EvidenceGrade = "G";
  cited.forEach((s) => {
    const cap = maxGradeForSource(s.kind);
    if (GRADE_RANK[cap] < GRADE_RANK[ceiling]) ceiling = cap;
  });
  if (gradeExceeds(claim.grade, ceiling)) add("grade_exceeds_source_ceiling");

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Guide workflow
// ---------------------------------------------------------------------------

/**
 * `updated` is the state of a Guide that was published and then republished after an
 * approved correction. It is reachable only from correction_pending and only by the
 * founder, and it is member visible exactly like published.
 */
export type GuideWorkflowState =
  | "idea"
  | "researching"
  | "draft"
  | "scientific_review"
  | "claims_review"
  | "quality_review"
  | "legal_review"
  | "founder_review"
  | "approved"
  | "published"
  | "updated"
  | "correction_pending"
  | "withdrawn";

export const GUIDE_WORKFLOW_STATES: readonly GuideWorkflowState[] = [
  "idea",
  "researching",
  "draft",
  "scientific_review",
  "claims_review",
  "quality_review",
  "legal_review",
  "founder_review",
  "approved",
  "published",
  "updated",
  "correction_pending",
  "withdrawn",
] as const;

/** The only states an automated actor may ever move a Guide into. */
export type AutomatedReachableState = "idea" | "researching" | "draft";

export const AUTOMATED_REACHABLE_STATES: readonly AutomatedReachableState[] = [
  "idea",
  "researching",
  "draft",
] as const;

/** Every state that requires a named human. The complement of the above, by construction. */
export type HumanOnlyState = Exclude<GuideWorkflowState, AutomatedReachableState>;

export type ReviewRole = "scientific" | "claims" | "quality" | "legal" | "founder";

export const REVIEW_ROLES: readonly ReviewRole[] = [
  "scientific",
  "claims",
  "quality",
  "legal",
  "founder",
] as const;

export interface HumanActor {
  kind: "human";
  reviewerId: string;
  role: ReviewRole;
}

export interface AutomatedActor {
  kind: "automated";
}

export type GuideActor = HumanActor | AutomatedActor;

/**
 * Who may perform a transition.
 *
 * "automated" means an automated actor or any human. "any_human" means a named human
 * of any review role. A ReviewRole means that role specifically.
 */
export type TransitionAuthority = "automated" | "any_human" | ReviewRole;

export interface GuideTransitionRule {
  from: GuideWorkflowState;
  to: GuideWorkflowState;
  authority: TransitionAuthority;
}

/**
 * The whole legal workflow. Anything absent from this table is denied.
 *
 * Note that no rule with an "automated" authority targets a HumanOnlyState, and that
 * approved and published require the founder role specifically.
 */
export const GUIDE_WORKFLOW_TRANSITIONS: readonly GuideTransitionRule[] = [
  // Automated research and drafting.
  { from: "idea", to: "researching", authority: "automated" },
  { from: "idea", to: "draft", authority: "automated" },
  { from: "researching", to: "idea", authority: "automated" },
  { from: "researching", to: "draft", authority: "automated" },
  { from: "draft", to: "researching", authority: "automated" },

  // Review ladder. Each stage is entered by the human who owns that stage.
  { from: "draft", to: "scientific_review", authority: "scientific" },
  { from: "scientific_review", to: "draft", authority: "scientific" },
  { from: "scientific_review", to: "claims_review", authority: "claims" },
  { from: "claims_review", to: "scientific_review", authority: "claims" },
  { from: "claims_review", to: "quality_review", authority: "quality" },
  { from: "quality_review", to: "claims_review", authority: "quality" },
  { from: "quality_review", to: "legal_review", authority: "legal" },
  { from: "legal_review", to: "quality_review", authority: "legal" },
  { from: "legal_review", to: "founder_review", authority: "founder" },
  { from: "founder_review", to: "legal_review", authority: "founder" },
  { from: "founder_review", to: "draft", authority: "founder" },

  // The two transitions that put words in front of a member. Founder only.
  { from: "founder_review", to: "approved", authority: "founder" },
  { from: "approved", to: "published", authority: "founder" },
  { from: "approved", to: "founder_review", authority: "founder" },

  // Corrections. A correction supersedes, it does not erase.
  { from: "published", to: "correction_pending", authority: "any_human" },
  { from: "updated", to: "correction_pending", authority: "any_human" },
  { from: "correction_pending", to: "updated", authority: "founder" },
  { from: "correction_pending", to: "withdrawn", authority: "founder" },

  // Withdrawal. Any named human may pull a work in progress; only the founder may
  // pull something a member can already read.
  { from: "draft", to: "withdrawn", authority: "any_human" },
  { from: "scientific_review", to: "withdrawn", authority: "any_human" },
  { from: "claims_review", to: "withdrawn", authority: "any_human" },
  { from: "quality_review", to: "withdrawn", authority: "any_human" },
  { from: "legal_review", to: "withdrawn", authority: "any_human" },
  { from: "founder_review", to: "withdrawn", authority: "any_human" },
  { from: "approved", to: "withdrawn", authority: "founder" },
  { from: "published", to: "withdrawn", authority: "founder" },
  { from: "updated", to: "withdrawn", authority: "founder" },
  { from: "withdrawn", to: "draft", authority: "founder" },
] as const;

export type GuideTransitionDenial =
  | "no_such_transition"
  | "human_required"
  | "unnamed_reviewer"
  | "wrong_role";

export type GuideTransitionResult =
  | { ok: true; state: GuideWorkflowState }
  | { ok: false; reason: GuideTransitionDenial; message: string };

export function isAutomatedReachable(state: GuideWorkflowState): state is AutomatedReachableState {
  return AUTOMATED_REACHABLE_STATES.includes(state as AutomatedReachableState);
}

/**
 * Move a Guide from one workflow state to another.
 *
 * The overloads are the point. An automated actor is only accepted with a target in
 * `AutomatedReachableState`, so no sequence of automated calls can typecheck its way
 * to approved or published, and a caller holding an un-narrowed `GuideActor` must
 * narrow it before requesting a human-only state.
 */
export function transitionGuide(
  from: GuideWorkflowState,
  to: AutomatedReachableState,
  actor: GuideActor,
): GuideTransitionResult;
export function transitionGuide(
  from: GuideWorkflowState,
  to: GuideWorkflowState,
  actor: HumanActor,
): GuideTransitionResult;
export function transitionGuide(
  from: GuideWorkflowState,
  to: GuideWorkflowState,
  actor: GuideActor,
): GuideTransitionResult {
  // Defense in depth for a caller that reached here through a cast or from
  // unvalidated JSON. The type system is the primary gate, this is the backstop.
  if (actor.kind === "automated" && !isAutomatedReachable(to)) {
    return {
      ok: false,
      reason: "human_required",
      message: `An automated actor may not move a Guide to ${to}.`,
    };
  }

  const rule = GUIDE_WORKFLOW_TRANSITIONS.find((r) => r.from === from && r.to === to);
  if (!rule) {
    return {
      ok: false,
      reason: "no_such_transition",
      message: `No transition from ${from} to ${to}.`,
    };
  }

  if (actor.kind === "automated") {
    if (rule.authority !== "automated") {
      return {
        ok: false,
        reason: "human_required",
        message: `Moving ${from} to ${to} requires a named human.`,
      };
    }
    return { ok: true, state: to };
  }

  if (actor.reviewerId.trim() === "") {
    return {
      ok: false,
      reason: "unnamed_reviewer",
      message: "A human actor must carry a reviewer id. Accountability is never anonymous.",
    };
  }

  if (rule.authority !== "automated" && rule.authority !== "any_human" && actor.role !== rule.authority) {
    return {
      ok: false,
      reason: "wrong_role",
      message: `Moving ${from} to ${to} requires the ${rule.authority} role, not ${actor.role}.`,
    };
  }

  return { ok: true, state: to };
}

// ---------------------------------------------------------------------------
// Member visibility
// ---------------------------------------------------------------------------

/**
 * The only two states an ordinary member may read the body of.
 *
 * Everything else, including approved, is status only. Approved is deliberately NOT
 * visible: approval is the founder's sign-off, publication is a separate act.
 */
export function isMemberVisible(state: GuideWorkflowState): boolean {
  return state === "published" || state === "updated";
}

/**
 * Map an internal workflow state onto the status a member is allowed to see.
 *
 * The internal ladder is not member business, so every review stage collapses to
 * "in_review" and a withdrawn Guide reads as "in_development" rather than announcing
 * that something was pulled.
 */
export function memberStatusFor(state: GuideWorkflowState): GuideSummaryDto["status"] {
  switch (state) {
    case "published":
      return "published";
    case "updated":
      return "updated";
    case "scientific_review":
    case "claims_review":
    case "quality_review":
    case "legal_review":
    case "founder_review":
    case "approved":
    case "correction_pending":
      return "in_review";
    case "draft":
    case "researching":
    case "withdrawn":
      return "in_development";
    case "idea":
      return "coming_soon";
    default:
      return "coming_soon";
  }
}

// ---------------------------------------------------------------------------
// Guide record
// ---------------------------------------------------------------------------

export interface GuideSection {
  heading: string;
  body: string;
  order: number;
}

export interface GuideRevision {
  revision: number;
  createdAt: string;
  authorId: string;
  summary: string;
  sections: GuideSection[];
}

/**
 * A correction names both the revision it supersedes and the revision that replaces
 * it. Neither revision is removed from `Guide.history`.
 */
export interface Correction {
  id: string;
  guideSlug: string;
  supersedesRevision: number;
  supersededByRevision: number;
  note: string;
  correctedAt: string;
  correctedBy: string;
}

export interface ReviewDecision {
  guideSlug: string;
  /** The revision reviewed. A sign-off does not carry forward to a later revision. */
  revision: number;
  role: ReviewRole;
  reviewerId: string;
  decision: "approved" | "changes_requested" | "rejected";
  decidedAt: string;
  note: string;
}

export interface GuideProductLink {
  guideSlug: string;
  sku: string;
  relationship: "primary" | "related";
}

export interface GuideGoalLink {
  guideSlug: string;
  goal: MemberGoal;
}

export interface Guide {
  slug: string;
  title: string;
  state: GuideWorkflowState;
  revision: number;
  publishedAt: string | null;
  sections: GuideSection[];
  claims: EvidenceClaim[];
  sources: EvidenceSource[];
  regulatoryStatements: RegulatoryStatement[];
  reviews: ReviewDecision[];
  history: GuideRevision[];
  corrections: Correction[];
  productLinks: GuideProductLink[];
  goalLinks: GuideGoalLink[];
}

// ---------------------------------------------------------------------------
// Sign-off
// ---------------------------------------------------------------------------

/**
 * A sign-off counts only when it is an approval, by a named human, of THIS Guide at
 * THIS revision. Anything else is treated as absent.
 */
function isSatisfyingReview(guide: Guide, review: ReviewDecision, role: ReviewRole): boolean {
  return (
    review.role === role &&
    review.decision === "approved" &&
    review.guideSlug === guide.slug &&
    review.revision === guide.revision &&
    review.reviewerId.trim() !== ""
  );
}

/** Which of the five sign-offs are still outstanding for the Guide's current revision. */
export function requiredReviewsFor(guide: Guide): ReviewRole[] {
  return REVIEW_ROLES.filter((role) => !guide.reviews.some((r) => isSatisfyingReview(guide, r, role)));
}

export interface PublishCheck {
  ok: boolean;
  missing: ReviewRole[];
}

/**
 * Whether the review record permits publication. Fails closed: all five roles.
 *
 * This answers review completeness only. Whether the workflow state legally allows
 * the move is `transitionGuide`'s job, and both gates must pass to publish.
 */
export function canPublish(guide: Guide, reviews: readonly ReviewDecision[]): PublishCheck {
  const missing = REVIEW_ROLES.filter(
    (role) => !reviews.some((r) => isSatisfyingReview(guide, r, role)),
  );
  return { ok: missing.length === 0, missing };
}
