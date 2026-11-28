/**
 * Adaptive discovery guide: the versioned, declarative contract (KAN-60).
 *
 * This is a separate contract from the category/FAQ-only guide in
 * ../catalog-guide.ts, which it does not extend or replace. Every record here is
 * data: no executable strings, no model-generated predicates, and no user text is
 * ever compiled into a rule.
 *
 * Discovery answers are optional presentation preferences held in page memory
 * under the current owner or guest epoch. They never grant catalog access, clear
 * a hold, select an item, decide clinical suitability, or enter a URL, storage,
 * analytics, logs, email, a referral payload or an ordinary request field.
 *
 * Nothing is live by existing: a question or product binding takes effect only
 * when it is runtime-enabled AND carries the approved review status, and the
 * manifest itself is published. Today no binding qualifies, so every selected
 * goal resolves to "no reviewed matches" and the full catalog stays available.
 */

export const DISCOVERY_SCHEMA_VERSION = 1 as const;

/** The ten goals in the 2026-11-20 draft. The first slice exercises sleep, weight management and recovery. */
export const DISCOVERY_GOAL_IDS = [
  "weight_management", "sleep", "recovery", "muscle", "skin_hair_nails",
  "energy", "gut", "focus", "immune", "healthy_aging",
] as const;
export type DiscoveryGoalId = typeof DISCOVERY_GOAL_IDS[number];
export const FIRST_SLICE_GOAL_IDS = ["sleep", "weight_management", "recovery"] as const satisfies readonly DiscoveryGoalId[];

export const QUESTION_TYPES = ["single_select", "multi_select"] as const;
export type QuestionType = typeof QUESTION_TYPES[number];

export const QUESTION_DEPTHS = ["initial", "deeper"] as const;
export type QuestionDepth = typeof QUESTION_DEPTHS[number];

/**
 * Display conditions. `equals` and `in` read a single-select answer; `contains` and
 * `selected_count_gt` read a multi-select answer. The validator rejects any other
 * pairing, so the evaluator never has to guess.
 */
export const CONDITION_OPERATORS = ["equals", "in", "contains", "selected_count_gt"] as const;
export type ConditionOperator = typeof CONDITION_OPERATORS[number];
export const OPERATORS_BY_TYPE: Readonly<Record<QuestionType, readonly ConditionOperator[]>> = {
  single_select: ["equals", "in"],
  multi_select: ["contains", "selected_count_gt"],
};

export type DisplayCondition = Readonly<{
  questionId: string;
  operator: ConditionOperator;
  /** An option id for equals/contains, option ids for in, a non-negative integer for selected_count_gt. */
  value: string | readonly string[] | number;
}>;

/**
 * Answer states. A stored answer is `answered`, `not_sure` or `skipped`. The others
 * are outcomes of resolving a raw answer and are never stored as a selection:
 * `not_applicable` (the question is hidden), `conflicting` (an exclusive option was
 * combined with another) and `invalid` (unknown id, wrong cardinality, out of subset).
 */
export const ANSWER_STATES = ["answered", "skipped", "not_sure", "not_applicable", "conflicting", "invalid"] as const;
export type AnswerState = typeof ANSWER_STATES[number];
export type StoredAnswerState = Extract<AnswerState, "answered" | "skipped" | "not_sure">;

/** Option ids that normalize to a state. `unsure` keeps its id so a named not-sure branch can display. */
export const OPTION_STATUS_NORMALIZATION = { unsure: "not_sure", prefer_not: "skipped" } as const;

export type DiscoveryAnswer = Readonly<{
  state: StoredAnswerState;
  /** Selected option ids, in the visitor's order. Empty for `skipped`. */
  optionIds: readonly string[];
}>;

/** Raw answers keyed by question id, as the UI holds them in memory. Parsed strictly before use. */
export type RawDiscoveryAnswers = Readonly<Record<string, unknown>>;

/** Effects a question may propose. They are inert intents until a reviewed record gives them content. */
export const OUTPUT_EFFECTS = [
  "set_explanatory_audience", "offer_existing_organization_navigation", "choose_reviewed_discovery_pathway",
  "queue_relevant_questions", "queue_goal_questions", "select_reviewed_topic_sections", "order_follow_up_queue",
  "order_goal_sections", "prefer_reviewed_product_type_after_eligibility", "prefer_documented_form_after_eligibility",
  "set_question_budget", "set_explanation_depth", "order_reviewed_detail_sections", "prioritize_reviewed_education",
  "prepare_user_reviewable_care_context_only", "select_reviewed_laboratory_category", "order_reviewed_laboratory_details",
] as const;
export type OutputEffect = typeof OUTPUT_EFFECTS[number];

/** Never produced by any question or rule, whatever a record says. */
export const DISALLOWED_OUTPUT_EFFECTS = [
  "diagnosis", "drug_selection_from_health_severity", "dose_or_protocol", "automatic_item_selection",
  "clear_hold", "grant_access", "clinical_suitability_claim",
] as const;

/**
 * The one review status that lets a record take effect. The 2026-11-20 draft names
 * no approved value; this literal is this contract's proposal and needs sign-off by
 * the content and privacy owners before any record carries it.
 */
export const APPROVED_REVIEW_STATUS = "APPROVED" as const;

