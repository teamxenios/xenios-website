import type { Express } from "express";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
import { adminRecipients, resolveEmailConfiguration } from "../services/email-config";
import {
  sendAccountClaimSuccess,
  sendAdminTestEmail,
  sendApplicationApproved,
  sendApplicationDeclined,
  sendApplicationReceived,
  sendEmailFailureAlert,
  sendInternalApplicationAlert,
  sendMoreInformationRequested,
  sendResubmittedConfirmation,
  sendStatusLink,
} from "./membership-emails";
import { makeResearchToken, type TokenPurpose } from "./membership";

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

// Template dispatch at SEND time. Fresh tokens are minted here, never stored.
// The token PURPOSE is decided at enqueue time (payload.tokenPurpose) so a
// pre-approval status link can never carry an account-claim credential.
async function dispatch(job: any): Promise<{ ok: boolean; providerId: string | null; error?: string }> {
  const payload = job.payload ?? {};
  const firstName = String(payload.firstName ?? "there");
  // Rows enqueued before purposes existed have no payload.tokenPurpose; for
  // those, the template is the reliable signal (an approval email must carry
  // a claim-capable link or its "Activate your membership" button dead-ends).
  const purpose: TokenPurpose =
    payload.tokenPurpose === "account_claim" ||
    (payload.tokenPurpose == null && job.template_key === "applicant_approved")
      ? "account_claim"
      : "status";
  const token = job.application_id ? makeResearchToken(purpose, String(job.application_id)) : "";
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
      case "applicant_resubmitted":
        result = await sendResubmittedConfirmation({ email: job.recipient, firstName, token });
        break;
      case "account_claim_success":
        result = await sendAccountClaimSuccess({ email: job.recipient, firstName });
        break;
      case "admin_new_application":
      case "admin_resubmitted":
        // Deliver to the job's own recipient (the configured admin address).
        // The previous hardcoded recipient sent every alert to team@.
        result = await sendInternalApplicationAlert({
          to: job.recipient,
          email: String(payload.applicantEmail ?? "unknown"),
          name: String(payload.applicantName ?? "Unknown"),
          applicantType: String(payload.applicantType ?? "individual"),
          kind: job.template_key === "admin_resubmitted" ? "resubmitted" : "new",
        });
        break;
      case "admin_email_failure":
        result = await sendEmailFailureAlert({
          to: job.recipient,
          failedTemplate: String(payload.failedTemplate ?? "unknown"),
          failedRecipient: String(payload.failedRecipient ?? "unknown"),
          applicationId: job.application_id ?? null,
          errorSummary: typeof payload.errorSummary === "string" ? payload.errorSummary : null,
        });
        break;
      default:
        return { ok: false, providerId: null, error: `unknown template ${job.template_key}` };
    }
    // Senders historically return boolean; newer ones return { ok, id }.
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

// A crash between the "processing" claim and the outcome write used to strand
// the row forever (invisible to every retry path). Reclaim anything stuck in
// processing longer than this window back to retryable.
const STALE_PROCESSING_MINUTES = 15;

async function reclaimStaleProcessing(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString();
  const { error } = await getSupabaseAdmin()
    .from(OUTBOX)
    .update({
      status: "failed_retryable",
      next_attempt_at: now.toISOString(),
      last_error_summary: "reclaimed after stale processing claim",
      updated_at: now.toISOString(),
    })
    .eq("status", "processing")
    .lt("updated_at", cutoff);
  if (error) console.error("[outbox] stale reclaim failed:", error.message);
}

// A permanently failed notification must never be silent: alert every admin
// recipient through the outbox itself. Failing admin_* templates never alert
// (no alert loops).
async function alertPermanentFailure(job: any, errorSummary: string | null): Promise<void> {
  if (String(job.template_key ?? "").startsWith("admin_")) return;
  // Bucketed so a REQUEUED job that permanently fails again alerts again
  // (failure rounds are hours apart; the same round stays deduplicated).
  const bucket = Math.floor(Date.now() / 600000);
  for (const admin of adminRecipients()) {
    try {
      await enqueueNotification({
        eventKey: `email-failure:${job.id}:${bucket}:${admin}`,
        eventType: "notification_failed_admin",
        templateKey: "admin_email_failure",
        recipient: admin,
        applicationId: job.application_id ?? null,
        payload: {
          failedTemplate: job.template_key,
          failedRecipient: job.recipient,
          errorSummary,
        },
      });
    } catch {
      /* the failure is already recorded on the job row */
    }
  }
}

