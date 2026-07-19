import type { Express } from "express";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
import { adminRecipients, resolveEmailConfiguration } from "../services/email-config";
import {
  sendApplicationApproved,
  sendApplicationDeclined,
  sendApplicationReceived,
  sendInternalApplicationAlert,
  sendMoreInformationRequested,
  sendStatusLink,
} from "./membership-emails";
import { makeStatusToken } from "./membership";

// ---------------------------------------------------------------------------
// Durable notification outbox (Mega 1 sections 3-4). Every notification is a
// row first, a send second: a transient Resend failure retries automatically
// and is visible in admin, and a permanent failure is recorded, never silent.
//
// Privacy: secure status tokens are NEVER stored in the outbox. Payloads carry
// the application id; a fresh signed token is generated at send time.
// ---------------------------------------------------------------------------

const OUTBOX = "research_notification_outbox";
const ATTEMPTS = "research_notification_attempts";

// Backoff schedule (Mega 1 section 4): immediate, 1m, 5m, 20m, 1h, 6h.
const BACKOFF_SECONDS = [0, 60, 300, 1200, 3600, 21600];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

type EnqueueInput = {
  eventKey: string;
  eventType: string;
  templateKey: string;
  recipient: string;
  applicationId?: string | null;
  payload?: Record<string, unknown>;
};

// Insert-or-ignore on the unique event_key: retried requests cannot duplicate a job.
export async function enqueueNotification(input: EnqueueInput): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const { error } = await getSupabaseAdmin().from(OUTBOX).insert({
    event_key: input.eventKey,
    event_type: input.eventType,
    template_key: input.templateKey,
    recipient: input.recipient,
    application_id: input.applicationId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("duplicate")) return true; // already queued
    console.error("[outbox] enqueue failed:", error.message);
    return false;
  }
  return true;
}

// Template dispatch at SEND time. Fresh status tokens are minted here, never stored.
async function dispatch(job: any): Promise<{ ok: boolean; providerId: string | null; error?: string }> {
  const payload = job.payload ?? {};
  const firstName = String(payload.firstName ?? "there");
  const token = job.application_id ? makeStatusToken(String(job.application_id)) : "";
  try {
    let result: unknown;
    switch (job.template_key) {
      case "applicant_received":
        result = await sendApplicationReceived({ email: job.recipient, firstName, token });
        break;
      case "applicant_status_link":
        result = await sendStatusLink({ email: job.recipient, firstName, token });
        break;
      case "applicant_approved":
        result = await sendApplicationApproved({
          email: job.recipient,
          firstName,
          token,
          approvalExpiresAt: payload.approvalExpiresAt ? new Date(String(payload.approvalExpiresAt)) : new Date(),
        });
        break;
      case "applicant_declined":
        result = await sendApplicationDeclined({ email: job.recipient, firstName });
        break;
      case "applicant_more_info":
        result = await sendMoreInformationRequested({
          email: job.recipient,
          firstName,
          token,
          note: typeof payload.note === "string" ? payload.note : null,
        });
        break;
      case "admin_new_application":
      case "admin_resubmitted":
        result = await sendInternalApplicationAlert({
          email: String(payload.applicantEmail ?? "unknown"),
          name: String(payload.applicantName ?? "Unknown"),
          applicantType: String(payload.applicantType ?? "individual"),
        });
        break;
      default:
        return { ok: false, providerId: null, error: `unknown template ${job.template_key}` };
    }
    // Senders historically return boolean; newer ones may return { ok, id }.
    const ok = result === true || (typeof result === "object" && result !== null && (result as any).ok !== false);
    const providerId = typeof result === "object" && result !== null ? ((result as any).id ?? null) : null;
    return { ok, providerId, error: ok ? undefined : "provider send returned failure" };
  } catch (error: any) {
    return { ok: false, providerId: null, error: String(error?.message ?? "send threw").slice(0, 300) };
  }
}

function nextAttemptAt(attemptCount: number, now: Date): string {
  const base = BACKOFF_SECONDS[Math.min(attemptCount, BACKOFF_SECONDS.length - 1)];
  const jitter = base * 0.2 * Math.random();
  return new Date(now.getTime() + (base + jitter) * 1000).toISOString();
}

