import {
  DEFAULT_DISCOVERY_LIMITS, DISCOVERY_GOAL_IDS, DISCOVERY_SCHEMA_VERSION,
  type DiscoveryBinding, type DiscoveryManifest, type DiscoveryQuestion, type DisplayCondition,
} from "../contract";

/**
 * Test fixture only. The first-slice question graph (sleep, weight management,
 * recovery and the shared questions) with the ids, options and display conditions
 * of the 2026-11-20 draft, and no wording. Bindings built here are SYNTHETIC: they
 * exist to exercise union, dedup and hold rules and are not reviewed mappings.
 */
export const FIXTURE_DATASET = "0".repeat(64);
export const FIXTURE_QUESTION_SET = "guide-draft-0.1.0";

const personal = ["personal_wellness", "clinical_information", "unsure"];
const when = (questionId: string, operator: DisplayCondition["operator"], value: DisplayCondition["value"]): DisplayCondition => ({ questionId, operator, value });
const question = (
  id: string, type: DiscoveryQuestion["type"], goalId: DiscoveryQuestion["goalId"], optionIds: string[],
  displayWhen: DisplayCondition[] = [], extra: Partial<DiscoveryQuestion> = {},
): DiscoveryQuestion => ({
  id, version: "0.1.0-draft", type, goalId, depth: "initial", optionIds, exclusiveOptionIds: [], displayWhen,
  dependsOn: [...new Set(displayWhen.map(condition => condition.questionId))], effects: [],
  runtimeEnabled: false, reviewStatus: "DRAFT_REQUIRES_PRODUCT_UX_PRIVACY_REVIEW", ...extra,
});

const goalIds = [...DISCOVERY_GOAL_IDS];
export const SLICE_QUESTIONS: readonly DiscoveryQuestion[] = [
  question("audience", "single_select", null, ["self", "someone_else", "organization", "browsing"]),
  question("pathway", "single_select", null, ["personal_wellness", "clinical_information", "laboratory_research", "unsure"]),
  question("goals", "multi_select", null, goalIds, [when("pathway", "in", personal)], { maxSelected: 10 }),
  question("priority_goals", "multi_select", null, goalIds, [when("goals", "selected_count_gt", 1)], { maxSelected: 3, subsetOfQuestionId: "goals" }),
  question("product_types", "multi_select", null, ["clinical_peptides", "supplements", "topicals", "all_relevant", "unsure"], [when("pathway", "in", personal)], { maxSelected: 5, exclusiveOptionIds: ["all_relevant", "unsure"] }),
  question("format_preference", "multi_select", null, ["capsule_tablet", "powder", "liquid", "topical", "no_preference"], [when("pathway", "in", personal)], { maxSelected: 5, exclusiveOptionIds: ["no_preference"] }),
  question("detail_preference", "single_select", null, ["quick", "deeper", "read_first"]),
  question("information_focus", "multi_select", null, ["plain_explanation", "ingredients_form", "evidence", "requirements", "documents"], [], { maxSelected: 5 }),
  question("weight_focus", "single_select", "weight_management", ["lose_weight", "maintain", "compare_paths", "unsure"], [when("goals", "contains", "weight_management")]),
  question("weight_approach", "single_select", "weight_management", ["clinical_review", "nutrition", "habits", "compare"], [when("goals", "contains", "weight_management")]),
  question("weight_goal_range", "single_select", "weight_management", ["under_25_lb", "25_to_49_lb", "50_to_99_lb", "100_lb_or_more", "no_number", "prefer_not"],
    [when("goals", "contains", "weight_management"), when("weight_focus", "equals", "lose_weight"), when("detail_preference", "equals", "deeper"), when("audience", "equals", "self")],
    { depth: "deeper", reviewStatus: "DRAFT_REQUIRES_CLINICAL_PRIVACY_REVIEW", effects: ["prepare_user_reviewable_care_context_only"] }),
  question("sleep_focus", "multi_select", "sleep", ["falling_asleep", "staying_asleep", "routine", "rested", "unsure"], [when("goals", "contains", "sleep")], { maxSelected: 5, exclusiveOptionIds: ["unsure"] }),
  question("sleep_context", "single_select", "sleep", ["learn_options", "compare_products", "prepare_questions", "read_routine"], [when("goals", "contains", "sleep")]),
  question("sleep_hours", "single_select", "sleep", ["under_4", "4_to_under_6", "6_to_under_8", "8_or_more", "varies", "unsure", "prefer_not"],
    [when("goals", "contains", "sleep"), when("detail_preference", "equals", "deeper"), when("audience", "equals", "self")],
    { depth: "deeper", reviewStatus: "DRAFT_REQUIRES_CLINICAL_PRIVACY_REVIEW", effects: ["prepare_user_reviewable_care_context_only"] }),
  question("recovery_context", "single_select", "recovery", ["exercise", "physical_work", "mobility", "clinical_context", "unsure"], [when("goals", "contains", "recovery")]),
  question("recovery_focus", "single_select", "recovery", ["nutrition", "rest", "mobility", "clinical_options"], [when("goals", "contains", "recovery")]),
  question("laboratory_materials", "multi_select", null, ["peptides", "other_compounds", "supplies", "all"], [when("pathway", "equals", "laboratory_research")], { maxSelected: 4, exclusiveOptionIds: ["all"] }),
  question("laboratory_documents", "multi_select", null, ["identity", "documents", "handling", "requirements"], [when("pathway", "equals", "laboratory_research")], { maxSelected: 4 }),
];

/** A SYNTHETIC approved binding, for evaluator tests only. */
export const syntheticBinding = (goalId: DiscoveryBinding["goalId"], offeringId: string, variantId: string, extra: Partial<DiscoveryBinding> = {}): DiscoveryBinding => ({
  mappingId: `synthetic-${goalId}-${offeringId}-${variantId}`, version: "1", questionSetRevision: FIXTURE_QUESTION_SET,
  catalogDatasetSha256: FIXTURE_DATASET, offeringId, variantId, goalId, pathway: "personal_wellness", predicate: [],
  evidenceIds: ["synthetic-evidence"], reasonTemplate: `Synthetic reason for ${goalId}`, runtimeEnabled: true, reviewStatus: "APPROVED",
  ...extra,
});

export const sliceManifest = (extra: Partial<DiscoveryManifest> = {}): DiscoveryManifest => ({
  schemaVersion: DISCOVERY_SCHEMA_VERSION,
  manifestRevision: "fixture-1",
  questionSetRevision: FIXTURE_QUESTION_SET,
  ruleSetRevision: "fixture-rules-1",
  catalogDatasetSha256: FIXTURE_DATASET,
  status: "published",
  goals: DISCOVERY_GOAL_IDS.map(id => ({ id, mappingStatus: "DRAFT_REQUIRES_EXACT_RECORD_REVIEW" })),
  questions: SLICE_QUESTIONS,
  bindings: [],
  limits: DEFAULT_DISCOVERY_LIMITS,
  ...extra,
});

/** The same graph with every question SYNTHETICALLY marked live, so the evaluator can be exercised. */
export const liveSliceManifest = (extra: Partial<DiscoveryManifest> = {}): DiscoveryManifest => sliceManifest({
  questions: SLICE_QUESTIONS.map(question => ({ ...question, runtimeEnabled: true, reviewStatus: "APPROVED" })),
  ...extra,
});

export const answered = (...optionIds: string[]) => ({ state: "answered", optionIds });
export const skipped = () => ({ state: "skipped", optionIds: [] });
