// xenios education library: the content contract and the publication gate.
//
// ---------------------------------------------------------------------------
// What this module is, and what it is not
// ---------------------------------------------------------------------------
//
// This is the exercise and learning library. It is GENERAL FITNESS EDUCATION.
// It is not a research product surface, it is not a Care surface, and nothing
// here describes how to use a product on a person. The directory it lives in
// (`shared/research/`) is a repository write zone, not a claim that exercise
// education belongs to the research rail. Keep that separation in mind when
// reading anything below.
//
// ---------------------------------------------------------------------------
// The gate that matters
// ---------------------------------------------------------------------------
//
// Content that touches injury, surgery, pain, a neurological limitation, or
// rehabilitation cannot be published until the appropriate professional review
// is RECORDED against the record. That rule is enforced here, in code, by
// `evaluatePublication` and `publishEducationRecord`. It is not a policy note
// in a document that a future edit can quietly ignore.
//
// Two design choices make the gate hard to walk around:
//
//   1. `PublishedEducationRecord` carries a unique-symbol brand. The only
//      function in the codebase that can produce that brand is
//      `publishEducationRecord`, and that function returns `{ ok: false }`
//      whenever a required review is missing. So there is no way to construct a
//      published record with an unmet review requirement, including by hand.
//   2. A review only counts when it is a real, attributable review. A reviewer
//      name, a credential reference, and a review date are all required, and a
//      placeholder value ("pending", "needed", "TBD", "n/a") is rejected. The
//      source workbook's reviewer column reads "Professional reviewer pending"
//      for every row, so every imported row has ZERO recorded reviews. We do not
//      turn a placeholder into a reviewer.
//
// Named-person rule: Afam Maduka is recorded as the AUTHOR of the imported
// exercise records, because the source workbook names him in its author column.
// No review by him, or by anyone else, is recorded anywhere in this build. A
// review is only ever created by the person doing it.
//
// ---------------------------------------------------------------------------
// Where the review requirements come from
// ---------------------------------------------------------------------------
//
// `13_EDUCATION_EXERCISE_AND_LEARNING_LIBRARY_2026-08-01_v2.xlsx`, sheet
// "Approval Matrix", rows ED-AP-001 to ED-AP-010. Each row states a content
// type or a sensitive subject and the reviewer it requires. Those ten rows are
// transcribed into `BASELINE_REVIEW_GROUPS` and `SENSITIVE_REVIEW_GROUPS`
// below, with the matrix row id kept beside each entry so the mapping can be
// checked against the workbook. Nothing here was invented.
//
// This module is dependency free so any lane can consume it.

// ---------------------------------------------------------------------------
// The closed unions
// ---------------------------------------------------------------------------

/** Where a record sits in its lifecycle. Only `publishEducationRecord` reaches PUBLISHED. */
export const EDUCATION_APPROVAL_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "WITHDRAWN",
] as const;

export type EducationApprovalState = (typeof EDUCATION_APPROVAL_STATES)[number];

/** The kinds of lesson the library holds. Mirrors ED-AP-001 to ED-AP-004. */
export const EDUCATION_CONTENT_TYPES = [
  "general_exercise_demonstration",
  "beginner_program_lesson",
  "nutrition_education",
  "sleep_recovery_lesson",
] as const;

export type EducationContentType = (typeof EDUCATION_CONTENT_TYPES)[number];

/**
 * Who may sign off on content. These are review ROLES, not job titles, and a
 * role is only meaningful when a named person with a credential reference is
 * attached to it.
 */
export const EDUCATION_REVIEWER_ROLES = [
  "fitness_professional",
  "nutrition_professional",
  "scope_reviewer",
  "licensed_professional",
  "clinician",
  "rehabilitation_professional",
  "neurology_professional",
  "youth_professional",
  "guardian_privacy_reviewer",
  "claims_reviewer",
  "legal_reviewer",
] as const;

export type EducationReviewerRole = (typeof EDUCATION_REVIEWER_ROLES)[number];

