import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  ADMIN_QUEUE_KEYS,
  type AdminQueueItem,
  type AdminQueueKey,
  type AdminQueuePage,
} from "@shared/research/member-platform";
import type { MemberRow } from "./member-auth";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin } from "../supabase";
import { capabilityEnabled } from "./capabilities";
import type { MemberPlatformDeps } from "./member-platform-deps";
import { AGREEMENT_DEFINITIONS } from "./agreements";
import {
  ASSESSMENT_DUE_HOURS,
  ASSESSMENT_RESPONSES_TABLE,
  INITIAL_ASSESSMENT_DEFINITION,
} from "./assessment";
import { BLUEPRINTS_TABLE } from "./blueprint";
import { XENIOS30_PLANS_TABLE } from "./plans";
import { SLA_WINDOW_HOURS } from "./sla";

// ---------------------------------------------------------------------------
// xenios research member platform: Samuel's admin queues (contract section 14,
// Website 2 lane, Wave 5).
//
// This module OWNS NO TABLE. It is a read-only projection over tables other
// waves own, which forces two properties into its shape:
//
// - Every read is defensive. Waves land independently, so a table that does
//   not exist yet reads as an EMPTY queue, never a 500. A queue that cannot
//   see its source says "nothing here" rather than falling over, and the
//   comment on each collector says who owns the source.
// - Nothing here mutates. There is no optimistic guarded update in this file
//   because there is no write; the queues point Samuel at the module that owns
//   the action, and that module owns the state machine and the step-up.
//
// THE SAFE SUMMARY IS THE POINT. A queue list is the widest-angle view of the
// membership that exists, so it is built from an ALLOWLIST of fields:
// first name, enum labels, versions, month labels, counts, and ages. Never a
// health answer, an assessment answer, a blueprint recommendation, a question
// body, an email address, or a document title. The list carries an OPAQUE
// subjectRef (a salted one-way digest, computed per queue so the same member
// is not correlatable across queues by ref), and the detail endpoint is the
// only place a real member id appears.
//
// The detail endpoint re-collects the queue and matches the opaque itemId
// inside it. That is deliberate: an admin cannot hand this route an arbitrary
// row id and read something that is not actually in a queue. Detail is
// server-authorized by construction, not by trust.
//
// Capability posture: a work queue NEVER answers 409 capability_disabled on
// the list. Hiding Samuel's work because an optional integration is off is the
// worse failure, and the queue can always be computed from the database. Where
// a capability genuinely decides what can happen next (answering a question
// that arrived over Telegram, escalating an SLA breach to Infinity), the
// DETAIL reports the capability truthfully as unavailable with the
// capability_disabled code, instead of implying a delivery route that does not
// exist. The capability-gated ACTIONS live in the modules that own them.
// ---------------------------------------------------------------------------

const MEMBERS_TABLE = "research_members";
const APPLICATIONS_TABLE = "research_applications";
const AGREEMENT_ACCEPTANCES_TABLE = "research_agreement_acceptances";

// Owned by the questions wave (contract section 12). Named here rather than
// imported so this module does not fail to load before that wave lands; the
// read is defensive either way.
export const MEMBER_QUESTIONS_TABLE = "research_member_questions";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// SLA windows come from the SLA module (SLA_WINDOW_HOURS), which owns them for
// every SlaKind. They are deliberately NOT copied here: a copy of a policy
// number drifts, and this queue disagreeing with the module that emits the
// breach events would be a quiet, hard-to-see wrong answer.
//
// Applications are the one exception, because an application is not an SlaKind
// (there is no member yet, so nothing downstream escalates on it). The window
// lives here, with the queue that is the only thing measuring it.
export const APPLICATION_REVIEW_SLA_HOURS = 72;

// A deadline inside this window (or already past) is at risk.
export const SLA_RISK_WINDOW_HOURS = 6;

export const ADMIN_QUEUE_PRIORITIES = ["critical", "high", "normal"] as const;
type QueuePriority = (typeof ADMIN_QUEUE_PRIORITIES)[number];

// Applications actually waiting on Samuel. more_information_requested is
// deliberately absent: that one is waiting on the APPLICANT, and the approval
// expiry sweep already closes stalled ones.
const APPLICATION_REVIEW_STATUSES = ["submitted", "under_review", "resubmitted"] as const;

// Blueprints waiting on Samuel. more_information_needed is a review state but
// the ball is with the member, so it is not his queue.
const BLUEPRINT_QUEUE_STATES = ["preliminary", "samuel_review"] as const;

const PLAN_QUEUE_STATES = ["draft", "samuel_review"] as const;

