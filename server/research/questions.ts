import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  QUESTION_CATEGORIES,
  type MemberQuestion,
  type QuestionCategory,
  type QuestionStatus,
  type TelegramLinkStart,
  type TelegramLinkState,
} from "@shared/research/member-platform";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { requireSupabaseAdmin } from "../routes";
import { getSupabaseAdmin } from "../supabase";
import { capabilityEnabled } from "./capabilities";
import { rateLimitHit } from "./rate-limit";
import type { MemberPlatformDeps } from "./member-platform-deps";
import {
  TELEGRAM_NOTICES,
  TELEGRAM_SECRET_HEADER,
  TelegramNotConfigured,
  selectTelegramProvider,
  type TelegramProvider,
} from "./telegram-provider";

// ---------------------------------------------------------------------------
// xenios research member platform: questions and the Telegram boundary
// (G12/G13, Website 2 lane, Wave 5).
//
// What a member asks is the most human thing in this product, so the shape of
// this module is about dignity as much as correctness:
//
// - NO QUEUE POSITION, anywhere. A member is never told they are 14th in line,
//   and is never shown a count of anyone else's work. The payload has no field
//   for it and the server computes none, so there is nothing to leak into a UI
//   by accident. Someone waiting on an answer about their health should not be
//   handed a number that tells them how small their place is.
// - sla_target_at is a TARGET, not a promise. It exists so Samuel's queue can
//   surface what is aging. No member-facing wording commits to a deadline, and
//   nothing here tells a member their answer is guaranteed by a clock.
// - A closed question is not reopened. Continuing a completed conversation
//   files a follow-up LINKED to the original, so the record of what was asked
//   and what was answered stays intact and honest.
// - answered_by is a display name ("Samuel"), never an admin email address.
//   The row is serialized straight to the member who asked.
//
// THE TELEGRAM HARD RULE (also encoded in telegram-provider.ts and
// research-questions.sql): Telegram is NEVER the system of record, and nothing
// sensitive ever goes out over it. No passwords, reset or verification tokens,
// identity documents, payment data, assessment content, private media,
// sensitive PDFs, or detailed health answers. Telegram carries short notices
// that point back to the member's account, and the account is where every
// answer is actually read. Inbound is a convenience door; the durable record
// is always here.
//
// The link token is one-time, short-lived, and stored ONLY as a SHA-256 hash.
// A replayed, expired, or revoked token is denied, and the denial is logged
// with no member data attached, because an attacker's failed attempt should
// not be the thing that tells a log reader who a member is.
// ---------------------------------------------------------------------------

export const MEMBER_QUESTIONS_TABLE = "research_member_questions";
export const TELEGRAM_LINKS_TABLE = "research_telegram_links";
const MEMBERS_TABLE = "research_members";

// The response target Samuel works to. A TARGET: it drives his queue ordering
// and nothing in a member-facing payload or message promises it.
export const SLA_TARGET_HOURS = 12;

// A member may ask ten questions an hour through any door. The limit is a
// throttle against runaway automation, not a judgment about asking a lot.
export const QUESTION_LIMIT_PER_HOUR = 10;

// One-time link tokens are short-lived on purpose: the window only has to be
// long enough to switch apps and press start.
export const LINK_TOKEN_TTL_MINUTES = 15;

// Server-enforced by requireSupabaseAdmin; the column stores a display name
// only, matching the blueprint reviewer convention.
const ANSWERER_DISPLAY_NAME = "Samuel";

// Only these two statuses are rateable: a member rates an ANSWER, so there has
// to be one.
const RATEABLE_STATUSES: readonly QuestionStatus[] = ["answer_ready", "completed"];

