import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  TRACKER_METRIC_KEYS,
  type ObservationSource,
  type TrackerMetricKey,
  type TrackerObservation,
  type TrackerProgressView,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { getSupabaseAdmin } from "../supabase";
import { rateLimitHit } from "./rate-limit";
import { assessmentStatusForMember } from "./assessment";
import type { MemberPlatformDeps } from "./member-platform-deps";

// ---------------------------------------------------------------------------
// xenios research member platform: tracker observations (G5, Wave 4).
//
// The tracker is LOCKED until the member's assessment is submitted: a locked
// read returns unlocked:false with no metrics (the UI shows the locked state,
// not an error), and a locked write is a state conflict.
//
// THERE IS NO COMPOSITE HEALTH SCORE ANYWHERE IN THIS MODULE. Six domains are
// reported side by side and never combined into one number to grow: no score,
// no overall index, no rank, no percentile. data_completeness is the only
// computed metric, and it measures how much of the OTHER five domains a member
// has covered in the window, never how healthy they are. A test asserts that
// no field named score, overall, or index ever appears in a tracker response;
// if a future change adds one, that test fails on purpose.
//
// Accessibility is a hard requirement, not a nicety: every metric carries a
// plain-language textSummary, so a member who cannot read the chart gets the
// same information in words.
//
// No capability gate applies here. This route stores structured values only:
// it never mints a signed URL and never touches storage. Media-sourced
// observations (voice_note, photo, video) are written by the private-media
// pipeline behind its own private_media capability gate; the tracker only
// reads the rows that pipeline leaves behind.
// ---------------------------------------------------------------------------

export const TRACKER_OBSERVATIONS_TABLE = "research_tracker_observations";

// Owned by plans.ts; re-declared locally (the same convention blueprint.ts and
// plans.ts use for research_members) so the tracker does not import a route
// module and create a cycle.
const XENIOS30_PLANS_TABLE = "research_xenios30_plans";

const DAY_MS = 24 * 60 * 60 * 1000;

// The reporting windows the contract allows, and the default.
export const TRACKER_WINDOW_DAYS = [7, 30, 90] as const;
export type TrackerWindowDays = (typeof TRACKER_WINDOW_DAYS)[number];
const DEFAULT_WINDOW_DAYS: TrackerWindowDays = 30;

// An entry may be backdated a week (a member catching up after a busy stretch)
// and never postdated.
export const MAX_BACKDATE_DAYS = 7;

// Writes per member per hour. Generous for real logging, tight enough that a
// runaway client cannot flood the table.
const WRITE_LIMIT_PER_HOUR = 120;

// The five domains a member can submit. data_completeness is computed from
// these and is rejected on write.
export const SUBMITTABLE_TRACKER_METRIC_KEYS: readonly TrackerMetricKey[] =
  TRACKER_METRIC_KEYS.filter((key) => key !== "data_completeness");

const METRIC_LABELS: Record<TrackerMetricKey, string> = {
  plan_adherence: "Plan adherence",
  body_and_appearance: "Body and appearance",
  sleep_and_recovery: "Sleep and recovery",
  energy_stress_vitality: "Energy, stress and vitality",
  performance_and_function: "Performance and function",
  data_completeness: "Data completeness",
};

