import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  PROFILE_SECTION_KEYS,
  SENSITIVE_PROFILE_SECTIONS,
  type ProfileSectionKey,
} from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { apiGet, apiPut, type ApiResult } from "../../lib/api";
import { getProfile } from "../../adapters/member";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";

// ---------------------------------------------------------------------------
// Member profile (/research/member/profile).
//
// THE SERVER CONTRACT (server/research/profile.ts), which this page renders
// verbatim and never reshapes:
//   GET  /api/research/profile            -> { ok, profile: { memberId,
//          sections: [{ key, schemaVersion, data, updatedAt }], completeness:
//          { completedSections, totalSections } } }. The seven health-adjacent
//          keys in SENSITIVE_PROFILE_SECTIONS are DELIBERATELY absent here.
//   GET  /api/research/profile/sensitive  -> { ok, sections: [...] }. Those
//          seven keys, on their own route, for the surfaces that need them.
//   PUT  /api/research/profile            -> body { section, schemaVersion,
//          data }, ONE section per call, member scoped, rate limited (429
//          rate_limited), 409 state_conflict on a schema version mismatch,
//          400 validation_failed. Returns { ok, section } for the saved
//          section.
//
// Sections and their field names mirror PROFILE_SECTION_REGISTRY exactly, so
// a real answer renders as a real answer. Nothing here invents a field the
// server does not store: a section with no server row renders its honest
// empty state and points at the assessment.
//
// Editing is live. It was previously disabled with a note saying the update
// contract was unpublished; that note was untrue, the PUT is built, guarded
// and rate limited, so the form now writes one section per save.
// ---------------------------------------------------------------------------

// adapters/member.ts owns endpoint strings for this surface and has a
// getProfile() helper only. The sensitive read and the section write need two
// more paths; they are named here because that adapter file is owned
// elsewhere right now. They belong in the adapter (see the report).
const PROFILE_PATH = "/api/research/profile";
const SENSITIVE_PROFILE_PATH = "/api/research/profile/sensitive";

// Every section in PROFILE_SECTION_REGISTRY sits at schemaVersion 1 today.
// The version the client sends comes from the section the server returned
// whenever there is one; this fallback only covers a section the member has
// never saved, where there is no row to read a version from. A mismatch is
// not silent: the server answers 409 state_conflict and the member is told to
// reload. The durable fix is to publish the versions in the shared contract.
const FALLBACK_SCHEMA_VERSION = 1;

const SENSITIVE_SET = new Set<ProfileSectionKey>(SENSITIVE_PROFILE_SECTIONS);

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

interface SectionDto {
  key: string;
  schemaVersion: number;
  data: Record<string, unknown>;
  updatedAt: string;
}

interface ProfileResponse {
  ok?: boolean;
  profile?: {
    memberId?: string;
    sections?: SectionDto[];
    completeness?: { completedSections?: number; totalSections?: number };
  };
}

interface SensitiveResponse {
  ok?: boolean;
  sections?: SectionDto[];
}

interface SectionWriteResponse {
  ok?: boolean;
  section?: SectionDto;
}

function isSectionDto(value: unknown): value is SectionDto {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SectionDto>;
  return typeof row.key === "string" && typeof row.data === "object" && row.data !== null;
}

// ---------------------------------------------------------------------------
// Section definitions: the server registry, in the member's language.
// ---------------------------------------------------------------------------

type FieldKind = "text" | "textarea" | "number" | "select" | "multiselect" | "list" | "boolean" | "products";

interface Option {
  value: string;
  label: string;
}

interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  maxLength?: number;
  maxItems?: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  options?: Option[];
  help?: string;
}

interface SectionDef {
  title: string;
  description: string;
  fields: FieldDef[];
}

