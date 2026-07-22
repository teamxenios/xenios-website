import crypto from "crypto";
import {
  forbiddenFieldNames,
  type IdentityDocumentCase,
  IdentityInvalidTransition,
  canTransition,
} from "./identity-documents";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: the manual name and age
// review (Domain 3).
//
// A named person looks at the uploaded document and answers exactly four
// questions: does the legal name match the application, is the person 21 or
// older, is the document current, and which jurisdiction issued it. The
// review type is manual_name_age and nothing else; this is not a forensic
// examination, not a KYC program, and not an automated vendor check. The
// wording matters because the promise to the applicant matters: a person
// confirms name and age, and that is all.
//
// THE MINIMAL VERIFICATION RECORD is the only thing that outlives the raw
// document. It is structurally incapable of carrying the document itself:
// there is no field for a full license number, an image, a name, a birth
// date, or an SSN, and the compile-time pin plus the structural test keep it
// that way. licenseLast4 is the single sanctioned identifier fragment, hard
// capped at four characters by the validator below and by the database check
// constraint.
// ---------------------------------------------------------------------------

export const IDENTITY_REVIEW_TYPE = "manual_name_age" as const;

export const IDENTITY_REVIEW_OUTCOMES = ["verified", "rejected"] as const;
export type IdentityReviewOutcome = (typeof IDENTITY_REVIEW_OUTCOMES)[number];

export const IDENTITY_AGE_THRESHOLD_YEARS = 21;