export type TrackerObservationRow = {
  id: string;
  member_id: string;
  metric_key: TrackerMetricKey;
  source: ObservationSource;
  recorded_at: string;
  timezone: string;
  unit: string | null;
  original_value: string;
  normalized_value: number | string | null;
  confidence: "low" | "medium" | "high" | null;
  notes: string | null;
  plan_id: string | null;
  created_at: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Normalization
//
// Convention, documented once and applied uniformly so a chart can compare
// entries the member wrote in different shapes:
//   plan_adherence            a number is the percentage of the plan followed
//   body_and_appearance       a number is the measurement in the member's unit
//   sleep_and_recovery        a number is hours slept; a rating is 0 to 10
//   energy_stress_vitality    a rating is 0 to 10
//   performance_and_function  a number is the measurement in the member's unit
//
// A rating written on a five-point scale ("4/5", "3 out of 5") is doubled onto
// the shared 0 to 10 rating scale, so a 4/5 and an 8/10 land on the same
// number. A ten-point rating is kept as written.
//
// Anything the parser cannot read as a number is kept VERBATIM with a null
// normalized value and low confidence. The member's words are never discarded
// and never guessed at, and a null normalized value tells the chart honestly
// that there is nothing to plot.
//
// The "medium" confidence band exists for the media pipeline (a number pulled
// out of a voice-note transcript, for example). This route never mints it:
// a member's own typed entry is either read exactly or kept as words.
// ---------------------------------------------------------------------------

const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;
const SCALE_PATTERN = /^(\d+(?:\.\d+)?)\s*(?:\/|\s+out\s+of\s+|\s+of\s+)\s*(5|10)$/i;

export type NormalizedEntry = {
  originalValue: string;
  normalizedValue: number | null;
  confidence: "low" | "medium" | "high";
};

export type NormalizeResult = { ok: true; entry: NormalizedEntry } | { ok: false; message: string };

export function normalizeObservationValue(raw: string | number): NormalizeResult {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, message: "Enter a number, a rating, or a short description." };
    return { ok: true, entry: { originalValue: String(raw), normalizedValue: raw, confidence: "high" } };
  }

  const text = raw.trim();
  if (text.length === 0) return { ok: false, message: "Enter a value." };

  if (NUMERIC_PATTERN.test(text)) {
    const value = Number(text);
    if (Number.isFinite(value)) {
      return { ok: true, entry: { originalValue: text, normalizedValue: value, confidence: "high" } };
    }
  }

  const scale = SCALE_PATTERN.exec(text);
  if (scale) {
    const rating = Number(scale[1]);
    const points = Number(scale[2]);
    if (rating > points) {
      return { ok: false, message: `A ${points}-point rating cannot be higher than ${points}.` };
    }
    return {
      ok: true,
      entry: {
        originalValue: text,
        normalizedValue: points === 5 ? rating * 2 : rating,
        confidence: "high",
      },
    };
  }

  // Words, kept exactly as written.
  return { ok: true, entry: { originalValue: text, normalizedValue: null, confidence: "low" } };
}

// A stored original_value round-trips back to a number when that is what the
// member sent, so the contract's `string | number` stays faithful.
function parseOriginalValue(stored: string): string | number {
  if (NUMERIC_PATTERN.test(stored.trim())) {
    const value = Number(stored.trim());
    if (Number.isFinite(value)) return value;
  }
  return stored;
}

// ---------------------------------------------------------------------------
// Time helpers (every date comes from deps.clock)
// ---------------------------------------------------------------------------

// The inclusive start of the reporting window: an entry recorded exactly at
// the boundary is inside it.
export function windowStartFor(now: Date, windowDays: TrackerWindowDays): Date {
  return new Date(now.getTime() - windowDays * DAY_MS);
}

export type RecordedAtCheck = { ok: true; date: Date } | { ok: false; message: string };

// Not in the future by any amount, and backdated by at most MAX_BACKDATE_DAYS.
// Both boundaries are inclusive: exactly now, and exactly seven days ago, are
// both acceptable.
export function checkRecordedAt(raw: string, now: Date): RecordedAtCheck {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return { ok: false, message: "Use an ISO-8601 date and time." };
  if (ms > now.getTime()) return { ok: false, message: "An entry cannot be recorded in the future." };
  if (ms < now.getTime() - MAX_BACKDATE_DAYS * DAY_MS) {
    return { ok: false, message: `An entry can be backdated up to ${MAX_BACKDATE_DAYS} days.` };
  }
  return { ok: true, date: new Date(ms) };
}

