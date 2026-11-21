import {
  APPROVED_REVIEW_STATUS, DISCOVERY_GOAL_IDS, OPTION_STATUS_NORMALIZATION,
  type AnswerState, type DiscoveryAnswer, type DiscoveryBinding, type DiscoveryCatalogFact, type DiscoveryGoalId,
  type DiscoveryManifest, type DiscoveryMatch, type DiscoveryQuestion, type DiscoveryResult, type DiscoveryWarning,
  type DisplayCondition, type RawDiscoveryAnswers,
} from "./contract";
import { validateManifest } from "./validate-manifest";

/**
 * The deterministic local evaluator for the adaptive discovery guide.
 *
 * Pure: it reads no URL, storage, network, clock or randomness and writes nothing.
 * Same manifest, answers and catalog facts give the same result. Unknown is never
 * false: a missing, skipped, not-sure or invalid answer is never a negative health
 * fact. Goal matches require an explicitly resolved pathway; the ordinary full
 * catalog remains available when that presentation route is unknown.
 *
 * Personalized set = D ∩ (∪ M(g)) ∩ F, where D is the visible, unheld variants with
 * a current reviewed binding, M(g) the reviewed matches for each selected goal, and
 * F the explicitly enabled factual filters. Soft preferences only reorder.
 */

export type ResolvedAnswers = Readonly<{
  /** Applicable, valid answers only. Hidden or invalid answers never reach a result. */
  answers: Readonly<Record<string, DiscoveryAnswer>>;
  /** Questions currently shown, in manifest order. */
  applicable: readonly string[];
  /** Raw answers removed, with why. Ids only; never the answer. */
  dropped: readonly Readonly<{ questionId: string; state: Extract<AnswerState, "not_applicable" | "conflicting" | "invalid"> }>[];
}>;

const GOAL_SET: ReadonlySet<string> = new Set(DISCOVERY_GOAL_IDS);

function ownAnswer(answers: Readonly<Record<string, DiscoveryAnswer>>, id: string): DiscoveryAnswer | undefined {
  return Object.prototype.hasOwnProperty.call(answers, id) ? answers[id] : undefined;
}

/** Strictly parses one raw answer against its question. Anything unexpected is invalid, never guessed. */
export function parseAnswer(question: DiscoveryQuestion, raw: unknown):
  DiscoveryAnswer | Readonly<{ state: "invalid" | "conflicting" }> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { state: "invalid" };
  const keys = Object.keys(raw);
  if (keys.some(key => key !== "state" && key !== "optionIds")) return { state: "invalid" };
  const { state, optionIds } = raw as { state?: unknown; optionIds?: unknown };
  if (state === "skipped") {
    return optionIds === undefined || (Array.isArray(optionIds) && optionIds.length === 0)
      ? { state: "skipped", optionIds: [] }
      : { state: "invalid" };
  }
  if (state !== "answered" && state !== "not_sure") return { state: "invalid" };
  if (!Array.isArray(optionIds) || optionIds.length === 0) return { state: "invalid" };
  const max = question.type === "single_select" ? 1 : question.maxSelected ?? question.optionIds.length;
  if (optionIds.length > max) return { state: "invalid" };
  if (optionIds.some(option => typeof option !== "string" || !question.optionIds.includes(option))) return { state: "invalid" };
  if (new Set(optionIds).size !== optionIds.length) return { state: "invalid" };
  const ids = optionIds as string[];
  if (ids.length > 1 && ids.some(option => question.exclusiveOptionIds.includes(option))) return { state: "conflicting" };
  // Normalization follows the options, not the caller's label: a lone "unsure" is not_sure
  // and keeps its id (a named not-sure branch may display); a lone "prefer_not" is skipped.
  if (ids.length === 1 && ids[0] === "prefer_not") return { state: OPTION_STATUS_NORMALIZATION.prefer_not, optionIds: [] };
  if (ids.length === 1 && ids[0] === "unsure") return { state: OPTION_STATUS_NORMALIZATION.unsure, optionIds: ids };
  if (state === "not_sure") return { state: "invalid" };
  return { state: "answered", optionIds: ids };
}

