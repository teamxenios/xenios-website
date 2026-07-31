import { describe, expect, it } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CareIntakeDefinition,
  CareIntakeFieldDefinition,
} from "@shared/care/intake";
import {
  CARE_INTAKE_REVIEW_STEP_ID,
  autosavePayload,
  buildIntakeSections,
  displayAnswer,
  fieldLabel,
  isAnswered,
  resumeStepId,
  sectionIdForFieldKey,
  sectionProgress,
  stableResponseKey,
  stepOrder,
  submitBlockers,
  validateField,
} from "./intake-sections";

// Every fixture below is a synthetic questionnaire shape, not a real approved
// questionnaire and not a real person. No patient identity, no clinical value.
const field = (
  key: string,
  overrides: Partial<CareIntakeFieldDefinition> = {},
): CareIntakeFieldDefinition => ({
  key,
  kind: "text",
  required: false,
  options: [],
  ...overrides,
});

function definitionOf(
  fields: readonly CareIntakeFieldDefinition[],
): CareIntakeDefinition {
  return {
    id: "synthetic-definition" as CareRecordId,
    version: "synthetic-v1",
    status: "approved",
    schemaHash: "sha256:synthetic",
    fields,
    approvedAt: "2026-07-25T18:00:00.000Z",
  };
}

describe("Care intake section grouping", () => {
  it("returns no sections without an approved definition", () => {
    expect(buildIntakeSections(null)).toEqual([]);
    expect(buildIntakeSections(definitionOf([]))).toEqual([]);
  });

  it("groups approved keys into ordered steps and drops empty ones", () => {
    const sections = buildIntakeSections(
      definitionOf([
        field("goals_summary"),
        field("identity_preferred_name"),
        field("medications_current"),
      ]),
    );
    expect(sections.map((section) => section.id)).toEqual([
      "identity",
      "medications",
      "goals",
    ]);
    expect(sections.every((section) => section.fields.length > 0)).toBe(true);
  });

  it("never hides an approved question it cannot classify", () => {
    const sections = buildIntakeSections(
      definitionOf([field("synthetic_unmatched_question")]),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("additional");
    expect(sections[0].fields[0].key).toBe("synthetic_unmatched_question");
  });

  it("derives a label only from the approved key", () => {
    expect(fieldLabel(field("medical_history_prior_care"))).toBe(
      "Prior care",
    );
    expect(fieldLabel(field("synthetic_unmatched_question"))).toBe(
      "Synthetic unmatched question",
    );
    expect(fieldLabel(field("identity"))).toBe("Identity");
  });

  it("puts review last in the step order", () => {
    const sections = buildIntakeSections(definitionOf([field("goals_focus")]));
    expect(stepOrder(sections)).toEqual(["goals", CARE_INTAKE_REVIEW_STEP_ID]);
  });

  it("finds the section that owns an approved key", () => {
    const sections = buildIntakeSections(
      definitionOf([field("allergies_known"), field("goals_focus")]),
    );
    expect(sectionIdForFieldKey(sections, "goals_focus")).toBe("goals");
    expect(sectionIdForFieldKey(sections, "not_a_key")).toBeNull();
  });
});

describe("Care intake answer state", () => {
  it("treats blank text and empty selections as unanswered", () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered("   ")).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered("a")).toBe(true);
  });

  it("mirrors the server validation for each approved field kind", () => {
    expect(
      validateField(field("goals_date", { kind: "date" }), "2026-07-31", false),
    ).toBeNull();
    expect(
      validateField(field("goals_date", { kind: "date" }), "31-07-2026", false),
    ).toBe("invalid_value");
    expect(
      validateField(
        field("goals_choice", { kind: "single_select", options: ["a", "b"] }),
        "c",
        false,
      ),
    ).toBe("invalid_value");
    expect(
      validateField(
        field("goals_many", { kind: "multi_select", options: ["a", "b"] }),
        ["a", "c"],
        false,
      ),
    ).toBe("invalid_value");
    expect(
      validateField(field("goals_flag", { kind: "boolean" }), "yes", false),
    ).toBe("invalid_value");
    expect(
      validateField(field("goals_long"), "x".repeat(4_001), false),
    ).toBe("invalid_value");
  });

  it("only reports a missing required answer when completeness is required", () => {
    const required = field("goals_focus", { required: true });
    expect(validateField(required, undefined, false)).toBeNull();
    expect(validateField(required, undefined, true)).toBe(
      "required_field_missing",
    );
  });

  it("counts progress per step and completes when required answers exist", () => {
    const sections = buildIntakeSections(
      definitionOf([
        field("goals_focus", { required: true }),
        field("goals_notes"),
      ]),
    );
    expect(sectionProgress(sections[0], {})).toEqual({
      answered: 0,
      total: 2,
      requiredRemaining: 1,
      complete: false,
    });
    expect(
      sectionProgress(sections[0], { goals_focus: "synthetic answer" }),
    ).toEqual({
      answered: 1,
      total: 2,
      requiredRemaining: 0,
      complete: true,
    });
  });

  it("resumes on the first step that still needs a required answer", () => {
    const sections = buildIntakeSections(
      definitionOf([
        field("identity_preferred_name", { required: true }),
        field("goals_focus", { required: true }),
      ]),
    );
    expect(resumeStepId(sections, {})).toBe("identity");
    expect(
      resumeStepId(sections, { identity_preferred_name: "synthetic" }),
    ).toBe("goals");
    expect(
      resumeStepId(sections, {
        identity_preferred_name: "synthetic",
        goals_focus: "synthetic",
      }),
    ).toBe(CARE_INTAKE_REVIEW_STEP_ID);
  });
});