/**
 * Subject matter that raises the review bar.
 *
 * The first five are the categories named in the build directive: injury,
 * surgery, pain, neurological limitation, rehabilitation. The last three come
 * from approval matrix rows ED-AP-008, ED-AP-009, and ED-AP-010.
 */
export const EDUCATION_SENSITIVE_SUBJECTS = [
  "injury",
  "surgery",
  "pain",
  "neurological_limitation",
  "rehabilitation",
  "pregnancy_postpartum",
  "youth",
  "product_or_care_linked",
] as const;

export type EducationSensitiveSubject = (typeof EDUCATION_SENSITIVE_SUBJECTS)[number];

/** Who the lesson is written for. Never inferred from a title. */
export const EDUCATION_AUDIENCES = [
  "general_fitness",
  "beginner",
  "youth",
  "prenatal_or_postpartum",
  "older_adult",
  "professional_only",
] as const;

export type EducationAudience = (typeof EDUCATION_AUDIENCES)[number];

/** The movement pattern a demonstration teaches. Mirrors the workbook's category column. */
export const EDUCATION_MOVEMENT_PATTERNS = [
  "lower_body_strength",
  "upper_push",
  "upper_pull",
  "core_and_carry",
  "mobility",
  "power",
  "conditioning",
  "accessory",
  "recovery",
] as const;

export type EducationMovementPattern = (typeof EDUCATION_MOVEMENT_PATTERNS)[number];

/** What the learner needs to have. Mirrors the workbook's equipment column. */
export const EDUCATION_EQUIPMENT = [
  "bodyweight",
  "dumbbell_cable_or_gym",
  "varies_by_movement",
] as const;

export type EducationEquipment = (typeof EDUCATION_EQUIPMENT)[number];

export const EDUCATION_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

export type EducationDifficulty = (typeof EDUCATION_DIFFICULTIES)[number];

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * One recorded professional review.
 *
 * Every field is required and every field is checked. A review with a blank or
 * placeholder name is not a review, and `isRecordedReview` says so.
 */
export interface ProfessionalReview {
  /** The person who actually reviewed it. Never a role name, never a placeholder. */
  readonly reviewerName: string;
  readonly role: EducationReviewerRole;
  /** A license number, registry id, or internal credential record. Never blank. */
  readonly credentialReference: string;
  /** ISO 8601 date, the day the review happened. */
  readonly reviewedAt: string;
  /** What the reviewer looked at, in their own words. */
  readonly scopeNote: string;
}

/** A pointer to produced media. The library holds references, never bytes. */
export interface MediaReference {
  readonly kind: "video" | "image";
  /** The asset identifier in the media system. Never a URL guessed from a title. */
  readonly assetId: string;
}

export interface EducationRecord {
  readonly id: string;
  readonly title: string;
  readonly contentType: EducationContentType;
  readonly audience: EducationAudience | null;
  readonly movementPattern: EducationMovementPattern | null;
  readonly equipment: EducationEquipment | null;
  readonly difficulty: EducationDifficulty | null;
  /** Subject matter flags that raise the review bar. Empty means routine content. */
  readonly sensitiveSubjects: readonly EducationSensitiveSubject[];
  /**
   * The contraindication and escalation note. Tells a learner when to stop and
   * who to speak to. Required on every published record.
   */
  readonly escalationNote: string;
  readonly author: string;
  readonly reviews: readonly ProfessionalReview[];
  /** The full transcript of the produced media. Null until it exists. */
  readonly transcript: string | null;
  readonly media: MediaReference | null;
  readonly scriptBody: string | null;
  readonly approvalState: EducationApprovalState;
  /** ISO 8601 date of the most recent completed review pass. Null until reviewed. */
  readonly reviewDate: string | null;
  /** Monotonic record version. Starts at 1 on import. */
  readonly version: number;
  readonly tags: readonly string[];
}

// ---------------------------------------------------------------------------
// Review requirements, transcribed from the approval matrix
// ---------------------------------------------------------------------------

