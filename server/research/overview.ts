import type { Express, Response } from "express";
import type { MemberOverview } from "@shared/research/member-platform";
import {
  MEMBER_BILLING_STATES,
  MEMBER_STATUSES,
  type MemberBillingState,
  type MemberStatus,
} from "@shared/research/membership-types";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { getSupabaseAdmin } from "../supabase";
import type { MemberPlatformDeps } from "./member-platform-deps";
import { assessmentStatusForMember } from "./assessment";

// ---------------------------------------------------------------------------
// xenios research member platform: member overview (dashboard head).
//
// Aggregates only the member's OWN state. Future-wave areas (documents,
// questions, plans) read defensively: a missing table or column reads as the
// empty state instead of crashing, so the overview stays truthful while later
// waves land. Never expose another member's data; every query filters by the
// authenticated member id.
// ---------------------------------------------------------------------------

async function countSafe(
  table: string,
  memberId: string,
  filters: Record<string, unknown>,
  notEquals: Record<string, string> = {},
): Promise<number> {
  try {
    let query = getSupabaseAdmin().from(table).select("id", { count: "exact", head: true }).eq("member_id", memberId);
    for (const [key, value] of Object.entries(filters)) {
      if (value === null) query = query.is(key, null);
      else query = query.eq(key, value);
    }
    for (const [key, value] of Object.entries(notEquals)) {
      query = query.neq(key, value);
    }
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function narrowMemberStatus(value: string): MemberStatus {
  return (MEMBER_STATUSES as readonly string[]).includes(value) ? (value as MemberStatus) : "active";
}

function narrowBillingState(value: unknown): MemberBillingState {
  return typeof value === "string" && (MEMBER_BILLING_STATES as readonly string[]).includes(value)
    ? (value as MemberBillingState)
    : "not_started";
}

export function registerOverviewApi(app: Express, deps: MemberPlatformDeps) {
  app.get("/api/research/member/overview", requireActiveMember, async (req, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    const member = (req as { researchMember?: MemberRow }).researchMember;
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

    const assessment = await assessmentStatusForMember(member, deps.clock.now());
    const [unacknowledgedDocuments, openQuestions] = await Promise.all([
      countSafe("research_plan_documents", member.id, { acknowledged_at: null, status: "current" }),
      // Open = anything not completed; the questions wave owns the vocabulary.
      countSafe("research_member_questions", member.id, {}, { status: "completed" }),
    ]);

    const trackerUnlocked = assessment.status === "submitted";
    const nextAction: MemberOverview["nextAction"] =
      assessment.required && assessment.status !== "submitted"
        ? { key: "complete_assessment", label: "Complete your assessment", dueAt: assessment.dueAt }
        : unacknowledgedDocuments > 0
          ? { key: "acknowledge_document", label: "Review your new documents", dueAt: null }
          : { key: "none", label: "You are up to date", dueAt: null };

    const overview: MemberOverview = {
      memberId: member.id,
      preferredName: member.first_name ?? "Member",
      memberStatus: narrowMemberStatus(member.status),
      billingState: narrowBillingState(member.billing_state),
      applicationStatus: "active",
      assessment,
      blueprint: { state: assessment.status === "submitted" ? "assessment_submitted" : "assessment_due", updatedAt: null },
      currentXenios30: null,
      currentXenios90: null,
      unacknowledgedDocuments,
      openQuestions,
      trackerUnlocked,
      nextAction,
    };
    res.json({ ok: true, overview });
  });
}