// The coarse reasons a review can fail. Categories, never document content.
export const IDENTITY_REJECTION_CATEGORIES = [
  "name_mismatch",
  "age_threshold_not_met",
  "document_expired",
  "unreadable",
  "required_field_concealed",
  "not_a_government_id",
  "other",
] as const;
export type IdentityRejectionCategory = (typeof IDENTITY_REJECTION_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// The minimal verification record
// ---------------------------------------------------------------------------

// Everything that survives the raw document's deletion. Immutable once
// written except for rawSourceDeletedAt, which the retention worker stamps
// when the underlying object is destroyed.
export type IdentityVerificationRecord = {
  reviewId: string;
  caseId: string;
  tenantId: string;
  memberId: string;
  reviewType: typeof IDENTITY_REVIEW_TYPE;
  nameMatch: "match" | "mismatch";
  ageThresholdMet: boolean;
  documentNotExpired: boolean;
  jurisdiction: string | null;
  licenseLast4: string | null; // at most the last 4 characters, ever
  outcome: IdentityReviewOutcome;
  rejectionCategory: IdentityRejectionCategory | null;
  reviewerId: string;
  startedAt: string;
  completedAt: string;
  rawSourceDeletedAt: string | null;
};

export const IDENTITY_REVIEW_PERSISTED_FIELDS = [
  "reviewId",
  "caseId",
  "tenantId",
  "memberId",
  "reviewType",
  "nameMatch",
  "ageThresholdMet",
  "documentNotExpired",
  "jurisdiction",
  "licenseLast4",
  "outcome",
  "rejectionCategory",
  "reviewerId",
  "startedAt",
  "completedAt",
  "rawSourceDeletedAt",
] as const;

// Compile-time pin: the record type and the persisted-fields list cannot
// drift apart.
type ReviewField = (typeof IDENTITY_REVIEW_PERSISTED_FIELDS)[number];
type MustBeNever<T extends never> = T;
export type _ReviewFieldContractA = MustBeNever<Exclude<keyof IdentityVerificationRecord, ReviewField>>;
export type _ReviewFieldContractB = MustBeNever<Exclude<ReviewField, keyof IdentityVerificationRecord>>;

// Structural guard, callable at runtime: refuses any record shape that grew a
// field the persistence contract forbids. The store calls this before every
// write, so even a future in-memory shortcut cannot persist document content.
export function assertMinimalVerificationRecord(record: IdentityVerificationRecord): void {
  const offending = forbiddenFieldNames(record);
  if (offending.length > 0) {
    throw new Error(
      `The verification record grew forbidden fields (${offending.join(", ")}); the minimal-record contract refuses to persist it.`,
    );
  }
  const extra = Object.keys(record).filter(
    (key) => !(IDENTITY_REVIEW_PERSISTED_FIELDS as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    throw new Error(
      `The verification record carries unknown fields (${extra.join(", ")}); only the minimal record persists.`,
    );
  }
  if (record.licenseLast4 !== null && !isMaskedLast4(record.licenseLast4)) {
    throw new Error("licenseLast4 must be exactly four characters or null; a fuller number never persists.");
  }
}

// The single sanctioned identifier fragment: exactly four characters,
// letters and digits only. Anything longer is a full-number leak and refused.
export function isMaskedLast4(value: string): boolean {
  return /^[A-Za-z0-9]{4}$/.test(value);
}

// ---------------------------------------------------------------------------
// Running a review
// ---------------------------------------------------------------------------

export type IdentityReviewStart = {
  reviewId: string;
  caseId: string;
  reviewerId: string;
  startedAt: string;
};

// A named reviewer opens the case. The case must be in the queue; two
// reviewers cannot both open it because the transition spends the state.
export function startIdentityReview(
  kase: IdentityDocumentCase,
  reviewerId: string,
  now: Date,
  reviewId: string = crypto.randomUUID(),
): { kase: IdentityDocumentCase; start: IdentityReviewStart } {
  if (!canTransition(kase.status, "under_review")) {
    throw new IdentityInvalidTransition(kase.status, "under_review");
  }
  if (typeof reviewerId !== "string" || reviewerId.length === 0) {
    throw new Error("A review is opened by a named reviewer, never anonymously.");
  }
  const start: IdentityReviewStart = {
    reviewId,
    caseId: kase.caseId,
    reviewerId,
    startedAt: now.toISOString(),
  };
  return {
    kase: { ...kase, status: "under_review", reviewId, updatedAt: now.toISOString() },
    start,
  };
}

// What the reviewer answers. Note the shape: there is no field to type a full
// license number, a name, or a birth date into. The reviewer reads those from
// the document and answers booleans; only the last 4 and the jurisdiction
// travel as text.
export type IdentityReviewFindings = {
  nameMatch: "match" | "mismatch";
  ageThresholdMet: boolean;
  documentNotExpired: boolean;
  jurisdiction: string | null;
  licenseLast4: string | null;
  rejectionCategory?: IdentityRejectionCategory;
};

// The outcome is DERIVED, never chosen: verified requires every check to
// pass. A failing review must carry a category so the applicant hears a
// reason, not a shrug; when the reviewer names none, the first failing check
// supplies it.
export function deriveReviewOutcome(findings: IdentityReviewFindings): {
  outcome: IdentityReviewOutcome;
  rejectionCategory: IdentityRejectionCategory | null;
} {
  const passed = findings.nameMatch === "match" && findings.ageThresholdMet && findings.documentNotExpired;
  if (passed) return { outcome: "verified", rejectionCategory: null };
  if (findings.rejectionCategory) return { outcome: "rejected", rejectionCategory: findings.rejectionCategory };
  if (findings.nameMatch !== "match") return { outcome: "rejected", rejectionCategory: "name_mismatch" };
  if (!findings.ageThresholdMet) return { outcome: "rejected", rejectionCategory: "age_threshold_not_met" };
  return { outcome: "rejected", rejectionCategory: "document_expired" };
}

export function completeIdentityReview(
  kase: IdentityDocumentCase,
  start: IdentityReviewStart,
  findings: IdentityReviewFindings,
  now: Date,
): { kase: IdentityDocumentCase; record: IdentityVerificationRecord } {
  if (kase.status !== "under_review" || kase.reviewId !== start.reviewId) {
    throw new Error("Only the review that opened this case can complete it.");
  }
  if (findings.licenseLast4 !== null && !isMaskedLast4(findings.licenseLast4)) {
    throw new Error(
      "licenseLast4 must be exactly the last four characters; the full number never enters this system.",
    );
  }
  const { outcome, rejectionCategory } = deriveReviewOutcome(findings);
  const to = outcome === "verified" ? "verified" : "rejected";
  if (!canTransition(kase.status, to)) throw new IdentityInvalidTransition(kase.status, to);

  const record: IdentityVerificationRecord = {
    reviewId: start.reviewId,
    caseId: kase.caseId,
    tenantId: kase.tenantId,
    memberId: kase.memberId,
    reviewType: IDENTITY_REVIEW_TYPE,
    nameMatch: findings.nameMatch,
    ageThresholdMet: findings.ageThresholdMet,
    documentNotExpired: findings.documentNotExpired,
    jurisdiction: findings.jurisdiction,
    licenseLast4: findings.licenseLast4,
    outcome,
    rejectionCategory,
    reviewerId: start.reviewerId,
    startedAt: start.startedAt,
    completedAt: now.toISOString(),
    rawSourceDeletedAt: null,
  };
  assertMinimalVerificationRecord(record);
  return {
    kase: { ...kase, status: to, updatedAt: now.toISOString() },
    record,
  };
}

// ---------------------------------------------------------------------------
// The activation gate (what the obligation flow consumes)
// ---------------------------------------------------------------------------

// The one question activation asks this domain: may this member activate?
// A rejected review BLOCKS activation outright. Anything short of a verified
// review also blocks, truthfully, as not-yet-verified. Only a completed
// manual_name_age review with outcome verified opens the gate.
export type ActivationIdentityGate =
  | { blocked: false; reviewId: string }
  | { blocked: true; reason: "identity_rejected" | "identity_not_verified" };

export function identityActivationGate(
  review: IdentityVerificationRecord | null,
): ActivationIdentityGate {
  if (review === null) return { blocked: true, reason: "identity_not_verified" };
  if (review.reviewType !== IDENTITY_REVIEW_TYPE) {
    // A record from some other review lane never opens this gate.
    return { blocked: true, reason: "identity_not_verified" };
  }
  if (review.outcome === "rejected") return { blocked: true, reason: "identity_rejected" };
  if (review.outcome === "verified") return { blocked: false, reviewId: review.reviewId };
  return { blocked: true, reason: "identity_not_verified" };
}
