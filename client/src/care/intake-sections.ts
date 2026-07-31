// Presentation logic for the Care patient intake surface.
//
// The intake questionnaire is authored, versioned, and approved server side
// (care_intake_definitions, read through GET /api/care/intake). This module
// never invents a question, an option, or a clinical meaning. It only:
//   1. groups the approved fields into readable, ordered sections,
//   2. mirrors server/care/intake.ts#validateCareIntakeResponses so a patient
//      sees a field-level message before a round trip,
//   3. reports progress and what still blocks an explicit submit.
// The server stays the authority. Every autosave and submit is re-validated
// there, and nothing here can approve, clear, or accept an answer on its own.

import type {
  CareIntakeDefinition,
  CareIntakeFieldDefinition,
  CareIntakeResponseValue,
} from "@shared/care/intake";

export interface CareIntakeSectionDefinition {
  id: string;
  title: string;
  /** Approved field-key prefixes that belong to this section. */
  prefixes: readonly string[];
  /** What this part of the approved questionnaire covers. Never a claim. */
  summary: string;
}

/**
 * The intake steps this surface presents, in order. A field is placed by its
 * approved key prefix, and anything unmatched falls into the trailing
 * "additional" step, so no approved question can be hidden by this grouping.
 * A step with no approved fields is not shown at all.
 */
export const CARE_INTAKE_SECTIONS: readonly CareIntakeSectionDefinition[] = [
  {
    id: "identity",
    title: "Identity",
    prefixes: ["identity"],
    summary: "How the clinical record needs your details recorded.",
  },
  {
    id: "medical_history",
    title: "Medical history",
    prefixes: ["medical_history", "history"],
    summary: "The history questions in the approved questionnaire.",
  },
  {
    id: "medications",
    title: "Medications",
    prefixes: ["medications", "medication"],
    summary: "What the approved questionnaire asks about what you take.",
  },
  {
    id: "allergies",
    title: "Allergies",
    prefixes: ["allergies", "allergy"],
    summary: "The allergy and reaction questions in the questionnaire.",
  },
  {
    id: "goals",
    title: "Goals",
    prefixes: ["goals", "goal"],
    summary: "What you want from care, in your own words.",
  },
  {
    id: "consents",
    title: "Consent questions",
    prefixes: ["consent", "consents"],
    summary:
      "Questionnaire items about consent. Your telehealth and privacy records are separate and are not granted here.",
  },
  {
    id: "additional",
    title: "Additional questions",
    prefixes: [],
    summary: "Other questions in the approved questionnaire.",
  },
];

export const CARE_INTAKE_ADDITIONAL_SECTION_ID = "additional";

/** Review is a real step in the flow, not a group of approved questions. */
export const CARE_INTAKE_REVIEW_STEP_ID = "review";

export interface CareIntakeSection extends CareIntakeSectionDefinition {
  fields: readonly CareIntakeFieldDefinition[];
}

function matchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}_`);
}

function sectionIdForKey(key: string): string {
  for (const section of CARE_INTAKE_SECTIONS) {
    if (section.prefixes.some((prefix) => matchesPrefix(key, prefix))) {
      return section.id;
    }
  }
  return CARE_INTAKE_ADDITIONAL_SECTION_ID;
}

/**
 * A readable label for an approved field key. The approved key supplies every
 * word. This only strips the section prefix and fixes the casing, so a label
 * can never say more than the approved questionnaire already says.
 */
export function fieldLabel(field: CareIntakeFieldDefinition): string {
  const normalized = field.key.toLowerCase();
  const sectionId = sectionIdForKey(normalized);
  const section = CARE_INTAKE_SECTIONS.find((entry) => entry.id === sectionId);
  let remainder = normalized;
  for (const prefix of section?.prefixes ?? []) {
    if (matchesPrefix(normalized, prefix)) {
      remainder = normalized.slice(prefix.length).replace(/^_/, "");
      break;
    }
  }
  const words = (remainder || normalized).replaceAll("_", " ").trim();
  if (!words) return field.key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Group an approved definition into the sections that actually have fields. */
export function buildIntakeSections(
  definition: CareIntakeDefinition | null,
): readonly CareIntakeSection[] {
  if (!definition) return [];
  const buckets = new Map<string, CareIntakeFieldDefinition[]>();
  for (const field of definition.fields) {
    const id = sectionIdForKey(field.key.toLowerCase());
    const bucket = buckets.get(id);
    if (bucket) bucket.push(field);
    else buckets.set(id, [field]);
  }
  return CARE_INTAKE_SECTIONS.filter((section) => buckets.has(section.id)).map(
    (section) => ({ ...section, fields: buckets.get(section.id) ?? [] }),
  );
}

/** The ordered step ids for the flow, review last. */
export function stepOrder(
  sections: readonly CareIntakeSection[],
): readonly string[] {
  return [...sections.map((section) => section.id), CARE_INTAKE_REVIEW_STEP_ID];
}

export function isAnswered(value: CareIntakeResponseValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0;
}

export type CareIntakeFieldError = "required_field_missing" | "invalid_value";

export const CARE_INTAKE_FIELD_ERROR_MESSAGES: Readonly<
  Record<CareIntakeFieldError, string>
> = {
  required_field_missing: "This question needs an answer before you submit.",
  invalid_value: "This answer does not match the approved question format.",
};

/**
 * Client mirror of server/care/intake.ts#validateCareIntakeResponses for one
 * field. Returning null means the server may still reject the answer. This is
 * an early message to the patient, never an approval.
 */
export function validateField(
  field: CareIntakeFieldDefinition,
  value: CareIntakeResponseValue | undefined,
  requireComplete: boolean,
): CareIntakeFieldError | null {
  if (!isAnswered(value)) {
    return requireComplete && field.required ? "required_field_missing" : null;
  }
  if (field.kind === "boolean") {
    return typeof value === "boolean" ? null : "invalid_value";
  }
  if (field.kind === "multi_select") {
    return Array.isArray(value) &&
      value.every(
        (item) => typeof item === "string" && field.options.includes(item),
      )
      ? null
      : "invalid_value";
  }
  if (typeof value !== "string") return "invalid_value";
  if (field.kind === "single_select") {
    return field.options.includes(value) ? null : "invalid_value";
  }
  if (field.kind === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "invalid_value";
  }
  return value.length <= 4_000 ? null : "invalid_value";
}

export interface CareIntakeSectionProgress {
  answered: number;
  total: number;
  requiredRemaining: number;
  complete: boolean;
}

export function sectionProgress(
  section: CareIntakeSection,
  responses: Readonly<Record<string, CareIntakeResponseValue>>,
): CareIntakeSectionProgress {
  let answered = 0;
  let requiredRemaining = 0;
  for (const field of section.fields) {
    const value = responses[field.key];
    if (isAnswered(value)) answered += 1;
    else if (field.required) requiredRemaining += 1;
  }
  return {
    answered,
    total: section.fields.length,
    requiredRemaining,
    complete: requiredRemaining === 0,
  };
}

/**
 * Where a resumed intake should land: the first step that still has a required
 * question waiting, or the review step when nothing is outstanding.
 */
export function resumeStepId(
  sections: readonly CareIntakeSection[],
  responses: Readonly<Record<string, CareIntakeResponseValue>>,
): string {
  const next = sections.find(
    (section) => !sectionProgress(section, responses).complete,
  );
  return next?.id ?? CARE_INTAKE_REVIEW_STEP_ID;
}

export interface CareIntakeCompleteness {
  /** Approved keys that are required and still unanswered, or invalid. */
  blockingFieldKeys: readonly string[];
  answered: number;
  total: number;
}

/**
 * What still blocks an explicit submit. The submit control never calls the
 * server while this list is non-empty, and the server re-checks regardless.
 */
export function submitBlockers(
  sections: readonly CareIntakeSection[],
  responses: Readonly<Record<string, CareIntakeResponseValue>>,
): CareIntakeCompleteness {
  const blockingFieldKeys: string[] = [];
  let answered = 0;
  let total = 0;
  for (const section of sections) {
    for (const field of section.fields) {
      total += 1;
      const value = responses[field.key];
      if (isAnswered(value)) answered += 1;
      if (validateField(field, value, true)) blockingFieldKeys.push(field.key);
    }
  }
  return { blockingFieldKeys, answered, total };
}

/** The section that owns an approved field key, or null when none does. */
export function sectionIdForFieldKey(
  sections: readonly CareIntakeSection[],
  key: string,
): string | null {
  const owner = sections.find((section) =>
    section.fields.some((field) => field.key === key),
  );
  return owner?.id ?? null;
}

/**
 * Only send answers the patient actually gave. An empty string or an empty
 * multi-select means "not answered yet", and the server rejects an unknown or
 * malformed value, so neither is sent.
 */
export function autosavePayload(
  sections: readonly CareIntakeSection[],
  responses: Readonly<Record<string, CareIntakeResponseValue>>,
): Record<string, CareIntakeResponseValue> {
  const payload: Record<string, CareIntakeResponseValue> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      const value = responses[field.key];
      if (!isAnswered(value)) continue;
      if (validateField(field, value, false)) continue;
      payload[field.key] = typeof value === "string" ? value.trim() : value;
    }
  }
  return payload;
}

/** A stable serialization so an identical draft is never resaved. */
export function stableResponseKey(
  value: Readonly<Record<string, CareIntakeResponseValue>>,
): string {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]] as const),
  );
}

/** A human answer summary for the review step. Never a clinical reading. */
export function displayAnswer(
  field: CareIntakeFieldDefinition,
  value: CareIntakeResponseValue | undefined,
): string {
  if (!isAnswered(value)) return "Not answered";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
