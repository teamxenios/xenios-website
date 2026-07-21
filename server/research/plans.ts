import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  XENIOS_90_PHASES,
  type MonthlyReviewState,
  type PlanPublicationState,
  type RecommendationItem,
  type TrackerMetricKey,
  type Xenios30Plan,
  type Xenios90Phase,
  type Xenios90Plan,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin } from "../supabase";
import type { MemberPlatformDeps, MemberPlatformNotifier } from "./member-platform-deps";

// ---------------------------------------------------------------------------
// xenios research member platform: Xenios 30 / Xenios 90 plans + Review Week
// (Wave 2).
//
// Publication doctrine: members NEVER see draft or samuel_review content, not
// even that a draft exists. The member routes serialize published rows only;
// history lists published and superseded heads (planId, monthLabel, state)
// and nothing else. The founding-phase publication flow is compressed: the
// admin creates a draft, then publishes it in one explicit step (the
// samuel_review state stays in the vocabulary for the fuller flow later).
// Publishing supersedes the earlier published version of the same plan, so
// exactly one version is current.
//
// Provenance rule: plan content references product slugs and
// RecommendationDisposition values only. Supplement Foundation entries are
// generic categories, never brand or composition claims, and nothing here
// carries dosing, administration, or treatment vocabulary.
//
// Notifications carry firstName and monthLabel only, never plan content or
// health data. The publish transition is an optimistic guarded update, so the
// notification fires at most once per plan.
// ---------------------------------------------------------------------------

export const XENIOS30_PLANS_TABLE = "research_xenios30_plans";
export const XENIOS90_PLANS_TABLE = "research_xenios90_plans";
export const PLAN_CHANGE_REQUESTS_TABLE = "research_plan_change_requests";

const MEMBERS_TABLE = "research_members";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Calendar helpers (pure; every date comes from deps.clock)
// ---------------------------------------------------------------------------

// UTC calendar month label, e.g. "2026-08". The early-change allowance and
// Review Week both key on this.
export function monthLabelFor(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// The first Monday after the labeled month ends, at UTC midnight. The month
// ends with its last day, so the candidate days start at the 1st of the
// following month; when that day is itself a Monday, it wins. Returns null
// for a malformed label.
export function firstMondayAfterMonthEnd(monthLabel: string): Date | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthLabel);
  if (!match) return null;
  // Date.UTC months are 0-indexed, so passing the 1-indexed month yields the
  // first day of the FOLLOWING month, which is exactly the day after the
  // labeled month ends.
  const firstOfNext = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  const daysUntilMonday = (8 - firstOfNext.getUTCDay()) % 7;
  return new Date(firstOfNext.getTime() + daysUntilMonday * DAY_MS);
}

// ---------------------------------------------------------------------------
// Storage rows + serialization
// ---------------------------------------------------------------------------

export type Xenios30PlanRow = {
  id: string;
  member_id: string;
  month_label: string;
  version: number;
  state: PlanPublicationState;
  content: Record<string, unknown>;
  reviewed_by: string | null;
  published_at: string | null;
  member_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type Xenios90PlanRow = {
  id: string;
  member_id: string;
  version: number;
  state: PlanPublicationState;
  current_phase: Xenios90Phase;
  content: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

// Columns are authoritative for identity and lifecycle; the content jsonb
// carries the rest of the payload. Serialization overlays columns last so a
// stale value smuggled inside content can never win.
export function toXenios30Plan(row: Xenios30PlanRow): Xenios30Plan {
  const content = (row.content ?? {}) as Partial<Xenios30Plan>;
  return {
    planId: row.id,
    monthLabel: row.month_label,
    state: row.state,
    version: row.version,
    fitnessDocumentId: content.fitnessDocumentId ?? null,
    nutritionDocumentId: content.nutritionDocumentId ?? null,
    blueprintActions: content.blueprintActions ?? [],
    supplementFoundation: (content.supplementFoundation ?? []) as RecommendationItem[],
    productGuidance: (content.productGuidance ?? []) as RecommendationItem[],
    adherenceTargets: content.adherenceTargets ?? [],
    trackerMetricKeys: (content.trackerMetricKeys ?? []) as TrackerMetricKey[],
    checkInDueAt: content.checkInDueAt ?? null,
    reviewedBy: row.reviewed_by,
    publishedAt: row.published_at,
    memberAcknowledgedAt: row.member_acknowledged_at,
  };
}

export function toXenios90Plan(row: Xenios90PlanRow): Xenios90Plan {
  const content = (row.content ?? {}) as Partial<Xenios90Plan>;
  return {
    planId: row.id,
    state: row.state,
    version: row.version,
    currentPhase: row.current_phase,
    phaseGoals: content.phaseGoals ?? { foundation: [], progression: [], consolidation: [] },
    milestones: content.milestones ?? [],
    monthlyVersions: content.monthlyVersions ?? [],
    publishedAt: row.published_at,
  };
}

// Column-owned keys are stripped from incoming admin content so the columns
// stay the single source of truth for identity and lifecycle.
const X30_COLUMN_OWNED_KEYS = [
  "planId",
  "state",
  "version",
  "monthLabel",
  "reviewedBy",
  "publishedAt",
  "memberAcknowledgedAt",
] as const;

const X90_COLUMN_OWNED_KEYS = ["planId", "state", "version", "currentPhase", "publishedAt"] as const;

function stripColumnOwned(
  input: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const content = { ...input };
  for (const key of keys) delete content[key];
  return content;
}

// ---------------------------------------------------------------------------
// Fetch helpers (every read filters by member; ordering happens in code so
// the behavior does not depend on database ordering guarantees)
// ---------------------------------------------------------------------------

// Newest first: month desc, then version desc within a month.
function sortXenios30(rows: Xenios30PlanRow[]): Xenios30PlanRow[] {
  return [...rows].sort((a, b) =>
    a.month_label === b.month_label
      ? b.version - a.version
      : a.month_label < b.month_label
        ? 1
        : -1,
  );
}

async function fetchXenios30Rows(memberId: string): Promise<Xenios30PlanRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(XENIOS30_PLANS_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error || !Array.isArray(data)) return [];
    return sortXenios30(data as Xenios30PlanRow[]);
  } catch {
    return [];
  }
}

