import { describe, expect, it } from "vitest";
import {
  evaluatePublication,
  publishEducationRecord,
  recordedReviews,
  type EducationRecord,
  type ProfessionalReview,
} from "@shared/research/education/library";
import {
  blockerHistogram,
  deriveSensitiveSubjects,
  EDUCATION_APPROVAL_MATRIX,
  EXERCISE_LIBRARY,
  EXERCISE_SOURCE_ROWS,
  exerciseLibraryCounts,
  findEducationRecord,
  LIBRARY_SCOPE_STATEMENT,
  publishedEducationRecords,
  TEXT_DERIVED_SENSITIVE_SUBJECTS,
  toEducationRecord,
} from "./exercise-library";

describe("the import is exactly what the workbook says", () => {
  it("holds all 100 exercise rows from sheet 43 Education Exercise", () => {
    expect(EXERCISE_SOURCE_ROWS).toHaveLength(100);
    expect(EXERCISE_LIBRARY).toHaveLength(100);
    expect(EXERCISE_SOURCE_ROWS[0]?.id).toBe("EX-0001");
    expect(EXERCISE_SOURCE_ROWS[99]?.id).toBe("EX-0100");
  });

  it("keeps the ids unique and in EX-NNNN form", () => {
    const ids = EXERCISE_LIBRARY.map((record) => record.id);
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^EX-\d{4}$/);
  });

  it("transcribes the 10 approval matrix rows", () => {
    expect(EDUCATION_APPROVAL_MATRIX).toHaveLength(10);
    expect(EDUCATION_APPROVAL_MATRIX[0]?.id).toBe("ED-AP-001");
    expect(EDUCATION_APPROVAL_MATRIX[9]?.id).toBe("ED-AP-010");
    expect(EDUCATION_APPROVAL_MATRIX[4]?.contentType).toBe("Pain or injury content");
    expect(EDUCATION_APPROVAL_MATRIX[6]?.contentType).toBe("Neurological condition content");
  });

  it("carries the library scope sentence verbatim", () => {
    expect(LIBRARY_SCOPE_STATEMENT).toContain("general fitness content");
    expect(LIBRARY_SCOPE_STATEMENT).toContain("route to appropriate professionals");
  });

  it("contains no em dashes", () => {
    for (const row of EXERCISE_SOURCE_ROWS) {
      for (const value of Object.values(row)) {
        if (typeof value === "string") expect(value).not.toContain("—");
      }
    }
  });
});

describe("no fabricated reviews, transcripts, or media", () => {
  it("names Afam Maduka as the author on every row, and as the reviewer on none", () => {
    for (const row of EXERCISE_SOURCE_ROWS) {
      expect(row.author).toBe("Afam Maduka");
      expect(row.sourceReviewerNote).toBe("Professional reviewer pending");
    }
  });

  it("records ZERO professional reviews across the whole library", () => {
    let total = 0;
    for (const record of EXERCISE_LIBRARY) {
      expect(record.reviews).toHaveLength(0);
      total += recordedReviews(record).length;
    }
    expect(total).toBe(0);
  });

  it("turns every placeholder into an absence, never into a value", () => {
    for (const record of EXERCISE_LIBRARY) {
      expect(record.transcript).toBeNull();
      expect(record.media).toBeNull();
      expect(record.scriptBody).toBeNull();
      expect(record.tags).toHaveLength(0);
      expect(record.reviewDate).toBeNull();
      // The workbook assigns no per record audience, so none is invented.
      expect(record.audience).toBeNull();
    }
  });

  it("keeps every record in DRAFT, because the workbook says Draft", () => {
    for (const record of EXERCISE_LIBRARY) {
      expect(record.approvalState).toBe("DRAFT");
    }
  });
});

