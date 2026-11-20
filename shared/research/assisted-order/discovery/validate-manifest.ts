import {
  APPROVED_REVIEW_STATUS, BINDING_PATHWAYS, CONDITION_OPERATORS, DISALLOWED_OUTPUT_EFFECTS, DISCOVERY_GOAL_IDS,
  DISCOVERY_SCHEMA_VERSION, MANIFEST_STATUSES, OPERATORS_BY_TYPE, OUTPUT_EFFECTS, QUESTION_DEPTHS, QUESTION_TYPES,
  type DiscoveryManifest, type DiscoveryQuestion, type DisplayCondition,
} from "./contract";

/**
 * Compiles a discovery manifest before release. A manifest that fails here is never
 * evaluated: the guide falls back to the ordinary catalog. Checks are structural;
 * passing says nothing about whether a mapping is clinically or factually right.
 *
 * Linear in the size of the graph (map lookups only), so a synthetic graph with
 * thousands of questions and bindings validates without recursion.
 */
export type ManifestIssue = Readonly<{ code: ManifestIssueCode; path: string }>;
export type ManifestIssueCode =
  | "schema_version" | "status" | "revision_missing" | "limits"
  | "goal_unknown" | "goal_duplicate"
  | "question_duplicate" | "question_shape" | "option_duplicate" | "option_limit" | "max_selected"
  | "exclusive_unknown" | "subset_reference"
  | "condition_limit" | "condition_reference" | "condition_order" | "condition_operator" | "condition_value"
  | "depends_on_mismatch" | "unreachable"
  | "effect_unknown" | "effect_disallowed" | "goal_reference"
  | "runtime_without_review"
  | "binding_duplicate" | "binding_shape" | "binding_dataset" | "binding_question_set" | "binding_limit";

export type ManifestValidation = Readonly<{ ok: boolean; issues: readonly ManifestIssue[] }>;

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const has = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