// Statuses that mean protected access is off. These are the account blocks.
const BLOCKED_MEMBER_STATUSES = ["paused", "cancelled", "closed"] as const;

// Members whose paperwork is still expected. A blocked account belongs in
// account_blocks, not in a paperwork chase.
const PAPERWORK_MEMBER_STATUSES = ["pending_activation", "active", "past_due"] as const;

// Whether a queue's ACTIONS change member state. The marker is what the admin
// UI reads to demand a step-up before it offers the action; it is never
// self-granted here and never inferred by the browser.
export const STEP_UP_QUEUES: Record<AdminQueueKey, boolean> = {
  applications: true,
  identity_status: true,
  agreement_status: true,
  assessment_due: true,
  blueprint_review: true,
  monthly_plan_review: true,
  questions: true,
  account_blocks: true,
  privacy_requests: true,
  // Observation surfaces. Acting means opening the queue that owns the action,
  // which carries its own step-up.
  security_events: false,
  sla_risk: false,
  product_concerns: true,
};

const QUEUE_LABELS: Record<AdminQueueKey, string> = {
  applications: "application",
  identity_status: "identity",
  agreement_status: "agreements",
  assessment_due: "assessment",
  blueprint_review: "blueprint",
  monthly_plan_review: "monthly plan",
  questions: "question",
  account_blocks: "account",
  privacy_requests: "privacy request",
  security_events: "security event",
  sla_risk: "SLA risk",
  product_concerns: "product concern",
};

// Queues whose deadlines feed sla_risk. sla_risk itself is excluded so the
// aggregation can never recurse.
const SLA_SOURCE_QUEUES: readonly AdminQueueKey[] = [
  "applications",
  "assessment_due",
  "blueprint_review",
  "monthly_plan_review",
  "questions",
];

// ---------------------------------------------------------------------------
// Opaque references
// ---------------------------------------------------------------------------

// Salt for the one-way digests. A configured salt keeps refs stable across
// restarts; without one the digest is still one-way, and because the queue key
// is inside the digest the same member yields a DIFFERENT ref per queue, so a
// list cannot be used to correlate a subject across queues.
function refSalt(): string {
  return process.env.RESEARCH_QUEUE_REF_SALT || process.env.RESEARCH_SESSION_SECRET || "";
}

function digest(...parts: string[]): string {
  return crypto
    .createHash("sha256")
    .update([refSalt(), ...parts].join("\u0000"))
    .digest("hex")
    .slice(0, 16);
}

// The list-safe subject handle. Never the raw member or application id.
export function subjectRefFor(queue: AdminQueueKey, subjectId: string): string {
  return `${queue}:${digest("subject", queue, subjectId)}`;
}

// The list-safe item handle. Resolved back to a record only by re-collecting
// the queue, so it grants no access to anything outside that queue.
export function itemIdFor(queue: AdminQueueKey, sourceKey: string): string {
  return `${queue}:${digest("item", queue, sourceKey)}`;
}

// ---------------------------------------------------------------------------
// Safe text
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const SUMMARY_MAX = 200;
const NAME_MAX = 40;

// Summaries are BUILT from allowlisted parts, so this is the second line of
// defense rather than the first: it redacts anything email-shaped that reached
// a name column and clamps length so no free text can ride along.
function safeText(value: string): string {
  return value.replace(EMAIL_PATTERN, "[redacted]").replace(/\s+/g, " ").trim().slice(0, SUMMARY_MAX);
}

function safeName(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "Member";
  return safeText(raw).slice(0, NAME_MAX);
}

function labelFor(value: unknown): string {
  return typeof value === "string" ? safeText(value.replace(/_/g, " ")) : "unknown";
}

// ---------------------------------------------------------------------------
// Time helpers (every date comes from deps.clock)
// ---------------------------------------------------------------------------

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function ageDays(now: Date, createdAt: string): number {
  const ms = parseTime(createdAt);
  if (ms === null) return 0;
  return Math.max(0, Math.floor((now.getTime() - ms) / DAY_MS));
}

function ageHours(now: Date, createdAt: string): number {
  const ms = parseTime(createdAt);
  if (ms === null) return 0;
  return Math.max(0, Math.floor((now.getTime() - ms) / HOUR_MS));
}

function plural(count: number, unit: string): string {
  return `${count} ${count === 1 ? unit : `${unit}s`}`;
}

function deadlineFrom(startedAt: unknown, hours: number): string | null {
  const ms = parseTime(startedAt);
  return ms === null ? null : new Date(ms + hours * HOUR_MS).toISOString();
}

