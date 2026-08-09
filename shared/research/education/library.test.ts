import { describe, expect, it } from "vitest";
import {
  countEducationStates,
  EDUCATION_APPROVAL_STATES,
  EDUCATION_CONTENT_TYPES,
  EDUCATION_REVIEWER_ROLES,
  EDUCATION_SENSITIVE_SUBJECTS,
  evaluatePublication,
  isRealValue,
  isRecordedReview,
  PROFESSIONAL_REVIEW_REQUIRED_SUBJECTS,
  publishEducationRecord,
  recordedReviews,
  requiredReviewGroups,
  screenEducationLanguage,
  type EducationRecord,
  type EducationReviewerRole,
  type EducationSensitiveSubject,
  type ProfessionalReview,
} from "./library";

// A record with every non review requirement already satisfied. Tests below take
// this and remove exactly one thing, so a failure names one cause.
const complete: EducationRecord = {
  id: "EX-TEST-1",
  title: "Bodyweight Squat",
  contentType: "general_exercise_demonstration",
  audience: "general_fitness",
  movementPattern: "lower_body_strength",
  equipment: "bodyweight",
  difficulty: "beginner",
  sensitiveSubjects: [],
  escalationNote:
    "Not a rehabilitation prescription. Stop for pain, dizziness, or unexpected shortness of breath and route appropriately.",
  author: "Afam Maduka",
  reviews: [],
  transcript: "Stand with your feet about shoulder width apart and sit down between your hips.",
  media: { kind: "video", assetId: "asset_ex_test_1" },
  scriptBody: "Set the feet, brace, sit down, stand up.",
  approvalState: "APPROVED",
  reviewDate: "2026-08-01",
  version: 1,
  tags: ["lower body"],
};

function review(overrides: Partial<ProfessionalReview> = {}): ProfessionalReview {
  return {
    reviewerName: "Dana Okoro",
    role: "fitness_professional",
    credentialReference: "NSCA-CSCS-118342",
    reviewedAt: "2026-08-01",
    scopeNote: "Checked technique cues, modifications, and the escalation note.",
    ...overrides,
  };
}

function record(overrides: Partial<EducationRecord> = {}): EducationRecord {
  return { ...complete, ...overrides };
}

function codes(rec: EducationRecord): readonly string[] {
  return evaluatePublication(rec).blockers.map((blocker) => blocker.code);
}

describe("closed unions", () => {
  it("holds exactly the five approval states", () => {
    expect(EDUCATION_APPROVAL_STATES).toEqual([
      "DRAFT",
      "IN_REVIEW",
      "APPROVED",
      "PUBLISHED",
      "WITHDRAWN",
    ]);
  });

  it("keeps the five directive named sensitive subjects in the union", () => {
    for (const subject of PROFESSIONAL_REVIEW_REQUIRED_SUBJECTS) {
      expect(EDUCATION_SENSITIVE_SUBJECTS).toContain(subject);
    }
    expect(PROFESSIONAL_REVIEW_REQUIRED_SUBJECTS).toEqual([
      "injury",
      "surgery",
      "pain",
      "neurological_limitation",
      "rehabilitation",
    ]);
  });

  it("gives every sensitive subject at least one review requirement", () => {
    for (const subject of EDUCATION_SENSITIVE_SUBJECTS) {
      const baseline = requiredReviewGroups({
        contentType: "general_exercise_demonstration",
        sensitiveSubjects: [],
      });
      const raised = requiredReviewGroups({
        contentType: "general_exercise_demonstration",
        sensitiveSubjects: [subject],
      });
      expect(raised.length).toBeGreaterThan(baseline.length);
    }
  });

  it("gives every content type a baseline review requirement", () => {
    for (const contentType of EDUCATION_CONTENT_TYPES) {
      const groups = requiredReviewGroups({ contentType, sensitiveSubjects: [] });
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group.acceptableRoles.length).toBeGreaterThan(0);
        for (const role of group.acceptableRoles) {
          expect(EDUCATION_REVIEWER_ROLES).toContain(role);
        }
        expect(group.matrixRowId).toMatch(/^ED-AP-\d{3}$/);
      }
    }
  });
});