export type MemberQuestionRow = {
  id: string;
  member_id: string;
  category: QuestionCategory;
  status: QuestionStatus;
  source: "web" | "telegram_text" | "telegram_voice";
  body_text: string | null;
  transcript_media_id: string | null;
  answer_text: string | null;
  answered_at: string | null;
  answered_by: string | null;
  rating: number | null;
  follow_up_of_question_id: string | null;
  sla_target_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type TelegramLinkRow = {
  id: string;
  member_id: string;
  link_token_hash: string;
  chat_ref: string | null;
  display_name: string | null;
  linked_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

// The member-facing record. Exactly the frozen contract keys and no others:
// there is no queue position, no place in line, no count of other members'
// questions, and no internal routing detail.
export function toMemberQuestion(row: MemberQuestionRow): MemberQuestion {
  const rating = typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5 ? row.rating : null;
  return {
    questionId: row.id,
    category: row.category,
    status: row.status,
    source: row.source,
    bodyText: row.body_text ?? null,
    transcriptMediaId: row.transcript_media_id ?? null,
    answerText: row.answer_text ?? null,
    answeredAt: row.answered_at ?? null,
    rating: rating as MemberQuestion["rating"],
    followUpOfQuestionId: row.follow_up_of_question_id ?? null,
    createdAt: row.created_at,
    slaTargetAt: row.sla_target_at ?? null,
  };
}

function toTelegramLinkState(row: TelegramLinkRow | null): TelegramLinkState {
  if (!row) return { linked: false, linkedAt: null, telegramDisplayName: null };
  return {
    linked: true,
    linkedAt: row.linked_at,
    // Display only. The chat reference is a routing detail and is never
    // serialized to the browser.
    telegramDisplayName: row.display_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Storage reads (every member read filters by member_id; ordering in code so
// behavior never depends on storage ordering guarantees)
// ---------------------------------------------------------------------------

async function fetchQuestionsForMember(memberId: string): Promise<MemberQuestionRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBER_QUESTIONS_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error || !Array.isArray(data)) return [];
    return (data as MemberQuestionRow[])
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  } catch {
    return [];
  }
}

// Member scoping lives in the query itself, so another member's question id
// never resolves and is indistinguishable from one that does not exist.
async function fetchMemberQuestionById(memberId: string, questionId: string): Promise<MemberQuestionRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBER_QUESTIONS_TABLE)
      .select("*")
      .eq("id", questionId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) return null;
    return (data as MemberQuestionRow) ?? null;
  } catch {
    return null;
  }
}

// By id alone. The only caller is Samuel's answer route, behind
// requireSupabaseAdmin; no member request reaches this.
async function fetchQuestionById(questionId: string): Promise<MemberQuestionRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBER_QUESTIONS_TABLE)
      .select("*")
      .eq("id", questionId)
      .maybeSingle();
    if (error) return null;
    return (data as MemberQuestionRow) ?? null;
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

async function fetchLinksForMember(memberId: string): Promise<TelegramLinkRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TELEGRAM_LINKS_TABLE)
      .select("*")
      .eq("member_id", memberId);
    if (error || !Array.isArray(data)) return [];
    return data as TelegramLinkRow[];
  } catch {
    return [];
  }
}

async function fetchLinkByTokenHash(tokenHash: string): Promise<TelegramLinkRow | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TELEGRAM_LINKS_TABLE)
      .select("*")
      .eq("link_token_hash", tokenHash)
      .maybeSingle();
    if (error) return null;
    return (data as TelegramLinkRow) ?? null;
  } catch {
    return null;
  }
}

async function fetchLinksByChatRef(chatRef: string): Promise<TelegramLinkRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TELEGRAM_LINKS_TABLE)
      .select("*")
      .eq("chat_ref", chatRef);
    if (error || !Array.isArray(data)) return [];
    return data as TelegramLinkRow[];
  } catch {
    return [];
  }
}

function isActiveLink(row: TelegramLinkRow): boolean {
  return row.used_at !== null && row.revoked_at === null;
}

// ---------------------------------------------------------------------------
// The one-time link token
// ---------------------------------------------------------------------------

// The raw token exists in exactly two places for exactly one moment: the
// response that mints it, and the message the member pastes to the bot. What
// is persisted is this hash, so a stolen database row cannot be replayed to
// link a chat to somebody's account.
export function hashLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function mintLinkToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// Question creation (shared by the web route and the verified webhook, so both
// doors land the same row shape and the same rate limit)
// ---------------------------------------------------------------------------

export type CreateQuestionInput = {
  memberId: string;
  category: QuestionCategory;
  bodyText: string;
  source: MemberQuestionRow["source"];
  followUpOfQuestionId?: string | null;
  transcriptMediaId?: string | null;
};