// Priority is derived, never stored: a deadline that has passed is critical, a
// deadline inside the risk window is high, and a queue with no deadline falls
// back to how long the item has been waiting.
export function priorityFor(now: Date, createdAt: string, slaDeadline: string | null): QueuePriority {
  const dueMs = parseTime(slaDeadline);
  if (dueMs !== null) {
    const remaining = dueMs - now.getTime();
    if (remaining <= 0) return "critical";
    if (remaining <= SLA_RISK_WINDOW_HOURS * HOUR_MS) return "high";
    return "normal";
  }
  const days = ageDays(now, createdAt);
  return days >= 5 ? "critical" : days >= 2 ? "high" : "normal";
}

// ---------------------------------------------------------------------------
// Defensive reads
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

// A missing table, a permissions error, or a thrown client all read as an
// empty result. Waves land independently, so a queue whose source does not
// exist yet must report nothing rather than break the whole admin console.
async function readTable(table: string, apply?: (query: any) => any): Promise<Row[]> {
  try {
    let query: any = getSupabaseAdmin().from(table).select("*");
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data as Row[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Queue records
// ---------------------------------------------------------------------------

// The internal record. subjectId and memberId are the raw identifiers; they
// are NEVER serialized into a list item, only into a detail body.
type QueueRecord = {
  queue: AdminQueueKey;
  // Stable identity of the underlying source row. Feeds the opaque itemId.
  sourceKey: string;
  subjectId: string;
  memberId: string | null;
  createdAt: string;
  slaDeadline: string | null;
  safeSummary: string;
  requiresStepUp: boolean;
  detail: Row;
};

type CollectContext = {
  now: Date;
  members: MemberRow[];
  membersById: Map<string, MemberRow>;
};

function firstNameOf(ctx: CollectContext, memberId: string | null): string {
  if (!memberId) return "Member";
  return safeName(ctx.membersById.get(memberId)?.first_name);
}

function stepUpBlock(queue: AdminQueueKey): Row {
  const required = STEP_UP_QUEUES[queue];
  return {
    required,
    reason: required
      ? "Actions from this queue change member state and require a step-up before they are offered."
      : "This queue is an observation surface; the action lives in the queue that owns it.",
  };
}

// ---------------------------------------------------------------------------
// Collectors, one per queue. Each names the wave that owns its source.
// ---------------------------------------------------------------------------

// applications: the membership lane owns research_applications.
async function collectApplications(ctx: CollectContext): Promise<QueueRecord[]> {
  const rows = await readTable(APPLICATIONS_TABLE, (query) =>
    query.in("status", [...APPLICATION_REVIEW_STATUSES]),
  );
  return rows.map((row) => {
    const applicationId = String(row.id ?? "");
    const createdAt = (row.submitted_at as string) ?? (row.created_at as string) ?? ctx.now.toISOString();
    const waiting = ageDays(ctx.now, createdAt);
    return {
      queue: "applications" as const,
      sourceKey: `application:${applicationId}`,
      subjectId: applicationId,
      // No member row exists until activation, so the subject is the application.
      memberId: null,
      createdAt,
      slaDeadline: deadlineFrom(createdAt, APPLICATION_REVIEW_SLA_HOURS),
      safeSummary: safeText(
        `${safeName(row.first_name)}, application ${labelFor(row.status)}, waiting ${plural(waiting, "day")}`,
      ),
      requiresStepUp: STEP_UP_QUEUES.applications,
      // Identifiers and lifecycle only. The applicant's own free text
      // (goals_text, fit_text), email, phone, and location are NOT admin-queue
      // material; the membership admin views own that surface.
      detail: {
        applicationId,
        status: row.status ?? null,
        submittedAt: row.submitted_at ?? null,
        reviewStartedAt: row.review_started_at ?? null,
        approvalExpiresAt: row.approval_expires_at ?? null,
        applicantType: row.applicant_type ?? null,
        waitingDays: waiting,
        stepUp: stepUpBlock("applications"),
      },
    };
  });
}

// The member's accepted-at-current-version agreement keys. One batched read,
// latest row per (member, key) wins, matching the append-only posture in
// agreements.ts.
async function acceptedKeysByMember(): Promise<Map<string, Set<string>>> {
  const rows = await readTable(AGREEMENT_ACCEPTANCES_TABLE, (query) =>
    query.eq("subject_type", "member"),
  );
  const sorted = rows
    .slice()
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const latest = new Map<string, Row>();
  for (const row of sorted) {
    latest.set(`${String(row.subject_id ?? "")}\u0000${String(row.agreement_key ?? "")}`, row);
  }
  const accepted = new Map<string, Set<string>>();
  for (const [key, row] of Array.from(latest.entries())) {
    const [subjectId, agreementKey] = key.split("\u0000");
    if (row.decision !== "accepted") continue;
    const definition = AGREEMENT_DEFINITIONS.find((d) => d.key === agreementKey);
    // A superseded version is NOT current acceptance; that member is a gap.
    if (!definition || row.agreement_version !== definition.version) continue;
    const set = accepted.get(subjectId) ?? new Set<string>();
    set.add(agreementKey);
    accepted.set(subjectId, set);
  }
  return accepted;
}

function paperworkMembers(ctx: CollectContext): MemberRow[] {
  return ctx.members.filter((member) =>
    (PAPERWORK_MEMBER_STATUSES as readonly string[]).includes(String(member.status ?? "")),
  );
}

// agreement_status: the required activation paperwork the member has not
// accepted at its current version. Source is research_agreement_acceptances
// (the agreements wave); the definition list is the single source of truth for
// what is required.
async function collectAgreementStatus(ctx: CollectContext): Promise<QueueRecord[]> {
  const required = AGREEMENT_DEFINITIONS.filter((d) => d.required && d.trigger === "activation");
  const accepted = await acceptedKeysByMember();
  const records: QueueRecord[] = [];
  for (const member of paperworkMembers(ctx)) {
    const have = accepted.get(member.id) ?? new Set<string>();
    const missing = required.filter((d) => !have.has(d.key));
    if (missing.length === 0) continue;
    const createdAt = String(member.created_at ?? ctx.now.toISOString());
    records.push({
      queue: "agreement_status",
      sourceKey: `agreements:${member.id}`,
      subjectId: member.id,
      memberId: member.id,
      createdAt,
      // Paperwork chasing has no review deadline; priority comes from age.
      slaDeadline: null,
      safeSummary: safeText(
        `${safeName(member.first_name)}, ${missing.length} of ${required.length} required agreements outstanding, ` +
          `${plural(ageDays(ctx.now, createdAt), "day")} since joining`,
      ),
      requiresStepUp: STEP_UP_QUEUES.agreement_status,
      // Agreement KEYS are document identifiers, not titles or content.
      detail: {
        memberId: member.id,
        memberStatus: member.status ?? null,
        missingAgreementKeys: missing.map((d) => d.key),
        requiredAgreementKeys: required.map((d) => d.key),
        requiredVersion: required[0]?.version ?? null,
        stepUp: stepUpBlock("agreement_status"),
      },
    });
  }
  return records;
}

// identity_status: the separately-consented agreements (the ones that must be
// affirmed on their own, never bundled) are the strongest identity-grade
// attestation this system actually holds. The identity PROVIDER is a separate
// capability that is not wired, so the detail says so rather than implying a
// verification result we do not have.
async function collectIdentityStatus(ctx: CollectContext): Promise<QueueRecord[]> {
  const required = AGREEMENT_DEFINITIONS.filter((d) => d.required && d.separateConsent);
  const accepted = await acceptedKeysByMember();
  const providerEnabled = capabilityEnabled("identity_verification");
  const records: QueueRecord[] = [];
  for (const member of paperworkMembers(ctx)) {
    const have = accepted.get(member.id) ?? new Set<string>();
    const missing = required.filter((d) => !have.has(d.key));
    if (missing.length === 0) continue;
    const createdAt = String(member.created_at ?? ctx.now.toISOString());
    records.push({
      queue: "identity_status",
      sourceKey: `identity:${member.id}`,
      subjectId: member.id,
      memberId: member.id,
      createdAt,
      slaDeadline: null,
      safeSummary: safeText(
        `${safeName(member.first_name)}, ${plural(missing.length, "separate consent")} outstanding, ` +
          `provider verification ${providerEnabled ? "available" : "unavailable"}`,
      ),
      requiresStepUp: STEP_UP_QUEUES.identity_status,
      detail: {
        memberId: member.id,
        memberStatus: member.status ?? null,
        missingAgreementKeys: missing.map((d) => d.key),
        // Truthful, never fabricated: with the capability off there is no
        // provider record to read and none is invented.
        identityVerification: providerEnabled
          ? { available: true, providerRecord: null }
          : {
              available: false,
              code: "capability_disabled",
              message: "The identity verification provider is not configured, so there is no provider record to show.",
            },
        stepUp: stepUpBlock("identity_status"),
      },
    });
  }
  return records;
}

// assessment_due: active members past the 72-hour deadline with no submitted
// initial assessment. Sources are research_members and the assessment wave's
// response table. Answers are never read into a summary or a detail.
async function collectAssessmentDue(ctx: CollectContext): Promise<QueueRecord[]> {
  const responses = await readTable(ASSESSMENT_RESPONSES_TABLE, (query) =>
    query
      .eq("definition_id", INITIAL_ASSESSMENT_DEFINITION.definitionId)
      .eq("mode", INITIAL_ASSESSMENT_DEFINITION.mode),
  );
  const byMember = new Map<string, Row>();
  for (const row of responses) byMember.set(String(row.member_id ?? ""), row);

  const records: QueueRecord[] = [];
  for (const member of ctx.members) {
    if (String(member.status ?? "") !== "active") continue;
    const activatedMs = parseTime(member.activated_at);
    if (activatedMs === null) continue;
    const response = byMember.get(member.id) ?? null;
    if (response && response.status === "submitted") continue;
    const dueAt = new Date(activatedMs + ASSESSMENT_DUE_HOURS * HOUR_MS).toISOString();
    // Past due only. An assessment still inside its window is not Samuel's
    // work; the reminder sweep owns that stretch.
    if (Date.parse(dueAt) > ctx.now.getTime()) continue;
    const overdueHours = ageHours(ctx.now, dueAt);
    records.push({
      queue: "assessment_due",
      sourceKey: `assessment:${member.id}`,
      subjectId: member.id,
      memberId: member.id,
      createdAt: String(member.activated_at),
      slaDeadline: dueAt,
      safeSummary: safeText(
        `${safeName(member.first_name)}, assessment not submitted, ` +
          `${plural(overdueHours, "hour")} past the ${ASSESSMENT_DUE_HOURS} hour deadline`,
      ),
      requiresStepUp: STEP_UP_QUEUES.assessment_due,
      // Progress metadata only. answers is deliberately absent.
      detail: {
        memberId: member.id,
        responseId: response ? (response.id ?? null) : null,
        responseStatus: response ? (response.status ?? null) : "not_started",
        startedAt: response ? (response.started_at ?? null) : null,
        lastSavedAt: response ? (response.last_saved_at ?? null) : null,
        remindersSent: response ? (response.reminders_sent ?? 0) : 0,
        dueAt,
        overdueHours,
        stepUp: stepUpBlock("assessment_due"),
      },
    });
  }
  return records;
}

// blueprint_review: research_blueprints waiting on Samuel. Blueprint CONTENT
// and Samuel's internal review_comment never leave this collector.
async function collectBlueprintReview(ctx: CollectContext): Promise<QueueRecord[]> {
  const rows = await readTable(BLUEPRINTS_TABLE, (query) => query.in("state", [...BLUEPRINT_QUEUE_STATES]));
  return rows.map((row) => {
    const createdAt = String(row.created_at ?? ctx.now.toISOString());
    const memberId = String(row.member_id ?? "");
    return {
      queue: "blueprint_review" as const,
      sourceKey: `blueprint:${String(row.id ?? "")}`,
      subjectId: memberId,
      memberId,
      createdAt,
      slaDeadline: deadlineFrom(createdAt, SLA_WINDOW_HOURS.blueprint_review),
      safeSummary: safeText(
        `${firstNameOf(ctx, memberId)}, blueprint v${Number(row.version ?? 0)}, ${labelFor(row.state)}, ` +
          `waiting ${plural(ageDays(ctx.now, createdAt), "day")}`,
      ),
      requiresStepUp: STEP_UP_QUEUES.blueprint_review,
      detail: {
        memberId,
        blueprintId: row.id ?? null,
        version: row.version ?? null,
        state: row.state ?? null,
        assessmentResponseId: row.assessment_response_id ?? null,
        createdAt,
        updatedAt: row.updated_at ?? null,
        stepUp: stepUpBlock("blueprint_review"),
      },
    };
  });
}

// monthly_plan_review: research_xenios30_plans not yet published. Plan content
// is never read; the month label and version are identity, not content.
async function collectMonthlyPlanReview(ctx: CollectContext): Promise<QueueRecord[]> {
  const rows = await readTable(XENIOS30_PLANS_TABLE, (query) => query.in("state", [...PLAN_QUEUE_STATES]));
  return rows.map((row) => {
    const createdAt = String(row.created_at ?? ctx.now.toISOString());
    const memberId = String(row.member_id ?? "");
    return {
      queue: "monthly_plan_review" as const,
      sourceKey: `xenios30:${String(row.id ?? "")}`,
      subjectId: memberId,
      memberId,
      createdAt,
      slaDeadline: deadlineFrom(createdAt, SLA_WINDOW_HOURS.monthly_plan_review),
      safeSummary: safeText(
        `${firstNameOf(ctx, memberId)}, Xenios 30 plan ${safeText(String(row.month_label ?? "unlabelled"))} ` +
          `v${Number(row.version ?? 0)} in ${labelFor(row.state)}, waiting ${plural(ageDays(ctx.now, createdAt), "day")}`,
      ),
      requiresStepUp: STEP_UP_QUEUES.monthly_plan_review,
      detail: {
        memberId,
        planId: row.id ?? null,
        monthLabel: row.month_label ?? null,
        version: row.version ?? null,
        state: row.state ?? null,
        createdAt,
        updatedAt: row.updated_at ?? null,
        stepUp: stepUpBlock("monthly_plan_review"),
      },
    };
  });
}

// questions: research_member_questions not completed (the questions wave owns
// the table and the vocabulary). Every row is read and filtered in code so an
// unfamiliar status is SURFACED rather than silently dropped. The question
// body, its transcript, and any drafted answer never appear anywhere here.
async function collectQuestions(ctx: CollectContext): Promise<QueueRecord[]> {
  const rows = await readTable(MEMBER_QUESTIONS_TABLE);
  const telegramEnabled = capabilityEnabled("telegram_support");
  const records: QueueRecord[] = [];
  for (const row of rows) {
    if (String(row.status ?? "") === "completed") continue;
    const createdAt = String(row.created_at ?? ctx.now.toISOString());
    const memberId = String(row.member_id ?? "");
    // The questions wave stamps its own target; fall back to the contract's
    // approximately 12 hours when the column is absent or unparseable.
    const storedTarget = typeof row.sla_target_at === "string" && row.sla_target_at ? row.sla_target_at : null;
    const slaDeadline = storedTarget ?? deadlineFrom(createdAt, SLA_WINDOW_HOURS.question_response);
    const source = String(row.source ?? "web");
    const overTelegram = source.startsWith("telegram");
    records.push({
      queue: "questions",
      sourceKey: `question:${String(row.id ?? "")}`,
      subjectId: memberId,
      memberId,
      createdAt,
      slaDeadline,
      safeSummary: safeText(
        `${firstNameOf(ctx, memberId)}, ${labelFor(row.category ?? "other")} question via ${labelFor(source)}, ` +
          `${labelFor(row.status ?? "pending")}, ${plural(ageHours(ctx.now, createdAt), "hour")} old`,
      ),
      requiresStepUp: STEP_UP_QUEUES.questions,
      detail: {
        memberId,
        questionId: row.id ?? null,
        category: row.category ?? null,
        status: row.status ?? null,
        source,
        createdAt,
        slaTargetAt: slaDeadline,
        // Presence flags, never the material itself. A voice question's
        // transcript is media and stays behind the audited media routes.
        hasBodyText: typeof row.body_text === "string" && row.body_text.length > 0,
        hasTranscript: typeof row.transcript_media_id === "string" && row.transcript_media_id.length > 0,
        answered: typeof row.answered_at === "string" && row.answered_at.length > 0,
        // Truthful delivery state. With Telegram off the answer cannot go back
        // the way it came, and saying so beats implying a route that is not
        // configured.
        answerChannel: overTelegram
          ? telegramEnabled
            ? { channel: "telegram", available: true }
            : {
                channel: "telegram",
                available: false,
                code: "capability_disabled",
                message: "Telegram support is not configured, so this answer cannot be delivered over Telegram.",
              }
          : { channel: "web", available: true },
        stepUp: stepUpBlock("questions"),
      },
    });
  }
  return records;
}

// account_blocks: members who have lost protected access. Source is
// research_members; the email column is never read into the payload.
async function collectAccountBlocks(ctx: CollectContext): Promise<QueueRecord[]> {
  const records: QueueRecord[] = [];
  for (const member of ctx.members) {
    const status = String(member.status ?? "");
    if (!(BLOCKED_MEMBER_STATUSES as readonly string[]).includes(status)) continue;
    const createdAt = String(member.updated_at ?? member.created_at ?? ctx.now.toISOString());
    records.push({
      queue: "account_blocks",
      sourceKey: `member:${member.id}`,
      subjectId: member.id,
      memberId: member.id,
      createdAt,
      slaDeadline: null,
      safeSummary: safeText(
        `${safeName(member.first_name)}, membership ${labelFor(status)}, ` +
          `${plural(ageDays(ctx.now, createdAt), "day")} in this state`,
      ),
      requiresStepUp: STEP_UP_QUEUES.account_blocks,
      detail: {
        memberId: member.id,
        memberStatus: status,
        billingState: member.billing_state ?? null,
        activatedAt: member.activated_at ?? null,
        changedAt: member.updated_at ?? null,
        stepUp: stepUpBlock("account_blocks"),
      },
    });
  }
  return records;
}

// sla_risk: not a source of its own. It re-reads the queues that carry review
// deadlines and lifts anything already past or inside the risk window, keeping
// the ORIGIN queue's step-up marker so the urgency view never softens the
// authorization the underlying action needs.
async function collectSlaRisk(ctx: CollectContext): Promise<QueueRecord[]> {
  const nowMs = ctx.now.getTime();
  const windowMs = SLA_RISK_WINDOW_HOURS * HOUR_MS;
  const infinityEnabled = capabilityEnabled("infinity_events");
  const records: QueueRecord[] = [];
  for (const origin of SLA_SOURCE_QUEUES) {
    const sourceRecords = await collectQueue(origin, ctx);
    for (const record of sourceRecords) {
      const dueMs = parseTime(record.slaDeadline);
      if (dueMs === null) continue;
      if (dueMs - nowMs > windowMs) continue;
      const overdue = dueMs <= nowMs;
      records.push({
        queue: "sla_risk",
        sourceKey: `sla:${record.sourceKey}`,
        subjectId: record.subjectId,
        memberId: record.memberId,
        createdAt: record.createdAt,
        slaDeadline: record.slaDeadline,
        safeSummary: safeText(
          `${QUEUE_LABELS[origin]} ${overdue ? "overdue" : "due soon"}: ${record.safeSummary}`,
        ),
        // The origin's marker, not the aggregate's: acting still changes
        // member state.
        requiresStepUp: record.requiresStepUp,
        detail: {
          ...record.detail,
          originQueue: origin,
          originItemId: itemIdFor(origin, record.sourceKey),
          slaDeadline: record.slaDeadline,
          overdue,
          minutesRemaining: Math.round((dueMs - nowMs) / 60000),
          // Escalation is the Infinity wave's action; report its availability
          // honestly instead of implying an escalation that cannot be sent.
          infinityEscalation: infinityEnabled
            ? { available: true }
            : {
                available: false,
                code: "capability_disabled",
                message: "Infinity events are not configured, so no escalation is emitted for this item.",
              },
          stepUp: stepUpBlock(origin),
        },
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

async function collectQueue(queue: AdminQueueKey, ctx: CollectContext): Promise<QueueRecord[]> {
  switch (queue) {
    case "applications":
      return collectApplications(ctx);
    case "identity_status":
      return collectIdentityStatus(ctx);
    case "agreement_status":
      return collectAgreementStatus(ctx);
    case "assessment_due":
      return collectAssessmentDue(ctx);
    case "blueprint_review":
      return collectBlueprintReview(ctx);
    case "monthly_plan_review":
      return collectMonthlyPlanReview(ctx);
    case "questions":
      return collectQuestions(ctx);
    case "account_blocks":
      return collectAccountBlocks(ctx);
    case "sla_risk":
      return collectSlaRisk(ctx);
    // privacy_requests and security_events: the privacy and security waves own
    // these sources and neither table exists yet. An empty queue is the
    // truthful answer; inventing rows here would be worse than showing none.
    case "privacy_requests":
      return [];
    case "security_events":
      return [];
    // product_concerns: the commerce lane owns the source (orders, returns,
    // product reports). Empty until that lane exposes a queue-safe view.
    case "product_concerns":
      return [];
    default:
      return [];
  }
}

// Ordering lives in code so it never depends on storage behavior: soonest
// deadline first, deadline-free items after, then oldest first, then a stable
// tie-break on the source key.
function sortRecords(records: QueueRecord[]): QueueRecord[] {
  return records.slice().sort((a, b) => {
    const aDue = parseTime(a.slaDeadline);
    const bDue = parseTime(b.slaDeadline);
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if (aDue !== null && bDue === null) return -1;
    if (aDue === null && bDue !== null) return 1;
    const aCreated = parseTime(a.createdAt) ?? 0;
    const bCreated = parseTime(b.createdAt) ?? 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return a.sourceKey.localeCompare(b.sourceKey);
  });
}

function toQueueItem(record: QueueRecord, now: Date): AdminQueueItem {
  return {
    itemId: itemIdFor(record.queue, record.sourceKey),
    queue: record.queue,
    // Opaque by construction. The raw member or application id lives only in
    // the detail response.
    subjectRef: subjectRefFor(record.queue, record.subjectId),
    safeSummary: record.safeSummary,
    priority: priorityFor(now, record.createdAt, record.slaDeadline),
    slaDeadline: record.slaDeadline,
    requiresStepUp: record.requiresStepUp,
    createdAt: record.createdAt,
  };
}

async function buildContext(deps: MemberPlatformDeps): Promise<CollectContext> {
  const members = (await readTable(MEMBERS_TABLE)) as unknown as MemberRow[];
  return {
    now: deps.clock.now(),
    members,
    membersById: new Map(members.map((member) => [member.id, member])),
  };
}

// The one collection path both routes use, so the detail endpoint can only
// ever return something the list would also show.
async function collectSorted(queue: AdminQueueKey, deps: MemberPlatformDeps): Promise<{ ctx: CollectContext; records: QueueRecord[] }> {
  const ctx = await buildContext(deps);
  return { ctx, records: sortRecords(await collectQueue(queue, ctx)) };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const queueParamSchema = z.object({
  queue: z.enum(ADMIN_QUEUE_KEYS),
});

const listQuerySchema = z.object({
  cursor: z.string().max(20).optional(),
  limit: z.string().max(10).optional(),
  priority: z.enum(ADMIN_QUEUE_PRIORITIES).optional(),
});

const itemParamSchema = z.object({
  queue: z.enum(ADMIN_QUEUE_KEYS),
  itemId: z.string().min(1).max(200),
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function sendValidation(res: Response, fieldErrors: Record<string, string[]>) {
  res.status(400).json({ ok: false, code: "validation_failed", fieldErrors });
}

function sendNotFound(res: Response, message: string) {
  res.status(404).json({ ok: false, code: "not_found", message });
}

// Express hands query values through as string | string[] | object. Anything
// that is not a plain string is a field error, never a coerced guess.
function queryStrings(req: Request): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["cursor", "limit", "priority"]) {
    const value = (req.query as Record<string, unknown>)[key];
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

export function registerAdminQueuesApi(app: Express, deps: MemberPlatformDeps) {
  // One queue page. Safe summaries and opaque subject refs only; the priority
  // filter applies before pagination so `total` describes what was asked for.
  app.get("/api/admin/research/queues/:queue", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const params = queueParamSchema.safeParse({ queue: req.params.queue });
      if (!params.success) {
        return sendValidation(res, {
          queue: [`queue must be one of: ${ADMIN_QUEUE_KEYS.join(", ")}`],
        });
      }
      const parsedQuery = listQuerySchema.safeParse(queryStrings(req));
      if (!parsedQuery.success) return sendValidation(res, parsedQuery.error.flatten().fieldErrors);

      const fieldErrors: Record<string, string[]> = {};
      const limit = parsedQuery.data.limit === undefined ? DEFAULT_LIMIT : Number(parsedQuery.data.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        fieldErrors.limit = [`limit must be an integer between 1 and ${MAX_LIMIT}`];
      }
      const offset = parsedQuery.data.cursor === undefined ? 0 : Number(parsedQuery.data.cursor);
      if (!Number.isInteger(offset) || offset < 0) {
        fieldErrors.cursor = ["cursor must be a non-negative integer offset"];
      }
      if (Object.keys(fieldErrors).length > 0) return sendValidation(res, fieldErrors);

      const queue = params.data.queue;
      const { ctx, records } = await collectSorted(queue, deps);

      const items = records.map((record) => toQueueItem(record, ctx.now));
      const filtered = parsedQuery.data.priority
        ? items.filter((item) => item.priority === parsedQuery.data.priority)
        : items;
      const total = filtered.length;
      const pageItems = filtered.slice(offset, offset + limit);

      const page: AdminQueuePage = {
        queue,
        items: pageItems,
        nextCursor: offset + limit < total ? String(offset + limit) : null,
        total,
      };
      res.json({ ok: true, page });
    } catch (err) {
      console.error("[admin queues] list failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The queue could not be loaded." });
    }
  });

  // One queue item. The queue is re-collected and the opaque itemId matched
  // inside it, so this route can only return something that is genuinely in
  // that queue right now. Detail may carry real identifiers (it is the
  // admin-only surface) but still never carries health answers, assessment or
  // blueprint content, question bodies, or media.
  app.get("/api/admin/research/queues/:queue/items/:itemId", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = itemParamSchema.safeParse({ queue: req.params.queue, itemId: req.params.itemId });
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        if (fieldErrors.queue) {
          fieldErrors.queue = [`queue must be one of: ${ADMIN_QUEUE_KEYS.join(", ")}`];
        }
        return sendValidation(res, fieldErrors);
      }

      const queue = parsed.data.queue;
      const { ctx, records } = await collectSorted(queue, deps);
      const record = records.find((candidate) => itemIdFor(queue, candidate.sourceKey) === parsed.data.itemId);
      // An item that has left the queue (reviewed, answered, submitted) is
      // simply not found; that is the honest answer and it leaks nothing about
      // whether the id ever existed.
      if (!record) return sendNotFound(res, "No item with that id in this queue.");

      res.json({
        ok: true,
        item: toQueueItem(record, ctx.now),
        detail: record.detail,
      });
    } catch (err) {
      console.error("[admin queues] item read failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The queue item could not be loaded." });
    }
  });
}