const YES_NO: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const SECTION_DEFS: Record<ProfileSectionKey, SectionDef> = {
  basic_information: {
    title: "Basic information",
    description: "Who you are and how we address you.",
    fields: [
      { key: "preferredName", label: "Preferred name", kind: "text", maxLength: 80 },
      { key: "pronouns", label: "Pronouns", kind: "text", maxLength: 40 },
      { key: "country", label: "Country", kind: "text", maxLength: 56 },
      { key: "timezone", label: "Time zone", kind: "text", maxLength: 64 },
      { key: "occupation", label: "Occupation", kind: "text", maxLength: 80 },
    ],
  },
  goals: {
    title: "Goals",
    description: "What you are working toward and why it matters to you.",
    fields: [
      { key: "primaryGoal", label: "Primary goal", kind: "text", required: true, maxLength: 200 },
      {
        key: "secondaryGoals",
        label: "Secondary goals",
        kind: "list",
        maxItems: 5,
        maxLength: 200,
        help: "One per line, up to 5.",
      },
      { key: "motivation", label: "What is driving this", kind: "textarea", maxLength: 500 },
    ],
  },
  body_and_routine: {
    title: "Body and routine",
    description: "Your measurements and the shape of a typical day.",
    fields: [
      { key: "heightCm", label: "Height (cm)", kind: "number", min: 100, max: 250 },
      { key: "weightKg", label: "Weight (kg)", kind: "number", min: 30, max: 300 },
      {
        key: "activityLevel",
        label: "Activity level",
        kind: "select",
        options: [
          { value: "sedentary", label: "Sedentary" },
          { value: "lightly_active", label: "Lightly active" },
          { value: "moderately_active", label: "Moderately active" },
          { value: "very_active", label: "Very active" },
        ],
      },
      { key: "typicalDayDescription", label: "A typical day", kind: "textarea", maxLength: 300 },
    ],
  },
  fitness: {
    title: "Fitness",
    description: "Training history and current activity.",
    fields: [
      {
        key: "trainingExperience",
        label: "Training experience",
        kind: "select",
        options: [
          { value: "none", label: "None" },
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      {
        key: "trainingStyles",
        label: "Training styles",
        kind: "list",
        maxItems: 10,
        maxLength: 60,
        help: "One per line, up to 10.",
      },
      { key: "sessionsPerWeek", label: "Sessions per week", kind: "number", min: 0, max: 14, integer: true },
      {
        key: "equipmentAccess",
        label: "Equipment access",
        kind: "select",
        options: [
          { value: "none", label: "None" },
          { value: "home_basic", label: "Home, basic" },
          { value: "home_full", label: "Home, full" },
          { value: "commercial_gym", label: "Commercial gym" },
        ],
      },
    ],
  },
  nutrition: {
    title: "Nutrition",
    description: "How you currently eat.",
    fields: [
      { key: "mealsPerDay", label: "Meals per day", kind: "number", min: 1, max: 8, integer: true },
      {
        key: "cooksAtHome",
        label: "Cooks at home",
        kind: "select",
        options: [
          { value: "rarely", label: "Rarely" },
          { value: "sometimes", label: "Sometimes" },
          { value: "often", label: "Often" },
        ],
      },
      {
        key: "hydrationCupsPerDay",
        label: "Cups of water per day",
        kind: "number",
        min: 0,
        max: 30,
        integer: true,
      },
      { key: "eatingPattern", label: "Eating pattern", kind: "text", maxLength: 60 },
    ],
  },
  sleep: {
    title: "Sleep",
    description: "Your sleep pattern and quality.",
    fields: [
      {
        key: "averageHoursPerNight",
        label: "Average hours per night",
        kind: "number",
        min: 0,
        max: 16,
        step: 0.5,
      },
      {
        key: "bedtimeConsistency",
        label: "Bedtime consistency",
        kind: "select",
        options: [
          { value: "consistent", label: "Consistent" },
          { value: "varies", label: "Varies" },
          { value: "shift_work", label: "Shift work" },
        ],
      },
      {
        key: "wakeRested",
        label: "Wakes rested",
        kind: "select",
        options: [
          { value: "rarely", label: "Rarely" },
          { value: "sometimes", label: "Sometimes" },
          { value: "often", label: "Often" },
        ],
      },
    ],
  },
  energy: {
    title: "Energy",
    description: "How your energy runs through the day.",
    fields: [
      {
        key: "typicalEnergyLevel",
        label: "Typical energy level (1 to 10)",
        kind: "number",
        min: 1,
        max: 10,
        integer: true,
      },
      { key: "afternoonDip", label: "Afternoon dip", kind: "boolean" },
      {
        key: "caffeineServingsPerDay",
        label: "Caffeine servings per day",
        kind: "number",
        min: 0,
        max: 20,
        integer: true,
      },
    ],
  },
  stress: {
    title: "Stress",
    description: "Where the pressure comes from and how you recover.",
    fields: [
      {
        key: "typicalStressLevel",
        label: "Typical stress level (1 to 10)",
        kind: "number",
        min: 1,
        max: 10,
        integer: true,
      },
      {
        key: "primaryStressors",
        label: "Main sources of stress",
        kind: "list",
        maxItems: 5,
        maxLength: 100,
        help: "One per line, up to 5.",
      },
      {
        key: "recoveryPractices",
        label: "Recovery practices",
        kind: "list",
        maxItems: 10,
        maxLength: 100,
        help: "One per line, up to 10.",
      },
    ],
  },
  current_products: {
    title: "Current products",
    description: "Products and supplements you currently use.",
    fields: [
      {
        key: "products",
        label: "Currently using",
        kind: "products",
        maxItems: 30,
        help: "A name, and what you take it for if you want to say.",
      },
    ],
  },
  allergies_and_restrictions: {
    title: "Allergies and restrictions",
    description: "Anything the review team must know before recommendations.",
    fields: [
      {
        key: "allergies",
        label: "Allergies",
        kind: "list",
        maxItems: 30,
        maxLength: 100,
        help: "One per line.",
      },
      {
        key: "restrictions",
        label: "Dietary restrictions",
        kind: "list",
        maxItems: 30,
        maxLength: 100,
        help: "One per line.",
      },
      { key: "noPork", label: "No pork", kind: "boolean" },
    ],
  },
  basic_safety_context: {
    title: "Basic safety context",
    description: "Short flags only. This is not a medical history.",
    fields: [
      {
        key: "injuries",
        label: "Injuries",
        kind: "list",
        maxItems: 20,
        maxLength: 120,
        help: "One per line, up to 20.",
      },
      { key: "conditionsDisclosed", label: "Conditions disclosed", kind: "boolean" },
      { key: "notes", label: "Notes", kind: "textarea", maxLength: 500 },
    ],
  },
  budget: {
    title: "Budget",
    description: "What you are comfortable investing monthly.",
    fields: [
      {
        key: "monthlyBudgetRange",
        label: "Monthly range",
        kind: "select",
        required: true,
        options: [
          { value: "under_50", label: "Under $50" },
          { value: "50_100", label: "$50 to $100" },
          { value: "100_250", label: "$100 to $250" },
          { value: "250_500", label: "$250 to $500" },
          { value: "over_500", label: "Over $500" },
        ],
      },
    ],
  },
  routine_complexity: {
    title: "Routine complexity",
    description: "How much routine you want to carry day to day.",
    fields: [
      {
        key: "preferredComplexity",
        label: "Preferred complexity",
        kind: "select",
        options: [
          { value: "minimal", label: "Minimal" },
          { value: "moderate", label: "Moderate" },
          { value: "detailed", label: "Detailed" },
        ],
      },
      { key: "maxDailyMinutes", label: "Most minutes per day", kind: "number", min: 0, max: 240, integer: true },
    ],
  },
  format_preferences: {
    title: "Format preferences",
    description: "The formats that actually suit you.",
    fields: [
      {
        key: "preferredFormats",
        label: "Preferred formats",
        kind: "multiselect",
        options: [
          { value: "pdf", label: "PDF" },
          { value: "video", label: "Video" },
          { value: "audio", label: "Audio" },
          { value: "text", label: "Text" },
        ],
      },
      { key: "wantsPrintable", label: "Wants printable versions", kind: "boolean" },
    ],
  },
  communication_preferences: {
    title: "Communication preferences",
    description: "Where and how we reach you.",
    fields: [
      {
        key: "preferredChannel",
        label: "Preferred channel",
        kind: "select",
        options: [
          { value: "email", label: "Email" },
          { value: "telegram", label: "Telegram" },
          { value: "web_only", label: "Web only" },
        ],
      },
      { key: "checkInReminders", label: "Check-in reminders", kind: "boolean" },
      {
        key: "reminderTimeOfDay",
        label: "Reminder time of day",
        kind: "select",
        options: [
          { value: "morning", label: "Morning" },
          { value: "midday", label: "Midday" },
          { value: "evening", label: "Evening" },
        ],
      },
    ],
  },
  media_settings: {
    title: "Media settings",
    description: "What happens to the raw photos and voice notes you send.",
    fields: [
      {
        key: "defaultRetentionElection",
        label: "Raw file handling",
        kind: "select",
        required: true,
        options: [
          { value: "retain_raw", label: "Keep raw files" },
          { value: "delete_raw_after_processing", label: "Delete raw files after processing" },
        ],
      },
      { key: "faceBlurByDefault", label: "Blur faces by default", kind: "boolean" },
    ],
  },
  privacy_choices: {
    title: "Privacy choices",
    description: "Opt-in areas. Everything here is off until you turn it on.",
    fields: [
      { key: "sexualWellnessEnabled", label: "Sexual wellness content", kind: "boolean" },
      { key: "marketingOptIn", label: "Marketing emails", kind: "boolean" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Reading the server's values
// ---------------------------------------------------------------------------

function optionLabel(field: FieldDef, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

interface ProductRow {
  name: string;
  purpose: string;
}

function asProductRows(value: unknown): ProductRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ProductRow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { name?: unknown; purpose?: unknown };
    if (typeof row.name !== "string" || row.name.trim().length === 0) continue;
    rows.push({
      name: row.name.trim(),
      purpose: typeof row.purpose === "string" ? row.purpose.trim() : "",
    });
  }
  return rows;
}

// The read-only rendering of one stored value. Returns null for an honest
// absence; it never substitutes a placeholder for a value the server did not
// send.
function displayValue(field: FieldDef, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  switch (field.kind) {
    case "boolean":
      return typeof raw === "boolean" ? (raw ? "Yes" : "No") : null;
    case "number":
      if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
      return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
    case "select":
      return typeof raw === "string" && raw.trim().length > 0 ? optionLabel(field, raw.trim()) : null;
    case "multiselect": {
      const values = asStringList(raw).map((v) => optionLabel(field, v));
      return values.length ? values.join(", ") : null;
    }
    case "list": {
      const values = asStringList(raw);
      return values.length ? values.join(", ") : null;
    }
    case "products": {
      const rows = asProductRows(raw);
      if (!rows.length) return null;
      return rows.map((r) => (r.purpose ? `${r.name} (${r.purpose})` : r.name)).join(", ");
    }
    default:
      return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }
}

// A stored key this page has no definition for is still the member's answer,
// so it renders rather than disappearing.
function displayUnknown(raw: unknown): string | null {
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string") return raw.trim().length ? raw.trim() : null;
  const values = asStringList(raw);
  return values.length ? values.join(", ") : null;
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// The edit form: values in, one section payload out
// ---------------------------------------------------------------------------

type EditorValue = string | string[] | ProductRow[];
type EditorState = Record<string, EditorValue>;

function toEditorState(def: SectionDef, data: Record<string, unknown> | undefined): EditorState {
  const state: EditorState = {};
  for (const field of def.fields) {
    const raw = data?.[field.key];
    switch (field.kind) {
      case "boolean":
        state[field.key] = typeof raw === "boolean" ? (raw ? "yes" : "no") : "";
        break;
      case "number":
        state[field.key] = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
        break;
      case "list":
      case "multiselect":
        state[field.key] = asStringList(raw);
        break;
      case "products":
        state[field.key] = asProductRows(raw);
        break;
      default:
        state[field.key] = typeof raw === "string" ? raw : "";
    }
  }
  return state;
}

type PayloadResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

// Optional answers that are blank are OMITTED, never sent as an empty string:
// the server schemas are strict and several fields reject an empty value.
// Lists are always sent, so clearing one really clears it.
function toPayload(def: SectionDef, state: EditorState): PayloadResult {
  const data: Record<string, unknown> = {};
  for (const field of def.fields) {
    const value = state[field.key];
    switch (field.kind) {
      case "boolean": {
        const raw = typeof value === "string" ? value : "";
        if (raw === "yes") data[field.key] = true;
        else if (raw === "no") data[field.key] = false;
        break;
      }
      case "number": {
        const raw = (typeof value === "string" ? value : "").trim();
        if (!raw) {
          if (field.required) return { ok: false, message: `${field.label} is needed before this section can be saved.` };
          break;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return { ok: false, message: `${field.label} must be a number.` };
        if (field.integer && !Number.isInteger(parsed)) {
          return { ok: false, message: `${field.label} must be a whole number.` };
        }
        if (field.min !== undefined && parsed < field.min) {
          return { ok: false, message: `${field.label} must be between ${field.min} and ${field.max}.` };
        }
        if (field.max !== undefined && parsed > field.max) {
          return { ok: false, message: `${field.label} must be between ${field.min} and ${field.max}.` };
        }
        data[field.key] = parsed;
        break;
      }
      case "list":
      case "multiselect": {
        const values = Array.isArray(value) ? asStringList(value) : [];
        if (field.maxItems !== undefined && values.length > field.maxItems) {
          return { ok: false, message: `${field.label} allows up to ${field.maxItems} entries.` };
        }
        if (field.maxLength !== undefined && values.some((v) => v.length > field.maxLength!)) {
          return {
            ok: false,
            message: `${field.label} entries must be ${field.maxLength} characters or fewer.`,
          };
        }
        data[field.key] = values;
        break;
      }
      case "products": {
        const rows = Array.isArray(value) ? asProductRows(value) : [];
        if (field.maxItems !== undefined && rows.length > field.maxItems) {
          return { ok: false, message: `${field.label} allows up to ${field.maxItems} entries.` };
        }
        data[field.key] = rows.map((row) => (row.purpose ? { name: row.name, purpose: row.purpose } : { name: row.name }));
        break;
      }
      default: {
        const raw = (typeof value === "string" ? value : "").trim();
        if (!raw) {
          if (field.required) return { ok: false, message: `${field.label} is needed before this section can be saved.` };
          break;
        }
        if (field.maxLength !== undefined && raw.length > field.maxLength) {
          return { ok: false, message: `${field.label} must be ${field.maxLength} characters or fewer.` };
        }
        data[field.key] = raw;
        break;
      }
    }
  }
  return { ok: true, data };
}

// Save denials route on the machine code, never on the server message.
const SAVE_DENIAL_COPY: Record<string, string> = {
  rate_limited: "Too many profile updates just now. Wait a moment and save again. Nothing you typed was lost.",
  state_conflict: "This section changed since you opened it. Reload the page, then make the change again.",
  validation_failed: "Some of these answers were not accepted. Check the lengths and formats, then save again.",
  membership_inactive: "Your membership is not active, so this cannot be saved right now.",
  activation_required: "Activate your membership to save changes to your profile.",
  billing_past_due: "Billing needs attention before profile changes can be saved.",
};

function saveErrorMessage(result: ApiResult<SectionWriteResponse>): string {
  switch (result.kind) {
    case "denied":
      return SAVE_DENIAL_COPY[result.code] ?? result.message ?? "This could not be saved. Please try again.";
    case "forbidden":
      return result.message ?? "You do not have access to change this section.";
    case "unauthorized":
      return "Your session has ended. Sign in again, then save this section.";
    case "unavailable":
      return "Saving is not available right now. Your answers were not changed.";
    case "error":
      return result.message;
    default:
      return "This could not be saved. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Development-only sample so the layout is reviewable locally. In production
// this is null and every section renders its honest empty state instead. The
// shape is the server's, key for key.
// ---------------------------------------------------------------------------

function fixtureSections(): SectionDto[] {
  const at = "2026-07-20T12:00:00.000Z";
  return [
    {
      key: "basic_information",
      schemaVersion: 1,
      updatedAt: at,
      data: { preferredName: "Jordan", country: "United States", timezone: "America/Chicago" },
    },
    {
      key: "goals",
      schemaVersion: 1,
      updatedAt: at,
      data: {
        primaryGoal: "Body recomposition",
        secondaryGoals: ["Better sleep", "More consistent energy"],
        motivation: "Show up fully for work and family.",
      },
    },
    {
      key: "fitness",
      schemaVersion: 1,
      updatedAt: at,
      data: { trainingExperience: "intermediate", trainingStyles: ["Strength"], sessionsPerWeek: 3 },
    },
    { key: "budget", schemaVersion: 1, updatedAt: at, data: { monthlyBudgetRange: "100_250" } },
    {
      key: "sleep",
      schemaVersion: 1,
      updatedAt: at,
      data: { averageHoursPerNight: 6.5, bedtimeConsistency: "varies", wakeRested: "sometimes" },
    },
  ];
}

// ---------------------------------------------------------------------------
// Field inputs
// ---------------------------------------------------------------------------

function FieldInput({
  sectionKey,
  field,
  value,
  disabled,
  onChange,
}: {
  sectionKey: ProfileSectionKey;
  field: FieldDef;
  value: EditorValue;
  disabled: boolean;
  onChange: (next: EditorValue) => void;
}) {
  const id = `profile-input-${sectionKey}-${field.key}`;
  const text = typeof value === "string" ? value : "";

  if (field.kind === "textarea") {
    return (
      <textarea
        id={id}
        data-testid={id}
        className="input-field"
        rows={3}
        maxLength={field.maxLength}
        value={text}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.kind === "number") {
    return (
      <input
        id={id}
        data-testid={id}
        className="input-field"
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? (field.integer ? 1 : "any")}
        value={text}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.kind === "select" || field.kind === "boolean") {
    const options = field.kind === "boolean" ? YES_NO : (field.options ?? []);
    return (
      <select
        id={id}
        data-testid={id}
        className="input-field"
        value={text}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{field.required ? "Choose one" : "Not answered"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "list") {
    const lines = Array.isArray(value) ? (value as string[]) : [];
    return (
      <textarea
        id={id}
        data-testid={id}
        className="input-field"
        rows={3}
        value={lines.join("\n")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    );
  }

  if (field.kind === "multiselect") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-3 mt-1" role="group" aria-labelledby={`${id}-label`} data-testid={id}>
        {(field.options ?? []).map((o) => (
          <label key={o.value} className="body-s flex items-center gap-2">
            <input
              type="checkbox"
              data-testid={`${id}-${o.value}`}
              checked={selected.includes(o.value)}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, o.value]
                    : selected.filter((v) => v !== o.value),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === "products") {
    return (
      <ProductRowsInput id={id} field={field} value={value} disabled={disabled} onChange={onChange} />
    );
  }

  return (
    <input
      id={id}
      data-testid={id}
      className="input-field"
      type="text"
      maxLength={field.maxLength}
      value={text}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ProductRowsInput({
  id,
  field,
  value,
  disabled,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: EditorValue;
  disabled: boolean;
  onChange: (next: EditorValue) => void;
}) {
  const rows = Array.isArray(value) ? (value as ProductRow[]) : [];
  const update = (index: number, patch: Partial<ProductRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div data-testid={id}>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 mt-2">
          <input
            className="input-field"
            aria-label={`Product ${index + 1} name`}
            data-testid={`${id}-name-${index}`}
            maxLength={120}
            value={row.name}
            disabled={disabled}
            onChange={(e) => update(index, { name: e.target.value })}
          />
          <input
            className="input-field"
            aria-label={`Product ${index + 1} purpose`}
            data-testid={`${id}-purpose-${index}`}
            maxLength={200}
            value={row.purpose}
            disabled={disabled}
            onChange={(e) => update(index, { purpose: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary mt-2"
        data-testid={`${id}-add`}
        disabled={disabled || (field.maxItems !== undefined && rows.length >= field.maxItems)}
        onClick={() => onChange([...rows, { name: "", purpose: "" }])}
      >
        Add a product
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One section card
// ---------------------------------------------------------------------------

function SectionCard({
  sectionKey,
  def,
  sensitive,
  stored,
  editable,
  lockedNote,
  unread,
  onSave,
}: {
  sectionKey: ProfileSectionKey;
  def: SectionDef;
  sensitive: boolean;
  stored: SectionDto | undefined;
  editable: boolean;
  lockedNote: string | null;
  // True when this section's answers could not be read at all. An unread
  // section must never render "nothing on file": absence of a read is not
  // absence of an answer.
  unread: boolean;
  onSave: (
    sectionKey: ProfileSectionKey,
    schemaVersion: number,
    data: Record<string, unknown>,
  ) => Promise<ApiResult<SectionWriteResponse>>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<EditorState>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownKeys = useMemo(() => new Set(def.fields.map((f) => f.key)), [def]);
  const data = stored?.data;

  const filled = def.fields
    .map((field) => ({ field, value: displayValue(field, data?.[field.key]) }))
    .filter((entry): entry is { field: FieldDef; value: string } => entry.value !== null);

  // Answers stored under a key this page does not define still belong to the
  // member, so they render. They also make the section unsafe to overwrite.
  const extras = Object.entries(data ?? {})
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, raw]) => ({ key, value: displayUnknown(raw) }))
    .filter((entry): entry is { key: string; value: string } => entry.value !== null);
  const hasUnknownKeys = Object.keys(data ?? {}).some((key) => !knownKeys.has(key));

  const blockedNote = hasUnknownKeys
    ? "This section holds an answer this page cannot edit yet. Saving here could remove it, so editing stays off until the page is updated."
    : lockedNote;
  const canEdit = editable && !hasUnknownKeys && !blockedNote;

  const openEditor = () => {
    setState(toEditorState(def, data));
    setError(null);
    setEditing(true);
  };

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const payload = toPayload(def, state);
    if (!payload.ok) {
      setError(payload.message);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onSave(sectionKey, stored?.schemaVersion ?? FALLBACK_SCHEMA_VERSION, payload.data);
    setSaving(false);
    if (result.kind === "ok") {
      setEditing(false);
      return;
    }
    setError(saveErrorMessage(result));
  };

  const headingId = `profile-section-${sectionKey}`;
  return (
    <section className="card" aria-labelledby={headingId} data-testid={`profile-card-${sectionKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <h2 id={headingId} className="body-m font-700">
            {def.title}
          </h2>
          <p className="body-s text-ink-mute mt-1">{def.description}</p>
        </div>
        <div className="flex items-center gap-3">
          {filled.length + extras.length > 0 && <ResearchStatusBadge label="On file" tone="success" />}
          {!editing && (
            <button
              type="button"
              className="btn btn-ghost"
              data-testid={`profile-edit-${sectionKey}`}
              disabled={!canEdit}
              aria-disabled={!canEdit}
              aria-describedby={blockedNote ? `${headingId}-note` : undefined}
              onClick={openEditor}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {blockedNote && (
        <p id={`${headingId}-note`} className="body-s text-ink-mute mt-2">
          {blockedNote}
        </p>
      )}

      {editing ? (
        <form className="mt-4" onSubmit={submit} data-testid={`profile-form-${sectionKey}`}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {def.fields.map((field) => (
              <div key={field.key}>
                {/* A checkbox group and the product rows are not one labelable
                    control, so they carry a group label rather than a for= that
                    would point at a container. */}
                {field.kind === "multiselect" || field.kind === "products" ? (
                  <span
                    id={`profile-input-${sectionKey}-${field.key}-label`}
                    className="mono-label text-ink-mute"
                  >
                    {field.label}
                    {field.required ? " (needed)" : ""}
                  </span>
                ) : (
                  <label
                    id={`profile-input-${sectionKey}-${field.key}-label`}
                    className="mono-label text-ink-mute"
                    htmlFor={`profile-input-${sectionKey}-${field.key}`}
                  >
                    {field.label}
                    {field.required ? " (needed)" : ""}
                  </label>
                )}
                <div className="mt-1">
                  <FieldInput
                    sectionKey={sectionKey}
                    field={field}
                    value={state[field.key] ?? ""}
                    disabled={saving}
                    onChange={(next) => setState((prev) => ({ ...prev, [field.key]: next }))}
                  />
                </div>
                {field.help && <p className="body-s text-ink-mute mt-1">{field.help}</p>}
              </div>
            ))}
          </div>
          {error && (
            <p className="body-s text-ink-2 mt-3" role="alert" data-testid={`profile-save-error-${sectionKey}`}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit"
              className="btn btn-primary"
              data-testid={`profile-save-${sectionKey}`}
              disabled={saving}
            >
              {saving ? "Saving" : "Save section"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              data-testid={`profile-cancel-${sectionKey}`}
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : filled.length + extras.length > 0 ? (
        <>
          <dl className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {filled.map(({ field, value }) => (
              <div key={field.key}>
                <dt className="mono-label text-ink-mute">{field.label}</dt>
                <dd className="body-s text-ink-2 mt-1" data-testid={`profile-value-${sectionKey}-${field.key}`}>
                  {value}
                </dd>
              </div>
            ))}
            {extras.map(({ key, value }) => (
              <div key={key}>
                <dt className="mono-label text-ink-mute">{humanizeKey(key)}</dt>
                <dd className="body-s text-ink-2 mt-1">{value}</dd>
              </div>
            ))}
          </dl>
          {stored?.updatedAt && fmtDate(stored.updatedAt) && (
            <p className="mono-label text-ink-mute mt-3">Updated {fmtDate(stored.updatedAt)}</p>
          )}
        </>
      ) : unread ? null : (
        <div className="mt-4">
          <p className="body-s text-ink-2">
            Nothing on file for this section yet. Complete this in your assessment and it will appear here.
          </p>
          <Link href={MEMBER_ROUTES.assessment} className="btn btn-secondary mt-3 inline-block">
            Go to your assessment
          </Link>
        </div>
      )}

      {sensitive && (
        <div className="mt-4">
          <ResearchSecureNotice>
            This section is sensitive. It is stored securely and visible only to you and the review team.
          </ResearchSecureNotice>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function Profile() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<ProfileResponse> | null>(null);
  const [sensitive, setSensitive] = useState<ApiResult<SensitiveResponse> | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setResult(null);
        setSensitive(null);
      }
      const [main, secure] = await Promise.all([
        getProfile<ProfileResponse>(memberToken),
        apiGet<SensitiveResponse>(SENSITIVE_PROFILE_PATH, memberToken),
      ]);
      setResult(main);
      setSensitive(secure);
    },
    [memberToken],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const saveSection = useCallback(
    async (sectionKey: ProfileSectionKey, schemaVersion: number, data: Record<string, unknown>) => {
      const written = await apiPut<SectionWriteResponse>(
        PROFILE_PATH,
        { section: sectionKey, schemaVersion, data },
        memberToken,
      );
      // A saved section is re-read from the server rather than assumed, so what
      // renders after a save is what is actually stored.
      if (written.kind === "ok") await load(true);
      return written;
    },
    [load, memberToken],
  );

  const state: "loading" | "ok" | "error" | "unauthorized" =
    result === null
      ? "loading"
      : result.kind === "error"
        ? "error"
        : result.kind === "unauthorized"
          ? "unauthorized"
          : "ok";

  // Development fixture only when the endpoint itself is missing; in
  // production devFixture returns null and the honest empty states render.
  const usingFixture = result?.kind === "unavailable" || result?.kind === "forbidden";
  const fixture = useMemo(() => (usingFixture ? devFixture(fixtureSections) : null), [usingFixture]);

  const sections = useMemo(() => {
    const map = new Map<string, SectionDto>();
    const add = (rows: unknown) => {
      if (!Array.isArray(rows)) return;
      for (const row of rows) if (isSectionDto(row)) map.set(row.key, row);
    };
    if (result?.kind === "ok") add(result.data.profile?.sections);
    if (sensitive?.kind === "ok") add(sensitive.data.sections);
    if (fixture) add(fixture);
    return map;
  }, [result, sensitive, fixture]);

  const completeness = result?.kind === "ok" ? result.data.profile?.completeness : undefined;
  const completedSections =
    typeof completeness?.completedSections === "number" ? completeness.completedSections : null;
  const totalSections = typeof completeness?.totalSections === "number" ? completeness.totalSections : null;

  const latestUpdate = useMemo(() => {
    let latest = "";
    sections.forEach((row) => {
      if (typeof row.updatedAt === "string" && row.updatedAt > latest) latest = row.updatedAt;
    });
    return latest ? fmtDate(latest) : "";
  }, [sections]);

  // The sensitive route is separate, so its failure is reported separately.
  // Those cards must not claim "nothing on file" when the truth is that the
  // page could not read them, and they must not be overwritten unread.
  const sensitiveLoaded = sensitive?.kind === "ok" || (fixture !== null && usingFixture);
  const sensitiveNote = sensitiveLoaded
    ? null
    : sensitive === null
      ? "This section is still loading."
      : sensitive?.kind === "unauthorized"
        ? "Your session has ended. Sign in again to see this section."
        : "This section is stored on a separate secure route and could not be read just now. Nothing has changed.";

  const canEditAtAll = result?.kind === "ok";

  return (
    <ResearchMemberShell
      title="Profile"
      lead="Everything the review team knows about you, in one place. Your assessment answers build this profile, and you can correct any section here."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={result?.kind === "error" ? result.message : undefined}
        onRetry={() => void load()}
      >
        {result?.kind === "denied" ? (
          <ResearchDenialNotice code={result.code} message={result.message} />
        ) : (
          <>
            {usingFixture && fixture === null && (
              <div className="card mb-6" role="status">
                <p className="body-m font-700">Your profile view is being prepared.</p>
                <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                  Nothing is wrong with your account. Your assessment answers are stored safely and will appear
                  here section by section when this view is published.
                </p>
              </div>
            )}
            {completedSections !== null && totalSections !== null && (
              <p className="mono-label text-ink-mute mb-2" data-testid="profile-completeness">
                {completedSections} of {totalSections} sections complete
              </p>
            )}
            {latestUpdate && <p className="mono-label text-ink-mute mb-4">Last updated {latestUpdate}</p>}
            <div className="grid gap-6">
              {PROFILE_SECTION_KEYS.map((key) => {
                const isSensitive = SENSITIVE_SET.has(key);
                return (
                  <SectionCard
                    key={key}
                    sectionKey={key}
                    def={SECTION_DEFS[key]}
                    sensitive={isSensitive}
                    stored={sections.get(key)}
                    editable={canEditAtAll && (!isSensitive || sensitiveLoaded)}
                    lockedNote={isSensitive && !sensitiveLoaded ? sensitiveNote : null}
                    unread={isSensitive && !sensitiveLoaded}
                    onSave={saveSection}
                  />
                );
              })}
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