describe("a placeholder is never a review", () => {
  it("rejects the workbook's own reviewer placeholder", () => {
    expect(isRealValue("Professional reviewer pending")).toBe(false);
    expect(isRealValue("Transcript needed")).toBe(false);
    expect(isRealValue("Video needed")).toBe(false);
    expect(isRealValue("Tags needed")).toBe(false);
    expect(isRealValue("TBD")).toBe(false);
    expect(isRealValue("n/a")).toBe(false);
    expect(isRealValue("   ")).toBe(false);
    expect(isRealValue(null)).toBe(false);
  });

  it("does not count a review whose reviewer name is a placeholder", () => {
    expect(isRecordedReview(review({ reviewerName: "Professional reviewer pending" }))).toBe(false);
    expect(isRecordedReview(review({ reviewerName: "" }))).toBe(false);
    expect(isRecordedReview(review({ credentialReference: "TBD" }))).toBe(false);
    expect(isRecordedReview(review({ reviewedAt: "soon" }))).toBe(false);
    expect(isRecordedReview(review({ scopeNote: "pending" }))).toBe(false);
    expect(isRecordedReview(review({ role: "not_a_role" as EducationReviewerRole }))).toBe(false);
  });

  it("counts a complete, attributable review", () => {
    expect(isRecordedReview(review())).toBe(true);
    expect(recordedReviews(record({ reviews: [review()] }))).toHaveLength(1);
  });

  it("a placeholder review cannot satisfy a requirement", () => {
    const withPlaceholder = record({
      reviews: [review({ reviewerName: "Professional reviewer pending" })],
    });
    expect(codes(withPlaceholder)).toContain("MISSING_REQUIRED_REVIEW");
    expect(publishEducationRecord(withPlaceholder, "2026-08-01").ok).toBe(false);
  });
});

describe("THE GATE: sensitive content cannot publish without the right reviewer", () => {
  const requiredRoleBySubject: Readonly<Record<string, EducationReviewerRole>> = {
    injury: "licensed_professional",
    surgery: "rehabilitation_professional",
    pain: "clinician",
    neurological_limitation: "neurology_professional",
    rehabilitation: "rehabilitation_professional",
  };

  for (const subject of PROFESSIONAL_REVIEW_REQUIRED_SUBJECTS) {
    it(`blocks ${subject} content that has only the baseline fitness review`, () => {
      const rec = record({ sensitiveSubjects: [subject], reviews: [review()] });
      const evaluation = evaluatePublication(rec);

      expect(evaluation.publishable).toBe(false);
      expect(evaluation.missingReviews.length).toBeGreaterThan(0);
      expect(evaluation.blockers.map((blocker) => blocker.code)).toContain(
        "MISSING_REQUIRED_REVIEW",
      );

      const outcome = publishEducationRecord(rec, "2026-08-01");
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.blockers.some((blocker) => blocker.code === "MISSING_REQUIRED_REVIEW")).toBe(
          true,
        );
      }
    });

    it(`publishes ${subject} content once the required professional review is recorded`, () => {
      const rec = record({
        sensitiveSubjects: [subject],
        reviews: [
          review(),
          review({
            reviewerName: "Dr Priya Raman",
            role: requiredRoleBySubject[subject],
            credentialReference: "TX-MD-204118",
            scopeNote: "Reviewed the escalation pathway and the restriction language.",
          }),
        ],
      });

      const outcome = publishEducationRecord(rec, "2026-08-02");
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.record.approvalState).toBe("PUBLISHED");
        expect(outcome.record.publishedAt).toBe("2026-08-02");
      }
    });

    it(`rejects a wrong role standing in for ${subject}`, () => {
      const rec = record({
        sensitiveSubjects: [subject],
        reviews: [review(), review({ reviewerName: "Sam Ellis", role: "nutrition_professional" })],
      });
      expect(publishEducationRecord(rec, "2026-08-01").ok).toBe(false);
    });
  }

  it("requires BOTH youth groups: a youth professional and a guardian privacy review", () => {
    const youthOnly = record({
      sensitiveSubjects: ["youth"],
      reviews: [review(), review({ reviewerName: "Kemi Adeyemi", role: "youth_professional" })],
    });
    expect(evaluatePublication(youthOnly).missingReviews).toHaveLength(1);
    expect(publishEducationRecord(youthOnly, "2026-08-01").ok).toBe(false);

    const both = record({
      sensitiveSubjects: ["youth"],
      reviews: [
        review(),
        review({ reviewerName: "Kemi Adeyemi", role: "youth_professional" }),
        review({ reviewerName: "Nina Vaz", role: "guardian_privacy_reviewer" }),
      ],
    });
    expect(publishEducationRecord(both, "2026-08-01").ok).toBe(true);
  });

  it("stacks requirements when a record carries several sensitive subjects", () => {
    const rec = record({
      sensitiveSubjects: ["surgery", "neurological_limitation"],
      reviews: [review()],
    });
    expect(evaluatePublication(rec).missingReviews).toHaveLength(2);

    const oneCovered = record({
      sensitiveSubjects: ["surgery", "neurological_limitation"],
      reviews: [review(), review({ reviewerName: "Dr Lee", role: "clinician" })],
    });
    expect(evaluatePublication(oneCovered).missingReviews).toHaveLength(1);
    expect(publishEducationRecord(oneCovered, "2026-08-01").ok).toBe(false);
  });

  it("a rehabilitation professional covers both surgery and rehabilitation", () => {
    const rec = record({
      sensitiveSubjects: ["surgery", "rehabilitation"],
      reviews: [
        review(),
        review({ reviewerName: "Ana Torres", role: "rehabilitation_professional" }),
      ],
    });
    expect(publishEducationRecord(rec, "2026-08-01").ok).toBe(true);
  });
});