/** True only when the condition is known to hold. Missing, skipped or other unknown input is not true. */
export function conditionHolds(condition: DisplayCondition, answers: Readonly<Record<string, DiscoveryAnswer>>): boolean {
  const answer = ownAnswer(answers, condition.questionId);
  if (!answer || answer.state === "skipped") return false;
  const selected = answer.optionIds;
  switch (condition.operator) {
    case "equals": return selected.length === 1 && selected[0] === condition.value;
    case "in": return selected.length === 1 && Array.isArray(condition.value) && condition.value.includes(selected[0]);
    case "contains": return typeof condition.value === "string" && selected.includes(condition.value);
    case "selected_count_gt": return answer.state === "answered" && typeof condition.value === "number" && selected.length > condition.value;
    default: return false;
  }
}

/**
 * Resolves raw answers in manifest order, which is dependency order. A question that
 * is no longer shown loses its answer, so clearing a goal or switching pathway erases
 * every now-unreachable descendant in one pass.
 */
export function resolveAnswers(manifest: DiscoveryManifest, raw: RawDiscoveryAnswers): ResolvedAnswers {
  const answers: Record<string, DiscoveryAnswer> = Object.create(null);
  const applicable: string[] = [];
  const dropped: { questionId: string; state: "not_applicable" | "conflicting" | "invalid" }[] = [];
  const input: RawDiscoveryAnswers = raw !== null && typeof raw === "object" ? raw : {};
  for (const question of manifest.questions) {
    const present = Object.prototype.hasOwnProperty.call(input, question.id);
    // A runtime-disabled question is never shown and its answer never counts. Every
    // question in the 2026-11-20 draft is disabled, so the draft yields no goals at all.
    const live = question.runtimeEnabled && question.reviewStatus === APPROVED_REVIEW_STATUS;
    if (!live || !question.displayWhen.every(condition => conditionHolds(condition, answers))) {
      if (present) dropped.push({ questionId: question.id, state: "not_applicable" });
      continue;
    }
    applicable.push(question.id);
    if (!present) continue;
    const parsed = parseAnswer(question, input[question.id]);
    if (parsed.state === "invalid" || parsed.state === "conflicting") {
      dropped.push({ questionId: question.id, state: parsed.state });
      continue;
    }
    const answer = parsed as DiscoveryAnswer;
    // A subset answer (priority among chosen goals) must stay within the parent's current
    // selection. One outside it invalidates the whole answer; nothing is added implicitly.
    if (question.subsetOfQuestionId && answer.state === "answered") {
      const parent = ownAnswer(answers, question.subsetOfQuestionId);
      if (!parent || answer.optionIds.some(option => !parent.optionIds.includes(option))) {
        dropped.push({ questionId: question.id, state: "invalid" });
        continue;
      }
    }
    answers[question.id] = answer;
  }
  return { answers, applicable, dropped };
}

/**
 * The next questions to show. Shared questions are not counted against the budget;
 * goal follow-ups are, in priority-goal order then selection order. A question
 * appears at most once, however many goals it serves.
 */
export function nextQuestions(manifest: DiscoveryManifest, resolved: ResolvedAnswers): readonly string[] {
  const byId = new Map(manifest.questions.map(question => [question.id, question]));
  const order = goalOrder(resolved.answers);
  const open = resolved.applicable.filter(id => !ownAnswer(resolved.answers, id)).map(id => byId.get(id)!);
  const shared = open.filter(question => question.goalId === null);
  const followUps = open
    .filter(question => question.goalId !== null)
    .map((question, index) => ({ question, index, rank: order.indexOf(question.goalId!) }))
    .sort((a, b) => (a.rank === -1 ? Infinity : a.rank) - (b.rank === -1 ? Infinity : b.rank) || a.index - b.index)
    .slice(0, manifest.limits.followUpBudget)
    .map(entry => entry.question);
  return [...new Set([...shared, ...followUps].map(question => question.id))];
}

