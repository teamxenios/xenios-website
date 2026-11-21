import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_LIMITS, type DiscoveryManifest, type DiscoveryQuestion } from "./contract";
import { validateManifest } from "./validate-manifest";
import { SLICE_QUESTIONS, liveSliceManifest, sliceManifest, syntheticBinding } from "./__fixtures__/slice-manifest";

const codes = (manifest: DiscoveryManifest) => validateManifest(manifest).issues.map(issue => issue.code);
const withQuestion = (id: string, change: Partial<DiscoveryQuestion>) =>
  sliceManifest({ questions: SLICE_QUESTIONS.map(question => question.id === id ? { ...question, ...change } : question) });

describe("validateManifest", () => {
  it("accepts the first-slice draft and its synthetic live twin", () => {
    expect(validateManifest(sliceManifest())).toEqual({ ok: true, issues: [] });
    expect(validateManifest(liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a")] }))).toEqual({ ok: true, issues: [] });
  });

  it("keeps every draft question runtime-disabled and carries no approved mapping", () => {
    const manifest = sliceManifest();
    expect(manifest.questions.filter(question => question.runtimeEnabled)).toEqual([]);
    expect(manifest.bindings).toEqual([]);
  });

  it("rejects a wrong schema, status, missing revision or broken limits", () => {
    expect(codes(sliceManifest({ schemaVersion: 2 as never }))).toContain("schema_version");
    expect(codes(sliceManifest({ status: "live" as never }))).toContain("status");
    expect(codes(sliceManifest({ ruleSetRevision: " " }))).toContain("revision_missing");
    expect(codes(sliceManifest({ limits: { ...DEFAULT_DISCOVERY_LIMITS, followUpBudget: -1 } }))).toEqual(["limits"]);
  });

  it("rejects unknown or duplicate goals", () => {
    expect(codes(sliceManifest({ goals: [...sliceManifest().goals, { id: "longevity" as never, mappingStatus: "x" }] }))).toContain("goal_unknown");
    expect(codes(sliceManifest({ goals: [...sliceManifest().goals, { id: "sleep", mappingStatus: "x" }] }))).toContain("goal_duplicate");
  });

  it("rejects duplicate questions and options, and selection limits beyond the options", () => {
    expect(codes(sliceManifest({ questions: [...SLICE_QUESTIONS, SLICE_QUESTIONS[0]] }))).toContain("question_duplicate");
    expect(codes(withQuestion("audience", { optionIds: ["self", "self"] }))).toContain("option_duplicate");
    expect(codes(withQuestion("audience", { optionIds: [] }))).toContain("option_limit");
    expect(codes(withQuestion("goals", { maxSelected: 11 }))).toContain("max_selected");
    expect(codes(withQuestion("audience", { maxSelected: 1 }))).toContain("max_selected");
    expect(codes(withQuestion("product_types", { exclusiveOptionIds: ["everything"] }))).toContain("exclusive_unknown");
  });

  it("rejects a subset question whose parent is missing, later or not multi-select", () => {
    expect(codes(withQuestion("priority_goals", { subsetOfQuestionId: "audience" }))).toContain("subset_reference");
    expect(codes(withQuestion("priority_goals", { subsetOfQuestionId: "sleep_focus" }))).toContain("subset_reference");
  });

  it("rejects a condition on a later or unknown question, which also rules out cycles", () => {
    const forward = { questionId: "sleep_focus", operator: "contains", value: "routine" } as const;
    expect(codes(withQuestion("goals", { displayWhen: [forward], dependsOn: ["sleep_focus"] }))).toContain("condition_order");
    const self = { questionId: "goals", operator: "contains", value: "sleep" } as const;
    expect(codes(withQuestion("goals", { displayWhen: [self], dependsOn: ["goals"] }))).toContain("condition_order");
    expect(codes(withQuestion("goals", { displayWhen: [{ questionId: "", operator: "equals", value: "x" }], dependsOn: [""] }))).toContain("condition_reference");
  });

  it("rejects operators that do not fit the parent type, and values outside the parent", () => {
    expect(codes(withQuestion("goals", { displayWhen: [{ questionId: "pathway", operator: "contains", value: "unsure" }] }))).toContain("condition_operator");
    expect(codes(withQuestion("goals", { displayWhen: [{ questionId: "pathway", operator: "in", value: ["somewhere"] }] }))).toContain("condition_value");
    expect(codes(withQuestion("goals", { displayWhen: [{ questionId: "pathway", operator: "in", value: [] }] }))).toContain("condition_value");
    expect(codes(withQuestion("priority_goals", { displayWhen: [{ questionId: "goals", operator: "selected_count_gt", value: 10 }] }))).toContain("condition_value");
    expect(codes(withQuestion("detail_preference", { displayWhen: Array.from({ length: 9 }, () => ({ questionId: "pathway", operator: "equals", value: "unsure" })), dependsOn: ["pathway"] })))
      .toContain("condition_limit");
  });

  it("requires dependsOn to name exactly what the conditions read", () => {
    expect(codes(withQuestion("goals", { dependsOn: [] }))).toContain("depends_on_mismatch");
    expect(codes(withQuestion("goals", { dependsOn: ["pathway", "audience"] }))).toContain("depends_on_mismatch");
  });

  it("flags conditions no single answer can satisfy", () => {
    const displayWhen = [
      { questionId: "goals", operator: "contains", value: "weight_management" },
      { questionId: "weight_focus", operator: "equals", value: "lose_weight" },
      { questionId: "weight_focus", operator: "equals", value: "maintain" },
    ] as const;
    expect(codes(withQuestion("weight_goal_range", { displayWhen, dependsOn: ["goals", "weight_focus"] }))).toContain("unreachable");
  });

  it("rejects unknown and disallowed effects, and goal follow-ups for goals the manifest lacks", () => {
    expect(codes(withQuestion("sleep_focus", { effects: ["invent_benefit" as never] }))).toContain("effect_unknown");
    for (const effect of ["diagnosis", "dose_or_protocol", "automatic_item_selection", "clear_hold", "grant_access"]) {
      expect(codes(withQuestion("sleep_focus", { effects: [effect as never] }))).toContain("effect_disallowed");
    }
    const noSleep = sliceManifest({ goals: sliceManifest().goals.filter(goal => goal.id !== "sleep") });
    expect(codes(noSleep)).toContain("goal_reference");
  });

  it("refuses a runtime-enabled question or binding without the approved status and evidence", () => {
    expect(codes(withQuestion("sleep_hours", { runtimeEnabled: true }))).toContain("runtime_without_review");
    for (const extra of [{ reviewStatus: "DRAFT_REQUIRES_EXACT_RECORD_REVIEW" }, { evidenceIds: [] }]) {
      expect(codes(sliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", extra)] }))).toContain("runtime_without_review");
    }
    expect(codes(sliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", { reviewStatus: "DRAFT", runtimeEnabled: false })] }))).toEqual([]);
  });

  it("binds every mapping to the manifest's dataset and question set, once", () => {
    const binding = syntheticBinding("sleep", "mo_a", "mov_a");
    expect(codes(sliceManifest({ bindings: [binding, binding] }))).toContain("binding_duplicate");
    expect(codes(sliceManifest({ bindings: [binding, { ...binding, mappingId: "other" }] }))).toContain("binding_duplicate");
    expect(codes(sliceManifest({ bindings: [{ ...binding, catalogDatasetSha256: "f".repeat(64) }] }))).toContain("binding_dataset");
    expect(codes(sliceManifest({ bindings: [{ ...binding, questionSetRevision: "guide-draft-0.2.0" }] }))).toContain("binding_question_set");
    expect(codes(sliceManifest({ bindings: [{ ...binding, pathway: "anything" as never }] }))).toContain("binding_shape");
    expect(codes(sliceManifest({ bindings: [{ ...binding, predicate: [{ questionId: "nowhere", operator: "equals", value: "x" }] }] }))).toContain("condition_order");
  });

  it("validates a synthetic graph at the configured capacity without recursion", () => {
    const limits = { ...DEFAULT_DISCOVERY_LIMITS, maxQuestions: 5_000, maxBindings: 50_000 };
    const questions: DiscoveryQuestion[] = [{ ...SLICE_QUESTIONS[0], id: "q0", displayWhen: [], dependsOn: [] }];
    for (let index = 1; index < limits.maxQuestions; index += 1) {
      questions.push({
        ...SLICE_QUESTIONS[0], id: `q${index}`,
        displayWhen: [{ questionId: `q${index - 1}`, operator: "equals", value: "self" }], dependsOn: [`q${index - 1}`],
      });
    }
    const bindings = Array.from({ length: limits.maxBindings }, (_, index) => syntheticBinding("sleep", `mo_${index}`, `mov_${index}`));
    const big = sliceManifest({ questions, bindings, limits });
    expect(validateManifest(big)).toEqual({ ok: true, issues: [] });
    expect(codes(sliceManifest({ questions: [...questions, { ...questions[0], id: "one_more" }], limits }))).toContain("limits");
    expect(codes(sliceManifest({ bindings: [...bindings, syntheticBinding("sleep", "mo_x", "mov_x")], limits }))).toContain("binding_limit");
  });
});

// PRIVATE support regressions; structural refusal is not review/clinical approval.
describe("finite malformed-condition and evidence refusal repairs", () => {
  it("reports numeric in=1 and nonobject conditions instead of throwing", () => {
    const numberIn = withQuestion("goals", { displayWhen: [{ questionId: "pathway", operator: "in", value: 1 }], dependsOn: ["pathway"] });
    expect(() => validateManifest(numberIn)).not.toThrow();
    expect(validateManifest(numberIn)).toMatchObject({ ok: false });
    expect(codes(numberIn)).toContain("condition_value");
    for (const condition of [null, undefined, true, 1, "bad", []]) {
      const manifest = withQuestion("goals", { displayWhen: [condition as never], dependsOn: [] });
      expect(() => validateManifest(manifest)).not.toThrow();
      expect(codes(manifest)).toContain("condition_reference");
      const bindingManifest = liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", { predicate: [condition as never] })] });
      expect(() => validateManifest(bindingManifest)).not.toThrow();
      expect(codes(bindingManifest)).toContain("condition_reference");
    }
    const sparse = withQuestion("goals", { displayWhen: new Array(1), dependsOn: [] });
    expect(codes(sparse)).toContain("condition_reference");
  });

  it("still detects valid contradictory conditions beside an invalid peer", () => {
    const manifest = withQuestion("goals", { displayWhen: [
      { questionId: "pathway", operator: "equals", value: "personal_wellness" },
      null as never,
      { questionId: "pathway", operator: "in", value: ["clinical_information"] },
    ], dependsOn: ["pathway"] });
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(codes(manifest)).toContain("condition_reference");
    expect(codes(manifest)).toContain("unreachable");
    const possible = withQuestion("goals", { displayWhen: [
      { questionId: "pathway", operator: "equals", value: "personal_wellness" },
      { questionId: "pathway", operator: "in", value: ["personal_wellness", "clinical_information"] },
    ], dependsOn: ["pathway"] });
    expect(validateManifest(possible)).toEqual({ ok: true, issues: [] });
    const namedBadOperator = withQuestion("goals", { displayWhen: [
      { questionId: "pathway", operator: "contains", value: "personal_wellness" }, null as never,
    ], dependsOn: [] });
    expect(codes(namedBadOperator)).toContain("condition_operator");
    expect(codes(namedBadOperator)).toContain("depends_on_mismatch");
  });

  it("preserves type/operator/value refusal while validating only safe contradiction inputs", () => {
    const conditions = [
      { questionId: "pathway", operator: "in", value: null },
      { questionId: "pathway", operator: "in", value: "unsure" },
      { questionId: "pathway", operator: "in", value: [1] },
      { questionId: "pathway", operator: "equals", value: ["unsure"] },
      { questionId: "pathway", operator: "equals", value: 1 },
    ];
    for (const condition of conditions) {
      const manifest = withQuestion("goals", { displayWhen: [condition as never], dependsOn: ["pathway"] });
      expect(() => validateManifest(manifest)).not.toThrow();
      expect(codes(manifest)).toContain("condition_value");
    }
    for (const value of [null, "1", -1, 0.5, 10]) {
      const manifest = withQuestion("priority_goals", { displayWhen: [{ questionId: "goals", operator: "selected_count_gt", value: value as never }], dependsOn: ["goals"] });
      expect(() => validateManifest(manifest)).not.toThrow();
      expect(codes(manifest)).toContain("condition_value");
    }
  });

  it("requires every evidence element to be nonblank without activating a draft", () => {
    for (const evidenceIds of [[""], ["   "], [1], [null], [{}], ["synthetic-id", false], new Array(1)]) {
      const manifest = liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", { evidenceIds: evidenceIds as never })] });
      expect(codes(manifest)).toContain("binding_shape");
    }
    expect(codes(liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", { evidenceIds: [] })] })))
      .toContain("runtime_without_review");
    expect(validateManifest(liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", { evidenceIds: ["synthetic-id"] })] })))
      .toEqual({ ok: true, issues: [] });
    expect(validateManifest(sliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", { evidenceIds: [], runtimeEnabled: false, reviewStatus: "DRAFT" })] })))
      .toEqual({ ok: true, issues: [] });
    expect(sliceManifest().bindings).toEqual([]);
    expect(sliceManifest().questions.some(question => question.runtimeEnabled)).toBe(false);
  });
});
