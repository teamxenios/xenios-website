import type { Express, Request, Response } from "express";
import { z } from "zod";
import type {
  AssessmentAnswer,
  AssessmentDefinition,
  AssessmentQuestion,
  AssessmentResponseState,
  AssessmentStatusSummary,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { getSupabaseAdmin } from "../supabase";
import { rateLimitHit } from "./rate-limit";
import type { MemberPlatformDeps } from "./member-platform-deps";
import { hasAcceptedCurrent } from "./agreements";

// ---------------------------------------------------------------------------
// xenios research member platform: the assessment (G3).
//
// One versioned definition, autosaved answers, a review-then-submit lock, and
// the 3-day deadline that drives reminders and the dashboard. The definition
// asks for structured lifestyle context and structured safety FLAGS only:
// never a diagnosis question, never dosing, never medication direction. Health
// answers are stored in the response row and are never logged and never placed
// in notification payloads (payloads carry firstName and dueAt only).
// ---------------------------------------------------------------------------

export const ASSESSMENT_RESPONSES_TABLE = "research_assessment_responses";

// Initial assessment deadline: activation time plus 72 hours.
export const ASSESSMENT_DUE_HOURS = 72;

type AnswerValue = string | number | string[] | null;

// ---------------------------------------------------------------------------
// Definition v1 (initial). Sections in canon order. Adaptive branching via
// showWhen keeps the member out of blocks that do not apply to them. The
// consentRef on the first body_and_routine question marks where the
// health-adjacent block begins; it is gated by the health data collection
// agreement (XR-MEM-012).
// ---------------------------------------------------------------------------

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const GOAL_OPTIONS = [
  { value: "body_recomposition", label: "Body recomposition" },
  { value: "strength", label: "Strength" },
  { value: "endurance", label: "Endurance" },
  { value: "energy", label: "Everyday energy" },
  { value: "sleep_quality", label: "Sleep quality" },
  { value: "stress_resilience", label: "Stress resilience" },
  { value: "longevity", label: "Longevity" },
  { value: "general_health", label: "General health" },
];

export const INITIAL_ASSESSMENT_DEFINITION: AssessmentDefinition = {
  definitionId: "initial-v1",
  version: 1,
  mode: "initial",
  targetMinutes: 10,
  sections: [
    {
      id: "goals",
      title: "Goals",
      order: 1,
      questions: [
        {
          id: "primary_goal",
          sectionId: "goals",
          kind: "single_choice",
          prompt: "What is your primary goal right now?",
          required: true,
          options: GOAL_OPTIONS,
        },
        {
          id: "secondary_goals",
          sectionId: "goals",
          kind: "multi_choice",
          prompt: "Any secondary goals? Pick as many as apply.",
          required: false,
          options: GOAL_OPTIONS,
        },
        {
          id: "goal_meaning",
          sectionId: "goals",
          kind: "long_text",
          prompt: "In your own words, what would meaningful progress look like by day 90?",
          required: true,
        },
      ],
    },
    {
      id: "body_and_routine",
      title: "Body and routine",
      order: 2,
      questions: [
        {
          id: "height_cm",
          sectionId: "body_and_routine",
          kind: "number",
          prompt: "Your height, in centimeters.",
          required: true,
          min: 100,
          max: 250,
          unit: "cm",
          // Health-adjacent questions begin here; the block is gated by the
          // health data collection agreement.
          consentRef: "XR-MEM-012",
        },
        {
          id: "weight_kg",
          sectionId: "body_and_routine",
          kind: "number",
          prompt: "Your current weight, in kilograms.",
          required: true,
          min: 30,
          max: 300,
          unit: "kg",
        },
        {
          id: "typical_day",
          sectionId: "body_and_routine",
          kind: "single_choice",
          prompt: "Which best describes a typical day for you?",
          required: true,
          options: [
            { value: "seated_desk", label: "Mostly seated at a desk" },
            { value: "mixed", label: "A mix of sitting and moving" },
            { value: "on_feet", label: "On my feet most of the day" },
            { value: "physically_demanding", label: "Physically demanding work" },
          ],
        },
      ],
    },
    {
      id: "fitness",
      title: "Fitness",
      order: 3,
      questions: [
        {
          id: "training_frequency",
          sectionId: "fitness",
          kind: "single_choice",
          prompt: "How many days per week do you currently train or exercise?",
          required: true,
          options: [
            { value: "none", label: "None right now" },
            { value: "one_to_two", label: "1 to 2 days" },
            { value: "three_to_four", label: "3 to 4 days" },
            { value: "five_plus", label: "5 or more days" },
          ],
        },
        {
          id: "training_styles",
          sectionId: "fitness",
          kind: "multi_choice",
          prompt: "What kinds of training do you do? Pick as many as apply.",
          required: false,
          options: [
            { value: "strength", label: "Strength training" },
            { value: "cardio", label: "Running or cardio" },
            { value: "classes", label: "Group classes" },
            { value: "sport", label: "A sport" },
            { value: "walking", label: "Walking" },
            { value: "yoga_mobility", label: "Yoga or mobility work" },
            { value: "none", label: "None right now" },
          ],
        },
        {
          id: "has_injuries",
          sectionId: "fitness",
          kind: "single_choice",
          prompt: "Do you have any current injuries or physical limitations?",
          required: true,
          options: YES_NO,
        },
        {
          id: "injury_details",
          sectionId: "fitness",
          kind: "long_text",
          prompt: "Briefly describe the injury or limitation and what it stops you from doing.",
          required: true,
          showWhen: [{ questionId: "has_injuries", equals: ["yes"] }],
        },
      ],
    },
    {
      id: "nutrition",
      title: "Nutrition",
      order: 4,
      questions: [
        {
          id: "eating_pattern",
          sectionId: "nutrition",
          kind: "single_choice",
          prompt: "Which best describes how you eat today?",
          required: true,
          options: [
            { value: "no_pattern", label: "No particular pattern" },
            { value: "loosely_structured", label: "Loosely structured" },
            { value: "tracked", label: "I track what I eat" },
            { value: "set_plan", label: "I follow a set plan" },
          ],
        },
        {
          id: "meals_per_day",
          sectionId: "nutrition",
          kind: "number",
          prompt: "How many meals do you usually eat per day?",
          required: true,
          min: 1,
          max: 8,
        },
        {
          id: "dietary_restrictions",
          sectionId: "nutrition",
          kind: "multi_choice",
          prompt: "Any dietary restrictions? Pick as many as apply.",
          required: false,
          options: [
            { value: "none", label: "None" },
            { value: "vegetarian", label: "Vegetarian" },
            { value: "vegan", label: "Vegan" },
            { value: "halal", label: "Halal" },
            { value: "kosher", label: "Kosher" },
            { value: "gluten_free", label: "Gluten free" },
            { value: "dairy_free", label: "Dairy free" },
            { value: "other", label: "Other" },
          ],
        },
        {
          id: "dietary_restrictions_other",
          sectionId: "nutrition",
          kind: "short_text",
          prompt: "Tell us about the other restriction.",
          required: true,
          showWhen: [{ questionId: "dietary_restrictions", equals: ["other"] }],
        },
      ],
    },
    {
      id: "sleep",
      title: "Sleep",
      order: 5,
      questions: [
        {
          id: "sleep_hours",
          sectionId: "sleep",
          kind: "number",
          prompt: "On a typical night, how many hours do you sleep?",
          required: true,
          min: 3,
          max: 12,
          unit: "hours",
        },
        {
          id: "sleep_quality",
          sectionId: "sleep",
          kind: "scale",
          prompt: "How would you rate your sleep quality overall?",
          required: true,
          min: 0,
          max: 10,
        },
        {
          id: "trouble_falling_asleep",
          sectionId: "sleep",
          kind: "single_choice",
          prompt: "How often do you have trouble falling asleep?",
          required: true,
          options: [
            { value: "rarely", label: "Rarely" },
            { value: "some_nights", label: "Some nights" },
            { value: "most_nights", label: "Most nights" },
          ],
        },
      ],
    },
    {
      id: "energy",
      title: "Energy",
      order: 6,
      questions: [
        {
          id: "energy_level",
          sectionId: "energy",
          kind: "scale",
          prompt: "How would you rate your everyday energy?",
          required: true,
          min: 0,
          max: 10,
        },
        {
          id: "energy_dips",
          sectionId: "energy",
          kind: "multi_choice",
          prompt: "When does your energy usually dip? Pick as many as apply.",
          required: false,
          options: [
            { value: "morning", label: "Morning" },
            { value: "midday", label: "Midday" },
            { value: "afternoon", label: "Afternoon" },
            { value: "evening", label: "Evening" },
            { value: "none", label: "It stays fairly steady" },
          ],
        },
      ],
    },
    {
      id: "stress",
      title: "Stress",
      order: 7,
      questions: [
        {
          id: "stress_level",
          sectionId: "stress",
          kind: "scale",
          prompt: "How would you rate your stress over the past month?",
          required: true,
          min: 0,
          max: 10,
        },
        {
          id: "stress_sources",
          sectionId: "stress",
          kind: "multi_choice",
          prompt: "Where does most of your stress come from? Pick as many as apply.",
          required: false,
          options: [
            { value: "work", label: "Work" },
            { value: "family", label: "Family" },
            { value: "finances", label: "Finances" },
            { value: "health", label: "Health" },
            { value: "sleep", label: "Poor sleep" },
            { value: "other", label: "Something else" },
          ],
        },
      ],
    },
    {
      id: "current_products",
      title: "Current products",
      order: 8,
      questions: [
        {
          id: "takes_supplements",
          sectionId: "current_products",
          kind: "single_choice",
          prompt: "Do you currently take any supplements or wellness products?",
          required: true,
          options: YES_NO,
        },
        {
          id: "current_supplements",
          sectionId: "current_products",
          kind: "long_text",
          prompt: "List what you currently take, names as written on the label.",
          required: true,
          showWhen: [{ questionId: "takes_supplements", equals: ["yes"] }],
        },
        {
          id: "products_working",
          sectionId: "current_products",
          kind: "single_choice",
          prompt: "Do you feel your current products are working for you?",
          required: false,
          options: [
            { value: "working_well", label: "Working well" },
            { value: "unsure", label: "Not sure" },
            { value: "not_working", label: "Not really" },
          ],
          showWhen: [{ questionId: "takes_supplements", equals: ["yes"] }],
        },
      ],
    },
    {
      id: "allergies_and_restrictions",
      title: "Allergies and restrictions",
      order: 9,
      questions: [
        {
          id: "has_allergies",
          sectionId: "allergies_and_restrictions",
          kind: "single_choice",
          prompt: "Do you have any allergies or intolerances?",
          required: true,
          options: YES_NO,
        },
        {
          id: "allergy_details",
          sectionId: "allergies_and_restrictions",
          kind: "long_text",
          prompt: "List the allergies or intolerances we should know about.",
          required: true,
          showWhen: [{ questionId: "has_allergies", equals: ["yes"] }],
        },
        {
          id: "avoided_ingredients",
          sectionId: "allergies_and_restrictions",
          kind: "short_text",
          prompt: "Any ingredients you avoid for personal, cultural, or religious reasons?",
          required: false,
        },
      ],
    },
    {
      id: "basic_safety_context",
      title: "Basic safety context",
      order: 10,
      questions: [
        // Structured flags only. These answers make recommendations more
        // conservative; they are never a diagnosis and never ask for one.
        {
          id: "clinician_care_flag",
          sectionId: "basic_safety_context",
          kind: "single_choice",
          prompt: "Are you currently under the regular care of a clinician for anything you monitor?",
          required: true,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "prefer_not_to_say", label: "Prefer not to say" },
          ],
        },
        {
          id: "activity_restriction_flag",
          sectionId: "basic_safety_context",
          kind: "single_choice",
          prompt: "Has a clinician ever advised you to limit physical activity?",
          required: true,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "prefer_not_to_say", label: "Prefer not to say" },
          ],
        },
        {
          id: "pregnancy_flag",
          sectionId: "basic_safety_context",
          kind: "single_choice",
          prompt: "Are you currently pregnant or nursing?",
          required: true,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "not_applicable", label: "Not applicable" },
            { value: "prefer_not_to_say", label: "Prefer not to say" },
          ],
        },
      ],
    },
    {
      id: "budget",
      title: "Budget",
      order: 11,
      questions: [
        {
          id: "monthly_budget",
          sectionId: "budget",
          kind: "single_choice",
          prompt: "What monthly budget feels comfortable for products and tools?",
          required: true,
          options: [
            { value: "under_50", label: "Under $50" },
            { value: "from_50_to_100", label: "$50 to $100" },
            { value: "from_100_to_200", label: "$100 to $200" },
            { value: "over_200", label: "Over $200" },
            { value: "flexible", label: "Flexible for the right plan" },
          ],
        },
        {
          id: "budget_priority",
          sectionId: "budget",
          kind: "single_choice",
          prompt: "How would you like us to treat that budget?",
          required: true,
          options: [
            { value: "essentials_only", label: "Essentials only" },
            { value: "balanced", label: "Balanced" },
            { value: "comprehensive", label: "Comprehensive" },
          ],
        },
      ],
    },
    {
      id: "routine_complexity",
      title: "Routine complexity",
      order: 12,
      questions: [
        {
          id: "routine_capacity",
          sectionId: "routine_complexity",
          kind: "single_choice",
          prompt: "How much daily routine can you realistically keep?",
          required: true,
          options: [
            { value: "minimal", label: "Minimal, a few small steps" },
            { value: "moderate", label: "Moderate, a steady routine" },
            { value: "detailed", label: "Detailed, I like structure" },
          ],
        },
      ],
    },
    {
      id: "preferences",
      title: "Preferences",
      order: 13,
      questions: [
        {
          id: "format_preference",
          sectionId: "preferences",
          kind: "multi_choice",
          prompt: "Which product formats do you prefer? Pick as many as apply.",
          required: false,
          options: [
            { value: "capsules", label: "Capsules" },
            { value: "powders", label: "Powders" },
            { value: "drinks", label: "Drinks" },
            { value: "gummies", label: "Gummies" },
            { value: "no_preference", label: "No preference" },
          ],
        },
        {
          id: "reminder_preference",
          sectionId: "preferences",
          kind: "single_choice",
          prompt: "How would you like gentle reminders?",
          required: true,
          options: [
            { value: "email", label: "Email" },
            { value: "telegram", label: "Telegram" },
            { value: "none", label: "No reminders" },
          ],
        },
      ],
    },
    {
      id: "direction_30_90",
      title: "Your first 30 and 90 days",
      order: 14,
      questions: [
        {
          id: "direction_30",
          sectionId: "direction_30_90",
          kind: "long_text",
          prompt: "What would you like the first 30 days to focus on?",
          required: true,
        },
        {
          id: "direction_90",
          sectionId: "direction_30_90",
          kind: "long_text",
          prompt: "Where would you like to be at day 90?",
          required: true,
        },
        {
          id: "plan_confidence",
          sectionId: "direction_30_90",
          kind: "scale",
          prompt: "How confident are you that you can follow a plan for the next 30 days?",
          required: true,
          min: 0,
          max: 10,
        },
      ],
    },
  ],
};

