import type { Express, Response } from "express";
import type { AdminQueueKey, InfinityEventType, SlaKind } from "@shared/research/member-platform";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin } from "../supabase";
import type { MemberPlatformDeps } from "./member-platform-deps";
import {
  buildInfinityEvent,
  disabledInfinityProvider,
  selectInfinityProvider,
  type InfinityEventPriority,
  type InfinityEventProvider,
} from "./infinity-provider";
import { ASSESSMENT_DUE_HOURS, ASSESSMENT_RESPONSES_TABLE, INITIAL_ASSESSMENT_DEFINITION } from "./assessment";
import { BLUEPRINTS_TABLE } from "./blueprint";
import { XENIOS30_PLANS_TABLE } from "./plans";
import { itemIdFor } from "./admin-queues";

// ---------------------------------------------------------------------------
// xenios research member platform: the SLA sweep (Website 2 lane, Wave 5).
//
// Four commitments have a clock on them:
//   assessment_deadline    72 hours from activation, while unsubmitted
//   blueprint_review       48 elapsed hours from entering samuel_review
//   monthly_plan_review    48 elapsed hours from entering samuel_review
//   question_response      about 12 hours from creation, while unanswered
//
// THE AT-RISK RULE: at_risk opens in the final 20 percent of the window, so
// the warning always arrives with a fifth of the time still left, whatever the
// window length. A 72 hour deadline goes at-risk at 57.6 hours (14.4 hours of
// room); a 12 hour deadline goes at-risk at 9.6 hours (2.4 hours of room).
// breached is any time past the deadline itself.
//
// A sweep that runs LATE emits the breach, not a stale at-risk warning. The
// phase is computed from the clock now, not replayed from the phases that
// would have fired had the sweep been running (same catch-up posture as the
// assessment reminder sweep).
//
// CLAIM BEFORE EMIT. Every emission inserts the ledger row FIRST. The unique
// (kind, subject_id, phase) constraint is what makes the claim exclusive: a
// duplicate-key error means another sweep (or another worker) already owns
// this notification, so this one skips. Only after the claim lands does the
// provider get called. If the provider refuses, the claim STAYS with
// delivered = false and a later sweep retries the delivery against the same
// claim; the claim is never deleted, so a flapping provider produces retries,
// never duplicates.
//
// Every source read is defensive: a table that does not exist yet (the
// questions wave owns its own) contributes zero candidates instead of
// failing the whole sweep.
//
// Nothing member-identifying crosses the boundary. Summaries describe the WORK
// ("initial assessment overdue"), never the member, their answers, their plan,
// or their question text; buildInfinityEvent enforces the field allowlist.
// ---------------------------------------------------------------------------

export const SLA_EVENTS_TABLE = "research_sla_events";

const MEMBERS_TABLE = "research_members";

// The questions wave owns this table; this read is deliberately defensive so
// the other three kinds keep sweeping before it exists.
const QUESTIONS_TABLE = "research_member_questions";

// Question statuses that still owe the member a response.
const OPEN_QUESTION_STATUSES = ["pending", "being_reviewed", "more_information_needed"] as const;

const HOUR_MS = 60 * 60 * 1000;

// The window per kind, in hours. assessment_deadline reuses the assessment
// module's own constant so the two can never drift apart.
export const SLA_WINDOW_HOURS: Record<SlaKind, number> = {
  assessment_deadline: ASSESSMENT_DUE_HOURS,
  blueprint_review: 48,
  monthly_plan_review: 48,
  question_response: 12,
};

// The final fifth of the window is the at-risk band.
export const AT_RISK_FRACTION = 0.2;

export type SlaPhase = "at_risk" | "breached";

export type SlaEventRow = {
  id: string;
  kind: SlaKind;
  subject_ref: string;
  subject_id: string | null;
  deadline_at: string;
  phase: SlaPhase;
  emitted_at: string;
  delivered: boolean;
  [key: string]: unknown;
};

export type SlaSweepResult = { atRisk: number; breached: number };

export type SlaSummary = {
  generatedAt: string;
  kinds: Record<SlaKind, { atRisk: number; breached: number }>;
  totals: { atRisk: number; breached: number };
  // Claims whose delivery the provider has refused so far. A number above zero
  // means Infinity is disabled or unreachable, not that the work is done.
  undeliveredEvents: number;
};

// ---------------------------------------------------------------------------
// The window math
// ---------------------------------------------------------------------------

