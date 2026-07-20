import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { canTransition, type ApplicationStatus } from "@shared/research/membership-types";

// ---------------------------------------------------------------------------
// Approval-expiry sweep (the master guide's open item; CLAUDE_PRIMARY lane).
// approval_expires_at was set at approval and enforced at claim time, but
// nothing ever moved a lapsed application to "expired": an unclaimed approval
// stayed "approved_pending_payment" forever and kept renewing claim-capable
// links through resend. This sweep closes the loop, entirely outside the
// membership module so it cannot conflict with the account-email lane:
// direct status-guarded updates plus append-only event rows, validated
// against the same shared state machine the API uses.
//
// Deliberately silent (no email): notification surfaces belong to the
// account-email systems lane; an "approval expired" template is queued for it
// in the coordination handoff. The audit trail records every flip.
// ---------------------------------------------------------------------------

const APPLICATIONS = "research_applications";
const EVENTS = "research_application_events";

// Statuses the sweep may expire, each verified against ALLOWED_TRANSITIONS at
// runtime so a future state-machine change can never make the sweep illegal.
const SWEEPABLE: ApplicationStatus[] = ["approved_pending_payment", "payment_pending"];

const BATCH = 50;

export async function sweepExpiredApprovals(now: Date): Promise<number> {
  if (!supabaseConfigured()) return 0;
  const nowIso = now.toISOString();
  let expired = 0;

  for (const status of SWEEPABLE) {
    if (!canTransition(status, "expired")) continue;
    const { data, error } = await getSupabaseAdmin()
      .from(APPLICATIONS)
      .select("id, status, approval_expires_at")
      .eq("status", status)
      .lt("approval_expires_at", nowIso)
      .limit(BATCH);
    if (error) {
      console.error("[research expiry] select failed:", error.message);
      continue;
    }
    for (const row of (data as any[]) ?? []) {
      if (!row.approval_expires_at) continue;
      // Status-guarded update: a concurrent claim/activation wins the race and
      // the sweep silently skips (same pattern as reward promotion).
      const { data: updated, error: updateError } = await getSupabaseAdmin()
        .from(APPLICATIONS)
        .update({ status: "expired", updated_at: nowIso })
        .eq("id", row.id)
        .eq("status", status)
        .select()
        .single();
      if (updateError || !updated) continue;
      expired += 1;
      const { error: eventError } = await getSupabaseAdmin().from(EVENTS).insert({
        application_id: row.id,
        previous_status: status,
        new_status: "expired",
        actor_type: "system",
        reason_code: "approval_expired",
        internal_note: `approval_expires_at=${row.approval_expires_at} swept at ${nowIso}`,
      });
      if (eventError) console.error("[research expiry] event insert failed:", eventError.message);
    }
  }
  return expired;
}