// ---------------------------------------------------------------------------
// Storage reads (every read filters by member; ordering happens in code so the
// behavior never depends on storage ordering guarantees)
// ---------------------------------------------------------------------------

async function fetchObservations(memberId: string, windowStart: Date): Promise<TrackerObservationRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TRACKER_OBSERVATIONS_TABLE)
      .select("*")
      .eq("member_id", memberId)
      .gte("recorded_at", windowStart.toISOString());
    if (error || !Array.isArray(data)) return [];
    return data as TrackerObservationRow[];
  } catch {
    return [];
  }
}

// A member may only attach their OWN plan to an observation. An unknown id, a
// malformed id, and another member's plan id all read the same way.
async function ownsPlan(memberId: string, planId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(XENIOS30_PLANS_TABLE)
      .select("id")
      .eq("id", planId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unlock
// ---------------------------------------------------------------------------

// The tracker opens when the assessment is submitted, and not before: there is
// nothing honest to chart against until the member has told us where they are
// starting from.
export async function trackerUnlockedFor(member: MemberRow, now: Date): Promise<boolean> {
  const status = await assessmentStatusForMember(member, now);
  return status.status === "submitted";
}

// ---------------------------------------------------------------------------
// Serialization + the progress view
// ---------------------------------------------------------------------------

export function toTrackerObservation(row: TrackerObservationRow): TrackerObservation {
  const normalized =
    row.normalized_value === null || row.normalized_value === undefined ? null : Number(row.normalized_value);
  return {
    observationId: row.id,
    metricKey: row.metric_key,
    source: row.source,
    recordedAt: row.recorded_at,
    timezone: row.timezone,
    unit: row.unit ?? null,
    originalValue: parseOriginalValue(row.original_value),
    normalizedValue: normalized !== null && Number.isFinite(normalized) ? normalized : null,
    confidence: row.confidence ?? "high",
    notes: row.notes ?? null,
    planId: row.plan_id ?? null,
    createdAt: row.created_at,
  };
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

// Newest first, with created_at then id as deterministic tiebreakers.
function byRecordedAtDesc(a: TrackerObservation, b: TrackerObservation): number {
  const diff = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
  if (diff !== 0 && Number.isFinite(diff)) return diff;
  const created = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (created !== 0 && Number.isFinite(created)) return created;
  return a.observationId < b.observationId ? -1 : a.observationId > b.observationId ? 1 : 0;
}

// The accessibility requirement in one function: whatever the chart shows, this
// says in plain language. Deliberately descriptive, never a verdict: "higher
// than your first entry" is a fact, "improving" would be a judgment the tracker
// has no standing to make.
export function summarizeMetric(
  metricKey: TrackerMetricKey,
  observations: TrackerObservation[],
  windowDays: TrackerWindowDays,
): string {
  const label = METRIC_LABELS[metricKey];
  const days = `the last ${windowDays} days`;
  if (observations.length === 0) return `${label}: no entries in ${days}.`;

  const count = observations.length;
  const entries = `${count} ${count === 1 ? "entry" : "entries"} in ${days}`;
  const numeric = observations.filter((observation) => observation.normalizedValue !== null);
  if (numeric.length === 0) {
    return `${label}: ${entries}, all in your own words, so there is no number to chart.`;
  }

  const latest = numeric[0];
  const earliest = numeric[numeric.length - 1];
  const unit = latest.unit ? ` ${latest.unit}` : "";
  const parts = [
    `${label}: ${entries}.`,
    `Latest ${formatNumber(latest.normalizedValue as number)}${unit} on ${dayOf(latest.recordedAt)}.`,
  ];

  if (numeric.length >= 2) {
    const delta = (latest.normalizedValue as number) - (earliest.normalizedValue as number);
    parts.push(
      Math.abs(delta) < 1e-9
        ? "About the same as your first entry in this window."
        : delta > 0
          ? `Higher than your first entry in this window by ${formatNumber(Math.abs(delta))}${unit}.`
          : `Lower than your first entry in this window by ${formatNumber(Math.abs(delta))}${unit}.`,
    );
  }

  const words = count - numeric.length;
  if (words > 0) {
    parts.push(`${words} ${words === 1 ? "entry is" : "entries are"} in your own words.`);
  }
  return parts.join(" ");
}

// data_completeness is COMPUTED, always, at read time: the share of the other
// five domains carrying at least one entry in the window. It is never read
// from storage (a stored row, if one ever appeared, is ignored) and it is
// never a health measure. It answers one question: how much of the picture do
// we actually have.
function completenessObservation(
  covered: number,
  windowDays: TrackerWindowDays,
  now: Date,
): TrackerObservation {
  const total = SUBMITTABLE_TRACKER_METRIC_KEYS.length;
  const stamp = now.toISOString();
  return {
    observationId: `computed:data_completeness:${windowDays}`,
    metricKey: "data_completeness",
    source: "system",
    recordedAt: stamp,
    timezone: "UTC",
    unit: "percent",
    originalValue: `${covered} of ${total}`,
    normalizedValue: Math.round((covered / total) * 100),
    confidence: "high",
    notes: null,
    planId: null,
    createdAt: stamp,
  };
}

function completenessSummary(covered: number, windowDays: TrackerWindowDays): string {
  const total = SUBMITTABLE_TRACKER_METRIC_KEYS.length;
  const label = METRIC_LABELS.data_completeness;
  const areas = `${covered} of the other ${total} areas`;
  if (covered === 0) {
    return `${label}: no entries yet in the last ${windowDays} days, so there is nothing to compare against.`;
  }
  return `${label}: ${areas} have an entry in the last ${windowDays} days. This tracks how complete the picture is, not how you are doing.`;
}

export function buildProgressView(
  rows: TrackerObservationRow[],
  windowDays: TrackerWindowDays,
  now: Date,
): TrackerProgressView {
  const byMetric = new Map<TrackerMetricKey, TrackerObservation[]>();
  for (const key of TRACKER_METRIC_KEYS) byMetric.set(key, []);
  for (const observation of rows.map(toTrackerObservation)) {
    byMetric.get(observation.metricKey)?.push(observation);
  }
  for (const key of TRACKER_METRIC_KEYS) byMetric.get(key)?.sort(byRecordedAtDesc);

  const covered = SUBMITTABLE_TRACKER_METRIC_KEYS.filter(
    (key) => (byMetric.get(key) ?? []).length > 0,
  ).length;

  return {
    unlocked: true,
    windowDays,
    metrics: TRACKER_METRIC_KEYS.map((key) => {
      if (key === "data_completeness") {
        return {
          metricKey: key,
          observations: [completenessObservation(covered, windowDays, now)],
          textSummary: completenessSummary(covered, windowDays),
        };
      }
      const observations = byMetric.get(key) ?? [];
      return { metricKey: key, observations, textSummary: summarizeMetric(key, observations, windowDays) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const observationSchema = z.object({
  metricKey: z.enum(TRACKER_METRIC_KEYS),
  recordedAt: z.string().min(1).max(64),
  timezone: z.string().min(1).max(64),
  unit: z.string().min(1).max(32).optional(),
  value: z.union([z.string().max(500), z.number()]),
  notes: z.string().max(2000).optional(),
  planId: z.string().min(1).max(100).optional(),
});

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberFrom(req: Request): MemberRow | null {
  return ((req as { researchMember?: MemberRow }).researchMember as MemberRow) ?? null;
}

function sendValidation(res: Response, fieldErrors: Record<string, string[]>) {
  res.status(400).json({ ok: false, code: "validation_failed", fieldErrors });
}

function sendConflict(res: Response, message: string) {
  res.status(409).json({ ok: false, code: "state_conflict", message });
}

function parseWindowDays(raw: unknown): TrackerWindowDays | null {
  if (raw === undefined || raw === "") return DEFAULT_WINDOW_DAYS;
  if (typeof raw !== "string") return null;
  const value = Number(raw);
  return (TRACKER_WINDOW_DAYS as readonly number[]).includes(value) ? (value as TrackerWindowDays) : null;
}

export function registerTrackerApi(app: Express, deps: MemberPlatformDeps) {
  // The member's own progress view. A locked tracker returns 200 with
  // unlocked:false and no metrics, so the UI renders the locked state rather
  // than an error page.
  app.get("/api/research/tracker", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const windowDays = parseWindowDays(req.query.windowDays);
      if (windowDays === null) {
        return sendValidation(res, { windowDays: [`windowDays must be one of: ${TRACKER_WINDOW_DAYS.join(", ")}`] });
      }

      const now = deps.clock.now();
      if (!(await trackerUnlockedFor(member, now))) {
        return res.json({ ok: true, progress: { unlocked: false, windowDays, metrics: [] } });
      }

      const rows = await fetchObservations(member.id, windowStartFor(now, windowDays));
      res.json({ ok: true, progress: buildProgressView(rows, windowDays, now) });
    } catch (err) {
      console.error("[tracker] load failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The tracker could not be loaded." });
    }
  });

  // Record one observation. The member id comes from the guard and NOWHERE
  // else: a memberId in the body is ignored (the schema strips it), so a
  // member can only ever write to their own record.
  app.post("/api/research/tracker", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const now = deps.clock.now();
      if (!(await trackerUnlockedFor(member, now))) {
        return sendConflict(res, "The tracker opens once your assessment is submitted.");
      }

      if (!(await rateLimitHit(`tracker-observation:${member.id}`, 3600, WRITE_LIMIT_PER_HOUR))) {
        return res.status(429).json({ ok: false, code: "rate_limited", message: "Too many entries. Try again shortly." });
      }

      const parsed = observationSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);
      const input = parsed.data;

      // data_completeness is computed from the other five domains at read time;
      // it is not a thing a member reports about themselves.
      if (input.metricKey === "data_completeness") {
        return sendValidation(res, {
          metricKey: ["data_completeness is computed from your other entries; it cannot be submitted."],
        });
      }

      const recorded = checkRecordedAt(input.recordedAt, now);
      if (!recorded.ok) return sendValidation(res, { recordedAt: [recorded.message] });

      const normalized = normalizeObservationValue(input.value);
      if (!normalized.ok) return sendValidation(res, { value: [normalized.message] });

      if (input.planId && !(await ownsPlan(member.id, input.planId))) {
        return sendValidation(res, { planId: ["No plan of yours with that id."] });
      }

      const source: ObservationSource = "manual";
      const { data, error } = await getSupabaseAdmin()
        .from(TRACKER_OBSERVATIONS_TABLE)
        .insert({
          member_id: member.id,
          metric_key: input.metricKey,
          source,
          // Stored in UTC; the member's own clock is preserved in `timezone`.
          recorded_at: recorded.date.toISOString(),
          timezone: input.timezone,
          unit: input.unit ?? null,
          original_value: normalized.entry.originalValue,
          normalized_value: normalized.entry.normalizedValue,
          confidence: normalized.entry.confidence,
          notes: input.notes ?? null,
          plan_id: input.planId ?? null,
          created_at: now.toISOString(),
        })
        .select("*")
        .single();
      if (error || !data) {
        console.error("[tracker] insert failed:", error?.message ?? "no row returned");
        return res.status(500).json({ ok: false, message: "The entry could not be recorded." });
      }

      res.json({ ok: true, observation: toTrackerObservation(data as TrackerObservationRow) });
    } catch (err) {
      console.error("[tracker] record failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The entry could not be recorded." });
    }
  });
}