async function insertQuestion(
  input: CreateQuestionInput,
  now: Date,
): Promise<MemberQuestionRow | null> {
  const nowIso = now.toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(MEMBER_QUESTIONS_TABLE)
    .insert({
      member_id: input.memberId,
      category: input.category,
      status: "pending",
      source: input.source,
      body_text: input.bodyText,
      transcript_media_id: input.transcriptMediaId ?? null,
      answer_text: null,
      answered_at: null,
      answered_by: null,
      rating: null,
      follow_up_of_question_id: input.followUpOfQuestionId ?? null,
      // A target for Samuel's queue ordering. Nothing member-facing promises it.
      sla_target_at: new Date(now.getTime() + SLA_TARGET_HOURS * 60 * 60 * 1000).toISOString(),
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return data as MemberQuestionRow;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const createSchema = z.object({
  category: z.enum(QUESTION_CATEGORIES),
  bodyText: z.string().min(5).max(4000),
  followUpOfQuestionId: z.string().min(1).max(100).optional(),
});

const rateSchema = z.object({
  // The contract's QuestionRateRequest carries the id as well as the rating.
  // The PATH is authoritative; a body id that disagrees is a field error
  // rather than something silently ignored.
  questionId: z.string().min(1).max(100).optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

const answerSchema = z.object({
  answerText: z.string().min(1).max(8000),
  status: z.union([z.literal("answer_ready"), z.literal("more_information_needed")]),
});

// Accepts the flat shape and Telegram's own update shape, so the route reads
// the same either way and a transport change does not reach the logic. Unknown
// fields are STRIPPED rather than passed through: Telegram sends a great deal
// this system has no business keeping, and the only way to be sure none of it
// travels further is to not carry it past the door.
const webhookSchema = z.object({
  chatRef: z.union([z.string(), z.number()]).optional(),
  displayName: z.string().max(200).optional(),
  linkToken: z.string().max(500).optional(),
  text: z.string().max(8000).optional(),
  message: z
    .object({
      chat: z.object({ id: z.union([z.string(), z.number()]) }).partial().optional(),
      from: z.object({ first_name: z.string(), username: z.string() }).partial().optional(),
      text: z.string().optional(),
    })
    .optional(),
});

type NormalizedUpdate = {
  chatRef: string | null;
  displayName: string | null;
  linkToken: string | null;
  text: string | null;
};

function normalizeUpdate(body: z.infer<typeof webhookSchema>): NormalizedUpdate {
  const chatRaw = body.chatRef ?? body.message?.chat?.id ?? null;
  const chatRef = chatRaw === null || chatRaw === undefined ? null : String(chatRaw);
  const displayName = body.displayName ?? body.message?.from?.first_name ?? body.message?.from?.username ?? null;
  const text = body.text ?? body.message?.text ?? null;

  // A link arrives either as an explicit field or as Telegram's deep-link
  // convention, "/start <token>".
  let linkToken = body.linkToken ?? null;
  if (!linkToken && typeof text === "string") {
    const startMatch = /^\/start\s+(\S+)\s*$/.exec(text.trim());
    if (startMatch) linkToken = startMatch[1];
  }
  return { chatRef, displayName, linkToken, text };
}

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

function sendNotFound(res: Response, message: string) {
  res.status(404).json({ ok: false, code: "not_found", message });
}

function sendConflict(res: Response, message: string) {
  res.status(409).json({ ok: false, code: "state_conflict", message });
}

function sendCapabilityDisabled(res: Response) {
  res.status(409).json({
    ok: false,
    code: "capability_disabled",
    message: "Telegram support is not available yet.",
  });
}

// The webhook is not a member or admin route, so it does not use the member
// codes. An unverified caller learns nothing beyond the refusal itself.
function sendUnauthorized(res: Response) {
  res.status(401).json({ ok: false, code: "unauthorized" });
}

// Every outbound Telegram message goes through here, and every one of them is
// a NOTICE from the fixed allowlist. A failure never breaks the request that
// triggered it: the durable record already landed in the database, and
// Telegram is only being told that something is waiting.
async function sendNotice(
  provider: TelegramProvider,
  chatRef: string,
  notice: keyof typeof TELEGRAM_NOTICES,
): Promise<void> {
  try {
    const result = await provider.sendMessage({ chatRef, text: TELEGRAM_NOTICES[notice] });
    if (!result.ok) {
      console.warn(`[questions] telegram notice not sent (${result.code}).`);
    }
  } catch (err) {
    console.error("[questions] telegram notice failed:", err instanceof Error ? err.message : err);
  }
}

export function registerQuestionsApi(app: Express, deps: MemberPlatformDeps) {
  // The member's own questions, newest first. No queue position and no count
  // of anyone else's questions appears here, by construction.
  app.get("/api/research/questions", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const rows = await fetchQuestionsForMember(member.id);
      res.json({ ok: true, questions: rows.map(toMemberQuestion) });
    } catch (err) {
      console.error("[questions] list failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "Your questions could not be loaded." });
    }
  });

  // Ask a question.
  app.post("/api/research/questions", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      if (!(await rateLimitHit(`member-question:${member.id}`, 3600, QUESTION_LIMIT_PER_HOUR))) {
        return res
          .status(429)
          .json({ ok: false, code: "rate_limited", message: "Too many questions at once. Try again shortly." });
      }

      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);
      const input = parsed.data;

      // A follow-up must continue the member's OWN question, and that question
      // must be completed. Closed questions get linked follow-ups rather than
      // being reopened, so the record of what was asked and answered survives.
      // Another member's id is refused in exactly the same words as a
      // non-completed one, so this route cannot be used to discover whether a
      // given question exists.
      if (input.followUpOfQuestionId) {
        const parent = await fetchMemberQuestionById(member.id, input.followUpOfQuestionId);
        if (!parent || parent.status !== "completed") {
          return sendValidation(res, {
            followUpOfQuestionId: ["A follow-up can only continue one of your own completed questions."],
          });
        }
      }

      const row = await insertQuestion(
        {
          memberId: member.id,
          category: input.category,
          bodyText: input.bodyText,
          source: "web",
          followUpOfQuestionId: input.followUpOfQuestionId ?? null,
        },
        deps.clock.now(),
      );
      if (!row) return sendConflict(res, "The question could not be saved. Try again.");

      res.json({ ok: true, question: toMemberQuestion(row) });
    } catch (err) {
      console.error("[questions] create failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The question could not be saved." });
    }
  });

  // Rate an answer. A member rates their own question only, and only once
  // there is an answer to rate.
  app.post("/api/research/questions/:questionId/rate", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const parsed = rateSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      const questionId = String(req.params.questionId);
      if (parsed.data.questionId && parsed.data.questionId !== questionId) {
        return sendValidation(res, {
          questionId: ["questionId in the body must match the question being rated."],
        });
      }

      const row = await fetchMemberQuestionById(member.id, questionId);
      if (!row) return sendNotFound(res, "No question with that id.");
      if (!RATEABLE_STATUSES.includes(row.status)) {
        return sendConflict(res, "There is no answer to rate on this question yet.");
      }

      // Optimistic, guarded update: the write matches only while the row is
      // still in a rateable state, so a concurrent transition loses cleanly
      // instead of clobbering.
      const now = deps.clock.now();
      // Rating a delivered answer also CLOSES the question: the member has
      // read it and had their say, so the record moves to completed and any
      // further conversation becomes a linked follow-up. This is the only
      // path to "completed", which keeps the status vocabulary honest for the
      // SLA sweep, the admin queues, and the member overview count.
      const { data } = await getSupabaseAdmin()
        .from(MEMBER_QUESTIONS_TABLE)
        .update({
          rating: parsed.data.rating,
          status: "completed",
          updated_at: now.toISOString(),
        })
        .eq("id", row.id)
        .eq("member_id", member.id)
        .in("status", [...RATEABLE_STATUSES])
        .select("*")
        .maybeSingle();
      // The guard lost. Abort rather than reporting a rating that was never
      // written.
      if (!data) return sendConflict(res, "The question changed underneath the rating. Reload and retry.");

      res.json({ ok: true });
    } catch (err) {
      console.error("[questions] rate failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The rating could not be saved." });
    }
  });

  // ---------------------------------------------------------------------------
  // Samuel's answer
  // ---------------------------------------------------------------------------

  // Answering is Samuel-only, server-enforced by requireSupabaseAdmin. The
  // stored answered_by is a DISPLAY NAME; the admin's email address never
  // reaches a member payload.
  app.post("/api/admin/research/questions/:questionId/answer", requireSupabaseAdmin, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const parsed = answerSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);

      const row = await fetchQuestionById(String(req.params.questionId));
      if (!row) return sendNotFound(res, "No question with that id.");
      // A completed question is closed. Continuing that conversation is a
      // linked follow-up, not an edit to the answered record.
      if (row.status === "completed") {
        return sendConflict(res, "That question is completed. The member can file a linked follow-up.");
      }
      // An answer already delivered is not silently overwritten either: the
      // member may have read and rated it, and replacing the text under an
      // existing rating would leave the record self-contradicting.
      if (row.status === "answer_ready") {
        return sendConflict(res, "That question already has an answer waiting. The member can file a linked follow-up.");
      }

      const now = deps.clock.now();
      const nowIso = now.toISOString();
      // Guarded on the status we read, so two reviewers cannot both land an
      // answer on the same question.
      const { data } = await getSupabaseAdmin()
        .from(MEMBER_QUESTIONS_TABLE)
        .update({
          answer_text: parsed.data.answerText,
          status: parsed.data.status,
          answered_at: nowIso,
          answered_by: ANSWERER_DISPLAY_NAME,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("status", row.status)
        .select("*")
        .maybeSingle();
      if (!data) return sendConflict(res, "The question changed underneath the answer. Reload and retry.");
      const answered = data as MemberQuestionRow;

      // Notify ONLY when there is an answer waiting. more_information_needed is
      // a request back to the member and is delivered through the account, not
      // announced as an answer that does not exist yet.
      //
      // Best effort: a notification failure never un-answers the question. The
      // answer is already durable; the email is how the member hears about it.
      // The payload carries firstName only, never the question, never the
      // answer, and never health data.
      if (answered.status === "answer_ready") {
        try {
          const memberRow = await fetchMemberById(answered.member_id);
          if (memberRow?.email) {
            await deps.notifier.notify({
              eventKey: `question-answer-ready:${answered.id}`,
              eventType: "question_answer_ready_member",
              templateKey: "member_question_answer_ready",
              recipient: memberRow.email,
              memberId: answered.member_id,
              payload: { firstName: memberRow.first_name },
            });
          }
        } catch (err) {
          console.error("[questions] answer notification failed:", err instanceof Error ? err.message : err);
        }
      }

      res.json({ ok: true, question: toMemberQuestion(answered) });
    } catch (err) {
      console.error("[questions] answer failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The answer could not be saved." });
    }
  });

  // ---------------------------------------------------------------------------
  // Telegram linking
  // ---------------------------------------------------------------------------

  // Mint a one-time link token. The RAW token is returned here and nowhere
  // else; only its hash is stored, so this response is the single moment it
  // exists in readable form.
  app.post("/api/research/telegram/link", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      // Truthful refusal with the capability off: no token is minted, because a
      // token nobody can spend is worse than an honest "not yet".
      if (!capabilityEnabled("telegram_support")) return sendCapabilityDisabled(res);

      const now = deps.clock.now();
      const nowIso = now.toISOString();

      // Supersede any UNUSED token this member still holds, so exactly one is
      // live at a time. An already-linked chat is left alone: minting a new
      // token is not a reason to cut off a working connection.
      const existing = await fetchLinksForMember(member.id);
      for (const link of existing) {
        if (link.used_at !== null || link.revoked_at !== null) continue;
        await getSupabaseAdmin()
          .from(TELEGRAM_LINKS_TABLE)
          .update({ revoked_at: nowIso })
          .eq("id", link.id);
      }

      const token = mintLinkToken();
      const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
      const { data, error } = await getSupabaseAdmin()
        .from(TELEGRAM_LINKS_TABLE)
        .insert({
          member_id: member.id,
          // The hash, never the token.
          link_token_hash: hashLinkToken(token),
          chat_ref: null,
          display_name: null,
          linked_at: null,
          revoked_at: null,
          expires_at: expiresAt,
          used_at: null,
          created_at: nowIso,
        })
        .select("*")
        .single();
      if (error || !data) return sendConflict(res, "The link could not be prepared. Try again.");

      const link: TelegramLinkStart = {
        linkToken: token,
        expiresAt,
        botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
      };
      res.json({ ok: true, link });
    } catch (err) {
      if (err instanceof TelegramNotConfigured) return sendCapabilityDisabled(res);
      console.error("[questions] telegram link failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The link could not be prepared." });
    }
  });

  // The member's link state. Display name only; the chat reference is a
  // routing detail and never leaves the server.
  app.get("/api/research/telegram", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
      const active = (await fetchLinksForMember(member.id))
        .filter(isActiveLink)
        .sort((a, b) => String(b.linked_at ?? "").localeCompare(String(a.linked_at ?? "")));
      res.json({ ok: true, state: toTelegramLinkState(active[0] ?? null) });
    } catch (err) {
      console.error("[questions] telegram state failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The Telegram state could not be loaded." });
    }
  });

  // Unlink. Deliberately NOT capability-gated: a member can always disconnect
  // a channel, whatever the capability registry currently says. Every row for
  // the member is revoked, live links and unspent tokens alike.
  app.delete("/api/research/telegram/link", requireActiveMember, async (req, res) => {
    setPrivacyHeaders(res);
    try {
      const member = memberFrom(req);
      if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

      const nowIso = deps.clock.now().toISOString();
      for (const link of await fetchLinksForMember(member.id)) {
        if (link.revoked_at !== null) continue;
        await getSupabaseAdmin()
          .from(TELEGRAM_LINKS_TABLE)
          .update({ revoked_at: nowIso })
          .eq("id", link.id);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[questions] telegram unlink failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The link could not be revoked." });
    }
  });

  // The inbound webhook. NOT a member session: the shared secret is the only
  // thing that gets a caller past the first line, and it is compared in
  // constant time by the provider.
  //
  // HARD RULE restated at the boundary: nothing sensitive goes back out over
  // this channel. Every reply is a fixed notice pointing at the member's
  // account, and the provider refuses anything else.
  app.post("/api/research/telegram/webhook", async (req, res) => {
    setPrivacyHeaders(res);
    try {
      if (!capabilityEnabled("telegram_support")) return sendCapabilityDisabled(res);

      const provider = selectTelegramProvider();
      const headerValue = req.headers[TELEGRAM_SECRET_HEADER];
      const secretHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      // rawBody is carried for a future HMAC scheme; Telegram itself
      // authenticates with the secret header alone.
      const verified = provider.verifyWebhook({
        secretHeader: typeof secretHeader === "string" ? secretHeader : undefined,
        rawBody: (() => {
          try {
            return JSON.stringify(req.body ?? {});
          } catch {
            return "";
          }
        })(),
      });
      if (!verified.ok) {
        // No member data: an unverified caller has not identified anyone, and
        // the log should not pretend otherwise.
        console.warn(`[questions] telegram webhook refused (${verified.code}).`);
        return sendUnauthorized(res);
      }

      const parsed = webhookSchema.safeParse(req.body);
      if (!parsed.success) return sendValidation(res, parsed.error.flatten().fieldErrors);
      const update = normalizeUpdate(parsed.data);
      if (!update.chatRef) {
        return sendValidation(res, { chatRef: ["A chat reference is required."] });
      }

      const now = deps.clock.now();
      const nowIso = now.toISOString();

      // 1. A link attempt.
      if (update.linkToken) {
        const row = await fetchLinkByTokenHash(hashLinkToken(update.linkToken));
        const expired = row ? Date.parse(row.expires_at) <= now.getTime() : false;
        // Unknown, spent, revoked, and expired are ONE answer, so a probe
        // cannot tell which token existed. Logged with no member data: the
        // reason is operationally useful, the identity is not ours to spill on
        // a failed attempt.
        if (!row || row.used_at !== null || row.revoked_at !== null || expired) {
          const reason = !row
            ? "unknown token"
            : row.used_at !== null
              ? "replayed token"
              : row.revoked_at !== null
                ? "revoked token"
                : "expired token";
          console.warn(`[questions] telegram link attempt denied (${reason}).`);
          return sendConflict(res, "That link is no longer valid. Start a new one from your account.");
        }

        // Single use is enforced HERE, by the guard, not by the read above: the
        // update matches only while used_at is still null, so two bots
        // presenting the same token race and exactly one wins.
        const { data } = await getSupabaseAdmin()
          .from(TELEGRAM_LINKS_TABLE)
          .update({
            used_at: nowIso,
            linked_at: nowIso,
            chat_ref: update.chatRef,
            display_name: update.displayName ?? null,
          })
          .eq("id", row.id)
          .is("used_at", null)
          .is("revoked_at", null)
          .gt("expires_at", nowIso)
          .select("*")
          .maybeSingle();
        if (!data) {
          // Same words for every failure: a concurrent spend, a revocation, or
          // an expiry that landed between the read and the write are all
          // "no longer valid" so a prober learns nothing.
          console.warn("[questions] telegram link attempt denied (concurrent use, revocation, or expiry).");
          return sendConflict(res, "That link is no longer valid. Start a new one from your account.");
        }

        // One active link per chat, structurally: any OTHER active link
        // pointing at this chat is revoked as this one is spent, so a chat can
        // never resolve to two members.
        await getSupabaseAdmin()
          .from(TELEGRAM_LINKS_TABLE)
          .update({ revoked_at: nowIso })
          .eq("chat_ref", update.chatRef)
          .is("revoked_at", null)
          .neq("id", row.id);

        await sendNotice(provider, update.chatRef, "link_confirmed");
        return res.json({ ok: true, linked: true });
      }

      // 2. An inbound message from a linked chat becomes a question.
      const text = typeof update.text === "string" ? update.text.trim() : "";
      if (!text) return sendValidation(res, { text: ["A message or a link token is required."] });

      const active = (await fetchLinksByChatRef(update.chatRef)).filter(isActiveLink);
      if (active.length === 0) {
        // An unlinked chat identifies nobody, so nothing about a member is
        // logged or implied here.
        console.warn("[questions] telegram message from an unlinked chat was ignored.");
        return sendConflict(res, "This chat is not linked to an account. Start a link from your account.");
      }
      // Ambiguity is refused rather than resolved by picking a row. If a chat
      // somehow holds more than one active link, no answer is the safe answer:
      // guessing would attribute one member's words to another.
      if (active.length > 1) {
        console.error("[questions] telegram chat resolves to multiple active links; refusing to attribute the message.");
        return sendConflict(res, "This chat is not linked to a single account. Re-link from your account.");
      }
      const memberId = active[0].member_id;

      // The Telegram door creates member content, so it enforces the same
      // membership rule the web door gets from requireActiveMember. A link
      // that outlived the membership does not keep writing questions.
      const author = await fetchMemberById(memberId);
      if (!author || author.status !== "active") {
        console.warn("[questions] telegram message from a chat whose membership is not active was ignored.");
        return sendConflict(res, "This chat is not linked to an active membership.");
      }

      // Telegram does not get a cheaper budget than the website.
      if (!(await rateLimitHit(`member-question:${memberId}`, 3600, QUESTION_LIMIT_PER_HOUR))) {
        return res
          .status(429)
          .json({ ok: false, code: "rate_limited", message: "Too many questions at once. Try again shortly." });
      }

      // Category "other" until the member (or Samuel) files it: guessing the
      // category from a chat message would be a judgment the member did not
      // make. Voice notes route through the media pipeline and arrive as
      // telegram_voice with a transcript reference; this door is text only.
      const row = await insertQuestion(
        {
          memberId,
          category: "other",
          bodyText: text.slice(0, 4000),
          source: "telegram_text",
        },
        now,
      );
      if (!row) return sendConflict(res, "The question could not be saved. Try again.");

      await sendNotice(provider, update.chatRef, "question_received");
      // The webhook's caller is Telegram, not the member, so the response
      // carries no question content back.
      return res.json({ ok: true, received: true });
    } catch (err) {
      if (err instanceof TelegramNotConfigured) return sendCapabilityDisabled(res);
      console.error("[questions] telegram webhook failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ ok: false, message: "The message could not be processed." });
    }
  });
}