// The current phase for one deadline, or null while there is still room. The
// window is measured from start to deadline, so the at-risk band scales with
// the commitment rather than being a fixed number of hours.
export function slaPhaseFor(startMs: number, deadlineMs: number, nowMs: number): SlaPhase | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return null;
  if (nowMs > deadlineMs) return "breached";
  const windowMs = deadlineMs - startMs;
  // A non-positive window has no meaningful at-risk band; it is either past
  // the deadline (handled above) or exactly on it.
  if (windowMs <= 0) return nowMs >= deadlineMs ? "breached" : null;
  const atRiskOpensAt = deadlineMs - windowMs * AT_RISK_FRACTION;
  return nowMs >= atRiskOpensAt ? "at_risk" : null;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

type SlaCandidate = {
  kind: SlaKind;
  phase: SlaPhase;
  subjectRef: string;
  subjectId: string;
  deadlineAt: Date;
  safeSummary: string;
  adminTarget: string;
};

const QUEUE_FOR_KIND: Record<SlaKind, AdminQueueKey> = {
  assessment_deadline: "assessment_due",
  blueprint_review: "blueprint_review",
  monthly_plan_review: "monthly_plan_review",
  question_response: "questions",
};

const EVENT_TYPE_FOR: Record<SlaKind, Record<SlaPhase, InfinityEventType>> = {
  // There is no "assessment at risk" type in the frozen vocabulary, so the
  // generic review warning carries the early signal and the assessment type
  // carries the breach.
  assessment_deadline: {
    at_risk: "research.review.sla_at_risk",
    breached: "research.assessment.overdue",
  },
  blueprint_review: {
    at_risk: "research.review.sla_at_risk",
    breached: "research.review.overdue",
  },
  monthly_plan_review: {
    at_risk: "research.review.sla_at_risk",
    breached: "research.review.overdue",
  },
  question_response: {
    at_risk: "research.question.response_due",
    breached: "research.question.overdue",
  },
};

function priorityFor(phase: SlaPhase): InfinityEventPriority {
  return phase === "breached" ? "critical" : "high";
}

// The escalation has to point at something Samuel can actually open. The
// admin detail route matches on itemIdFor(queue, sourceKey), NOT on a raw row
// id, so the target is built with the same helper and the same sourceKey
// shape the queue module derives. A link built from the raw id resolves to
// nothing.
const SOURCE_KEY_PREFIX: Record<SlaKind, string> = {
  assessment_deadline: "assessment",
  blueprint_review: "blueprint",
  monthly_plan_review: "xenios30",
  question_response: "question",
};