// One worker pass: claim due jobs with a status-guarded update (two workers can
// never both win the same job), attempt delivery, record every attempt.
export async function runOutboxTick(now: Date = new Date()): Promise<{ sent: number; retried: number; failed: number }> {
  const result = { sent: 0, retried: 0, failed: 0 };
  if (!supabaseConfigured()) return result;

  await reclaimStaleProcessing(now);

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
      await alertPermanentFailure(job, outcome.error ?? null);
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

const REQUEUEABLE = ["failed_permanent", "failed_retryable", "processing"];

export function registerOutboxAdmin(app: Express) {
  // Manual drain (also the cron hook if an external scheduler is added later).
  app.post("/api/admin/research/outbox/run", requireSupabaseAdmin, async (req, res) => {
    const adminEmail = (req as any).adminEmail as string | undefined;
    console.log(`[outbox] manual drain by ${adminEmail ?? "admin"}`);
    const summary = await runOutboxTick();
    res.json({ ok: true, summary });
  });

  // Individual failed/queued emails, so failures are diagnosable without DB
  // surgery. Metadata only: payloads (applicant names, notes) never leave the
  // outbox row through this endpoint.
  app.get("/api/admin/research/outbox", requireSupabaseAdmin, async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const status = typeof req.query.status === "string" ? req.query.status : "";
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
      let query = getSupabaseAdmin()
        .from(OUTBOX)
        .select(
          "id,event_key,event_type,template_key,recipient,status,attempt_count,next_attempt_at,last_attempt_at,provider_message_id,last_error_summary,application_id,created_at,completed_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, outbox: data ?? [] });
    } catch (error) {
      console.error("[outbox] admin list error:", error);
      res.status(500).json({ ok: false, message: "Could not load the outbox." });
    }
  });

  // Requeue one message, including failed_permanent (which no automatic path
  // touches) and stuck processing rows. Attempts are reset so the full backoff
  // schedule applies again; the requeue itself is recorded as an attempt row
  // attributed to the admin.
  app.post("/api/admin/research/outbox/:id/retry", requireSupabaseAdmin, async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const adminEmail = (req as any).adminEmail as string | undefined;
      const id = String(req.params.id);
      const { data: row } = await getSupabaseAdmin().from(OUTBOX).select("*").eq("id", id).maybeSingle();
      if (!row || !REQUEUEABLE.includes((row as any).status)) {
        return res.status(409).json({ ok: false, message: "Only failed or stuck messages can be requeued." });
      }
      // A processing row may be mid-flight in a worker; only a STALE claim is
      // requeueable, or the requeue races the send into a duplicate email.
      if ((row as any).status === "processing") {
        const updatedAt = (row as any).updated_at ? Date.parse(String((row as any).updated_at)) : 0;
        if (updatedAt >= Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000) {
          return res.status(409).json({ ok: false, message: "This message is still being processed. Try again in a few minutes." });
        }
      }
      const now = new Date().toISOString();
      const { data: updated, error } = await getSupabaseAdmin()
        .from(OUTBOX)
        .update({
          status: "pending",
          attempt_count: 0,
          next_attempt_at: now,
          last_error_summary: null,
          updated_at: now,
        })
        .eq("id", id)
        .eq("status", (row as any).status)
        .select()
        .single();
      if (error || !updated) {
        return res.status(409).json({ ok: false, message: "Only failed or stuck messages can be requeued." });
      }
      await getSupabaseAdmin().from(ATTEMPTS).insert({
        outbox_id: id,
        attempt: 0,
        outcome: "manual-requeue",
        error_summary: `requeued by ${adminEmail ?? "admin"}`,
      });
      const summary = await runOutboxTick();
      res.json({ ok: true, summary });
    } catch (error) {
      console.error("[outbox] admin retry error:", error);
      res.status(500).json({ ok: false, message: "The requeue failed." });
    }
  });

  // Manual provider test. The recipient MUST be a configured admin address:
  // this endpoint proves the delivery path without ever becoming an open relay.
  app.post("/api/admin/research/test-email", requireSupabaseAdmin, async (req, res) => {
    try {
      const adminEmail = (req as any).adminEmail as string | undefined;
      const to = typeof req.body?.to === "string" ? req.body.to.trim().toLowerCase() : "";
      if (!to || !adminRecipients().includes(to)) {
        return res.status(400).json({
          ok: false,
          message: "The test recipient must be one of the configured admin addresses.",
        });
      }
      console.log(`[outbox] test email to admin address requested by ${adminEmail ?? "admin"}`);
      const result = await sendAdminTestEmail({ to });
      res.json({
        ok: result.ok,
        providerMessageId: result.id,
        message: result.ok ? "Test email handed to the provider." : "The provider did not accept the test email.",
      });
    } catch (error) {
      console.error("[outbox] test email error:", error);
      res.status(500).json({ ok: false, message: "The test email failed." });
    }
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