export function validateManifest(manifest: DiscoveryManifest): ManifestValidation {
  const issues: ManifestIssue[] = [];
  const issue = (code: ManifestIssueCode, path: string) => { issues.push({ code, path }); };

  if (manifest?.schemaVersion !== DISCOVERY_SCHEMA_VERSION) issue("schema_version", "schemaVersion");
  if (!has(MANIFEST_STATUSES, manifest?.status)) issue("status", "status");
  for (const key of ["manifestRevision", "questionSetRevision", "ruleSetRevision", "catalogDatasetSha256"] as const) {
    if (!isText(manifest?.[key])) issue("revision_missing", key);
  }
  const limits = manifest?.limits;
  const limitKeys = ["maxQuestions", "maxOptionsPerQuestion", "maxConditionsPerQuestion", "maxBindings", "maxSelectedGoals", "followUpBudget"] as const;
  if (!limits || limitKeys.some(key => !isCount(limits[key]))) {
    issue("limits", "limits");
    return { ok: false, issues };
  }
  const questions = Array.isArray(manifest.questions) ? manifest.questions : [];
  const bindings = Array.isArray(manifest.bindings) ? manifest.bindings : [];
  const goals = Array.isArray(manifest.goals) ? manifest.goals : [];
  if (questions.length > limits.maxQuestions) issue("limits", "questions");
  if (bindings.length > limits.maxBindings) issue("binding_limit", "bindings");

  const goalIds = new Set<string>();
  goals.forEach((goal, index) => {
    if (!has(DISCOVERY_GOAL_IDS, goal?.id)) issue("goal_unknown", `goals[${index}]`);
    else if (goalIds.has(goal.id)) issue("goal_duplicate", `goals[${index}]`);
    else goalIds.add(goal.id);
  });

  // Questions seen so far, in order: a condition may only read an earlier question,
  // which makes the dependency graph acyclic by construction.
  const earlier = new Map<string, DiscoveryQuestion>();
  questions.forEach((question, index) => {
    const at = `questions[${index}]`;
    if (!isText(question?.id) || !isText(question.version) || !has(QUESTION_TYPES, question.type)
      || !has(QUESTION_DEPTHS, question.depth) || !Array.isArray(question.optionIds) || !Array.isArray(question.displayWhen)
      || !Array.isArray(question.dependsOn) || !Array.isArray(question.effects) || !Array.isArray(question.exclusiveOptionIds)
      || typeof question.runtimeEnabled !== "boolean" || !isText(question.reviewStatus)) {
      issue("question_shape", at);
      return;
    }
    if (earlier.has(question.id)) { issue("question_duplicate", at); return; }
    const options = new Set<string>();
    for (const option of question.optionIds) {
      if (!isText(option) || options.has(option)) issue("option_duplicate", `${at}.optionIds`);
      options.add(option);
    }
    if (options.size === 0 || options.size > limits.maxOptionsPerQuestion) issue("option_limit", `${at}.optionIds`);
    if (question.maxSelected !== undefined && (question.type !== "multi_select" || !isCount(question.maxSelected)
      || question.maxSelected < 1 || question.maxSelected > options.size)) issue("max_selected", `${at}.maxSelected`);
    if (question.exclusiveOptionIds.some(option => !options.has(option))) issue("exclusive_unknown", `${at}.exclusiveOptionIds`);
    if (question.subsetOfQuestionId !== undefined) {
      const parent = earlier.get(question.subsetOfQuestionId);
      if (question.type !== "multi_select" || !parent || parent.type !== "multi_select"
        || question.optionIds.some(option => !parent.optionIds.includes(option))) issue("subset_reference", `${at}.subsetOfQuestionId`);
    }
    if (question.goalId !== null && (!has(DISCOVERY_GOAL_IDS, question.goalId) || !goalIds.has(question.goalId))) issue("goal_reference", `${at}.goalId`);
    for (const effect of question.effects) {
      if ((DISALLOWED_OUTPUT_EFFECTS as readonly string[]).includes(effect)) issue("effect_disallowed", `${at}.effects`);
      else if (!has(OUTPUT_EFFECTS, effect)) issue("effect_unknown", `${at}.effects`);
    }
    if (question.runtimeEnabled && question.reviewStatus !== APPROVED_REVIEW_STATUS) issue("runtime_without_review", at);

    checkConditions(question.displayWhen, `${at}.displayWhen`, earlier, limits.maxConditionsPerQuestion, issue);
    const read = [...new Set(question.displayWhen.map(condition => condition.questionId))];
    if (read.length !== question.dependsOn.length || read.some(id => !question.dependsOn.includes(id))) issue("depends_on_mismatch", `${at}.dependsOn`);
    if (contradictory(question.displayWhen)) issue("unreachable", `${at}.displayWhen`);
    earlier.set(question.id, question);
  });

  const bindingKeys = new Set<string>();
  const mappingIds = new Set<string>();
  bindings.forEach((binding, index) => {
    const at = `bindings[${index}]`;
    if (!isText(binding?.mappingId) || !isText(binding.version) || !isText(binding.offeringId) || !isText(binding.variantId)
      || !has(DISCOVERY_GOAL_IDS, binding.goalId) || !has(BINDING_PATHWAYS, binding.pathway) || !Array.isArray(binding.predicate)
      || !Array.isArray(binding.evidenceIds) || !isText(binding.reasonTemplate) || typeof binding.runtimeEnabled !== "boolean"
      || !isText(binding.reviewStatus)) {
      issue("binding_shape", at);
      return;
    }
    const key = `${binding.goalId}\u0000${binding.offeringId}\u0000${binding.variantId}\u0000${binding.pathway}`;
    if (mappingIds.has(binding.mappingId) || bindingKeys.has(key)) issue("binding_duplicate", at);
    mappingIds.add(binding.mappingId);
    bindingKeys.add(key);
    if (!goalIds.has(binding.goalId)) issue("goal_reference", `${at}.goalId`);
    if (binding.catalogDatasetSha256 !== manifest.catalogDatasetSha256) issue("binding_dataset", `${at}.catalogDatasetSha256`);
    if (binding.questionSetRevision !== manifest.questionSetRevision) issue("binding_question_set", `${at}.questionSetRevision`);
    if (binding.runtimeEnabled && (binding.reviewStatus !== APPROVED_REVIEW_STATUS || binding.evidenceIds.length === 0)) issue("runtime_without_review", at);
    checkConditions(binding.predicate, `${at}.predicate`, earlier, limits.maxConditionsPerQuestion, issue);
  });

  return { ok: issues.length === 0, issues };
}

function checkConditions(
  conditions: readonly DisplayCondition[], at: string, earlier: ReadonlyMap<string, DiscoveryQuestion>,
  maxConditions: number, issue: (code: ManifestIssueCode, path: string) => void,
) {
  if (conditions.length > maxConditions) issue("condition_limit", at);
  conditions.forEach((condition, index) => {
    const path = `${at}[${index}]`;
    const target = earlier.get(condition?.questionId);
    if (!target) { issue(isText(condition?.questionId) ? "condition_order" : "condition_reference", path); return; }
    if (!has(CONDITION_OPERATORS, condition.operator) || !OPERATORS_BY_TYPE[target.type].includes(condition.operator)) {
      issue("condition_operator", path);
      return;
    }
    const value = condition.value;
    const known = (option: unknown) => typeof option === "string" && target.optionIds.includes(option);
    const valid = condition.operator === "in"
      ? Array.isArray(value) && value.length > 0 && value.every(known)
      : condition.operator === "selected_count_gt"
        ? isCount(value) && (value as number) < (target.maxSelected ?? target.optionIds.length)
        : known(value);
    if (!valid) issue("condition_value", path);
  });
}

/** Two single-select conditions on one question that no answer can satisfy together. */
function contradictory(conditions: readonly DisplayCondition[]): boolean {
  const allowed = new Map<string, Set<string>>();
  for (const condition of conditions) {
    if (condition.operator !== "equals" && condition.operator !== "in") continue;
    const values = new Set(condition.operator === "in" ? condition.value as readonly string[] : [condition.value as string]);
    const prior = allowed.get(condition.questionId);
    const next = prior ? new Set([...prior].filter(value => values.has(value))) : values;
    if (next.size === 0) return true;
    allowed.set(condition.questionId, next);
  }
  return false;
}