// Flat question index, built once. The definition is a constant, so this map
// is safe to share.
const QUESTION_INDEX: Map<string, AssessmentQuestion> = new Map(
  INITIAL_ASSESSMENT_DEFINITION.sections.flatMap((section) =>
    section.questions.map((question) => [question.id, question] as const),
  ),
);

export function listAssessmentQuestions(): AssessmentQuestion[] {
  return INITIAL_ASSESSMENT_DEFINITION.sections.flatMap((section) => section.questions);
}

// ---------------------------------------------------------------------------
// Answer semantics
// ---------------------------------------------------------------------------

const SHORT_TEXT_MAX = 500;
const LONG_TEXT_MAX = 4000;
const MULTI_CHOICE_MAX = 20;

// A showWhen condition holds when the referenced answer intersects `equals`.
// Single-choice answers are strings; multi-choice answers are string arrays;
// both are handled through one array coercion. A missing or null answer never
// satisfies a condition, so dependent questions stay hidden until the parent
// is answered.
export function isQuestionVisible(
  question: AssessmentQuestion,
  answers: Record<string, AnswerValue>,
): boolean {
  if (!question.showWhen || question.showWhen.length === 0) return true;
  return question.showWhen.every((condition) => {
    const value = answers[condition.questionId];
    if (value === null || value === undefined) return false;
    const selected = Array.isArray(value) ? value : [String(value)];
    return selected.some((entry) => condition.equals.includes(entry));
  });
}