async function fetchXenios90Rows(memberId: string): Promise<Xenios90PlanRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(XENIOS90_PLANS_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error || !Array.isArray(data)) return [];
    return [...(data as Xenios90PlanRow[])].sort((a, b) => b.version - a.version);
  } catch {
    return [];
  }
}

async function fetchXenios30ById(planId: string): Promise<Xenios30PlanRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(XENIOS30_PLANS_TABLE)
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (error) return null;
    return (data as Xenios30PlanRow) ?? null;
  } catch {
    return null;
  }
}

async function fetchXenios90ById(planId: string): Promise<Xenios90PlanRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(XENIOS90_PLANS_TABLE)
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (error) return null;
    return (data as Xenios90PlanRow) ?? null;
  } catch {
    return null;
  }
}

type NotifyMemberRow = {
  id: string;
  email: string;
  first_name?: string | null;
  [key: string]: unknown;
};

async function fetchMemberById(memberId: string): Promise<NotifyMemberRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBERS_TABLE)
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    if (error) return null;
    return (data as NotifyMemberRow) ?? null;
  } catch {
    return null;
  }
}

async function hasEarlyChange(memberId: string, monthLabel: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(PLAN_CHANGE_REQUESTS_TABLE)
      .select("id")
      .eq("member_id", memberId)
      .eq("month_label", monthLabel)
      .limit(1);
    if (error || !Array.isArray(data)) return false;
    return data.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Monthly Review Week state
// ---------------------------------------------------------------------------

// Deferrals, documented honestly:
// - checkInStatus knows only "not_due" and "due" here: it flips to due when
//   Review Week starts. The fuller submitted/reviewed/published check-in
//   lifecycle belongs to the check-in + SLA wave.
// - slaDeadline stays null: the 48 elapsed-hour publish deadline is computed
//   by the SLA sweep wave from the check-in submission it owns.
export async function monthlyReviewStateFor(
  memberId: string,
  now: Date,
): Promise<MonthlyReviewState> {
  const rows = await fetchXenios30Rows(memberId);
  // Review Week exists only once the member has a published Xenios 30 plan;
  // it starts the first Monday after that plan's month ends.
  const latestPublished = rows.find((row) => row.state === "published") ?? null;
  const reviewStart = latestPublished ? firstMondayAfterMonthEnd(latestPublished.month_label) : null;
  const checkInStatus: MonthlyReviewState["checkInStatus"] =
    reviewStart !== null && now.getTime() >= reviewStart.getTime() ? "due" : "not_due";
  return {
    reviewWeekStart: reviewStart ? reviewStart.toISOString() : null,
    checkInStatus,
    earlyChangeUsedThisMonth: await hasEarlyChange(memberId, monthLabelFor(now)),
    slaDeadline: null,
  };
}

// ---------------------------------------------------------------------------
// Service results
// ---------------------------------------------------------------------------

type ServiceErr = {
  ok: false;
  code: "validation_failed" | "state_conflict" | "not_found";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
type ServiceOk<T> = { ok: true } & T;
type ServiceResult<T> = ServiceOk<T> | ServiceErr;

function isDuplicateKeyError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? "");
  return /duplicate|unique/i.test(message);
}

