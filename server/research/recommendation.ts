import type { RecommendationDisposition, RecommendationItem } from "@shared/research/member-platform";

// ---------------------------------------------------------------------------
// xenios research member platform: the transparent recommendation engine (G4).
//
// A pure, deterministic rule engine over the submitted assessment answers. No
// IO, no clock, no randomness: the same input always produces the same output,
// so a Blueprint is reproducible and auditable. Every item explains itself in
// plain language and names the exact answers that produced it (sourceSignals).
//
// Hard rules baked into this module:
// - PROVENANCE: nothing here reads compositions, strengths, or prices from
//   products-data.ts as facts. Product references are dispositions and generic
//   categories only; supplement foundation entries are generic categories
//   (for example "a foundation multivitamin"), never brand claims.
// - NO dosing, administration, or treatment vocabulary anywhere in output.
//   Availability speaks only through RecommendationDisposition; product
//   options surface only as possible_research_pathway, needs_samuel_review,
//   or not_available. The engine recommends conversations, never intake.
// - NO free-text echo: a member's own words (allergy details, current product
//   lists, goal descriptions) are matched against categories but never copied
//   into output strings, so draft content cannot leak health free text.
// - Safety flags are conservative: any flagged safety context pushes product
//   and supplement items to needs_samuel_review and adds a review question.
// ---------------------------------------------------------------------------

export type AnswerValue = string | number | string[] | null;

export type RecommendationInput = {
  // The submitted assessment answers, keyed by questionId (assessment.ts).
  answers: Record<string, AnswerValue>;
  // Optional structured profile sections (profile wave). Used only as a
  // fallback source for the primary goal when the assessment answer is
  // missing; never merged into free text.
  profileSections?: { key: string; data: Record<string, unknown> }[];
};

export type RecommendationConfidence = "low" | "medium" | "high";

export type RecommendationOutput = {
  primaryGoal: string;
  secondaryGoals: string[];
  topPriorities: string[]; // always exactly three
  recommendations: RecommendationItem[];
  questionsForReview: string[]; // items flagged for Samuel's personal review
  confidence: RecommendationConfidence;
};

// ---------------------------------------------------------------------------
// Answer readers (tolerant of missing or malformed values; the engine never
// throws on a sparse answer set, it just produces fewer, lower-confidence items)
// ---------------------------------------------------------------------------