// True when the stored value counts as an answer for submission purposes.
// Empty strings and empty selections do not count; the number 0 does.
function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Number.isFinite(value);
}

// Validates one submitted value against its question. Returns a member-safe
// error string, or null when the value is acceptable. Null is always allowed:
// it clears the answer.
function validateAnswerValue(question: AssessmentQuestion, value: AnswerValue): string | null {
  if (value === null) return null;
  switch (question.kind) {
    case "single_choice": {
      if (typeof value !== "string") return "Choose one of the listed options.";
      const allowed = (question.options ?? []).some((option) => option.value === value);
      return allowed ? null : "Choose one of the listed options.";
    }
    case "multi_choice": {
      if (!Array.isArray(value)) return "Choose from the listed options.";
      if (value.length > MULTI_CHOICE_MAX) return "Too many selections.";
      const allowed = new Set((question.options ?? []).map((option) => option.value));
      return value.every((entry) => typeof entry === "string" && allowed.has(entry))
        ? null
        : "Choose from the listed options.";
    }
    case "scale":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a number.";
      if (question.min !== undefined && value < question.min) return `Enter a value of at least ${question.min}.`;
      if (question.max !== undefined && value > question.max) return `Enter a value of at most ${question.max}.`;
      return null;
    }
    case "short_text": {
      if (typeof value !== "string") return "Enter a short answer.";
      return value.length <= SHORT_TEXT_MAX ? null : "That answer is too long.";
    }
    case "long_text": {
      if (typeof value !== "string") return "Enter an answer.";
      return value.length <= LONG_TEXT_MAX ? null : "That answer is too long.";
    }
  }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export type AssessmentResponseRow = {
  id: string;
  member_id: string;
  definition_id: string;
  definition_version: number;
  mode: string;
  status: "in_progress" | "submitted";
  answers: Record<string, AnswerValue>;
  started_at: string | null;
  last_saved_at: string | null;
  submitted_at: string | null;
  reminders_sent: number;
  [key: string]: unknown;
};