function adminTargetFor(kind: SlaKind, subjectId: string): string {
  const queue = QUEUE_FOR_KIND[kind];
  return `/api/admin/research/queues/${queue}/items/${itemIdFor(queue, `${SOURCE_KEY_PREFIX[kind]}:${subjectId}`)}`;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Every source read goes through here: a missing table, a storage error, or a
// thrown client all resolve to an empty list, so one kind can never take the
// whole sweep down.
async function readRows(
  table: string,
  apply: (query: any) => any = (query) => query,
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await apply(getSupabaseAdmin().from(table).select("*"));
    if (error || !Array.isArray(data)) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// 72 hours from activation, while the initial assessment is unsubmitted.
async function assessmentCandidates(nowMs: number): Promise<SlaCandidate[]> {
  const members = await readRows(MEMBERS_TABLE, (query) => query.eq("status", "active"));
  if (members.length === 0) return [];

  const submitted = await readRows(ASSESSMENT_RESPONSES_TABLE, (query) =>
    query
      .eq("definition_id", INITIAL_ASSESSMENT_DEFINITION.definitionId)
      .eq("mode", INITIAL_ASSESSMENT_DEFINITION.mode)
      .eq("status", "submitted"),
  );
  const submittedBy = new Set(submitted.map((row) => String(row.member_id ?? "")));

  const out: SlaCandidate[] = [];
  for (const member of members) {
    const memberId = typeof member.id === "string" ? member.id : "";
    if (!memberId || submittedBy.has(memberId)) continue;
    const activatedMs = parseTime(member.activated_at);
    if (activatedMs === null) continue;
    const deadlineMs = activatedMs + SLA_WINDOW_HOURS.assessment_deadline * HOUR_MS;
    const phase = slaPhaseFor(activatedMs, deadlineMs, nowMs);
    if (!phase) continue;
    out.push({
      kind: "assessment_deadline",
      phase,
      subjectRef: memberId,
      subjectId: memberId,
      deadlineAt: new Date(deadlineMs),
      safeSummary:
        phase === "breached"
          ? "Initial assessment is overdue; the 72 hour window has closed."
          : "Initial assessment is close to its 72 hour deadline.",
      adminTarget: adminTargetFor("assessment_deadline", memberId),
    });
  }
  return out;
}

// 48 elapsed hours from entering samuel_review. updated_at is stamped by the
// guarded transition into that state; a later internal note in the same state
// re-stamps it, which restarts the clock on purpose, since Samuel touching the
// row is exactly the engagement the deadline is asking for.
async function reviewCandidates(
  kind: "blueprint_review" | "monthly_plan_review",
  table: string,
  label: string,
  nowMs: number,
): Promise<SlaCandidate[]> {
  const rows = await readRows(table, (query) => query.eq("state", "samuel_review"));
  const out: SlaCandidate[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const startMs = parseTime(row.updated_at) ?? parseTime(row.created_at);
    if (startMs === null) continue;
    const deadlineMs = startMs + SLA_WINDOW_HOURS[kind] * HOUR_MS;
    const phase = slaPhaseFor(startMs, deadlineMs, nowMs);
    if (!phase) continue;
    out.push({
      kind,
      phase,
      // The row id, not the member id: the queue item is the unit of work, and
      // the id is opaque either way.
      subjectRef: id,
      subjectId: id,
      deadlineAt: new Date(deadlineMs),
      safeSummary:
        phase === "breached"
          ? `${label} has been waiting past its 48 hour review window.`
          : `${label} is close to its 48 hour review window.`,
      adminTarget: adminTargetFor(kind, id),
    });
  }
  return out;
}

// About 12 hours from creation, while the question is still unanswered. The
// question's own sla_target_at wins when it is present, so a question created
// with a different target is honored rather than overridden.
async function questionCandidates(nowMs: number): Promise<SlaCandidate[]> {
  const rows = await readRows(QUESTIONS_TABLE, (query) =>
    query.in("status", [...OPEN_QUESTION_STATUSES]),
  );
  const out: SlaCandidate[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const createdMs = parseTime(row.created_at);
    if (createdMs === null) continue;
    const deadlineMs =
      parseTime(row.sla_target_at) ?? createdMs + SLA_WINDOW_HOURS.question_response * HOUR_MS;
    const phase = slaPhaseFor(createdMs, deadlineMs, nowMs);
    if (!phase) continue;
    out.push({
      kind: "question_response",
      phase,
      subjectRef: id,
      subjectId: id,
      deadlineAt: new Date(deadlineMs),
      // The question TEXT never appears here: a member's question is member
      // content, and the category is enough to route the work.
      safeSummary:
        phase === "breached"
          ? "A member question is past its response target."
          : "A member question is close to its response target.",
      adminTarget: adminTargetFor("question_response", id),
    });
  }
  return out;
}

async function collectCandidates(nowMs: number): Promise<SlaCandidate[]> {
  const [assessments, blueprints, plans, questions] = await Promise.all([
    assessmentCandidates(nowMs).catch(() => []),
    reviewCandidates("blueprint_review", BLUEPRINTS_TABLE, "A Blueprint review", nowMs).catch(() => []),
    reviewCandidates("monthly_plan_review", XENIOS30_PLANS_TABLE, "A monthly plan review", nowMs).catch(
      () => [],
    ),
    questionCandidates(nowMs).catch(() => []),
  ]);
  return [...assessments, ...blueprints, ...plans, ...questions];
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

function ledgerKey(kind: SlaKind, subjectId: string, phase: SlaPhase): string {
  return `${kind}|${subjectId}|${phase}`;
}

async function fetchLedger(): Promise<Map<string, SlaEventRow>> {
  const rows = (await readRows(SLA_EVENTS_TABLE)) as SlaEventRow[];
  const map = new Map<string, SlaEventRow>();
  for (const row of rows) {
    const subjectId = typeof row.subject_id === "string" ? row.subject_id : "";
    if (!subjectId) continue;
    map.set(ledgerKey(row.kind, subjectId, row.phase), row);
  }
  return map;
}

// The claim. A duplicate-key error is the EXPECTED outcome when another sweep
// got here first, and it returns null so this sweep skips rather than emitting
// a second notification for the same subject and phase.
async function claim(candidate: SlaCandidate, now: Date): Promise<SlaEventRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(SLA_EVENTS_TABLE)
      .insert({
        kind: candidate.kind,
        subject_ref: candidate.subjectRef,
        subject_id: candidate.subjectId,
        deadline_at: candidate.deadlineAt.toISOString(),
        phase: candidate.phase,
        emitted_at: now.toISOString(),
        delivered: false,
      })
      .select("*")
      .single();
    if (error || !data) return null;
    return data as SlaEventRow;
  } catch {
    return null;
  }
}

async function markDelivered(row: SlaEventRow): Promise<void> {
  try {
    // Guarded on delivered = false, so a concurrent sweep that delivered first
    // loses cleanly instead of rewriting a settled row.
    await getSupabaseAdmin()
      .from(SLA_EVENTS_TABLE)
      .update({ delivered: true })
      .eq("id", row.id)
      .eq("delivered", false)
      .select("*")
      .maybeSingle();
  } catch {
    // A delivered notification whose flag did not persist is retried next
    // sweep. A duplicate notification is a smaller harm than a lost claim, and
    // the claim itself is what stops the duplicate from becoming permanent.
  }
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

// Runs one pass. The counts report events SUCCESSFULLY handed to Infinity in
// this sweep, so a refused emit counts zero now and counts one on the retry
// sweep that lands it. Deliberately not "claims created": the point of the
// number is what got through.
export async function sweepSlaDeadlines(
  deps: MemberPlatformDeps,
  provider?: InfinityEventProvider,
): Promise<SlaSweepResult> {
  const emitter = provider ?? selectInfinityProvider();
  const result: SlaSweepResult = { atRisk: 0, breached: 0 };

  // Capability off: no emission, no crash, and no claim either. The ledger
  // records what was emitted, so writing claims that nothing could deliver
  // would only bank a flood of stale notifications for the day it turns on.
  if (emitter === disabledInfinityProvider) return result;

  const now = deps.clock.now();
  const candidates = await collectCandidates(now.getTime());
  if (candidates.length === 0) return result;

  const ledger = await fetchLedger();

  for (const candidate of candidates) {
    try {
      const existing = ledger.get(ledgerKey(candidate.kind, candidate.subjectId, candidate.phase));
      // Already delivered: this subject and phase are done, forever.
      if (existing?.delivered === true) continue;

      // Either retry an undelivered claim or make a new one. A lost claim race
      // means somebody else owns this notification, so we stop.
      const row = existing ?? (await claim(candidate, now));
      if (!row) continue;

      const event = buildInfinityEvent({
        eventId: row.id,
        type: EVENT_TYPE_FOR[candidate.kind][candidate.phase],
        priority: priorityFor(candidate.phase),
        subjectRef: candidate.subjectRef,
        safeSummary: candidate.safeSummary,
        slaDeadline: candidate.deadlineAt.toISOString(),
        adminTarget: candidate.adminTarget,
        emittedAt: now.toISOString(),
      });

      const emitted = await emitter.emit(event);
      if (!emitted.ok) {
        // The claim stays. delivered = false is the retry queue.
        console.warn(`[sla] Infinity refused an ${candidate.phase} event (${emitted.code}); it stays queued.`);
        continue;
      }
      await markDelivered(row);
      if (candidate.phase === "breached") result.breached += 1;
      else result.atRisk += 1;
    } catch (err) {
      // One subject's failure never stops the sweep. Metadata only in logs.
      console.error("[sla] sweep item failed:", err instanceof Error ? err.message : "unknown error");
    }
  }

  return result;
}

// The sla_risk queue's head numbers: what is at risk or breached RIGHT NOW,
// per kind, computed from live state rather than from what has been emitted.
// Read-only; it never claims and never emits.
export async function slaSummaryForAdmin(deps: MemberPlatformDeps): Promise<SlaSummary> {
  const now = deps.clock.now();
  const candidates = await collectCandidates(now.getTime());
  const kinds: Record<SlaKind, { atRisk: number; breached: number }> = {
    assessment_deadline: { atRisk: 0, breached: 0 },
    blueprint_review: { atRisk: 0, breached: 0 },
    monthly_plan_review: { atRisk: 0, breached: 0 },
    question_response: { atRisk: 0, breached: 0 },
  };
  for (const candidate of candidates) {
    if (candidate.phase === "breached") kinds[candidate.kind].breached += 1;
    else kinds[candidate.kind].atRisk += 1;
  }
  const totals = Object.values(kinds).reduce(
    (acc, entry) => ({ atRisk: acc.atRisk + entry.atRisk, breached: acc.breached + entry.breached }),
    { atRisk: 0, breached: 0 },
  );

  const ledger = (await readRows(SLA_EVENTS_TABLE)) as SlaEventRow[];
  const undeliveredEvents = ledger.filter((row) => row.delivered !== true).length;

  return { generatedAt: now.toISOString(), kinds, totals, undeliveredEvents };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

export function registerSlaAdminApi(app: Express, deps: MemberPlatformDeps) {
  // The founding-phase manual trigger. A scheduled runner (cron, a platform
  // scheduler, or a queue worker calling sweepSlaDeadlines on an interval) is
  // a DEPLOYMENT concern and is deliberately not started from inside the web
  // process: the sweep is idempotent by claim, so running it from anywhere,
  // at any cadence, and more than once at a time is safe.
  app.post("/api/admin/research/sla/sweep", requireSupabaseAdmin, async (_req, res) => {
    setPrivacyHeaders(res);
    try {
      const swept = await sweepSlaDeadlines(deps);
      const summary = await slaSummaryForAdmin(deps);
      res.json({ ok: true, swept, summary });
    } catch (err) {
      console.error("[sla] sweep failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The SLA sweep could not be completed." });
    }
  });
}
