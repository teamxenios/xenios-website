// Durable support-case source for the customer account portal, graduated onto
// research_member_questions (ledger row 18) — the member-owned question store
// that the existing /api/research/questions surface already writes.
//
// Two deliberate departures from questions.ts's own read helpers:
//   1. FAILURE PROPAGATES. The ports contract (ports.ts) requires a port that
//      cannot answer to THROW so the service fails the read closed;
//      questions.ts swallows read errors into [] for its own surface, which
//      would render "no cases" during an outage here. We do not copy that.
//   2. The portal category vocabulary (order/account/care/pharmacy) is wider
//      than QUESTION_CATEGORIES in places and narrower in others, so the
//      portal category rides INSIDE body_text as a `[portal:x]` marker while
//      the row's own category column stays inside the existing CHECK
//      constraint vocabulary. Reads recover the marker; rows written by the
//      classic questions surface map through a fixed conservative table.
//
// No queue positions, no counts of anyone else's work, and nothing here
// promises a response deadline — the SLA target is Samuel's queue ordering
// tool, exactly as questions.ts documents.

import {
  SUPPORT_CASE_CATEGORIES,
  type SupportCaseCategory,
  type SupportCaseState,
  type SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import { getSupabaseAdmin } from "../../supabase";
import { MEMBER_QUESTIONS_TABLE, QUESTION_LIMIT_PER_HOUR, SLA_TARGET_HOURS } from "../questions";
import { rateLimitHit } from "../rate-limit";
import type { SupportCasesPort } from "./ports";

export type SupportQuestionRow = {
  id: string;
  member_id: string;
  category: string;
  status: string;
  body_text: string | null;
  created_at: string;
  updated_at?: string | null;
  answered_at?: string | null;
  sla_target_at?: string | null;
  [key: string]: unknown;
};

export type MemberQuestionsSupportDeps = Readonly<{
  /** Throws when the durable read fails — never swallows into []. */
  listRows: (memberId: string) => Promise<readonly SupportQuestionRow[]>;
  /** Throws when the durable write fails. */
  insertRow: (row: Record<string, unknown>) => Promise<SupportQuestionRow>;
  /** Write throttle; resolves false when the budget is spent. */
  allowWrite?: (memberId: string) => Promise<boolean>;
  now?: () => Date;
}>;

const PORTAL_MARKER = /^\[portal:(order|account|care|pharmacy)\]\s*/;

// Portal → question-table category, staying inside the existing CHECK
// constraint. The `[portal:x]` marker preserves the exact portal category.
const QUESTION_CATEGORY_BY_PORTAL: Readonly<Record<SupportCaseCategory, string>> = Object.freeze({
  order: "shipping",
  account: "account",
  care: "other",
  pharmacy: "other",
});

function portalCategoryOf(row: SupportQuestionRow): SupportCaseCategory {
  const marker = PORTAL_MARKER.exec(row.body_text ?? "");
  if (marker) return marker[1] as SupportCaseCategory;
  // Classic questions-surface rows: a fixed conservative mapping.
  switch (row.category) {
    case "shipping":
    case "product":
      return "order";
    default:
      return "account";
  }
}

function subjectOf(row: SupportQuestionRow): string {
  const body = (row.body_text ?? "").replace(PORTAL_MARKER, "");
  const firstLine = body.split("\n", 1)[0]?.trim() ?? "";
  return firstLine === "" ? "Support request" : firstLine.slice(0, 200);
}

function stateOf(status: string): SupportCaseState {
  if (status === "more_information_needed") return "waiting_on_customer";
  if (status === "answer_ready" || status === "completed") return "resolved";
  // pending, being_reviewed, and anything unknown: still open — a state we
  // cannot read is never presented as resolved.
  return "open";
}

// A human sentence with no deadline commitment (questions.ts hard rule: the
// SLA target orders Samuel's queue; nothing member-facing promises it).
const RESPONSE_EXPECTATION = "Our team reads every request and replies as soon as possible.";

function toCase(row: SupportQuestionRow): SupportCaseSummaryDto {
  return {
    id: row.id,
    category: portalCategoryOf(row),
    subject: subjectOf(row),
    state: stateOf(row.status),
    lastUpdateAt:
      (typeof row.updated_at === "string" && row.updated_at) ||
      (typeof row.answered_at === "string" && row.answered_at) ||
      row.created_at,
    responseExpectation: RESPONSE_EXPECTATION,
  };
}

export function createMemberQuestionsSupportSource(
  deps: MemberQuestionsSupportDeps,
): SupportCasesPort {
  return {
    async casesFor(memberKey) {
      const rows = await deps.listRows(memberKey);
      return rows
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
        .map(toCase);
    },
    async openCase(memberKey, input) {
      if (!(SUPPORT_CASE_CATEGORIES as readonly string[]).includes(input.category)) {
        throw new Error("invalid_support_category");
      }
      const allowed = deps.allowWrite ? await deps.allowWrite(memberKey) : true;
      if (!allowed) throw new Error("support_rate_limited");
      const now = deps.now ? deps.now() : new Date();
      const nowIso = now.toISOString();
      const row = await deps.insertRow({
        member_id: memberKey,
        category: QUESTION_CATEGORY_BY_PORTAL[input.category as SupportCaseCategory],
        status: "pending",
        source: "web",
        body_text: `[portal:${input.category}] ${input.subject}\n\n${input.description}`,
        transcript_media_id: null,
        answer_text: null,
        answered_at: null,
        answered_by: null,
        rating: null,
        follow_up_of_question_id: null,
        sla_target_at: new Date(now.getTime() + SLA_TARGET_HOURS * 60 * 60 * 1000).toISOString(),
        created_at: nowIso,
        updated_at: nowIso,
      });
      return toCase(row);
    },
  };
}

/** The production wiring: Supabase-backed rows, shared durable rate window. */
export function createSupabaseMemberQuestionsSupportSource(): SupportCasesPort {
  return createMemberQuestionsSupportSource({
    async listRows(memberId) {
      const { data, error } = await getSupabaseAdmin()
        .from(MEMBER_QUESTIONS_TABLE)
        .select("*")
        .eq("member_id", memberId);
      if (error || !Array.isArray(data)) throw new Error("support_read_failed");
      return data as SupportQuestionRow[];
    },
    async insertRow(row) {
      const { data, error } = await getSupabaseAdmin()
        .from(MEMBER_QUESTIONS_TABLE)
        .insert(row)
        .select("*")
        .single();
      if (error || !data) throw new Error("support_write_failed");
      return data as SupportQuestionRow;
    },
    allowWrite(memberId) {
      // Same budget as the classic questions door: a throttle, not a judgment.
      return rateLimitHit(`customer-account-support:${memberId}`, 3600, QUESTION_LIMIT_PER_HOUR);
    },
  });
}
