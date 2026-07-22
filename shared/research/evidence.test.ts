import { describe, expect, it } from "vitest";
import {
  AUTOMATED_REACHABLE_STATES,
  EVIDENCE_GRADES,
  GUIDE_WORKFLOW_STATES,
  GUIDE_WORKFLOW_TRANSITIONS,
  HUMAN_EVIDENCE_KINDS,
  REVIEW_ROLES,
  SOURCE_KINDS,
  canPublish,
  gradeExceeds,
  isAutomatedReachable,
  isMemberVisible,
  maxGradeForSource,
  memberStatusFor,
  requiredReviewsFor,
  transitionGuide,
  validateClaimGrade,
  type EvidenceClaim,
  type EvidenceGrade,
  type EvidenceSource,
  type Guide,
  type GuideActor,
  type GuideTransitionResult,
  type GuideWorkflowState,
  type ReviewDecision,
  type ReviewRole,
  type SourceKind,
} from "./evidence";

// ---------------------------------------------------------------------------
// Fixtures. No dosing, no frequency, no route of administration anywhere.
// ---------------------------------------------------------------------------

const AUTOMATED: GuideActor = { kind: "automated" };

function human(role: ReviewRole, reviewerId = `rev-${role}`): GuideActor {
  return { kind: "human", reviewerId, role };
}

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    id: "s1",
    kind: "human_trial",
    citation: "A randomized human trial of the compound.",
    url: null,
    verified: true,
    recordedAt: "2026-07-01",
    recordedBy: "samuel",
    ...overrides,
  };
}

function claim(overrides: Partial<EvidenceClaim> = {}): EvidenceClaim {
  return {
    id: "c1",
    guideSlug: "creatine",
    text: "Supports training performance in resistance-trained adults.",
    grade: "B",
    sourceIds: ["s1"],
    memberVisible: true,
    gradedAt: "2026-07-01",
    gradedBy: "samuel",
    ...overrides,
  };
}

function review(overrides: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    guideSlug: "creatine",
    revision: 3,
    role: "scientific",
    reviewerId: "rev-scientific",
    decision: "approved",
    decidedAt: "2026-07-01",
    note: "Checked.",
    ...overrides,
  };
}

function guide(overrides: Partial<Guide> = {}): Guide {
  return {
    slug: "creatine",
    title: "Creatine",
    state: "founder_review",
    revision: 3,
    publishedAt: null,
    sections: [{ heading: "What it is", body: "A plain-language overview.", order: 1 }],
    claims: [],
    sources: [],
    regulatoryStatements: [],
    reviews: [],
    history: [],
    corrections: [],
    productLinks: [],
    goalLinks: [],
    ...overrides,
  };
}

/**
 * A deliberately unsafe view of the function, used to prove the RUNTIME backstop.
 * Real callers cannot write these calls: the overloads reject an automated actor for
 * any human-only target, which is asserted separately below.
 */
const unsafeTransition = transitionGuide as unknown as (
  from: GuideWorkflowState,
  to: GuideWorkflowState,
  actor: GuideActor,
) => GuideTransitionResult;

// ---------------------------------------------------------------------------
// AI CANNOT PUBLISH
// ---------------------------------------------------------------------------