export type DiscoveryQuestion = Readonly<{
  id: string;
  version: string;
  type: QuestionType;
  goalId: DiscoveryGoalId | null;
  depth: QuestionDepth;
  optionIds: readonly string[];
  /** Multi-select only; defaults to the option count. */
  maxSelected?: number;
  /** Each listed option must be the only selection. */
  exclusiveOptionIds: readonly string[];
  /** Multi-select only: every selected id must also be selected in this earlier question. */
  subsetOfQuestionId?: string;
  /** Shown only when every condition holds. An empty list means always shown. */
  displayWhen: readonly DisplayCondition[];
  /** Exactly the question ids the conditions read. */
  dependsOn: readonly string[];
  effects: readonly OutputEffect[];
  runtimeEnabled: boolean;
  reviewStatus: string;
}>;

export const BINDING_PATHWAYS = ["personal_wellness", "clinical_information", "laboratory_research"] as const;
export type BindingPathway = typeof BINDING_PATHWAYS[number];

/**
 * One reviewed link from a goal to an exact canonical variant. Bound to the exact
 * catalog dataset; a new import or content revision invalidates it.
 */
export type DiscoveryBinding = Readonly<{
  mappingId: string;
  version: string;
  questionSetRevision: string;
  catalogDatasetSha256: string;
  offeringId: string;
  variantId: string;
  goalId: DiscoveryGoalId;
  pathway: BindingPathway;
  /** Extra conditions over explicit answers, in the same closed language. Empty means the goal alone. */
  predicate: readonly DisplayCondition[];
  evidenceIds: readonly string[];
  /** Reviewed "why is this shown" text. */
  reasonTemplate: string;
  runtimeEnabled: boolean;
  reviewStatus: string;
}>;

export const MANIFEST_STATUSES = ["draft", "reviewed", "published", "withdrawn"] as const;
export type ManifestStatus = typeof MANIFEST_STATUSES[number];

export type DiscoveryLimits = Readonly<{
  maxQuestions: number;
  maxOptionsPerQuestion: number;
  maxConditionsPerQuestion: number;
  maxBindings: number;
  maxSelectedGoals: number;
  /** Goal follow-ups shown before "See results now"; a product hypothesis, not a validated limit. */
  followUpBudget: number;
}>;

export const DEFAULT_DISCOVERY_LIMITS: DiscoveryLimits = {
  maxQuestions: 5_000,
  maxOptionsPerQuestion: 24,
  maxConditionsPerQuestion: 8,
  maxBindings: 50_000,
  maxSelectedGoals: 10,
  followUpBudget: 6,
};

export type DiscoveryManifest = Readonly<{
  schemaVersion: typeof DISCOVERY_SCHEMA_VERSION;
  manifestRevision: string;
  questionSetRevision: string;
  ruleSetRevision: string;
  catalogDatasetSha256: string;
  status: ManifestStatus;
  goals: readonly Readonly<{ id: DiscoveryGoalId; mappingStatus: string }>[];
  /** In dependency order: a question may only read questions listed before it. */
  questions: readonly DiscoveryQuestion[];
  bindings: readonly DiscoveryBinding[];
  limits: DiscoveryLimits;
}>;

/**
 * The canonical facts the evaluator may read about one visible variant. The
 * consumer projects these from the viewer-scoped canonical catalog; the server
 * stays authoritative for visibility and request actions.
 */
export type DiscoveryCatalogFact = Readonly<{
  offeringId: string;
  variantId: string;
  /** Visible to the current confirmed viewer. */
  visible: boolean;
  /** Any current hold, inquiry-only restriction or withdrawn publication. Held items never match a goal. */
  held: boolean;
  /** Pathways the canonical record permits; a binding for any other pathway is ignored. */
  pathways: readonly BindingPathway[];
  /** Factual form, matching `format_preference` option ids where one applies. */
  format?: string;
  /** Factual product type, matching `product_types` option ids where one applies. */
  productType?: string;
}>;

export type DiscoveryMatch = Readonly<{
  offeringId: string;
  variantId: string;
  /** Selected goals this variant has a reviewed binding for, in presentation order. */
  goalIds: readonly DiscoveryGoalId[];
  mappingIds: readonly string[];
  reasonTemplates: readonly string[];
}>;

export const UNRESOLVED_REASONS = ["no_reviewed_mapping"] as const;
export const DISCOVERY_WARNINGS = [
  "manifest_invalid", "manifest_not_published", "catalog_version_mismatch", "answers_dropped",
] as const;
export type DiscoveryWarning = typeof DISCOVERY_WARNINGS[number];

/**
 * A discovery view, not a medical determination. It carries no raw answers, and
 * no field claims approval, eligibility or a recommendation for the person.
 */
export type DiscoveryResult = Readonly<{
  state: "matches" | "unavailable";
  manifestRevision: string | null;
  catalogDatasetSha256: string | null;
  selectedGoalIds: readonly DiscoveryGoalId[];
  matches: readonly DiscoveryMatch[];
  unresolvedGoals: readonly Readonly<{ goalId: DiscoveryGoalId; reason: typeof UNRESOLVED_REASONS[number] }>[];
  appliedFilters: Readonly<{ formats: readonly string[] }>;
  warnings: readonly DiscoveryWarning[];
  fullCatalogAvailable: true;
}>;