describe("THE GATE holds against the real library", () => {
  it("publishes none of the 100 records", () => {
    expect(publishedEducationRecords()).toHaveLength(0);
    for (const record of EXERCISE_LIBRARY) {
      expect(evaluatePublication(record).publishable).toBe(false);
      expect(publishEducationRecord(record, "2026-08-01").ok).toBe(false);
    }
  });

  it("reports the same five blockers on all 100 records", () => {
    expect(blockerHistogram()).toEqual({
      MISSING_AUDIENCE: 100,
      MISSING_TRANSCRIPT: 100,
      MISSING_MEDIA: 100,
      MISSING_REVIEW_DATE: 100,
      MISSING_REQUIRED_REVIEW: 100,
    });
  });

  it("a real record with rehabilitation content still cannot publish on a fitness review alone", () => {
    const base = findEducationRecord("EX-0001");
    expect(base).toBeDefined();

    const fitnessReview: ProfessionalReview = {
      reviewerName: "Dana Okoro",
      role: "fitness_professional",
      credentialReference: "NSCA-CSCS-118342",
      reviewedAt: "2026-08-01",
      scopeNote: "Technique, modifications, and equipment.",
    };

    // Everything else filled in, and the record reframed as rehabilitation content.
    const staged: EducationRecord = {
      ...(base as EducationRecord),
      sensitiveSubjects: ["rehabilitation"],
      audience: "general_fitness",
      transcript: "Sit down between the hips and stand back up.",
      media: { kind: "video", assetId: "asset_ex_0001" },
      reviewDate: "2026-08-01",
      reviews: [fitnessReview],
    };

    const outcome = publishEducationRecord(staged, "2026-08-01");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.blockers.map((blocker) => blocker.code)).toEqual(["MISSING_REQUIRED_REVIEW"]);
    }

    // Add the rehabilitation professional and it clears.
    const cleared = publishEducationRecord(
      {
        ...staged,
        reviews: [
          fitnessReview,
          {
            reviewerName: "Ana Torres",
            role: "rehabilitation_professional",
            credentialReference: "TX-PT-88214",
            reviewedAt: "2026-08-01",
            scopeNote: "Reviewed restrictions, clearance language, and escalation.",
          },
        ],
      },
      "2026-08-01",
    );
    expect(cleared.ok).toBe(true);
  });
});

describe("sensitive subject detection", () => {
  it("derives exactly the five directive named subjects and nothing else", () => {
    expect([...TEXT_DERIVED_SENSITIVE_SUBJECTS].sort()).toEqual([
      "injury",
      "neurological_limitation",
      "pain",
      "rehabilitation",
      "surgery",
    ]);
  });

  it("flags obvious sensitive subject matter", () => {
    expect(deriveSensitiveSubjects("Post-op knee rehab progression")).toEqual(
      expect.arrayContaining(["surgery", "rehabilitation"]),
    );
    expect(deriveSensitiveSubjects("Training around low back pain")).toContain("pain");
    expect(deriveSensitiveSubjects("Balance work after a stroke")).toContain(
      "neurological_limitation",
    );
    expect(deriveSensitiveSubjects("Return to lifting after an ACL injury")).toContain("injury");
  });

  it("does not misread an ordinary movement name", () => {
    // "Child Pose Reach" is a yoga posture, not youth content.
    expect(deriveSensitiveSubjects("Child Pose Reach", "Recovery / Mobility")).toHaveLength(0);
  });

  it("finds no sensitive subject matter in the 100 imported exercises", () => {
    // The library is ordinary movement education. This is the real state, and it
    // is asserted so a future import that DOES carry injury or rehabilitation
    // content changes this number and gets noticed.
    for (const record of EXERCISE_LIBRARY) {
      expect(record.sensitiveSubjects).toHaveLength(0);
    }
    expect(exerciseLibraryCounts().sensitiveSubjectRecords).toBe(0);
  });

  it("never reads the escalation note, which names pain on every row", () => {
    for (const row of EXERCISE_SOURCE_ROWS) {
      expect(row.escalationNote).toContain("pain");
    }
    // If the note were scanned, all 100 would be flagged. None are.
    expect(exerciseLibraryCounts().sensitiveSubjectRecords).toBe(0);
  });
});

describe("counts, reported honestly", () => {
  it("reports the real state of the library", () => {
    expect(exerciseLibraryCounts()).toEqual({
      total: 100,
      byApprovalState: { DRAFT: 100, IN_REVIEW: 0, APPROVED: 0, PUBLISHED: 0, WITHDRAWN: 0 },
      withRecordedReview: 0,
      withTranscript: 0,
      withMedia: 0,
      publishable: 0,
      sensitiveSubjectRecords: 0,
    });
  });

  it("spreads the movement patterns across the nine workbook categories", () => {
    const patterns = new Set(EXERCISE_LIBRARY.map((record) => record.movementPattern));
    expect(patterns.size).toBe(9);
  });

  it("projects a row without upgrading anything", () => {
    const row = EXERCISE_SOURCE_ROWS[0];
    expect(row).toBeDefined();
    const record = toEducationRecord(row!);
    expect(record.id).toBe(row!.id);
    expect(record.title).toBe(row!.title);
    expect(record.escalationNote).toBe(row!.escalationNote);
    expect(record.version).toBe(1);
    expect(record.contentType).toBe("general_exercise_demonstration");
  });
});