describe("an automated actor can never reach approved or published", () => {
  it("rejects an automated actor for every state outside idea, researching, draft", () => {
    const humanOnly = GUIDE_WORKFLOW_STATES.filter((s) => !isAutomatedReachable(s));
    expect(humanOnly).toHaveLength(10);

    humanOnly.forEach((to) => {
      GUIDE_WORKFLOW_STATES.forEach((from) => {
        const result = unsafeTransition(from, to, AUTOMATED);
        expect(result.ok, `automated ${from} -> ${to} must be denied`).toBe(false);
        if (!result.ok) expect(result.reason).toBe("human_required");
      });
    });
  });

  it("has no transition rule that lets an automated authority target a human-only state", () => {
    GUIDE_WORKFLOW_TRANSITIONS.forEach((rule) => {
      if (rule.authority === "automated") {
        expect(isAutomatedReachable(rule.to), `${rule.from} -> ${rule.to}`).toBe(true);
      }
    });
  });

  it("closes the automated reachable set at draft from every possible starting state", () => {
    // Breadth-first closure over every automated transition, from every start state.
    GUIDE_WORKFLOW_STATES.forEach((start) => {
      const reached: GuideWorkflowState[] = [start];
      const queue: GuideWorkflowState[] = [start];

      while (queue.length > 0) {
        const current = queue.shift() as GuideWorkflowState;
        GUIDE_WORKFLOW_STATES.forEach((to) => {
          const result = unsafeTransition(current, to, AUTOMATED);
          if (result.ok && !reached.includes(to)) {
            reached.push(to);
            queue.push(to);
          }
        });
      }

      // The start state is in the set by definition, so the claim under test is that
      // automation ADDS nothing outside the automated lane, from any starting point.
      const added = reached.filter((state) => state !== start);
      expect(added, `${start} must not reach approved`).not.toContain("approved");
      expect(added, `${start} must not reach published`).not.toContain("published");
      expect(added, `${start} must not reach updated`).not.toContain("updated");
      added.forEach((state) => {
        expect(isAutomatedReachable(state), `${start} reached ${state}`).toBe(true);
      });
    });
  });

  it("permits the automated drafting lane it is supposed to permit", () => {
    expect(transitionGuide("idea", "researching", AUTOMATED)).toEqual({
      ok: true,
      state: "researching",
    });
    expect(transitionGuide("researching", "draft", AUTOMATED)).toEqual({
      ok: true,
      state: "draft",
    });
    expect(transitionGuide("draft", "researching", AUTOMATED)).toEqual({
      ok: true,
      state: "researching",
    });
  });

  it("rejects these calls at compile time, not only at runtime", () => {
    // @ts-expect-error an automated actor may not target founder_review
    transitionGuide("legal_review", "founder_review", AUTOMATED);
    // @ts-expect-error an automated actor may not target approved
    transitionGuide("founder_review", "approved", AUTOMATED);
    // @ts-expect-error an automated actor may not target published
    transitionGuide("approved", "published", AUTOMATED);
    expect(AUTOMATED_REACHABLE_STATES).toEqual(["idea", "researching", "draft"]);
  });
});

// ---------------------------------------------------------------------------
// Human role gates
// ---------------------------------------------------------------------------