describe("the rest of the publication gate", () => {
  it("publishes a routine record that has its baseline review", () => {
    const outcome = publishEducationRecord(record({ reviews: [review()] }), "2026-08-01");
    expect(outcome.ok).toBe(true);
  });

  const holes: readonly [string, Partial<EducationRecord>][] = [
    ["MISSING_AUDIENCE", { audience: null }],
    ["MISSING_MOVEMENT_PATTERN", { movementPattern: null }],
    ["MISSING_EQUIPMENT", { equipment: null }],
    ["MISSING_DIFFICULTY", { difficulty: null }],
    ["MISSING_ESCALATION_NOTE", { escalationNote: "  " }],
    ["MISSING_TRANSCRIPT", { transcript: null }],
    ["MISSING_TRANSCRIPT", { transcript: "Transcript needed" }],
    ["MISSING_MEDIA", { media: null }],
    ["MISSING_REVIEW_DATE", { reviewDate: null }],
    ["MISSING_AUTHOR", { author: "" }],
    ["MISSING_TITLE", { title: "" }],
    ["INVALID_VERSION", { version: 0 }],
    ["WITHDRAWN_RECORD", { approvalState: "WITHDRAWN" }],
  ];

  for (const [code, hole] of holes) {
    it(`blocks on ${code}`, () => {
      const rec = record({ reviews: [review()], ...hole });
      expect(codes(rec)).toContain(code);
      expect(publishEducationRecord(rec, "2026-08-01").ok).toBe(false);
    });
  }

  it("refuses a publish date that is not an ISO date", () => {
    const outcome = publishEducationRecord(record({ reviews: [review()] }), "tomorrow");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.blockers[0]?.code).toBe("INVALID_PUBLISH_DATE");
    }
  });
});

describe("language screen", () => {
  it("passes ordinary coaching language", () => {
    expect(
      screenEducationLanguage(
        "Set the feet, brace the trunk, and sit down between the hips.",
        "Stop if you feel dizzy and speak with a professional.",
      ),
    ).toHaveLength(0);
  });

  const banned: readonly [string, string][] = [
    ["DOSING_LANGUAGE", "Take 500 mg before the session."],
    ["ADMINISTRATION_LANGUAGE", "Reconstitute the vial before use."],
    ["CYCLING_OR_STACKING", "Stack peptides across the block."],
    ["MEDICAL_CLAIM", "This treats pain within a week."],
    ["OUTCOME_GUARANTEE", "Guaranteed results in thirty days."],
  ];

  for (const [code, text] of banned) {
    it(`flags ${code}`, () => {
      expect(screenEducationLanguage(text).map((finding) => finding.code)).toContain(code);
    });
  }

  it("blocks publication when a script carries prohibited language", () => {
    const rec = record({
      reviews: [review()],
      scriptBody: "Warm up, then take 500 mg of the compound.",
    });
    expect(codes(rec)).toContain("DOSING_LANGUAGE");
    expect(publishEducationRecord(rec, "2026-08-01").ok).toBe(false);
  });
});

describe("counts", () => {
  it("reports the real state of a set of records", () => {
    const counts = countEducationStates([
      record({ approvalState: "DRAFT", reviews: [], transcript: null, media: null }),
      record({ approvalState: "DRAFT", reviews: [review()] }),
      record({ approvalState: "IN_REVIEW", sensitiveSubjects: ["pain"], reviews: [review()] }),
    ]);

    expect(counts.total).toBe(3);
    expect(counts.byApprovalState.DRAFT).toBe(2);
    expect(counts.byApprovalState.IN_REVIEW).toBe(1);
    expect(counts.byApprovalState.PUBLISHED).toBe(0);
    expect(counts.withRecordedReview).toBe(2);
    expect(counts.withTranscript).toBe(2);
    expect(counts.withMedia).toBe(2);
    expect(counts.sensitiveSubjectRecords).toBe(1);
    // Only the middle record is complete: the first has holes, the third is
    // missing its pain review.
    expect(counts.publishable).toBe(1);
  });
});

describe("no way around the gate", () => {
  it("only publishEducationRecord can produce a published record", () => {
    // A hand written object cannot be assigned to PublishedEducationRecord: the
    // brand is a unique symbol declared inside the module. This test pins the
    // runtime half of that guarantee, that the function is the only producer and
    // that it says no when a requirement is unmet.
    const unreviewed = record({ sensitiveSubjects: ["injury"], reviews: [] });
    const outcome = publishEducationRecord(unreviewed, "2026-08-01");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const messages = outcome.blockers.map((blocker) => blocker.message).join(" ");
      expect(messages).toContain("licensed professional");
    }
  });

  it("a subject that is not sensitive does not raise the bar", () => {
    const rec = record({ sensitiveSubjects: [] as readonly EducationSensitiveSubject[] });
    expect(requiredReviewGroups(rec)).toHaveLength(1);
  });
});