// ---------------------------------------------------------------------------
// Member services
// ---------------------------------------------------------------------------

// Member-scoped, published only, first acknowledgment wins. Unknown ids,
// another member's plans, and unpublished drafts all read as not_found so a
// member can never learn a draft exists.
export async function acknowledgeXenios30(
  memberId: string,
  planId: string,
  now: Date,
): Promise<ServiceResult<{ acknowledgedAt: string }>> {
  const stamp = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(XENIOS30_PLANS_TABLE)
    .update({ member_acknowledged_at: stamp, updated_at: stamp })
    .eq("id", planId)
    .eq("member_id", memberId)
    .eq("state", "published")
    .is("member_acknowledged_at", null)
    .select("*")
    .maybeSingle();
  if (data) return { ok: true, acknowledgedAt: stamp };

  // The guarded update matched nothing; find out why without leaking drafts.
  const existing = await fetchXenios30ById(planId);
  if (
    !existing ||
    existing.member_id !== memberId ||
    existing.state === "draft" ||
    existing.state === "samuel_review"
  ) {
    return { ok: false, code: "not_found", message: "No such plan." };
  }
  if (existing.state === "published" && existing.member_acknowledged_at) {
    // Idempotent: the first acknowledgment's timestamp stands.
    return { ok: true, acknowledgedAt: existing.member_acknowledged_at };
  }
  return { ok: false, code: "state_conflict", message: "Only a published plan can be acknowledged." };
}

