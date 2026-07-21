import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  BLUEPRINT_TRANSITIONS,
  type AdminQueueItem,
  type AdminQueuePage,
  type BlueprintState,
  type BlueprintView,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin } from "../supabase";
import type { MemberPlatformDeps } from "./member-platform-deps";
import {
  ASSESSMENT_RESPONSES_TABLE,
  INITIAL_ASSESSMENT_DEFINITION,
  type AssessmentResponseRow,
} from "./assessment";
import { recommend, type RecommendationOutput } from "./recommendation";

// ---------------------------------------------------------------------------
// xenios research member platform: the Whole-Life Blueprint (G4).
//
// The submitted assessment row IS the generation queue: generation consumes
// it, runs the transparent recommendation engine, and stores the output as a
// versioned blueprint row. The state machine (BLUEPRINT_TRANSITIONS, frozen
// contract) is server-owned; the browser never picks a state. Members see
// draft content NEVER: preliminary, samuel_review, and more_information_needed
// return state plus a member-visible message only, and full recommendations
// appear only once Samuel publishes. Samuel's internal notes (review_comment)
// are stored but never serialized into any member-facing response.
//
// Notification payloads carry firstName only, never health data.
// ---------------------------------------------------------------------------

export const BLUEPRINTS_TABLE = "research_blueprints";
const MEMBERS_TABLE = "research_members";

// States that sit in Samuel's review queue. `preliminary` is the instant
// between generation and entering review; generation advances it immediately
// and self-heals a row that never advanced.
export const BLUEPRINT_REVIEW_STATES: readonly BlueprintState[] = [
  "preliminary",
  "samuel_review",
  "more_information_needed",
];

// The reviewer identity is server-enforced by requireSupabaseAdmin; the
// column stores a display name only (contract: reviewedBy is display only).
const REVIEWER_DISPLAY_NAME = "Samuel";

// Member-visible placeholders for the review states. more_information_needed
// normally carries Samuel's own message; this is the fallback.
const PLACEHOLDER_MESSAGES: Partial<Record<BlueprintState, string>> = {
  preliminary: "Your Whole-Life Blueprint is being prepared and will be personally reviewed before you see it.",
  samuel_review: "Your Whole-Life Blueprint is with Samuel for personal review. You will be notified when it is published.",
  more_information_needed: "Samuel needs a little more information before your Blueprint can be finished.",
};

export type BlueprintRow = {
  id: string;
  member_id: string;
  version: number;
  state: BlueprintState;
  content: Partial<RecommendationOutput>;
  assessment_response_id: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  member_visible_message: string | null;
  published_at: string | null;
  superseded_by_version: number | null;
  member_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export function canTransition(from: BlueprintState, to: BlueprintState): boolean {
  return (BLUEPRINT_TRANSITIONS[from] ?? []).includes(to);
}

// Optimistic, guarded transition: the update matches only while the row is
// still in the state we read, so a concurrent transition loses cleanly (null)
// instead of clobbering. Illegal transitions never reach the database.
async function transitionRow(
  row: BlueprintRow,
  to: BlueprintState,
  now: Date,
  extra: Record<string, unknown> = {},
): Promise<BlueprintRow | null> {
  if (!canTransition(row.state, to)) return null;
  const { data } = await getSupabaseAdmin()
    .from(BLUEPRINTS_TABLE)
    .update({ state: to, updated_at: now.toISOString(), ...extra })
    .eq("id", row.id)
    .eq("state", row.state)
    .select("*")
    .maybeSingle();
  return (data as BlueprintRow) ?? null;
}

// ---------------------------------------------------------------------------
// Storage reads
// ---------------------------------------------------------------------------

// The member's blueprint rows, newest version first. Sorted in code so the
// ordering never depends on storage behavior.
async function fetchBlueprints(memberId: string): Promise<BlueprintRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(BLUEPRINTS_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error) return [];
    return ((data as BlueprintRow[]) ?? []).slice().sort((a, b) => b.version - a.version);
  } catch {
    return [];
  }
}

async function fetchBlueprintById(blueprintId: string): Promise<BlueprintRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(BLUEPRINTS_TABLE)
      .select("*")
      .eq("id", blueprintId)
      .maybeSingle();
    if (error) return null;
    return (data as BlueprintRow) ?? null;
  } catch {
    return null;
  }
}

