/**
 * How a person actually reaches Tebra, and what happens when Tebra is not
 * configured.
 *
 * Three modes, resolved from configuration and never invented:
 *   - `direct_url`: a scheduling link Tebra gave us.
 *   - `widget`: Tebra's own embedded scheduler.
 *   - `concierge`: the fallback. A short, non clinical request that an
 *     operations owner picks up by hand.
 *
 * If nothing is configured the answer is the concierge fallback. A scheduling
 * URL is never guessed, and a scheduling confirmation is never claimed.
 *
 * CONFIGURATION (both optional, both https only, both server side):
 *
 *   TEBRA_SCHEDULING_URL      a scheduling link the practice gave us.
 *                             NEXT_PUBLIC_TEBRA_SCHEDULING_URL is accepted as
 *                             an alias for callers who arrive with that name.
 *   TEBRA_WIDGET_SCRIPT_URL   the practice's embedded scheduler.
 *
 * This repo has no public env prefix convention: the browser gets its values
 * from the server through the care API, so neither of these is ever inlined
 * into a bundle. With neither set the surface falls back to the concierge
 * path, which is a safe state rather than a broken one.
 *
 * A referral WRITE additionally requires the existing capability flag
 * CARE_REAL_PATIENT_DATA_ENABLED, enforced at the server write chokepoint in
 * `server/care/referral-repository.ts`.
 */

export const CARE_HANDOFF_MODES = ["direct_url", "widget", "concierge"] as const;
export type CareHandoffMode = (typeof CARE_HANDOFF_MODES)[number];

export interface CareHandoffConfig {
  mode: CareHandoffMode;
  /** Present only in `direct_url` mode, and only from configuration. */
  schedulingUrl: string | null;
  /** Present only in `widget` mode, and only from configuration. */
  widgetScriptUrl: string | null;
  configured: boolean;
}

export const CARE_CONCIERGE_HANDOFF: CareHandoffConfig = {
  mode: "concierge",
  schedulingUrl: null,
  widgetScriptUrl: null,
  configured: false,
};

/**
 * The instruction shown above the concierge form. It is deliberately blunt:
 * the form is a request to be contacted, not a place to describe a condition.
 */
export const CARE_CONCIERGE_NOTICE =
  "Do not enter medical details here. No symptoms, conditions, medications, lab results, or treatment questions. This form only asks our team to contact you so care can be scheduled. Anything clinical belongs in your visit with the clinician.";

/** Only https, and only a host we were configured with. */
function safeUrl(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve the handoff from a plain record of configuration values. Taking a
 * record rather than reading `process.env` directly keeps this shared between
 * server and tests, and keeps a test from inheriting real credentials.
 */
export function resolveCareHandoffConfig(
  env: Readonly<Record<string, string | undefined>>,
): CareHandoffConfig {
  const schedulingUrl =
    safeUrl(env.TEBRA_SCHEDULING_URL) ??
    safeUrl(env.NEXT_PUBLIC_TEBRA_SCHEDULING_URL);
  const widgetScriptUrl = safeUrl(env.TEBRA_WIDGET_SCRIPT_URL);

  if (schedulingUrl) {
    return { mode: "direct_url", schedulingUrl, widgetScriptUrl, configured: true };
  }
  if (widgetScriptUrl) {
    return {
      mode: "widget",
      schedulingUrl: null,
      widgetScriptUrl,
      configured: true,
    };
  }
  return CARE_CONCIERGE_HANDOFF;
}

/* ── the concierge content guard ──────────────────────────────────────────── */

export type CareConciergeRejectionReason =
  | "clinical_content"
  | "too_long"
  | "empty";

export interface CareConciergeScreenResult {
  ok: boolean;
  reason: CareConciergeRejectionReason | null;
  /** The matched marker, for the person to correct. Never the whole message. */
  marker: string | null;
  message: string;
}

/** The concierge request is a contact request, so it stays short. */
export const CARE_CONCIERGE_MAX_LENGTH = 300;

/**
 * Markers that make a message look clinical. Recall biased on purpose: a
 * refused message costs a person one rewrite, an accepted one puts clinical
 * narrative in a Xenios table.
 */
const CLINICAL_MARKERS: readonly string[] = [
  "symptom",
  "symptoms",
  "diagnosis",
  "diagnosed",
  "condition",
  "disease",
  "disorder",
  "syndrome",
  "medication",
  "medications",
  "meds",
  "prescription",
  "prescribed",
  "dose",
  "dosage",
  "refill",
  "pill",
  "injection",
  "lab",
  "labs",
  "bloodwork",
  "blood work",
  "test result",
  "test results",
  "a1c",
  "hba1c",
  "cholesterol",
  "glucose",
  "thyroid",
  "testosterone",
  "estrogen",
  "insulin",
  "treatment",
  "therapy",
  "surgery",
  "allergy",
  "allergic",
  "pain",
  "hurts",
  "ache",
  "nausea",
  "dizzy",
  "dizziness",
  "fatigue",
  "depression",
  "anxiety",
  "pregnant",
  "pregnancy",
  "chest",
  "heart",
  "blood pressure",
  "diabetes",
  "diabetic",
  "cancer",
  "infection",
  "fever",
  "rash",
  "bleeding",
  "semaglutide",
  "tirzepatide",
  "metformin",
  "ozempic",
  "mounjaro",
  "wegovy",
  "peptide",
  "hormone",
  "side effect",
  "side effects",
  "history of",
  "i have been feeling",
  "i feel",
];

/** A dosage looks like "10 mg" or "0.5mL", which is clinical by shape. */
const DOSAGE = /\b\d+(\.\d+)?\s?(mg|mcg|ml|iu|units?|cc)\b/i;

/**
 * Screen a concierge message. Deterministic and shared, so the browser and the
 * server reach the same verdict and the server is the one that binds.
 */
export function screenCareConciergeMessage(
  value: unknown,
): CareConciergeScreenResult {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return {
      ok: false,
      reason: "empty",
      marker: null,
      message: "Tell us the best way to reach you so our team can follow up.",
    };
  }
  if (text.length > CARE_CONCIERGE_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      marker: null,
      message: `Keep this under ${CARE_CONCIERGE_MAX_LENGTH} characters. It is a request to be contacted, not a description of your health.`,
    };
  }

  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  for (const marker of CLINICAL_MARKERS) {
    if (haystack.includes(` ${marker} `)) {
      return {
        ok: false,
        reason: "clinical_content",
        marker,
        message: CARE_CONCIERGE_NOTICE,
      };
    }
  }
  if (DOSAGE.test(text)) {
    return {
      ok: false,
      reason: "clinical_content",
      marker: "dosage",
      message: CARE_CONCIERGE_NOTICE,
    };
  }

  return { ok: true, reason: null, marker: null, message: "" };
}