/** Selected goals, prioritized ones first, then the visitor's selection order. */
function goalOrder(answers: Readonly<Record<string, DiscoveryAnswer>>): DiscoveryGoalId[] {
  const goalAnswer = ownAnswer(answers, "goals"), priorityAnswer = ownAnswer(answers, "priority_goals");
  const selected = goalAnswer?.state === "answered" ? goalAnswer.optionIds.filter(id => GOAL_SET.has(id)) as DiscoveryGoalId[] : [];
  const priority = priorityAnswer?.state === "answered" ? priorityAnswer.optionIds.filter(id => selected.includes(id as DiscoveryGoalId)) as DiscoveryGoalId[] : [];
  return [...new Set([...priority, ...selected])];
}

const unavailable = (manifest: DiscoveryManifest | null, warnings: DiscoveryWarning[]): DiscoveryResult => ({
  state: "unavailable",
  manifestRevision: manifest?.manifestRevision ?? null,
  catalogDatasetSha256: manifest?.catalogDatasetSha256 ?? null,
  selectedGoalIds: [],
  matches: [],
  unresolvedGoals: [],
  appliedFilters: { formats: [] },
  warnings,
  fullCatalogAvailable: true,
});

export type EvaluateOptions = Readonly<{
  /** The dataset hash of the canonical catalog snapshot the facts came from. */
  catalogDatasetSha256: string;
  /** Formats from an explicit "Only show this format" control. Never inferred from a preference. */
  onlyFormats?: readonly string[];
}>;

const bindingLive = (binding: DiscoveryBinding, manifest: DiscoveryManifest) =>
  binding.runtimeEnabled && binding.reviewStatus === APPROVED_REVIEW_STATUS && binding.evidenceIds.length > 0
  && binding.catalogDatasetSha256 === manifest.catalogDatasetSha256 && binding.questionSetRevision === manifest.questionSetRevision;

/**
 * Evaluates the guide. An invalid, unpublished or stale manifest yields an honest
 * "unavailable" view with the full catalog, never a claim that a product is absent
 * or that the visitor is ineligible.
 */