describe("Care intake submit and autosave payload", () => {
  it("blocks submit on a missing required answer and on an invalid one", () => {
    const sections = buildIntakeSections(
      definitionOf([
        field("goals_focus", { required: true }),
        field("goals_date", { kind: "date" }),
      ]),
    );
    expect(submitBlockers(sections, {}).blockingFieldKeys).toEqual([
      "goals_focus",
    ]);
    const invalid = submitBlockers(sections, {
      goals_focus: "synthetic answer",
      goals_date: "not-a-date",
    });
    expect(invalid.blockingFieldKeys).toEqual(["goals_date"]);
    expect(invalid.answered).toBe(2);
    expect(invalid.total).toBe(2);
  });

  it("clears every blocker once each required answer is valid", () => {
    const sections = buildIntakeSections(
      definitionOf([field("goals_focus", { required: true })]),
    );
    expect(
      submitBlockers(sections, { goals_focus: "synthetic answer" })
        .blockingFieldKeys,
    ).toEqual([]);
  });

  it("sends only answered, valid, trimmed answers for approved keys", () => {
    const sections = buildIntakeSections(
      definitionOf([
        field("goals_focus"),
        field("goals_blank"),
        field("goals_date", { kind: "date" }),
      ]),
    );
    const payload = autosavePayload(sections, {
      goals_focus: "  synthetic answer  ",
      goals_blank: "   ",
      goals_date: "not-a-date",
      goals_unknown_key: "should not be sent",
    });
    expect(payload).toEqual({ goals_focus: "synthetic answer" });
  });

  it("serializes a draft stably so an identical draft is not resaved", () => {
    expect(stableResponseKey({ b: "2", a: "1" })).toBe(
      stableResponseKey({ a: "1", b: "2" }),
    );
    expect(stableResponseKey({ a: "1" })).not.toBe(
      stableResponseKey({ a: "2" }),
    );
  });

  it("summarizes an answer for review without interpreting it", () => {
    expect(displayAnswer(field("goals_focus"), undefined)).toBe("Not answered");
    expect(displayAnswer(field("goals_flag", { kind: "boolean" }), true)).toBe(
      "Yes",
    );
    expect(displayAnswer(field("goals_flag", { kind: "boolean" }), false)).toBe(
      "No",
    );
    expect(
      displayAnswer(field("goals_many", { kind: "multi_select" }), ["a", "b"]),
    ).toBe("a, b");
    expect(displayAnswer(field("goals_focus"), "synthetic answer")).toBe(
      "synthetic answer",
    );
  });
});
