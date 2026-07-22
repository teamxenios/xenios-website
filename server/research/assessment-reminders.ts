import { getSupabaseAdmin } from "../supabase";
import type { MemberPlatformDeps } from "./member-platform-deps";
import {
  ASSESSMENT_DUE_HOURS,
  ASSESSMENT_RESPONSES_TABLE,
  getOrCreateResponse,
} from "./assessment";

// ---------------------------------------------------------------------------
// xenios research member platform: assessment reminder sweep (G3).
//
// Milestones at 0h, 24h, 48h, and 72h after activation. Each active member
// with no submitted initial assessment gets at most ONE email per sweep, for
// the latest milestone they have passed; a sweep that runs late catches up
// with a single email instead of a backlog. After the 72h milestone the
// dashboard's overdue state carries the message and no further email is sent.
//
// Idempotency is layered: the reminders_sent counter is claimed with an
// optimistic guarded update BEFORE the notification is attempted (a
// concurrent sweep loses the claim and sends nothing), and the eventKey is
// deterministic per member and milestone so the durable outbox path
// deduplicates any retry. Payloads carry firstName and dueAt only: never
// health answers, never tokens.
// ---------------------------------------------------------------------------

const MEMBERS_TABLE = "research_members";

const MILESTONE_HOURS = [0, 24, 48, 72] as const;

type SweepMemberRow = {
  id: string;
  email: string;
  first_name?: string | null;
  status: string;
  activated_at?: string | null;
  [key: string]: unknown;
};

// The latest milestone index whose time has passed, or null when none has
// (cannot happen for an activated member, since milestone 0 is activation
// itself, but the guard keeps the math honest).
function latestPassedMilestone(activatedAt: Date, now: Date): number | null {
  let latest: number | null = null;
  for (let index = 0; index < MILESTONE_HOURS.length; index += 1) {
    const at = activatedAt.getTime() + MILESTONE_HOURS[index] * 60 * 60 * 1000;
    if (now.getTime() >= at) latest = index;
  }
  return latest;
}

// Runs one reminder pass. Returns the number of reminders sent.
export async function sweepAssessmentReminders(deps: MemberPlatformDeps): Promise<number> {
  const now = deps.clock.now();
  let members: SweepMemberRow[] = [];
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBERS_TABLE)
      .select("*")
      .eq("status", "active");
    if (error || !Array.isArray(data)) return 0;
    members = data as SweepMemberRow[];
  } catch {
    return 0;
  }

  let sent = 0;
  for (const member of members) {
    try {
      if (!member?.id || !member.email) continue;
      const activatedRaw = member.activated_at;
      if (typeof activatedRaw !== "string" || !activatedRaw) continue;
      const activatedAt = new Date(activatedRaw);
      if (Number.isNaN(activatedAt.getTime())) continue;

      const milestone = latestPassedMilestone(activatedAt, now);
      if (milestone === null) continue;

      // The response row tracks reminders; creating it here (opened=false)
      // never stamps started_at, so "started" still means the member opened it.
      const row = await getOrCreateResponse(member.id, now, false);
      if (row.status === "submitted") continue;
      if (row.reminders_sent > milestone) continue;

      // Claim the milestone first. If another sweep got here between our read
      // and this write, the reminders_sent guard matches nothing and we skip.
      const { data: claimed } = await getSupabaseAdmin()
        .from(ASSESSMENT_RESPONSES_TABLE)
        .update({ reminders_sent: milestone + 1 })
        .eq("id", row.id)
        .eq("status", "in_progress")
        .eq("reminders_sent", row.reminders_sent)
        .select("*")
        .maybeSingle();
      if (!claimed) continue;

      const dueAt = new Date(
        activatedAt.getTime() + ASSESSMENT_DUE_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const delivered = await deps.notifier.notify({
        eventKey: `assessment-due:${member.id}:${milestone}`,
        eventType: "assessment_due_member",
        templateKey: "member_assessment_due",
        recipient: member.email,
        memberId: member.id,
        payload: {
          firstName: typeof member.first_name === "string" ? member.first_name : "",
          dueAt,
        },
      });
      if (delivered) sent += 1;
    } catch (err) {
      // One member's failure never stops the sweep. Log metadata only.
      console.error(
        "[assessment reminders] sweep item failed:",
        err instanceof Error ? err.message : "unknown error",
      );
    }
  }
  return sent;
}

// Exported for tests: the milestone schedule is part of the behavior contract.
export const ASSESSMENT_REMINDER_MILESTONE_HOURS = MILESTONE_HOURS;