// One included early change per UTC calendar month. The pre-check gives the
// friendly path; the unique (member_id, month_label) constraint makes the
// limit structural, so a concurrent duplicate collapses to the same conflict.
export async function requestEarlyChange(
  memberId: string,
  reason: string,
  now: Date,
): Promise<ServiceResult<Record<never, never>>> {
  const monthLabel = monthLabelFor(now);
  const used: ServiceErr = {
    ok: false,
    code: "state_conflict",
    message: "The included early plan change for this month is already used.",
  };
  if (await hasEarlyChange(memberId, monthLabel)) return used;
  const { error } = await getSupabaseAdmin().from(PLAN_CHANGE_REQUESTS_TABLE).insert({
    member_id: memberId,
    month_label: monthLabel,
    reason,
    created_at: now.toISOString(),
  });
  if (error) {
    if (isDuplicateKeyError(error)) return used;
    throw new Error("The early change request could not be recorded.");
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin services (create draft, publish; the compressed founding-phase flow)
// ---------------------------------------------------------------------------

export async function createXenios30Draft(
  memberId: string,
  monthLabel: string,
  content: Record<string, unknown>,
  now: Date,
): Promise<ServiceResult<{ row: Xenios30PlanRow }>> {
  if (!(await fetchMemberById(memberId))) {
    return { ok: false, code: "not_found", message: "No such member." };
  }
  const rows = await fetchXenios30Rows(memberId);
  const version =
    rows.filter((row) => row.month_label === monthLabel).reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const stamp = now.toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(XENIOS30_PLANS_TABLE)
    .insert({
      member_id: memberId,
      month_label: monthLabel,
      version,
      state: "draft",
      content: stripColumnOwned(content, X30_COLUMN_OWNED_KEYS),
      reviewed_by: null,
      published_at: null,
      member_acknowledged_at: null,
      created_at: stamp,
      updated_at: stamp,
    })
    .select("*")
    .single();
  if (error || !data) {
    // A concurrent create claimed this version number (the unique constraint
    // on member + month + version); the admin retries.
    return { ok: false, code: "state_conflict", message: "The draft could not be created. Try again." };
  }
  return { ok: true, row: data as Xenios30PlanRow };
}

export async function publishXenios30(
  planId: string,
  adminEmail: string,
  now: Date,
  notifier: MemberPlatformNotifier,
): Promise<ServiceResult<{ row: Xenios30PlanRow }>> {
  const target = await fetchXenios30ById(planId);
  if (!target) return { ok: false, code: "not_found", message: "No such plan." };

  // The single-fire publish transition: only draft or samuel_review can move
  // to published, and only once, so everything after this line (supersede +
  // notify) runs at most once per plan.
  const stamp = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(XENIOS30_PLANS_TABLE)
    .update({ state: "published", published_at: stamp, reviewed_by: adminEmail, updated_at: stamp })
    .eq("id", planId)
    .in("state", ["draft", "samuel_review"])
    .select("*")
    .maybeSingle();
  if (!data) {
    return { ok: false, code: "state_conflict", message: "Only a draft or review plan can be published." };
  }
  const published = data as Xenios30PlanRow;

  // Any earlier published version for the same member + month steps down.
  await getSupabaseAdmin()
    .from(XENIOS30_PLANS_TABLE)
    .update({ state: "superseded", updated_at: stamp })
    .eq("member_id", published.member_id)
    .eq("month_label", published.month_label)
    .eq("state", "published")
    .neq("id", published.id);

  // Safe payload only: firstName + monthLabel, never plan content.
  const member = await fetchMemberById(published.member_id);
  if (member?.email) {
    // Best effort: a notification failure never un-publishes.
    try {
      await notifier.notify({
        eventKey: `plan-published:xenios30:${published.id}`,
        eventType: "member_plan_published",
        templateKey: "member_plan_published",
        recipient: member.email,
        memberId: member.id,
        payload: {
          firstName: typeof member.first_name === "string" ? member.first_name : "",
          monthLabel: published.month_label,
        },
      });
    } catch (err) {
      console.error("[plans] xenios30 publish notification failed:", err instanceof Error ? err.message : err);
    }
  }
  return { ok: true, row: published };
}

export async function createXenios90Draft(
  memberId: string,
  currentPhase: Xenios90Phase,
  content: Record<string, unknown>,
  now: Date,
): Promise<ServiceResult<{ row: Xenios90PlanRow }>> {
  if (!(await fetchMemberById(memberId))) {
    return { ok: false, code: "not_found", message: "No such member." };
  }
  const rows = await fetchXenios90Rows(memberId);
  const version = rows.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const stamp = now.toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(XENIOS90_PLANS_TABLE)
    .insert({
      member_id: memberId,
      version,
      state: "draft",
      current_phase: currentPhase,
      content: stripColumnOwned(content, X90_COLUMN_OWNED_KEYS),
      published_at: null,
      created_at: stamp,
      updated_at: stamp,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, code: "state_conflict", message: "The draft could not be created. Try again." };
  }
  return { ok: true, row: data as Xenios90PlanRow };
}

export async function publishXenios90(
  planId: string,
  now: Date,
  notifier: MemberPlatformNotifier,
): Promise<ServiceResult<{ row: Xenios90PlanRow }>> {
  const target = await fetchXenios90ById(planId);
  if (!target) return { ok: false, code: "not_found", message: "No such plan." };

  const stamp = now.toISOString();
  const { data } = await getSupabaseAdmin()
    .from(XENIOS90_PLANS_TABLE)
    .update({ state: "published", published_at: stamp, updated_at: stamp })
    .eq("id", planId)
    .in("state", ["draft", "samuel_review"])
    .select("*")
    .maybeSingle();
  if (!data) {
    return { ok: false, code: "state_conflict", message: "Only a draft or review plan can be published." };
  }
  const published = data as Xenios90PlanRow;

  // One published ninety-day arc per member: the earlier one steps down.
  await getSupabaseAdmin()
    .from(XENIOS90_PLANS_TABLE)
    .update({ state: "superseded", updated_at: stamp })
    .eq("member_id", published.member_id)
    .eq("state", "published")
    .neq("id", published.id);

  // The ninety-day plan has no month label; the payload stays firstName only.
  const member = await fetchMemberById(published.member_id);
  if (member?.email) {
    // Best effort: a notification failure never un-publishes.
    try {
      await notifier.notify({
        eventKey: `plan-published:xenios90:${published.id}`,
        eventType: "member_plan_published",
        templateKey: "member_plan_published",
        recipient: member.email,
        memberId: member.id,
        payload: {
          firstName: typeof member.first_name === "string" ? member.first_name : "",
        },
      });
    } catch (err) {
      console.error("[plans] xenios90 publish notification failed:", err instanceof Error ? err.message : err);
    }
  }
  return { ok: true, row: published };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const MONTH_LABEL_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const earlyChangeSchema = z.object({
  reason: z.string().min(10).max(1000),
});

const xenios30CreateSchema = z.object({
  memberId: z.string().min(1).max(100),
  monthLabel: z.string().regex(MONTH_LABEL_PATTERN, "Use the YYYY-MM month label."),
  content: z.record(z.unknown()),
});

const xenios90CreateSchema = z.object({
  memberId: z.string().min(1).max(100),
  currentPhase: z.enum(XENIOS_90_PHASES),
  content: z.record(z.unknown()),
});

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberFrom(req: Request): MemberRow | null {
  return ((req as { researchMember?: MemberRow }).researchMember as MemberRow) ?? null;
}

function adminEmailFrom(req: Request): string {
  const email = (req as { adminEmail?: unknown }).adminEmail;
  return typeof email === "string" && email ? email : "admin";
}

function sendServiceErr(res: Response, err: ServiceErr) {
  const status = err.code === "validation_failed" ? 400 : err.code === "not_found" ? 404 : 409;
  res.status(status).json({
    ok: false,
    code: err.code,
    ...(err.message ? { message: err.message } : {}),
    ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
  });
}

export function registerPlansApi(app: Express, deps: MemberPlatformDeps) {
  // The member's current published Xenios 30 plan plus published/superseded
  // history heads. Draft and samuel_review rows never appear here in any form.
  app.get("/api/research/plans/xenios30", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const rows = await fetchXenios30Rows(member.id);
      const current = rows.find((row) => row.state === "published") ?? null;
      const history = rows
        .filter((row) => row.state === "published" || row.state === "superseded")
        .map((row) => ({ planId: row.id, monthLabel: row.month_label, state: row.state }));
      res.json({ ok: true, current: current ? toXenios30Plan(current) : null, history });
    } catch (err) {
      console.error("[plans] xenios30 load failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The plan could not be loaded." });
    }
  });

  // Acknowledge the member's own published plan.
  app.post("/api/research/plans/xenios30/:planId/acknowledge", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const result = await acknowledgeXenios30(member.id, String(req.params.planId), deps.clock.now());
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, acknowledgedAt: result.acknowledgedAt });
    } catch (err) {
      console.error("[plans] acknowledge failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The plan could not be acknowledged." });
    }
  });

  // The one included early plan change this calendar month.
  app.post("/api/research/plans/early-change", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const parsed = earlyChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }
      const now = deps.clock.now();
      const result = await requestEarlyChange(member.id, parsed.data.reason, now);
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, review: await monthlyReviewStateFor(member.id, now) });
    } catch (err) {
      console.error("[plans] early change failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The change request could not be recorded." });
    }
  });

  // The member's published ninety-day arc plus the Review Week state.
  app.get("/api/research/plans/xenios90", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const now = deps.clock.now();
      const rows = await fetchXenios90Rows(member.id);
      const published = rows.find((row) => row.state === "published") ?? null;
      res.json({
        ok: true,
        plan: published ? toXenios90Plan(published) : null,
        review: await monthlyReviewStateFor(member.id, now),
      });
    } catch (err) {
      console.error("[plans] xenios90 load failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The plan could not be loaded." });
    }
  });

  // Admin: create a Xenios 30 draft (next version for the member + month).
  app.post("/api/admin/research/plans/xenios30", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = xenios30CreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }
      const result = await createXenios30Draft(
        parsed.data.memberId,
        parsed.data.monthLabel,
        parsed.data.content,
        deps.clock.now(),
      );
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, plan: toXenios30Plan(result.row) });
    } catch (err) {
      console.error("[plans] admin xenios30 create failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The draft could not be created." });
    }
  });

  // Admin: publish a Xenios 30 draft. Supersedes the earlier published
  // version for the month, stamps reviewed_by, and notifies the member.
  app.post("/api/admin/research/plans/xenios30/:planId/publish", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const result = await publishXenios30(
        String(req.params.planId),
        adminEmailFrom(req),
        deps.clock.now(),
        deps.notifier,
      );
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, plan: toXenios30Plan(result.row) });
    } catch (err) {
      console.error("[plans] admin xenios30 publish failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The plan could not be published." });
    }
  });

  // Admin: create a Xenios 90 draft (next version for the member).
  app.post("/api/admin/research/plans/xenios90", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = xenios90CreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }
      const result = await createXenios90Draft(
        parsed.data.memberId,
        parsed.data.currentPhase,
        parsed.data.content,
        deps.clock.now(),
      );
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, plan: toXenios90Plan(result.row) });
    } catch (err) {
      console.error("[plans] admin xenios90 create failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The draft could not be created." });
    }
  });

  // Admin: publish a Xenios 90 draft. Supersedes the member's earlier
  // published arc and notifies the member.
  app.post("/api/admin/research/plans/xenios90/:planId/publish", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const result = await publishXenios90(String(req.params.planId), deps.clock.now(), deps.notifier);
      if (!result.ok) return sendServiceErr(res, result);
      res.json({ ok: true, plan: toXenios90Plan(result.row) });
    } catch (err) {
      console.error("[plans] admin xenios90 publish failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The plan could not be published." });
    }
  });
}