// The member's SUBMITTED initial assessment (status submitted); that row is
// the generation queue entry, per the frozen contract.
async function fetchSubmittedAssessment(memberId: string): Promise<AssessmentResponseRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(ASSESSMENT_RESPONSES_TABLE)
      .select("*")
      .eq("member_id", memberId)
      .eq("definition_id", INITIAL_ASSESSMENT_DEFINITION.definitionId)
      .eq("mode", INITIAL_ASSESSMENT_DEFINITION.mode)
      .eq("status", "submitted")
      .maybeSingle();
    if (error) return null;
    return (data as AssessmentResponseRow) ?? null;
  } catch {
    return null;
  }
}

async function fetchMemberById(memberId: string): Promise<MemberRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBERS_TABLE)
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    if (error) return null;
    return (data as MemberRow) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

// The full member view. Only ever built from published/updated rows for
// member responses; review_comment (Samuel's internal note) is deliberately
// not part of this shape.
export function toBlueprintView(row: BlueprintRow): BlueprintView {
  const content = row.content ?? {};
  return {
    blueprintId: row.id,
    state: row.state,
    version: row.version,
    primaryGoal: content.primaryGoal ?? "",
    secondaryGoals: content.secondaryGoals ?? [],
    topPriorities: content.topPriorities ?? [],
    recommendations: content.recommendations ?? [],
    questionsForReview: content.questionsForReview ?? [],
    confidence: content.confidence ?? "low",
    reviewedBy: row.reviewed_by,
    publishedAt: row.published_at,
    supersededByVersion: row.superseded_by_version,
    memberAcknowledgedAt: row.member_acknowledged_at,
  };
}

function isMemberVisible(state: BlueprintState): boolean {
  return state === "published" || state === "updated";
}

// ---------------------------------------------------------------------------
// Generation (the founding-phase manual trigger calls this; the automatic
// path is a later SLA-wave sweep)
// ---------------------------------------------------------------------------

export type GenerateBlueprintResult =
  | { ok: true; row: BlueprintRow; created: boolean }
  | { ok: false; code: "not_found" | "state_conflict"; message: string };

export async function generatePreliminaryBlueprint(
  memberId: string,
  deps: MemberPlatformDeps,
  options: { force?: boolean } = {},
): Promise<GenerateBlueprintResult> {
  const member = await fetchMemberById(memberId);
  if (!member) {
    return { ok: false, code: "not_found", message: "No member with that id." };
  }
  const submission = await fetchSubmittedAssessment(memberId);
  if (!submission) {
    return {
      ok: false,
      code: "state_conflict",
      message: "The member has not submitted the assessment; there is nothing to generate from.",
    };
  }

  const existing = await fetchBlueprints(memberId);

  // Idempotent: a blueprint already in review for this exact submission is
  // returned as-is. A forced regenerate would discard review state, so it is
  // refused as a state conflict.
  const inReview = existing.find(
    (row) => row.assessment_response_id === submission.id && BLUEPRINT_REVIEW_STATES.includes(row.state),
  );
  if (inReview) {
    if (options.force) {
      return {
        ok: false,
        code: "state_conflict",
        message: `Blueprint version ${inReview.version} is already in ${inReview.state}; regenerating would discard review state.`,
      };
    }
    // Self-heal a preliminary row whose advance to review never landed.
    if (inReview.state === "preliminary") {
      const advanced = await transitionRow(inReview, "samuel_review", deps.clock.now());
      return { ok: true, row: advanced ?? inReview, created: false };
    }
    return { ok: true, row: inReview, created: false };
  }

  const output = recommend({ answers: (submission.answers ?? {}) as Record<string, string | number | string[] | null> });
  const nowIso = deps.clock.now().toISOString();
  const version = existing.length > 0 ? Math.max(...existing.map((row) => row.version)) + 1 : 1;

  const { data, error } = await getSupabaseAdmin()
    .from(BLUEPRINTS_TABLE)
    .insert({
      member_id: memberId,
      version,
      state: "preliminary",
      content: output,
      assessment_response_id: submission.id,
      reviewed_by: null,
      review_comment: null,
      member_visible_message: null,
      published_at: null,
      superseded_by_version: null,
      member_acknowledged_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();
  if (error || !data) {
    // A concurrent generate may have raced on unique (member_id, version);
    // re-read before failing.
    const raced = (await fetchBlueprints(memberId)).find(
      (row) => row.assessment_response_id === submission.id && BLUEPRINT_REVIEW_STATES.includes(row.state),
    );
    if (raced) return { ok: true, row: raced, created: false };
    return { ok: false, code: "state_conflict", message: "The blueprint could not be created." };
  }

  // Server-owned advance into Samuel's queue (preliminary -> samuel_review).
  const row = data as BlueprintRow;
  const advanced = await transitionRow(row, "samuel_review", deps.clock.now());
  return { ok: true, row: advanced ?? row, created: true };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const acknowledgeSchema = z.object({
  blueprintId: z.string().min(1).max(100),
  version: z.number().int().min(1),
});

const reviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve_and_publish"),
    comment: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("request_information"),
    memberVisibleMessage: z.string().min(1).max(2000),
    internalNote: z.string().max(4000).optional(),
  }),
  z.object({
    action: z.literal("revise"),
    internalNote: z.string().min(1).max(4000),
  }),
]);