export function evaluateDiscovery(
  manifest: DiscoveryManifest, raw: RawDiscoveryAnswers, catalog: readonly DiscoveryCatalogFact[], options: EvaluateOptions,
): DiscoveryResult {
  if (!validateManifest(manifest).ok) return unavailable(null, ["manifest_invalid"]);
  if (manifest.status !== "published") return unavailable(manifest, ["manifest_not_published"]);
  if (options.catalogDatasetSha256 !== manifest.catalogDatasetSha256) return unavailable(manifest, ["catalog_version_mismatch"]);

  const resolved = resolveAnswers(manifest, raw);
  const warnings: DiscoveryWarning[] = resolved.dropped.length > 0 ? ["answers_dropped"] : [];
  const goals = goalOrder(resolved.answers).slice(0, manifest.limits.maxSelectedGoals);
  const pathwayAnswer = ownAnswer(resolved.answers, "pathway");
  const pathway = pathwayAnswer?.state === "answered" ? pathwayAnswer.optionIds[0] : undefined;
  const onlyFormats = [...new Set(options.onlyFormats ?? [])];

  // Establish a unique canonical fact before applying visibility, holds or filters.
  // A conflicting duplicate suppresses only discovery matching, never the full catalog.
  const facts = new Map<string, DiscoveryCatalogFact>();
  const ambiguous = new Set<string>();
  for (const fact of catalog) {
    const key = `${fact.offeringId}\u0000${fact.variantId}`;
    const previous = facts.get(key);
    if (!previous) facts.set(key, fact);
    else if (!sameCatalogFact(previous, fact)) ambiguous.add(key);
  }

  // ∪ M(g), deduplicated by exact variant.
  const matched = new Map<string, { fact: DiscoveryCatalogFact; goals: Set<DiscoveryGoalId>; reasons: { goalId: DiscoveryGoalId; mappingId: string; text: string }[] }>();
  for (const binding of manifest.bindings) {
    if (!bindingLive(binding, manifest) || !goals.includes(binding.goalId)) continue;
    // Without an explicit known pathway, do not assign a health-goal route.
    if (pathway === undefined || binding.pathway !== pathway) continue;
    const key = `${binding.offeringId}\u0000${binding.variantId}`;
    const fact = facts.get(key);
    if (!fact || ambiguous.has(key) || !fact.visible || fact.held || !fact.pathways.includes(binding.pathway)) continue;
    if (!binding.predicate.every(condition => conditionHolds(condition, resolved.answers))) continue;
    if (onlyFormats.length > 0 && (fact.format === undefined || !onlyFormats.includes(fact.format))) continue;
    const entry = matched.get(key) ?? { fact, goals: new Set<DiscoveryGoalId>(), reasons: [] };
    entry.goals.add(binding.goalId);
    entry.reasons.push({ goalId: binding.goalId, mappingId: binding.mappingId, text: binding.reasonTemplate });
    matched.set(key, entry);
  }

  // Order: goal priority, then soft format and product-type preferences, then identity.
  // No score, price, commission or guessed benefit takes part.
  const preferredFormats = preference(ownAnswer(resolved.answers, "format_preference"), ["no_preference"]);
  const preferredTypes = preference(ownAnswer(resolved.answers, "product_types"), ["all_relevant"]);
  const rank = (entry: { fact: DiscoveryCatalogFact; goals: Set<DiscoveryGoalId> }) => [
    Math.min(...[...entry.goals].map(goal => goals.indexOf(goal))),
    entry.fact.format !== undefined && preferredFormats.includes(entry.fact.format) ? 0 : 1,
    entry.fact.productType !== undefined && preferredTypes.includes(entry.fact.productType) ? 0 : 1,
  ];
  const matches: DiscoveryMatch[] = [...matched.values()]
    .sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return a.fact.offeringId < b.fact.offeringId ? -1 : a.fact.offeringId > b.fact.offeringId ? 1
        : a.fact.variantId < b.fact.variantId ? -1 : a.fact.variantId > b.fact.variantId ? 1 : 0;
    })
    .map(entry => {
      // Reasons follow goal presentation order, then mapping id, so binding order never shows.
      const reasons = [...entry.reasons].sort((a, b) => goals.indexOf(a.goalId) - goals.indexOf(b.goalId)
        || (a.mappingId < b.mappingId ? -1 : a.mappingId > b.mappingId ? 1 : 0));
      return {
        offeringId: entry.fact.offeringId,
        variantId: entry.fact.variantId,
        goalIds: goals.filter(goal => entry.goals.has(goal)),
        mappingIds: reasons.map(reason => reason.mappingId),
        reasonTemplates: [...new Set(reasons.map(reason => reason.text))],
      };
    });

  const represented = new Set(matches.flatMap(match => match.goalIds));
  return {
    state: "matches",
    manifestRevision: manifest.manifestRevision,
    catalogDatasetSha256: manifest.catalogDatasetSha256,
    selectedGoalIds: goals,
    matches,
    unresolvedGoals: goals.filter(goal => !represented.has(goal)).map(goalId => ({ goalId, reason: "no_reviewed_mapping" as const })),
    appliedFilters: { formats: onlyFormats },
    warnings,
    fullCatalogAvailable: true,
  };
}

function sameCatalogFact(a: DiscoveryCatalogFact, b: DiscoveryCatalogFact): boolean {
  const aPathways = new Set(a.pathways), bPathways = new Set(b.pathways);
  return a.visible === b.visible && a.held === b.held
    && a.format === b.format && a.productType === b.productType
    && aPathways.size === bPathways.size && [...aPathways].every(pathway => bPathways.has(pathway));
}

function preference(answer: DiscoveryAnswer | undefined, neutral: readonly string[]): readonly string[] {
  if (!answer || answer.state !== "answered") return [];
  return answer.optionIds.filter(option => !neutral.includes(option));
}