/**
 * A requirement is a GROUP of acceptable roles. At least one recorded review
 * from the group satisfies it. Several groups on one record all have to be
 * satisfied, which is how "claims plus clinical or legal" is expressed.
 */
export interface ReviewRequirement {
  /** The approval matrix row this came from, so the mapping stays checkable. */
  readonly matrixRowId: string;
  readonly reason: string;
  readonly acceptableRoles: readonly EducationReviewerRole[];
}

/** ED-AP-001 to ED-AP-004: the baseline review every lesson needs for its type. */
const BASELINE_REVIEW_GROUPS: Readonly<
  Record<EducationContentType, readonly ReviewRequirement[]>
> = {
  general_exercise_demonstration: [
    {
      matrixRowId: "ED-AP-001",
      reason: "General exercise demonstration needs a qualified fitness reviewer.",
      acceptableRoles: ["fitness_professional"],
    },
  ],
  beginner_program_lesson: [
    {
      matrixRowId: "ED-AP-002",
      reason: "Beginner program lesson needs a fitness reviewer.",
      acceptableRoles: ["fitness_professional"],
    },
  ],
  nutrition_education: [
    {
      matrixRowId: "ED-AP-003",
      reason: "Nutrition education needs a qualified nutrition reviewer or scope owner.",
      acceptableRoles: ["nutrition_professional", "scope_reviewer"],
    },
  ],
  sleep_recovery_lesson: [
    {
      matrixRowId: "ED-AP-004",
      reason: "Sleep and recovery lessons need a scope reviewer.",
      acceptableRoles: ["scope_reviewer"],
    },
  ],
};

/** ED-AP-005 to ED-AP-010: the extra reviews sensitive subject matter needs. */
const SENSITIVE_REVIEW_GROUPS: Readonly<
  Record<EducationSensitiveSubject, readonly ReviewRequirement[]>
> = {
  pain: [
    {
      matrixRowId: "ED-AP-005",
      reason: "Pain content needs a licensed professional reviewer.",
      acceptableRoles: [
        "licensed_professional",
        "clinician",
        "rehabilitation_professional",
        "neurology_professional",
      ],
    },
  ],
  injury: [
    {
      matrixRowId: "ED-AP-005",
      reason: "Injury content needs a licensed professional reviewer.",
      acceptableRoles: [
        "licensed_professional",
        "clinician",
        "rehabilitation_professional",
        "neurology_professional",
      ],
    },
  ],
  surgery: [
    {
      matrixRowId: "ED-AP-006",
      reason:
        "Post operative content needs the responsible clinician or a rehabilitation professional.",
      acceptableRoles: ["clinician", "rehabilitation_professional"],
    },
  ],
  neurological_limitation: [
    {
      matrixRowId: "ED-AP-007",
      reason: "Neurological condition content needs a neurology or rehabilitation professional.",
      acceptableRoles: ["neurology_professional", "rehabilitation_professional"],
    },
  ],
  rehabilitation: [
    {
      matrixRowId: "ED-AP-006",
      reason: "Rehabilitation content needs a rehabilitation professional or the responsible clinician.",
      acceptableRoles: ["rehabilitation_professional", "clinician"],
    },
  ],
  pregnancy_postpartum: [
    {
      matrixRowId: "ED-AP-008",
      reason: "Pregnancy and postpartum content needs a qualified professional reviewer.",
      acceptableRoles: ["licensed_professional", "clinician"],
    },
  ],
  youth: [
    {
      matrixRowId: "ED-AP-009",
      reason: "Youth content needs a qualified youth professional.",
      acceptableRoles: ["youth_professional"],
    },
    {
      matrixRowId: "ED-AP-009",
      reason: "Youth content needs a guardian and privacy review.",
      acceptableRoles: ["guardian_privacy_reviewer"],
    },
  ],
  product_or_care_linked: [
    {
      matrixRowId: "ED-AP-010",
      reason: "Content tied to a product or a Care offer needs a claims reviewer.",
      acceptableRoles: ["claims_reviewer"],
    },
    {
      matrixRowId: "ED-AP-010",
      reason: "Content tied to a product or a Care offer needs a clinical or legal reviewer.",
      acceptableRoles: ["clinician", "legal_reviewer"],
    },
  ],
};