async function fetchResponseRow(memberId: string): Promise<AssessmentResponseRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(ASSESSMENT_RESPONSES_TABLE)
      .select("*")
      .eq("member_id", memberId)
      .eq("definition_id", INITIAL_ASSESSMENT_DEFINITION.definitionId)
      .eq("mode", INITIAL_ASSESSMENT_DEFINITION.mode)
      .maybeSingle();
    if (error) return null;
    return (data as AssessmentResponseRow) ?? null;
  } catch {
    return null;
  }
}

// Returns the member's initial response row, creating it if absent. When
// `opened` is true (a member actually viewing or saving), a null started_at
// is stamped so started_at always means "the member first opened it"; the
// reminder sweep creates rows with opened=false so tracking reminders never
// fakes a start.
export async function getOrCreateResponse(
  memberId: string,
  now: Date,
  opened = true,
): Promise<AssessmentResponseRow> {
  const existing = await fetchResponseRow(memberId);
  if (existing) {
    if (opened && existing.started_at === null && existing.status === "in_progress") {
      const stamped = await getSupabaseAdmin()
        .from(ASSESSMENT_RESPONSES_TABLE)
        .update({ started_at: now.toISOString() })
        .eq("id", existing.id)
        .eq("status", "in_progress")
        .select("*")
        .maybeSingle();
      if (stamped.data) return stamped.data as AssessmentResponseRow;
    }
    return existing;
  }
  const { data, error } = await getSupabaseAdmin()
    .from(ASSESSMENT_RESPONSES_TABLE)
    .insert({
      member_id: memberId,
      definition_id: INITIAL_ASSESSMENT_DEFINITION.definitionId,
      definition_version: INITIAL_ASSESSMENT_DEFINITION.version,
      mode: INITIAL_ASSESSMENT_DEFINITION.mode,
      status: "in_progress",
      answers: {},
      started_at: opened ? now.toISOString() : null,
      last_saved_at: null,
      submitted_at: null,
      reminders_sent: 0,
    })
    .select("*")
    .single();
  if (!error && data) return data as AssessmentResponseRow;
  // A concurrent request may have created the row first (the unique
  // constraint on member + definition + mode); re-read before failing.
  const raced = await fetchResponseRow(memberId);
  if (raced) return raced;
  throw new Error("The assessment response could not be created.");
}