describe("the review ladder requires the right named human", () => {
  it("walks draft to published with the correct role at each step", () => {
    const steps: Array<[GuideWorkflowState, GuideWorkflowState, ReviewRole]> = [
      ["draft", "scientific_review", "scientific"],
      ["scientific_review", "claims_review", "claims"],
      ["claims_review", "quality_review", "quality"],
      ["quality_review", "legal_review", "legal"],
      ["legal_review", "founder_review", "founder"],
      ["founder_review", "approved", "founder"],
      ["approved", "published", "founder"],
    ];
    steps.forEach(([from, to, role]) => {
      expect(transitionGuide(from, to, human(role))).toEqual({ ok: true, state: to });
    });
  });

  it("requires the founder role specifically for approved and for published", () => {
    REVIEW_ROLES.filter((r) => r !== "founder").forEach((role) => {
      const toApproved = transitionGuide("founder_review", "approved", human(role));
      expect(toApproved.ok, `${role} must not approve`).toBe(false);
      if (!toApproved.ok) expect(toApproved.reason).toBe("wrong_role");

      const toPublished = transitionGuide("approved", "published", human(role));
      expect(toPublished.ok, `${role} must not publish`).toBe(false);
      if (!toPublished.ok) expect(toPublished.reason).toBe("wrong_role");
    });
  });

  it("denies a human whose role does not own the stage", () => {
    const result = transitionGuide("draft", "scientific_review", human("legal"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong_role");
  });

  it("denies a human actor with no reviewer id", () => {
    const result = transitionGuide("approved", "published", human("founder", "   "));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unnamed_reviewer");
  });

  it("denies a transition that is not in the table at all", () => {
    const result = transitionGuide("draft", "published", human("founder"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_such_transition");
  });

  it("lets any named human raise a correction but only the founder republish", () => {
    expect(transitionGuide("published", "correction_pending", human("claims"))).toEqual({
      ok: true,
      state: "correction_pending",
    });
    const byClaims = transitionGuide("correction_pending", "updated", human("claims"));
    expect(byClaims.ok).toBe(false);
    if (!byClaims.ok) expect(byClaims.reason).toBe("wrong_role");
    expect(transitionGuide("correction_pending", "updated", human("founder"))).toEqual({
      ok: true,
      state: "updated",
    });
  });
});

// ---------------------------------------------------------------------------
// Member visibility
// ---------------------------------------------------------------------------

describe("member visibility", () => {
  it("is true only for published and updated", () => {
    GUIDE_WORKFLOW_STATES.forEach((state) => {
      const expected = state === "published" || state === "updated";
      expect(isMemberVisible(state), state).toBe(expected);
    });
  });

  it("does not expose an approved but unpublished Guide", () => {
    expect(isMemberVisible("approved")).toBe(false);
    expect(memberStatusFor("approved")).toBe("in_review");
  });

  it("collapses every internal stage to a status a member may see", () => {
    const allowed = ["published", "updated", "in_review", "in_development", "coming_soon"];
    GUIDE_WORKFLOW_STATES.forEach((state) => {
      expect(allowed).toContain(memberStatusFor(state));
    });
    expect(memberStatusFor("withdrawn")).toBe("in_development");
    expect(memberStatusFor("idea")).toBe("coming_soon");
  });
});

// ---------------------------------------------------------------------------
// Source ceilings
// ---------------------------------------------------------------------------

describe("maxGradeForSource", () => {
  it("caps a retailer, vendor, manufacturer, or supplier page at E", () => {
    expect(maxGradeForSource("retailer_or_vendor")).toBe("E");
    expect(maxGradeForSource("manufacturer")).toBe("E");
    expect(maxGradeForSource("supplier")).toBe("E");
  });

  it("caps traditional use at F and anything unrecognized at G", () => {
    expect(maxGradeForSource("traditional")).toBe("F");
    expect(maxGradeForSource("other")).toBe("G");
    expect(maxGradeForSource("not_a_real_kind" as SourceKind)).toBe("G");
  });

  it("lets regulatory and systematic evidence reach A and human trials reach B", () => {
    expect(maxGradeForSource("fda")).toBe("A");
    expect(maxGradeForSource("systematic_review")).toBe("A");
    expect(maxGradeForSource("human_trial")).toBe("B");
    expect(maxGradeForSource("clinical_trial_registry")).toBe("B");
    expect(maxGradeForSource("preclinical_study")).toBe("D");
  });

  it("returns a real grade for every declared source kind", () => {
    SOURCE_KINDS.forEach((kind) => {
      expect(EVIDENCE_GRADES).toContain(maxGradeForSource(kind));
    });
  });

  it("never lists a commercial page as human evidence", () => {
    expect(HUMAN_EVIDENCE_KINDS).not.toContain("retailer_or_vendor");
    expect(HUMAN_EVIDENCE_KINDS).not.toContain("manufacturer");
    expect(HUMAN_EVIDENCE_KINDS).not.toContain("supplier");
  });

  it("orders grades so A is strongest and PROHIBITED never reads as too strong", () => {
    expect(gradeExceeds("A", "B")).toBe(true);
    expect(gradeExceeds("B", "B")).toBe(false);
    expect(gradeExceeds("E", "B")).toBe(false);
    expect(gradeExceeds("PROHIBITED", "G")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Claim grading
// ---------------------------------------------------------------------------

describe("validateClaimGrade", () => {
  it("refuses B for a claim citing only a vendor page", () => {
    const vendor = source({ id: "v1", kind: "retailer_or_vendor", citation: "Product listing." });
    const result = validateClaimGrade(claim({ grade: "B", sourceIds: ["v1"] }), [vendor]);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("human_evidence_required");
    expect(result.violations).toContain("grade_exceeds_source_ceiling");
  });

  it("refuses A, B, and C for vendor-only and manufacturer-only citations", () => {
    const commercial: SourceKind[] = ["retailer_or_vendor", "manufacturer", "supplier"];
    const strong: EvidenceGrade[] = ["A", "B", "C"];
    commercial.forEach((kind) => {
      strong.forEach((grade) => {
        const s = source({ id: "x1", kind });
        const result = validateClaimGrade(claim({ grade, sourceIds: ["x1"] }), [s]);
        expect(result.ok, `${kind} must not support ${grade}`).toBe(false);
      });
    });
  });

  it("accepts E for a vendor-only citation", () => {
    const vendor = source({ id: "v1", kind: "retailer_or_vendor" });
    const result = validateClaimGrade(claim({ grade: "E", sourceIds: ["v1"] }), [vendor]);
    expect(result).toEqual({ ok: true, violations: [] });
  });

  it("accepts B when a human trial is cited", () => {
    const trial = source({ id: "s1", kind: "human_trial" });
    expect(validateClaimGrade(claim({ grade: "B" }), [trial])).toEqual({ ok: true, violations: [] });
  });

  it("refuses A when only a human trial is cited, because a trial ceilings at B", () => {
    const trial = source({ id: "s1", kind: "human_trial" });
    const result = validateClaimGrade(claim({ grade: "A" }), [trial]);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["grade_exceeds_source_ceiling"]);
  });

  it("accepts A when a systematic review is cited", () => {
    const sr = source({ id: "s1", kind: "systematic_review" });
    expect(validateClaimGrade(claim({ grade: "A" }), [sr])).toEqual({ ok: true, violations: [] });
  });

  it("uses the strongest cited ceiling, so weak provenance alongside a trial is harmless", () => {
    const trial = source({ id: "s1", kind: "human_trial" });
    const vendor = source({ id: "s2", kind: "retailer_or_vendor" });
    const result = validateClaimGrade(claim({ grade: "B", sourceIds: ["s1", "s2"] }), [trial, vendor]);
    expect(result).toEqual({ ok: true, violations: [] });
  });

  it("refuses a claim with no sources at all", () => {
    const result = validateClaimGrade(claim({ grade: "C", sourceIds: [] }), []);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("missing_source");
    expect(result.violations).toContain("grade_exceeds_source_ceiling");
  });

  it("flags a citation that points at a source that does not exist", () => {
    const trial = source({ id: "s1", kind: "human_trial" });
    const result = validateClaimGrade(claim({ grade: "B", sourceIds: ["s1", "ghost"] }), [trial]);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["unknown_source_reference"]);
  });

  it("never lets a PROHIBITED claim be member visible", () => {
    const trial = source({ id: "s1", kind: "human_trial" });
    const shown = validateClaimGrade(claim({ grade: "PROHIBITED", memberVisible: true }), [trial]);
    expect(shown.ok).toBe(false);
    expect(shown.violations).toContain("prohibited_claim_member_visible");

    const hidden = validateClaimGrade(claim({ grade: "PROHIBITED", memberVisible: false }), [trial]);
    expect(hidden).toEqual({ ok: true, violations: [] });
  });

  it("grades each claim on its own sources, never the Guide as a whole", () => {
    const trial = source({ id: "s1", kind: "human_trial" });
    const vendor = source({ id: "s2", kind: "retailer_or_vendor" });
    const strong = validateClaimGrade(claim({ id: "c1", grade: "B", sourceIds: ["s1"] }), [trial, vendor]);
    const weak = validateClaimGrade(claim({ id: "c2", grade: "B", sourceIds: ["s2"] }), [trial, vendor]);
    expect(strong.ok).toBe(true);
    expect(weak.ok).toBe(false);
  });

  it("reports each violation once", () => {
    const result = validateClaimGrade(claim({ grade: "A", sourceIds: ["ghost1", "ghost2"] }), []);
    const unique = result.violations.filter((v, i) => result.violations.indexOf(v) === i);
    expect(result.violations).toEqual(unique);
  });
});

// ---------------------------------------------------------------------------
// Sign-off
// ---------------------------------------------------------------------------

describe("requiredReviewsFor", () => {
  it("lists all five roles when nothing is signed off", () => {
    expect(requiredReviewsFor(guide())).toEqual(["scientific", "claims", "quality", "legal", "founder"]);
  });

  it("is empty once all five roles approved the current revision", () => {
    const reviews = REVIEW_ROLES.map((role) => review({ role }));
    expect(requiredReviewsFor(guide({ reviews }))).toEqual([]);
  });

  it("ignores a sign-off on an earlier revision", () => {
    const reviews = REVIEW_ROLES.map((role) => review({ role, revision: 2 }));
    expect(requiredReviewsFor(guide({ revision: 3, reviews }))).toEqual([...REVIEW_ROLES]);
  });

  it("ignores changes_requested and rejected decisions", () => {
    const reviews = [
      review({ role: "scientific", decision: "changes_requested" }),
      review({ role: "claims", decision: "rejected" }),
    ];
    const outstanding = requiredReviewsFor(guide({ reviews }));
    expect(outstanding).toContain("scientific");
    expect(outstanding).toContain("claims");
  });

  it("ignores an anonymous sign-off", () => {
    const reviews = [review({ role: "founder", reviewerId: "  " })];
    expect(requiredReviewsFor(guide({ reviews }))).toContain("founder");
  });

  it("ignores a sign-off belonging to a different Guide", () => {
    const reviews = REVIEW_ROLES.map((role) => review({ role, guideSlug: "other-guide" }));
    expect(requiredReviewsFor(guide({ reviews }))).toEqual([...REVIEW_ROLES]);
  });
});

describe("canPublish fails closed", () => {
  it("passes only with all five approvals on the current revision", () => {
    const reviews = REVIEW_ROLES.map((role) => review({ role }));
    expect(canPublish(guide(), reviews)).toEqual({ ok: true, missing: [] });
  });

  it("fails with any single role missing", () => {
    REVIEW_ROLES.forEach((absent) => {
      const reviews = REVIEW_ROLES.filter((r) => r !== absent).map((role) => review({ role }));
      const result = canPublish(guide(), reviews);
      expect(result.ok, `missing ${absent} must block publication`).toBe(false);
      expect(result.missing).toEqual([absent]);
    });
  });

  it("fails with no reviews at all", () => {
    expect(canPublish(guide(), [])).toEqual({ ok: false, missing: [...REVIEW_ROLES] });
  });

  it("fails when the Guide moved to a new revision after sign-off", () => {
    const reviews = REVIEW_ROLES.map((role) => review({ role, revision: 3 }));
    const result = canPublish(guide({ revision: 4 }), reviews);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([...REVIEW_ROLES]);
  });
});