/**
 * The subjects that the build directive names as always requiring professional
 * review before publication. Exported so a test can assert the list has not
 * been quietly shortened.
 */
export const PROFESSIONAL_REVIEW_REQUIRED_SUBJECTS: readonly EducationSensitiveSubject[] = [
  "injury",
  "surgery",
  "pain",
  "neurological_limitation",
  "rehabilitation",
];

/** Every review group a record has to satisfy, baseline plus sensitive subjects. */
export function requiredReviewGroups(
  record: Pick<EducationRecord, "contentType" | "sensitiveSubjects">,
): readonly ReviewRequirement[] {
  const groups: ReviewRequirement[] = [...BASELINE_REVIEW_GROUPS[record.contentType]];
  for (const subject of record.sensitiveSubjects) {
    const extra = SENSITIVE_REVIEW_GROUPS[subject];
    if (extra) groups.push(...extra);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// What counts as a recorded review
// ---------------------------------------------------------------------------

/**
 * Values that look like data but mean "nobody has done this yet". The source
 * workbook is full of them. None of them may become a reviewer, an asset, or a
 * transcript.
 */
const PLACEHOLDER_PATTERN =
  /^(?:-+|n\/?a|tbd|t\.b\.d\.?|none|null|unknown|unassigned|placeholder|pending|needed|required)$/i;

/** True when a string carries real content rather than a workbook placeholder. */
export function isRealValue(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (PLACEHOLDER_PATTERN.test(trimmed)) return false;
  // Catch the phrase forms too: "Professional reviewer pending", "Transcript needed",
  // "Video needed", "Script draft", "Tags needed".
  if (/\b(?:pending|needed|not yet|to be (?:assigned|confirmed|determined)|awaiting)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;

/**
 * A review counts only when a named person with a credential reviewed it on a
 * real date. This is the anti fabrication check: a placeholder reviewer column
 * can never satisfy a review requirement.
 */
export function isRecordedReview(review: ProfessionalReview): boolean {
  if (!EDUCATION_REVIEWER_ROLES.includes(review.role)) return false;
  if (!isRealValue(review.reviewerName)) return false;
  if (review.reviewerName.trim().length < 2) return false;
  if (!isRealValue(review.credentialReference)) return false;
  if (!isRealValue(review.reviewedAt) || !ISO_DATE.test(review.reviewedAt.trim())) return false;
  if (!isRealValue(review.scopeNote)) return false;
  return true;
}

/** The reviews on a record that actually count. */
export function recordedReviews(record: Pick<EducationRecord, "reviews">): readonly ProfessionalReview[] {
  return record.reviews.filter(isRecordedReview);
}

function isSatisfied(
  requirement: ReviewRequirement,
  reviews: readonly ProfessionalReview[],
): boolean {
  return reviews.some((review) => requirement.acceptableRoles.includes(review.role));
}

// ---------------------------------------------------------------------------
// Language screen
// ---------------------------------------------------------------------------

export interface LanguageFinding {
  readonly code: string;
  readonly message: string;
  readonly matched: string;
}

/**
 * Education content teaches movement. It never tells a person how to dose,
 * reconstitute, inject, cycle, or stack anything, and it never claims to treat
 * or cure. This screen runs over every free text field before publication.
 */
const PROHIBITED_LANGUAGE: readonly { code: string; message: string; pattern: RegExp }[] = [
  {
    code: "DOSING_LANGUAGE",
    message: "Education content may not carry dosing language.",
    pattern: /\b(?:\d+\s*(?:mg|mcg|ug|iu|ml)\b|dosage|dosing|per\s+dose)\b/i,
  },
  {
    code: "ADMINISTRATION_LANGUAGE",
    message: "Education content may not carry human administration instructions.",
    pattern: /\b(?:inject|injection|subcutaneous|intramuscular|reconstitut\w*|syringe|vial)\b/i,
  },
  {
    code: "CYCLING_OR_STACKING",
    message: "Education content may not describe cycling or stacking a compound.",
    pattern: /\b(?:cycle|cycling|stack|stacking)\s+(?:a\s+)?(?:compound|peptide|supplement|dose)s?\b/i,
  },
  {
    code: "MEDICAL_CLAIM",
    message: "Education content may not claim to treat, cure, or prevent a condition.",
    pattern: /\b(?:cures?|curing|treats?|treating|heals?|healing|prevents?|reverses?)\s+(?:your\s+)?(?:disease|illness|condition|injury|pain|cancer|diabetes)\b/i,
  },
  {
    code: "OUTCOME_GUARANTEE",
    message: "Education content may not guarantee an outcome.",
    pattern: /\b(?:guaranteed?|guarantees)\s+(?:results?|outcomes?|weight loss|recovery)\b/i,
  },
];

export function screenEducationLanguage(...texts: readonly (string | null)[]): readonly LanguageFinding[] {
  const findings: LanguageFinding[] = [];
  for (const text of texts) {
    if (typeof text !== "string" || text.length === 0) continue;
    for (const rule of PROHIBITED_LANGUAGE) {
      const match = rule.pattern.exec(text);
      if (match) {
        findings.push({ code: rule.code, message: rule.message, matched: match[0] });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The publication gate
// ---------------------------------------------------------------------------

export interface PublicationBlocker {
  readonly code: string;
  readonly message: string;
}

export interface PublicationEvaluation {
  readonly publishable: boolean;
  readonly blockers: readonly PublicationBlocker[];
  /** The review groups that are still unmet, for an operations queue. */
  readonly missingReviews: readonly ReviewRequirement[];
}

/**
 * Everything that stands between a record and publication, in plain language.
 *
 * Fails closed: an unknown or absent value is always a blocker, never a pass.
 */
export function evaluatePublication(record: EducationRecord): PublicationEvaluation {
  const blockers: PublicationBlocker[] = [];

  if (record.approvalState === "WITHDRAWN") {
    blockers.push({
      code: "WITHDRAWN_RECORD",
      message: "A withdrawn record cannot be published. Restore it to review first.",
    });
  }
  if (!isRealValue(record.title)) {
    blockers.push({ code: "MISSING_TITLE", message: "The record has no title." });
  }
  if (!isRealValue(record.author)) {
    blockers.push({ code: "MISSING_AUTHOR", message: "The record has no named author." });
  }
  if (record.audience === null) {
    blockers.push({
      code: "MISSING_AUDIENCE",
      message: "No audience is recorded. The source workbook does not assign one per record.",
    });
  }
  if (record.contentType === "general_exercise_demonstration" && record.movementPattern === null) {
    blockers.push({
      code: "MISSING_MOVEMENT_PATTERN",
      message: "An exercise demonstration has to name its movement pattern.",
    });
  }
  if (record.contentType === "general_exercise_demonstration" && record.equipment === null) {
    blockers.push({
      code: "MISSING_EQUIPMENT",
      message: "An exercise demonstration has to name the equipment it needs.",
    });
  }
  if (record.difficulty === null) {
    blockers.push({ code: "MISSING_DIFFICULTY", message: "No difficulty level is recorded." });
  }
  if (!isRealValue(record.escalationNote)) {
    blockers.push({
      code: "MISSING_ESCALATION_NOTE",
      message: "No contraindication and escalation note is recorded.",
    });
  }
  if (!isRealValue(record.transcript)) {
    blockers.push({
      code: "MISSING_TRANSCRIPT",
      message: "No transcript is on file for the produced media.",
    });
  }
  if (record.media === null || !isRealValue(record.media.assetId)) {
    blockers.push({
      code: "MISSING_MEDIA",
      message: "No image or video asset reference is on file.",
    });
  }
  if (!isRealValue(record.reviewDate) || !ISO_DATE.test((record.reviewDate ?? "").trim())) {
    blockers.push({
      code: "MISSING_REVIEW_DATE",
      message: "No completed review date is recorded.",
    });
  }
  if (!Number.isSafeInteger(record.version) || record.version < 1) {
    blockers.push({ code: "INVALID_VERSION", message: "The record version is not a positive integer." });
  }

  const findings = screenEducationLanguage(
    record.title,
    record.escalationNote,
    record.scriptBody,
    record.transcript,
  );
  for (const finding of findings) {
    blockers.push({
      code: finding.code,
      message: `${finding.message} Found: "${finding.matched}".`,
    });
  }

  const counted = recordedReviews(record);
  const missingReviews: ReviewRequirement[] = [];
  for (const requirement of requiredReviewGroups(record)) {
    if (!isSatisfied(requirement, counted)) {
      missingReviews.push(requirement);
      blockers.push({
        code: "MISSING_REQUIRED_REVIEW",
        message: `${requirement.reason} Acceptable roles: ${requirement.acceptableRoles.join(", ")} (${requirement.matrixRowId}).`,
      });
    }
  }

  return { publishable: blockers.length === 0, blockers, missingReviews };
}

declare const publishedBrand: unique symbol;

/**
 * A record that has passed the gate.
 *
 * The brand is declared with a unique symbol and is only ever attached inside
 * `publishEducationRecord`. A caller cannot write this type by hand, so the gate
 * cannot be bypassed by constructing an object literal.
 */
export type PublishedEducationRecord = Omit<EducationRecord, "approvalState"> & {
  readonly approvalState: "PUBLISHED";
  readonly publishedAt: string;
  readonly [publishedBrand]: true;
};

export type PublishOutcome =
  | { readonly ok: true; readonly record: PublishedEducationRecord }
  | { readonly ok: false; readonly blockers: readonly PublicationBlocker[] };

/**
 * The only way a record becomes published.
 *
 * Content involving injury, surgery, pain, a neurological limitation, or
 * rehabilitation reaches `ok: true` only once the matching professional review
 * is recorded on the record.
 */
export function publishEducationRecord(record: EducationRecord, publishedAt: string): PublishOutcome {
  const evaluation = evaluatePublication(record);
  if (!evaluation.publishable) {
    return { ok: false, blockers: evaluation.blockers };
  }
  if (!isRealValue(publishedAt) || !ISO_DATE.test(publishedAt.trim())) {
    return {
      ok: false,
      blockers: [{ code: "INVALID_PUBLISH_DATE", message: "A publish date has to be an ISO 8601 date." }],
    };
  }
  const published = {
    ...record,
    approvalState: "PUBLISHED",
    publishedAt,
  } as PublishedEducationRecord;
  return { ok: true, record: published };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface EducationStateCounts {
  readonly total: number;
  readonly byApprovalState: Readonly<Record<EducationApprovalState, number>>;
  readonly withRecordedReview: number;
  readonly withTranscript: number;
  readonly withMedia: number;
  readonly publishable: number;
  readonly sensitiveSubjectRecords: number;
}

export function countEducationStates(records: readonly EducationRecord[]): EducationStateCounts {
  const byApprovalState = Object.fromEntries(
    EDUCATION_APPROVAL_STATES.map((state) => [state, 0]),
  ) as Record<EducationApprovalState, number>;

  let withRecordedReview = 0;
  let withTranscript = 0;
  let withMedia = 0;
  let publishable = 0;
  let sensitiveSubjectRecords = 0;

  for (const record of records) {
    byApprovalState[record.approvalState] += 1;
    if (recordedReviews(record).length > 0) withRecordedReview += 1;
    if (isRealValue(record.transcript)) withTranscript += 1;
    if (record.media !== null) withMedia += 1;
    if (evaluatePublication(record).publishable) publishable += 1;
    if (record.sensitiveSubjects.length > 0) sensitiveSubjectRecords += 1;
  }

  return {
    total: records.length,
    byApprovalState,
    withRecordedReview,
    withTranscript,
    withMedia,
    publishable,
    sensitiveSubjectRecords,
  };
}
