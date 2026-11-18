import { z } from "zod";

/** One explicitly elapsed UTC day, independent of the host timezone or DST. */
const DAY_MS = 86_400_000;

/** Strict millisecond-precision RFC3339 subset; never normalize an impossible date. */
function instant(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, , offsetHour, offsetMinute] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || zone === "-00:00"
    || (zone !== "Z" && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return null;
  const valueMs = Date.parse(value);
  if (!Number.isFinite(valueMs)) return null;
  const utcYear = new Date(valueMs).getUTCFullYear();
  return utcYear >= 1 && utcYear <= 9999 ? valueMs : null;
}

const stamp = z.string().max(29).refine(value => instant(value) !== null);
const dayCount = z.number().int().positive().safe();
const policySchema = z.object({
  recordReference: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9.:/@_-]*$/),
  documentSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  durationSemantics: z.literal("elapsed_utc_days"),
  afterClosureDays: dayCount,
  afterSubmissionDays: dayCount,
}).strict();
const inputSchema = z.object({
  classification: z.enum(["unconverted", "converted", "completed", "unknown"]),
  submittedAt: stamp,
  /** Explicit null means known not closed; omitted/unknown is not an open case. */
  closedAt: stamp.nullable(),
  asOf: stamp,
  legalHold: z.enum(["none", "active", "unknown"]),
  extension: z.enum(["none", "present", "unknown"]),
  policy: policySchema,
}).strict();

export type UnconvertedRetentionInput = z.infer<typeof inputSchema>;
type UnavailableReason = "invalid_input" | "classification_unavailable" | "unsupported_classification"
  | "hold_status_unavailable" | "extension_status_unavailable" | "invalid_timeline" | "deadline_out_of_range";
const ADVISORY = Object.freeze({ schemaVersion: 1, mode: "advisory", authority: "none", automaticDeletion: false } as const);
export type UnconvertedRetentionPlan = typeof ADVISORY & (
  | Readonly<{ status: "unavailable"; reason: UnavailableReason }>
  | Readonly<{ status: "held"; reason: "legal_hold" | "extension_requires_review" }>
  | Readonly<{
    status: "planned";
    policy: Readonly<z.infer<typeof policySchema>>;
    submittedAt: string;
    closedAt: string | null;
    asOf: string;
    submissionDeadlineAt: string;
    closureDeadlineAt: string | null;
    deadlineAt: string;
    limitingClock: "submission_cap" | "closure_limit" | "both";
    phase: "before_deadline" | "deadline_reached";
  }>
);

function addDays(from: number, count: number): number | null {
  const duration = count * DAY_MS, result = from + duration;
  if (!Number.isSafeInteger(duration) || !Number.isSafeInteger(result)) return null;
  const date = new Date(result), year = date.getUTCFullYear();
  return Number.isFinite(date.getTime()) && year >= 1 && year <= 9999 ? result : null;
}

/**
 * Pure deadline calculation over explicit canonical facts and supplied policy values.
 * It does not authenticate policy approval, classify an order, read a clock, inspect
 * activity/quotes, authorize erasure, or call a persistence/provider boundary.
 */
export function planUnconvertedRetention(raw: unknown): UnconvertedRetentionPlan {
  const parsed = inputSchema.safeParse(raw);
  const unavailable = (reason: UnavailableReason): UnconvertedRetentionPlan => ({ ...ADVISORY, status: "unavailable", reason });
  if (!parsed.success) return unavailable("invalid_input");
  const input = parsed.data;
  if (input.classification === "unknown") return unavailable("classification_unavailable");
  if (input.classification !== "unconverted") return unavailable("unsupported_classification");
  if (input.legalHold === "active") return { ...ADVISORY, status: "held", reason: "legal_hold" };
  if (input.legalHold === "unknown") return unavailable("hold_status_unavailable");
  if (input.extension === "present") return { ...ADVISORY, status: "held", reason: "extension_requires_review" };
  if (input.extension === "unknown") return unavailable("extension_status_unavailable");

  // All were validated above; no wall clock or activity-derived fallback is used.
  const submitted = instant(input.submittedAt)!;
  const closed = input.closedAt === null ? null : instant(input.closedAt)!;
  const asOf = instant(input.asOf)!;
  if (submitted > asOf || (closed !== null && (closed < submitted || closed > asOf))) {
    return unavailable("invalid_timeline");
  }
  const submissionDeadline = addDays(submitted, input.policy.afterSubmissionDays);
  const closureDeadline = closed === null ? null : addDays(closed, input.policy.afterClosureDays);
  if (submissionDeadline === null || (closed !== null && closureDeadline === null)) {
    return unavailable("deadline_out_of_range");
  }
  const deadline = closureDeadline === null ? submissionDeadline : Math.min(submissionDeadline, closureDeadline);
  return {
    ...ADVISORY,
    status: "planned",
    policy: { ...input.policy, documentSha256: input.policy.documentSha256.toLowerCase() },
    submittedAt: new Date(submitted).toISOString(),
    closedAt: closed === null ? null : new Date(closed).toISOString(),
    asOf: new Date(asOf).toISOString(),
    submissionDeadlineAt: new Date(submissionDeadline).toISOString(),
    closureDeadlineAt: closureDeadline === null ? null : new Date(closureDeadline).toISOString(),
    deadlineAt: new Date(deadline).toISOString(),
    limitingClock: closureDeadline === null || submissionDeadline < closureDeadline ? "submission_cap"
      : closureDeadline < submissionDeadline ? "closure_limit" : "both",
    phase: asOf < deadline ? "before_deadline" : "deadline_reached",
  };
}