// One worker pass: claim due jobs with a status-guarded update (two workers can
// never both win the same job), attempt delivery, record every attempt.
export async function runOutboxTick(now: Date = new Date()): Promise<{ sent: number; retried: number; failed: number }> {
  const result = { sent: 0, retried: 0, failed: 0 };
  if (!supabaseConfigured()) return result;

  const { data: due, error } = await getSupabaseAdmin()
    .from(OUTBOX)
    .select("*")
    .in("status", ["pending", "failed_retryable"])
    .lte("next_attempt_at", now.toISOString())
    .limit(20);
  if (error || !due?.length) return result;

  for (const job of due as any[]) {
    // Claim: only one runner may move it to processing.
    const { data: claimed } = await getSupabaseAdmin()
      .from(OUTBOX)
      .update({ status: "processing", updated_at: now.toISOString() })
      .eq("id", job.id)
      .eq("status", job.status)
      .select()
      .single();
    if (!claimed) continue;

    const attempt = (job.attempt_count ?? 0) + 1;
    const outcome = await dispatch(job);

    await getSupabaseAdmin().from(ATTEMPTS).insert({
      outbox_id: job.id,
      attempt,
      outcome: outcome.ok ? "sent" : "failed",
      error_summary: outcome.error ?? null,
    });

    if (outcome.ok) {
      await getSupabaseAdmin()
        .from(OUTBOX)
        .update({
          status: "sent",
          attempt_count: attempt,
          last_attempt_at: now.toISOString(),
          provider_message_id: outcome.providerId,
          completed_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", job.id);
      result.sent += 1;
    } else if (attempt >= MAX_ATTEMPTS) {
      await getSupabaseAdmin()
        .from(OUTBOX)
        .update({
          status: "failed_permanent",
          attempt_count: attempt,
          last_attempt_at: now.toISOString(),
          last_error_summary: outcome.error ?? null,
          updated_at: now.toISOString(),
        })
        .eq("id", job.id);
      result.failed += 1;
    } else {
      await getSupabaseAdmin()
        .from(OUTBOX)
        .update({
          status: "failed_retryable",
          attempt_count: attempt,
          last_attempt_at: now.toISOString(),
          next_attempt_at: nextAttemptAt(attempt, now),
          last_error_summary: outcome.error ?? null,
          updated_at: now.toISOString(),
        })
        .eq("id", job.id);
      result.retried += 1;
    }
  }
  return result;
}

// In-process polling worker: survives restarts because all state is in
// Supabase; a protected admin endpoint provides a manual drain as backup.
let workerTimer: ReturnType<typeof setInterval> | null = null;
export function startOutboxWorker(log: (message: string, source?: string) => void) {
  if (workerTimer) return;
  if (!supabaseConfigured()) {
    log("outbox worker not started: storage unconfigured", "outbox");
    return;
  }
  workerTimer = setInterval(() => {
    runOutboxTick().catch((error) => console.error("[outbox] tick error:", error));
  }, 60 * 1000);
  (workerTimer as any).unref?.();
  log("outbox worker started (60s interval)", "outbox");
}

export function registerOutboxAdmin(app: Express) {
  // Manual drain (also the cron hook if an external scheduler is added later).
  app.post("/api/admin/research/outbox/run", requireSupabaseAdmin, async (_req, res) => {
    const summary = await runOutboxTick();
    res.json({ ok: true, summary });
  });

  // Safe booleans and counts only (Mega 1 section 8).
  app.get("/api/admin/research/system-status", requireSupabaseAdmin, async (_req, res) => {
    const email = await resolveEmailConfiguration();
    const counts: Record<string, number> = {};
    let lastSent: string | null = null;
    if (supabaseConfigured()) {
      for (const status of ["pending", "processing", "failed_retryable", "failed_permanent", "sent"]) {
        const { data } = await getSupabaseAdmin().from(OUTBOX).select("id").eq("status", status).limit(500);
        counts[status] = (data as any[])?.length ?? 0;
      }
      const { data: last } = await getSupabaseAdmin()
        .from(OUTBOX)
        .select("completed_at")
        .eq("status", "sent")
        .order("completed_at", { ascending: false })
        .limit(1);
      lastSent = (last as any[])?.[0]?.completed_at ?? null;
    }
    res.json({
      ok: true,
      system: {
        supabaseConfigured: supabaseConfigured(),
        emailProvider: email.provider,
        emailConfigured: email.provider !== "unavailable",
        verifiedSenderConfigured: Boolean(email.fromEmail),
        adminRecipientCount: adminRecipients().length,
        outbox: counts,
        lastSuccessfulSend: lastSent,
        workerRunning: Boolean(workerTimer),
        driveExportsEnabled: process.env.RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED === "true",
      },
    });
  });
}