export function toResponseState(row: AssessmentResponseRow | null): AssessmentResponseState {
  if (!row) {
    return {
      responseId: "",
      definitionId: INITIAL_ASSESSMENT_DEFINITION.definitionId,
      definitionVersion: INITIAL_ASSESSMENT_DEFINITION.version,
      mode: INITIAL_ASSESSMENT_DEFINITION.mode,
      status: "not_started",
      answers: [],
      startedAt: null,
      lastSavedAt: null,
      submittedAt: null,
    };
  }
  const answers: AssessmentAnswer[] = [];
  for (const question of listAssessmentQuestions()) {
    const value = row.answers?.[question.id];
    if (value !== undefined) answers.push({ questionId: question.id, value });
  }
  return {
    responseId: row.id,
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    mode: row.mode as AssessmentResponseState["mode"],
    status: row.status,
    answers,
    startedAt: row.started_at,
    lastSavedAt: row.last_saved_at,
    submittedAt: row.submitted_at,
  };
}

// ---------------------------------------------------------------------------
// Status summary (imported by overview.ts; the signature is load-bearing)
// ---------------------------------------------------------------------------

function memberDueAt(member: MemberRow): Date | null {
  const activatedAt = member.activated_at;
  if (typeof activatedAt !== "string" || !activatedAt) return null;
  const activated = new Date(activatedAt);
  if (Number.isNaN(activated.getTime())) return null;
  return new Date(activated.getTime() + ASSESSMENT_DUE_HOURS * 60 * 60 * 1000);
}