function str(answers: Record<string, AnswerValue>, id: string): string | null {
  const value = answers[id];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function num(answers: Record<string, AnswerValue>, id: string): number | null {
  const value = answers[id];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function list(answers: Record<string, AnswerValue>, id: string): string[] {
  const value = answers[id];
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

// Only sourceSignals that were actually answered are attached to an item, so
// every signal in the output is traceable to a real input.
function answeredOf(answers: Record<string, AnswerValue>, ids: string[]): string[] {
  return ids.filter((id) => {
    const value = answers[id];
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return Number.isFinite(value);
  });
}

// ---------------------------------------------------------------------------
// Goal vocabulary (mirrors the assessment's GOAL_OPTIONS values)
// ---------------------------------------------------------------------------

const GOAL_LABELS: Record<string, string> = {
  body_recomposition: "Body recomposition",
  strength: "Strength",
  endurance: "Endurance",
  energy: "Everyday energy",
  sleep_quality: "Sleep quality",
  stress_resilience: "Stress resilience",
  longevity: "Longevity",
  general_health: "General health",
};

function goalLabel(value: string | null): string | null {
  if (!value) return null;
  return GOAL_LABELS[value] ?? null;
}

// ---------------------------------------------------------------------------
// Confidence: answer completeness over the signal questions the engine reads.
// ---------------------------------------------------------------------------

const SIGNAL_QUESTION_IDS = [
  "primary_goal",
  "goal_meaning",
  "training_frequency",
  "has_injuries",
  "eating_pattern",
  "dietary_restrictions",
  "sleep_hours",
  "sleep_quality",
  "energy_level",
  "stress_level",
  "takes_supplements",
  "has_allergies",
  "clinician_care_flag",
  "activity_restriction_flag",
  "pregnancy_flag",
  "monthly_budget",
  "budget_priority",
  "routine_capacity",
] as const;

function computeConfidence(answers: Record<string, AnswerValue>): RecommendationConfidence {
  const answered = answeredOf(answers, [...SIGNAL_QUESTION_IDS]).length;
  const ratio = answered / SIGNAL_QUESTION_IDS.length;
  if (ratio >= 0.85) return "high";
  if (ratio >= 0.5) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Category keyword matching for duplicate warnings. The member's free text is
// scanned for category words only; the text itself never enters the output.
// ---------------------------------------------------------------------------

const DUPLICATE_PATTERNS: Record<string, RegExp> = {
  multivitamin: /multi\s*-?\s*vitamin|multivit|\bmulti\b/i,
  omega_3: /omega|fish\s*oil|\bepa\b|\bdha\b/i,
  protein: /protein/i,
  wind_down: /sleep|melatonin|magnes/i,
};

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function recommend(input: RecommendationInput): RecommendationOutput {
  const answers = input.answers ?? {};

  // Goal mapping. The profile "goals" section is a fallback source only.
  let primaryGoalValue = str(answers, "primary_goal");
  if (!goalLabel(primaryGoalValue)) {
    const profileGoals = (input.profileSections ?? []).find((section) => section.key === "goals");
    const fromProfile = profileGoals?.data?.primaryGoal;
    primaryGoalValue = typeof fromProfile === "string" && GOAL_LABELS[fromProfile] ? fromProfile : primaryGoalValue;
  }
  const primaryGoal = goalLabel(primaryGoalValue) ?? "General health";
  const secondaryGoals = list(answers, "secondary_goals")
    .map((value) => goalLabel(value))
    .filter((label): label is string => label !== null && label !== primaryGoal);
  const dedupedSecondary = Array.from(new Set(secondaryGoals));

  // Derived signals, each traceable to specific answers.
  const sleepHours = num(answers, "sleep_hours");
  const sleepQuality = num(answers, "sleep_quality");
  const fallingAsleep = str(answers, "trouble_falling_asleep");
  const sleepPoor =
    (sleepHours !== null && sleepHours < 7) ||
    (sleepQuality !== null && sleepQuality <= 5) ||
    fallingAsleep === "most_nights";

  const stressLevel = num(answers, "stress_level");
  const stressHigh = stressLevel !== null && stressLevel >= 7;

  const energyLevel = num(answers, "energy_level");
  const energyDips = list(answers, "energy_dips").filter((value) => value !== "none");
  const energyLow = energyLevel !== null && energyLevel <= 4;

  const trainingFrequency = str(answers, "training_frequency");
  const trainingLow = trainingFrequency === "none" || trainingFrequency === "one_to_two";

  const hasInjuries = str(answers, "has_injuries") === "yes";
  const hasAllergies = str(answers, "has_allergies") === "yes";
  const avoidedIngredients = str(answers, "avoided_ingredients") !== null;

  const takesSupplements = str(answers, "takes_supplements") === "yes";
  const currentProductsText = (str(answers, "current_supplements") ?? "").toLowerCase();
  const productsNotWorking = str(answers, "products_working") === "not_working";

  const clinicianCare = str(answers, "clinician_care_flag") === "yes";
  const activityRestricted = str(answers, "activity_restriction_flag") === "yes";
  const pregnancyFlag = str(answers, "pregnancy_flag") === "yes";
  const anySafetyFlag = clinicianCare || activityRestricted || pregnancyFlag;

  const monthlyBudget = str(answers, "monthly_budget");
  const budgetPriority = str(answers, "budget_priority");
  const routineCapacity = str(answers, "routine_capacity");

  const recommendations: RecommendationItem[] = [];
  const questionsForReview: string[] = [];

  // Safety flags make product and supplement items conservative: Samuel
  // reviews them personally before anything is offered.
  const productSafety = (disposition: RecommendationDisposition): RecommendationDisposition =>
    anySafetyFlag ? "needs_samuel_review" : disposition;
  const safetyNote = anySafetyFlag
    ? " Because of the safety context you flagged, Samuel reviews this personally before anything moves forward."
    : "";

  // -------------------------------------------------------------------------
  // Lifestyle items (sleep, stress, energy)
  // -------------------------------------------------------------------------

  if (sleepPoor) {
    recommendations.push({
      id: "lifestyle_sleep_routine",
      kind: "lifestyle",
      title: "A consistent wind-down and sleep window",
      disposition: "recommended",
      explanation:
        "Your sleep answers point to short or unrefreshing nights. A fixed wind-down time and a steady sleep window is the highest-leverage first change, and it costs nothing.",
      sourceSignals: answeredOf(answers, ["sleep_hours", "sleep_quality", "trouble_falling_asleep"]),
    });
  }

  if (stressHigh) {
    recommendations.push({
      id: "lifestyle_stress_downshift",
      kind: "lifestyle",
      title: "A short daily stress downshift practice",
      disposition: "recommended",
      explanation:
        "You rated your recent stress on the high end. A brief daily downshift practice (a walk, breathing, or quiet time) protects everything else in the plan.",
      sourceSignals: answeredOf(answers, ["stress_level", "stress_sources"]),
    });
  }

  if (energyLow || energyDips.length > 0) {
    recommendations.push({
      id: "lifestyle_energy_rhythm",
      kind: "lifestyle",
      title: "An energy-aware daily rhythm",
      disposition: "recommended",
      explanation:
        "Your energy answers show predictable dips. Placing meals, movement, and demanding work around those dips usually recovers more energy than any product.",
      sourceSignals: answeredOf(answers, ["energy_level", "energy_dips"]),
    });
  }

  // -------------------------------------------------------------------------
  // Fitness program assignment (a named program label, never exercise
  // prescription detail; the plan documents carry the actual sessions)
  // -------------------------------------------------------------------------

  const fitnessSignals = answeredOf(answers, ["training_frequency", "primary_goal", "routine_capacity"]);
  if (fitnessSignals.length > 0) {
    let program: string;
    if (trainingFrequency === "none") {
      program = "Foundation Movement 2-Day";
    } else if (trainingFrequency === "one_to_two") {
      program = "Foundation Strength 3-Day";
    } else if (trainingFrequency === "three_to_four") {
      program =
        primaryGoalValue === "strength" || primaryGoalValue === "body_recomposition"
          ? "Strength Builder 4-Day"
          : primaryGoalValue === "endurance"
            ? "Endurance Base 3-Day"
            : "Balanced Training 3-Day";
    } else if (trainingFrequency === "five_plus") {
      program = "Performance Split 5-Day";
    } else {
      program = "Foundation Movement 2-Day";
    }
    // Minimal routine capacity caps the assignment at a three-day shape.
    if (routineCapacity === "minimal" && (program.includes("4-Day") || program.includes("5-Day"))) {
      program = "Foundation Strength 3-Day";
    }
    const fitnessFlagged = hasInjuries || activityRestricted;
    recommendations.push({
      id: "fitness_program",
      kind: "fitness_program",
      title: program,
      disposition: fitnessFlagged ? "needs_samuel_review" : "recommended",
      explanation: fitnessFlagged
        ? "This program shape fits your current training frequency and goal, but you flagged an injury or a clinician-advised activity limit, so Samuel confirms the right version with you before it starts."
        : "This program shape fits your current training frequency, your goal, and the amount of routine you said you can keep.",
      sourceSignals: [
        ...fitnessSignals,
        ...(hasInjuries ? answeredOf(answers, ["has_injuries", "injury_details"]) : []),
        ...(activityRestricted ? answeredOf(answers, ["activity_restriction_flag"]) : []),
      ],
    });
    if (hasInjuries) {
      questionsForReview.push("An injury or physical limitation was flagged; confirm the fitness program shape before it starts.");
    }
    if (activityRestricted) {
      questionsForReview.push("A clinician-advised activity limit was flagged; confirm the training approach personally.");
    }
  }

  // -------------------------------------------------------------------------
  // Nutrition program assignment (a named framework label)
  // -------------------------------------------------------------------------

  const eatingPattern = str(answers, "eating_pattern");
  const nutritionSignals = answeredOf(answers, ["eating_pattern", "primary_goal", "budget_priority", "routine_capacity"]);
  if (nutritionSignals.length > 0) {
    let framework: string;
    if (routineCapacity === "minimal" || eatingPattern === "no_pattern" || eatingPattern === "loosely_structured") {
      framework = "Simple Plate Method";
    } else if (primaryGoalValue === "body_recomposition" && (eatingPattern === "tracked" || eatingPattern === "set_plan")) {
      framework = "Recomposition Nutrition Framework";
    } else {
      framework = "Structured Macro Framework";
    }
    const dietaryRestrictions = list(answers, "dietary_restrictions").filter((value) => value !== "none");
    const restrictionsNote =
      dietaryRestrictions.length > 0 || avoidedIngredients
        ? " Your dietary restrictions and avoided ingredients shape the food choices inside it from day one."
        : "";
    recommendations.push({
      id: "nutrition_program",
      kind: "nutrition_program",
      title: framework,
      disposition: pregnancyFlag ? "needs_samuel_review" : "recommended",
      explanation: pregnancyFlag
        ? "This framework fits how you eat today, but you flagged pregnancy or nursing, so Samuel reviews the nutrition approach with you first." + restrictionsNote
        : "This framework fits how you eat today, your goal, and the level of structure you said you can keep." + restrictionsNote,
      sourceSignals: [
        ...nutritionSignals,
        ...answeredOf(answers, ["dietary_restrictions", "avoided_ingredients"]),
        ...(pregnancyFlag ? answeredOf(answers, ["pregnancy_flag"]) : []),
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Supplement foundation: GENERIC categories only, never brands, never
  // amounts, never intake instructions. Categories the member appears to
  // already cover become duplicate warnings instead of additions.
  // -------------------------------------------------------------------------

  const alreadyCovers = (category: keyof typeof DUPLICATE_PATTERNS): boolean =>
    takesSupplements && currentProductsText.length > 0 && DUPLICATE_PATTERNS[category].test(currentProductsText);

  const duplicateNote =
    " You listed something in this category already, so it is marked as a possible duplicate rather than an addition.";

  const foundationEntries: {
    id: string;
    category: keyof typeof DUPLICATE_PATTERNS;
    title: string;
    include: boolean;
    baseDisposition: RecommendationDisposition;
    explanation: string;
    signalIds: string[];
  }[] = [
    {
      id: "supplement_multivitamin",
      category: "multivitamin",
      title: "A foundation multivitamin",
      include: true,
      baseDisposition:
        eatingPattern === "no_pattern" || eatingPattern === "loosely_structured" ? "recommended" : "optional",
      explanation:
        "A generic foundation category, not a brand. It appears here because your eating pattern leaves gaps a broad foundation can quietly cover.",
      signalIds: ["eating_pattern", "budget_priority"],
    },
    {
      id: "supplement_omega_3",
      category: "omega_3",
      title: "An omega-3 source",
      include: true,
      baseDisposition:
        primaryGoalValue === "longevity" || primaryGoalValue === "general_health" || primaryGoalValue === "stress_resilience"
          ? "recommended"
          : "optional",
      explanation:
        "A generic foundation category, not a brand. It appears because of your stated goal, as a category worth discussing, not a claim about results.",
      signalIds: ["primary_goal"],
    },
    {
      id: "supplement_protein_foundation",
      category: "protein",
      title: "A daily protein foundation",
      include:
        primaryGoalValue === "strength" ||
        primaryGoalValue === "body_recomposition" ||
        trainingFrequency === "three_to_four" ||
        trainingFrequency === "five_plus",
      baseDisposition: "recommended",
      explanation:
        "A generic foundation category, not a brand. Training toward your goal usually means daily protein needs attention before anything more exotic.",
      signalIds: ["primary_goal", "training_frequency"],
    },
    {
      id: "supplement_evening_wind_down",
      category: "wind_down",
      title: "An evening wind-down support category",
      include: sleepPoor,
      baseDisposition: "optional",
      explanation:
        "A generic category, not a brand. It appears only because your sleep answers were on the low side; the sleep routine above comes first.",
      signalIds: ["sleep_hours", "sleep_quality", "trouble_falling_asleep"],
    },
  ];

  for (const entry of foundationEntries) {
    if (!entry.include) continue;
    const signals = answeredOf(answers, entry.signalIds);
    if (signals.length === 0) continue;
    const duplicate = alreadyCovers(entry.category);
    const disposition = productSafety(duplicate ? "duplicate_warning" : entry.baseDisposition);
    recommendations.push({
      id: entry.id,
      kind: "supplement_foundation",
      title: entry.title,
      disposition,
      explanation: entry.explanation + (duplicate ? duplicateNote : "") + safetyNote,
      sourceSignals: [
        ...signals,
        ...(duplicate ? answeredOf(answers, ["takes_supplements", "current_supplements"]) : []),
        ...(anySafetyFlag
          ? answeredOf(answers, ["clinician_care_flag", "activity_restriction_flag", "pregnancy_flag"])
          : []),
      ],
    });
  }

  // Exclusions from allergies and avoided ingredients. The member's own list
  // is deliberately not echoed here; Samuel reads it in the source answers.
  if (hasAllergies || avoidedIngredients) {
    recommendations.push({
      id: "exclusions_allergies",
      kind: "supplement_foundation",
      title: "Exclusions from your allergy and avoid list",
      disposition: "excluded",
      explanation:
        "Anything that conflicts with the allergies, intolerances, or avoided ingredients you listed is excluded up front. Samuel cross-checks labels against your list before any product conversation.",
      sourceSignals: answeredOf(answers, ["has_allergies", "allergy_details", "avoided_ingredients"]),
    });
    if (hasAllergies) {
      questionsForReview.push("The allergy and intolerance list needs a label-by-label cross-check before any product conversation.");
    }
  }

  // -------------------------------------------------------------------------
  // Product options: goal fit only, never efficacy claims. Availability
  // speaks only through possible_research_pathway, needs_samuel_review, or
  // not_available.
  // -------------------------------------------------------------------------

  if (primaryGoalValue && goalLabel(primaryGoalValue)) {
    const budgetTight = monthlyBudget === "under_50" && budgetPriority === "essentials_only";
    const disposition: RecommendationDisposition = anySafetyFlag
      ? "needs_samuel_review"
      : budgetTight
        ? "not_available"
        : "possible_research_pathway";
    const explanation = anySafetyFlag
      ? "Your stated goal suggests product options may be worth a conversation, but the safety context you flagged means Samuel reviews fit personally first. Nothing here is a claim that any product works for you."
      : budgetTight
        ? "Your stated goal could suggest product options, but with your budget directed to essentials this phase, product options are set aside for now and revisited at your monthly review."
        : "Your stated goal suggests there may be product options worth a conversation with Samuel. This marks goal fit only; it is not a claim that any product works for you.";
    recommendations.push({
      id: "product_options_goal_fit",
      kind: "product_option",
      title: "Product options aligned with your primary goal",
      disposition,
      explanation,
      sourceSignals: answeredOf(answers, [
        "primary_goal",
        "monthly_budget",
        "budget_priority",
        ...(anySafetyFlag ? ["clinician_care_flag", "activity_restriction_flag", "pregnancy_flag"] : []),
      ]),
    });
  }

  if (takesSupplements && productsNotWorking) {
    recommendations.push({
      id: "product_options_current_review",
      kind: "product_option",
      title: "A review of your current products",
      disposition: "needs_samuel_review",
      explanation:
        "You said your current products may not be working for you. Samuel reviews your list with you before anything is added, removed, or replaced.",
      sourceSignals: answeredOf(answers, ["takes_supplements", "current_supplements", "products_working"]),
    });
    questionsForReview.push("The member feels their current products may not be working; review the list together before changes.");
  }

  if (pregnancyFlag) {
    questionsForReview.push("Pregnancy or nursing was flagged; every product and supplement item needs Samuel's personal review.");
  }
  if (clinicianCare) {
    questionsForReview.push("Ongoing clinician care was flagged; keep product and supplement fit conservative and reviewed.");
  }

  // -------------------------------------------------------------------------
  // Top priorities: exactly three, ordered by leverage, padded from stable
  // fallbacks so the shape is always the same.
  // -------------------------------------------------------------------------

  const priorityCandidates: string[] = [];
  if (sleepPoor) priorityCandidates.push("Rebuild a consistent sleep routine");
  if (stressHigh) priorityCandidates.push("Lower the daily stress load");
  if (energyLow) priorityCandidates.push("Restore steady everyday energy");
  if (trainingLow) priorityCandidates.push("Establish a keepable training rhythm");
  priorityCandidates.push(`Progress toward ${primaryGoal.toLowerCase()}`);
  priorityCandidates.push("Keep the routine simple enough to sustain");
  priorityCandidates.push("Build the habit of a weekly review");
  const topPriorities = Array.from(new Set(priorityCandidates)).slice(0, 3);

  return {
    primaryGoal,
    secondaryGoals: dedupedSecondary,
    topPriorities,
    recommendations,
    questionsForReview,
    confidence: computeConfidence(answers),
  };
}