const generateSchema = z.object({
  memberId: z.string().min(1).max(100),
  force: z.boolean().optional(),
});

function setPrivacyHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberFrom(req: Request): MemberRow | null {
  return ((req as { researchMember?: MemberRow }).researchMember as MemberRow) ?? null;
}

function sendConflict(res: Response, message: string) {
  res.status(409).json({ ok: false, code: "state_conflict", message });
}

function sendNotFound(res: Response, message: string) {
  res.status(404).json({ ok: false, code: "not_found", message });
}

function sendValidation(res: Response, fieldErrors: Record<string, string[]>) {
  res.status(400).json({ ok: false, code: "validation_failed", fieldErrors });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function registerBlueprintApi(app: Express, deps: MemberPlatformDeps) {
  // The member's own blueprint. Published and updated versions return the
  // full view; review states return state + a member-visible message ONLY
  // (never draft recommendations). With no rows yet, the state derives from
  // the member's assessment progress (matching the overview's vocabulary).
  app.get("/api/research/blueprint", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const rows = await fetchBlueprints(member.id);
      if (rows.length === 0) {
        const submission = await fetchSubmittedAssessment(member.id);
        const state: BlueprintState = submission ? "assessment_submitted" : "assessment_due";
        return res.json({ ok: true, blueprint: null, state });
      }

      const head = rows[0];
      const visibleRow = rows.find((row) => isMemberVisible(row.state)) ?? null;
      const body: Record<string, unknown> = {
        ok: true,
        blueprint: visibleRow ? toBlueprintView(visibleRow) : null,
        state: head.state,
      };
      if (BLUEPRINT_REVIEW_STATES.includes(head.state)) {
        body.memberVisibleMessage = head.member_visible_message ?? PLACEHOLDER_MESSAGES[head.state] ?? null;
      }
      res.json(body);
    } catch (err) {
      console.error("[blueprint] load failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The blueprint could not be loaded." });
    }
  });

  // Member acknowledgment of a published blueprint version. A stale version
  // is a state conflict; another member's blueprint id reads as not found.
  app.post("/api/research/blueprint/acknowledge", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const parsed = acknowledgeSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      // Member scoping in the query itself: another member's blueprint id
      // never resolves, so it is indistinguishable from a missing one.
      const { data } = await getSupabaseAdmin()
        .from(BLUEPRINTS_TABLE)
        .select("*")
        .eq("id", parsed.data.blueprintId)
        .eq("member_id", member.id)
        .maybeSingle();
      const row = (data as BlueprintRow) ?? null;
      if (!row) return sendNotFound(res, "No blueprint with that id.");
      // Only the CURRENT published version is acknowledgeable. A superseded
      // ("updated") row means the member is on a stale page; the conflict
      // sends them to reload and acknowledge the current version instead.
      if (row.state !== "published") {
        return row.state === "updated"
          ? sendConflict(res, "The blueprint has moved on. Reload to acknowledge the current version.")
          : sendConflict(res, "Only a published blueprint can be acknowledged.");
      }
      if (row.version !== parsed.data.version) {
        return sendConflict(res, `The blueprint has moved on. Current version is ${row.version}. Reload to continue.`);
      }
      if (row.member_acknowledged_at) {
        return res.json({ ok: true, acknowledgedAt: row.member_acknowledged_at });
      }

      const nowIso = deps.clock.now().toISOString();
      const updated = await getSupabaseAdmin()
        .from(BLUEPRINTS_TABLE)
        .update({ member_acknowledged_at: nowIso, updated_at: nowIso })
        .eq("id", row.id)
        .is("member_acknowledged_at", null)
        .select("*")
        .maybeSingle();
      if (!updated.data) {
        // A concurrent acknowledgment landed first; return its timestamp.
        const raced = await fetchBlueprintById(row.id);
        if (raced?.member_acknowledged_at) {
          return res.json({ ok: true, acknowledgedAt: raced.member_acknowledged_at });
        }
        return sendConflict(res, "The blueprint could not be acknowledged.");
      }
      res.json({ ok: true, acknowledgedAt: nowIso });
    } catch (err) {
      console.error("[blueprint] acknowledge failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The blueprint could not be acknowledged." });
    }
  });

  // Samuel's review queue: blueprints in review states, oldest waiting first.
  // Safe summaries carry a first name, the version, and days waiting; never
  // health data, never blueprint content.
  app.get("/api/admin/research/blueprints", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const stateParam = typeof req.query.state === "string" && req.query.state ? req.query.state : null;
      if (stateParam && !BLUEPRINT_REVIEW_STATES.includes(stateParam as BlueprintState)) {
        return sendValidation(res, {
          state: [`state must be one of: ${BLUEPRINT_REVIEW_STATES.join(", ")}`],
        });
      }

      const limitRaw = req.query.limit === undefined ? 25 : Number(req.query.limit);
      if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
        return sendValidation(res, { limit: ["limit must be an integer between 1 and 100"] });
      }
      const offsetRaw = req.query.cursor === undefined || req.query.cursor === "" ? 0 : Number(req.query.cursor);
      if (!Number.isInteger(offsetRaw) || offsetRaw < 0) {
        return sendValidation(res, { cursor: ["cursor must be a non-negative integer offset"] });
      }

      const states = stateParam ? [stateParam] : [...BLUEPRINT_REVIEW_STATES];
      const { data, error } = await getSupabaseAdmin()
        .from(BLUEPRINTS_TABLE)
        .select("*")
        .in("state", states);
      const rows = (error ? [] : ((data as BlueprintRow[]) ?? []))
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));

      const total = rows.length;
      const pageRows = rows.slice(offsetRaw, offsetRaw + limitRaw);

      // First names for safe summaries, one lookup for the page.
      const memberIds = Array.from(new Set(pageRows.map((row) => row.member_id)));
      const firstNames = new Map<string, string>();
      if (memberIds.length > 0) {
        const membersRead = await getSupabaseAdmin().from(MEMBERS_TABLE).select("*").in("id", memberIds);
        for (const memberRow of (membersRead.data as MemberRow[]) ?? []) {
          firstNames.set(memberRow.id, memberRow.first_name ?? "Member");
        }
      }

      const now = deps.clock.now();
      const items: AdminQueueItem[] = pageRows.map((row) => {
        const createdMs = Date.parse(row.created_at);
        const daysWaiting = Number.isFinite(createdMs)
          ? Math.max(0, Math.floor((now.getTime() - createdMs) / DAY_MS))
          : 0;
        const first = firstNames.get(row.member_id) ?? "Member";
        return {
          itemId: row.id,
          queue: "blueprint_review",
          subjectRef: row.member_id,
          safeSummary:
            `${first}, blueprint v${row.version}, ${row.state.replace(/_/g, " ")}, ` +
            `waiting ${daysWaiting} ${daysWaiting === 1 ? "day" : "days"}`,
          priority: daysWaiting >= 5 ? "critical" : daysWaiting >= 2 ? "high" : "normal",
          // Deadlines are owned by the SLA sweep wave; the queue stays honest
          // and reports none until that wave computes them.
          slaDeadline: null,
          requiresStepUp: true,
          createdAt: row.created_at,
        };
      });

      const page: AdminQueuePage = {
        queue: "blueprint_review",
        items,
        nextCursor: offsetRaw + limitRaw < total ? String(offsetRaw + limitRaw) : null,
        total,
      };
      res.json({ ok: true, page });
    } catch (err) {
      console.error("[blueprint] queue read failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The review queue could not be loaded." });
    }
  });

  // The founding-phase manual generation trigger. The automatic path is a
  // later SLA-wave sweep over submitted assessment rows.
  app.post("/api/admin/research/blueprints/generate", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = generateSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      const result = await generatePreliminaryBlueprint(parsed.data.memberId, deps, {
        force: parsed.data.force === true,
      });
      if (!result.ok) {
        if (result.code === "not_found") return sendNotFound(res, result.message);
        return sendConflict(res, result.message);
      }
      res.json({
        ok: true,
        blueprintId: result.row.id,
        version: result.row.version,
        state: result.row.state,
        created: result.created,
      });
    } catch (err) {
      console.error("[blueprint] generate failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The blueprint could not be generated." });
    }
  });

  // Samuel's review action. Publish is server-authorized HERE and nowhere
  // else; every branch validates against the frozen transition table.
  app.post("/api/admin/research/blueprints/:blueprintId/review", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      const row = await fetchBlueprintById(String(req.params.blueprintId));
      if (!row) return sendNotFound(res, "No blueprint with that id.");

      const now = deps.clock.now();
      const action = parsed.data;

      if (action.action === "approve_and_publish") {
        // Publishing an already-published version, or anything else the
        // transition table forbids, is a state conflict.
        if (!canTransition(row.state, "published")) {
          return sendConflict(res, `A blueprint in ${row.state} cannot be published.`);
        }
        const published = await transitionRow(row, "published", now, {
          published_at: now.toISOString(),
          reviewed_by: REVIEWER_DISPLAY_NAME,
          ...(action.comment ? { review_comment: action.comment } : {}),
        });
        if (!published) return sendConflict(res, "The blueprint state changed underneath the review. Reload and retry.");

        // Supersede EVERY other member-visible version so exactly one
        // blueprint is current, regardless of version ordering: the transition
        // table legally allows an older superseded version to be revised and
        // republished, and in that case the newer sibling must be demoted too.
        const siblings = await fetchBlueprints(published.member_id);
        for (const prior of siblings) {
          if (prior.id === published.id) continue;
          if (prior.state === "published") {
            await transitionRow(prior, "updated", now, { superseded_by_version: published.version });
          } else if (prior.state === "updated" && prior.superseded_by_version === null) {
            await getSupabaseAdmin()
              .from(BLUEPRINTS_TABLE)
              .update({ superseded_by_version: published.version, updated_at: now.toISOString() })
              .eq("id", prior.id);
          }
        }

        // Notify the member. Best effort: a notification failure never
        // un-publishes. Payload carries firstName only, never health data.
        try {
          const memberRow = await fetchMemberById(published.member_id);
          if (memberRow?.email) {
            await deps.notifier.notify({
              eventKey: `blueprint-published:${published.member_id}:v${published.version}`,
              eventType: "blueprint_published_member",
              templateKey: "member_plan_published",
              recipient: memberRow.email,
              memberId: published.member_id,
              payload: { firstName: memberRow.first_name },
            });
          }
        } catch (err) {
          console.error("[blueprint] publish notification failed:", err instanceof Error ? err.message : err);
        }

        return res.json({ ok: true, state: published.state });
      }

      if (action.action === "request_information") {
        if (!canTransition(row.state, "more_information_needed")) {
          return sendConflict(res, `A blueprint in ${row.state} cannot move to more_information_needed.`);
        }
        const moved = await transitionRow(row, "more_information_needed", now, {
          member_visible_message: action.memberVisibleMessage,
          reviewed_by: REVIEWER_DISPLAY_NAME,
          ...(action.internalNote ? { review_comment: action.internalNote } : {}),
        });
        if (!moved) return sendConflict(res, "The blueprint state changed underneath the review. Reload and retry.");
        return res.json({ ok: true, state: moved.state });
      }

      // revise: the blueprint stays in (or returns to) samuel_review with the
      // internal note recorded. review_comment is never member-facing.
      if (row.state === "samuel_review") {
        const { data } = await getSupabaseAdmin()
          .from(BLUEPRINTS_TABLE)
          .update({ review_comment: action.internalNote, updated_at: now.toISOString() })
          .eq("id", row.id)
          .eq("state", "samuel_review")
          .select("*")
          .maybeSingle();
        if (!data) return sendConflict(res, "The blueprint state changed underneath the review. Reload and retry.");
        return res.json({ ok: true, state: (data as BlueprintRow).state });
      }
      if (!canTransition(row.state, "samuel_review")) {
        return sendConflict(res, `A blueprint in ${row.state} cannot move back to samuel_review.`);
      }
      // Leaving more_information_needed clears the member-visible message so
      // the member sees the samuel_review placeholder, not a stale request.
      const revised = await transitionRow(row, "samuel_review", now, {
        review_comment: action.internalNote,
        ...(row.state === "more_information_needed" ? { member_visible_message: null } : {}),
      });
      if (!revised) return sendConflict(res, "The blueprint state changed underneath the review. Reload and retry.");
      res.json({ ok: true, state: revised.state });
    } catch (err) {
      console.error("[blueprint] review failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The review action could not be applied." });
    }
  });
}