export async function assessmentStatusForMember(
  member: MemberRow,
  now: Date,
): Promise<AssessmentStatusSummary> {
  const row = await fetchResponseRow(member.id);
  const status: AssessmentStatusSummary["status"] = row ? row.status : "not_started";
  const due = memberDueAt(member);
  return {
    required: true,
    status,
    dueAt: due ? due.toISOString() : null,
    overdue: due !== null && status !== "submitted" && now.getTime() > due.getTime(),
    remindersSent: row?.reminders_sent ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Service results
// ---------------------------------------------------------------------------

type ServiceErr = {
  ok: false;
  code: "validation_failed" | "state_conflict";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
type ServiceOk<T> = { ok: true } & T;
type ServiceResult<T> = ServiceOk<T> | ServiceErr;

function versionConflict(definitionId: string, definitionVersion: number): ServiceErr | null {
  if (
    definitionId !== INITIAL_ASSESSMENT_DEFINITION.definitionId ||
    definitionVersion !== INITIAL_ASSESSMENT_DEFINITION.version
  ) {
    return {
      ok: false,
      code: "state_conflict",
      message:
        `The assessment definition has changed. Current definition is ` +
        `${INITIAL_ASSESSMENT_DEFINITION.definitionId} version ${INITIAL_ASSESSMENT_DEFINITION.version}. Reload to continue.`,
    };
  }
  return null;
}

// Merges a partial answer set into the member's response, by questionId.
// Unknown questions and malformed values are rejected whole (no partial
// merge), so a buggy client cannot poison the stored answers.
export async function mergeAutosave(
  memberId: string,
  request: { definitionId: string; definitionVersion: number; answers: AssessmentAnswer[] },
  now: Date,
): Promise<ServiceResult<{ row: AssessmentResponseRow; lastSavedAt: string }>> {
  const stale = versionConflict(request.definitionId, request.definitionVersion);
  if (stale) return stale;

  const fieldErrors: Record<string, string[]> = {};
  for (const answer of request.answers) {
    const question = QUESTION_INDEX.get(answer.questionId);
    if (!question) {
      fieldErrors[answer.questionId] = ["Unknown question."];
      continue;
    }
    const problem = validateAnswerValue(question, answer.value as AnswerValue);
    if (problem) fieldErrors[answer.questionId] = [problem];
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, code: "validation_failed", fieldErrors };
  }

  const row = await getOrCreateResponse(memberId, now);
  if (row.status === "submitted") {
    return { ok: false, code: "state_conflict", message: "The assessment is already submitted." };
  }

  const merged: Record<string, AnswerValue> = { ...(row.answers ?? {}) };
  for (const answer of request.answers) {
    if (answer.value === null) delete merged[answer.questionId];
    else merged[answer.questionId] = answer.value as AnswerValue;
  }

  const lastSavedAt = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(ASSESSMENT_RESPONSES_TABLE)
    .update({ answers: merged, last_saved_at: lastSavedAt })
    .eq("id", row.id)
    .eq("status", "in_progress")
    .select("*")
    .maybeSingle();
  if (!data) {
    // The status guard matched nothing: submitted between our read and write.
    return { ok: false, code: "state_conflict", message: "The assessment is already submitted." };
  }
  return { ok: true, row: data as AssessmentResponseRow, lastSavedAt };
}

// Locks the response. Every required question that is visible under the
// current answers must be answered; hidden-by-branching questions never
// block. Submitting twice is a state conflict.
export async function submitAssessment(
  memberId: string,
  request: { definitionId: string; definitionVersion: number },
  now: Date,
): Promise<ServiceResult<{ row: AssessmentResponseRow }>> {
  const stale = versionConflict(request.definitionId, request.definitionVersion);
  if (stale) return stale;

  const row = await getOrCreateResponse(memberId, now);
  if (row.status === "submitted") {
    return { ok: false, code: "state_conflict", message: "The assessment is already submitted." };
  }

  const answers = row.answers ?? {};
  const missing: string[] = [];
  for (const question of listAssessmentQuestions()) {
    if (!question.required) continue;
    if (!isQuestionVisible(question, answers)) continue;
    if (!isAnswered(answers[question.id])) missing.push(question.id);
  }
  if (missing.length > 0) {
    const fieldErrors: Record<string, string[]> = {};
    for (const id of missing) fieldErrors[id] = ["This question needs an answer before submission."];
    return {
      ok: false,
      code: "validation_failed",
      message: `Missing required answers: ${missing.join(", ")}`,
      fieldErrors,
    };
  }

  const submittedAt = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(ASSESSMENT_RESPONSES_TABLE)
    .update({ status: "submitted", submitted_at: submittedAt, last_saved_at: submittedAt })
    .eq("id", row.id)
    .eq("status", "in_progress")
    .select("*")
    .maybeSingle();
  if (!data) {
    return { ok: false, code: "state_conflict", message: "The assessment is already submitted." };
  }
  return { ok: true, row: data as AssessmentResponseRow };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const answerSchema = z.object({
  questionId: z.string().min(1).max(100),
  value: z.union([z.string(), z.number(), z.array(z.string()).max(MULTI_CHOICE_MAX), z.null()]),
});

const autosaveSchema = z.object({
  definitionId: z.string().min(1).max(100),
  definitionVersion: z.number().int(),
  answers: z.array(answerSchema).max(100),
  clientSavedAt: z.string().max(64),
});

const submitSchema = z.object({
  definitionId: z.string().min(1).max(100),
  definitionVersion: z.number().int(),
  confirmReviewed: z.literal(true),
});

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberFrom(req: Request): MemberRow | null {
  return ((req as { researchMember?: MemberRow }).researchMember as MemberRow) ?? null;
}

function sendServiceErr(res: Response, err: ServiceErr) {
  const status = err.code === "validation_failed" ? 400 : 409;
  res.status(status).json({
    ok: false,
    code: err.code,
    ...(err.message ? { message: err.message } : {}),
    ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
  });
}

export function registerAssessmentApi(app: Express, deps: MemberPlatformDeps) {
  // The definition plus the member's own response and deadline summary.
  app.get("/api/research/assessment", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const now = deps.clock.now();
      const row = await getOrCreateResponse(member.id, now);
      const status = await assessmentStatusForMember(member, now);
      res.json({
        ok: true,
        definition: INITIAL_ASSESSMENT_DEFINITION,
        response: toResponseState(row),
        status,
      });
    } catch (err) {
      console.error("[assessment] load failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The assessment could not be loaded." });
    }
  });

  // Autosave: partial answers, merged by questionId. 30 per minute per member.
  app.post("/api/research/assessment/responses", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      // Server-side consent gate: the assessment stores health-adjacent
      // answers, so the Sensitive Health Data Consent (XR-MEM-012, its own
      // separate acceptance at first entry) must be accepted at the current
      // version before any answer is stored.
      if (!(await hasAcceptedCurrent(member.id, "XR-MEM-012"))) {
        return res.status(409).json({
          ok: false,
          code: "state_conflict",
          message: "Consent required before answers can be saved: XR-MEM-012 (Sensitive Health Data Consent).",
        });
      }
      if (!(await rateLimitHit(`assessment-autosave:${member.id}`, 60, 30))) {
        return res.status(429).json({ ok: false, code: "rate_limited", message: "Saving too often. Try again shortly." });
      }
      const parsed = autosaveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }
      const result = await mergeAutosave(member.id, parsed.data, deps.clock.now());
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, lastSavedAt: result.lastSavedAt });
    } catch (err) {
      console.error("[assessment] autosave failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The answers could not be saved." });
    }
  });

  // Submit: locks the response and moves the blueprint forward.
  app.post("/api/research/assessment/submit", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      // Same consent gate as autosave: no submission without the current
      // Sensitive Health Data Consent on record.
      if (!(await hasAcceptedCurrent(member.id, "XR-MEM-012"))) {
        return res.status(409).json({
          ok: false,
          code: "state_conflict",
          message: "Consent required before submission: XR-MEM-012 (Sensitive Health Data Consent).",
        });
      }
      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }
      const result = await submitAssessment(member.id, parsed.data, deps.clock.now());
      if (!result.ok) return sendServiceErr(res, result);
      res.json({
        ok: true,
        response: toResponseState(result.row),
        blueprintState: "assessment_submitted",
      });
    } catch (err) {
      console.error("[assessment] submit failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The assessment could not be submitted." });
    }
  });
}
