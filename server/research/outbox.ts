import type { Express } from "express";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
import { adminRecipients, resolveEmailConfiguration } from "../services/email-config";
import {
  sendAccountClaimSuccess,
  sendApprovedCustomerClaim,
  sendApprovedCustomerWelcome,
  sendAdminTestEmail,
  sendApplicationApproved,
  sendB2BBuyerClaim,
  sendApplicationDeclined,
  sendApplicationReceived,
  sendEmailFailureAlert,
  sendInternalApplicationAlert,
  sendMoreInformationRequested,
  sendResubmittedConfirmation,
  sendStatusLink,
} from "./membership-emails";
import { makeResearchToken, makeApprovedCustomerClaimToken, type TokenPurpose } from "./membership";
import { MEMBER_PLATFORM_TEMPLATES } from "./member-platform-emails";
import { getResendClient } from "../services/email";
import {
  FOUNDING_EMAIL_TEMPLATES,
  assertEmailPayloadSafe,
  type FoundingEmailTemplate,
} from "./membership-activation/emails";
import { runAgreementPackageReconciler } from "./agreement-package-reconciliation";
import { renderProductDiagnosticOutboxEmail } from "./products-diagnostics/communications";
import { renderEarlyAccessOutboxEmail } from "./early-access/notifications/communications";
import { renderAssistedOrderOutboxEmail } from "./assisted-order/communications";
import { renderBuyerCommerceOutboxEmail } from "./buyer-commerce/communications";

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
  return (await enqueueNotificationOnce(input)) !== "unavailable";
}

/**
 * The same insert, with the three outcomes told apart.
 *
 * `enqueueNotification` answers "is this notification on file", which is what
 * every mail caller wants: a duplicate is a success, because the row is there.
 * A sweep that must not double-count needs the stricter question "did THIS call
 * create the row", and collapsing `inserted` and `already_queued` into one
 * boolean cannot answer it.
 *
 * The unique index on `event_key` is what makes this honest: it is the claim
 * and the enqueue at once, so there is no window in which two sweeps both
 * believe they are first. `23505` is the unique-violation SQLSTATE; the message
 * text is checked too, because PostgREST does not always surface the code.
 */
export type EnqueueOutcome = "inserted" | "already_queued" | "unavailable";

export async function enqueueNotificationOnce(input: EnqueueInput): Promise<EnqueueOutcome> {
  if (!supabaseConfigured()) return "unavailable";
  const { error } = await getSupabaseAdmin().from(OUTBOX).insert({
    event_key: input.eventKey,
    event_type: input.eventType,
    template_key: input.templateKey,
    recipient: input.recipient,
    application_id: input.applicationId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "23505" || String(error.message ?? "").toLowerCase().includes("duplicate")) {
      return "already_queued";
    }
    console.error("[outbox] enqueue failed:", error.message);
    return "unavailable";
  }
  return "inserted";
}

// ---------------------------------------------------------------------------
// Founding-membership (fm_*) renderers. The 24 activation templates live as
// DATA in membership-activation/emails.ts; this registration is the one place
// that data becomes a subject and a body. The payload is re-checked against
// the forbidden-key patterns AT RENDER TIME, so receiving instructions have no
// path into a sent email even if a row was inserted by hand: the member gets
// the method label and the XRM memo reference only, and the destination stays
// inside the authenticated portal.
// ---------------------------------------------------------------------------

const FOUNDING_TEMPLATES_BY_KEY: ReadonlyMap<string, FoundingEmailTemplate> = new Map(
  FOUNDING_EMAIL_TEMPLATES.map((template) => [template.key, template]),
);

export const RESEARCH_SENDER_DEFAULT = "Xenios Research <research@xeniostechnology.com>";
export const RESEARCH_REPLY_TO_DEFAULT = "research@xeniostechnology.com";

const FOUNDING_EMAIL_SIGNOFF = "Xenios Research\nresearch@xeniostechnology.com";
const SITE_URL_DEFAULT = "https://xeniostechnology.com";

/** Historical per-document notices are deliberately retired. Keeping their
 * templates readable lets an already-queued row finish without retrying
 * forever, but dispatch acknowledges it without contacting the provider. */
export const SUPPRESSED_PER_DOCUMENT_AGREEMENT_TEMPLATES: ReadonlySet<string> = new Set([
  "fm_esign_completed_member",
  "fm_admin_esign_completed",
]);

// ISO-8601 payload values read as instants and render human-readable;
// everything else (amounts, references, labels) is inserted as-is.
function formatTemplateValue(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toUTCString();
  }
  return value == null ? "" : String(value);
}

function fillPlaceholders(line: string, payload: Record<string, unknown>): string {
  return line.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
    key in payload ? formatTemplateValue(payload[key]) : "",
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeAccountActionUrl(path: string): string {
  let base = SITE_URL_DEFAULT;
  try {
    const configured = new URL(process.env.SITE_URL?.trim() || SITE_URL_DEFAULT);
    if (configured.protocol === "https:") base = configured.origin;
  } catch {
    // A malformed deployment override cannot put an untrusted link in email.
  }
  return new URL(path, `${base}/`).toString();
}

/**
 * Render one fm_* template to subject + text, or null when the key is not a
 * founding template (the caller falls through to the other dispatch branches,
 * so unknown-template retry behavior for non-fm keys is untouched). Throws
 * EmailPayloadRefused when the payload smells like receiving instructions.
 */
export function renderFoundingEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): { subject: string; text: string; html?: string } | null {
  const template = FOUNDING_TEMPLATES_BY_KEY.get(templateKey);
  if (!template) return null;
  assertEmailPayloadSafe(payload);
  const subject = fillPlaceholders(template.subject, payload);
  const body = template.bodyLines.map((line) => fillPlaceholders(line, payload)).join("\n\n");
  if (!template.action) return { subject, text: `${body}\n\n${FOUNDING_EMAIL_SIGNOFF}` };

  const actionUrl = safeAccountActionUrl(template.action.path);
  const text = `${body}\n\n${template.action.label}: ${actionUrl}\n\n${FOUNDING_EMAIL_SIGNOFF}`;
  const paragraphs = template.bodyLines
    .map((line) => `<p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(fillPlaceholders(line, payload)).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html =
    `<div style="font-family:Arial,sans-serif;color:#171717;max-width:620px;margin:0 auto;">` +
    `${paragraphs}` +
    `<p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">${escapeHtml(template.action.label)}</a></p>` +
    `<p style="margin:24px 0 0;color:#5f5f5f;line-height:1.5;">Xenios Research<br>research@xeniostechnology.com</p>` +
    `</div>`;
  return { subject, text, html };
}

// Sender and reply-to per config: the research overrides win, else the spec
// identity Xenios Research <research@xeniostechnology.com>. The generic site
// sender (team@) is deliberately NOT a fallback for founding-membership mail.
export async function sendFoundingEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; providerId: string | null; error?: string }> {
  try {
    const r = await getResendClient();
    const from = process.env.RESEARCH_EMAIL_FROM?.trim() || RESEARCH_SENDER_DEFAULT;
    const replyTo = process.env.RESEARCH_EMAIL_REPLY_TO?.trim() || RESEARCH_REPLY_TO_DEFAULT;
    const message = {
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      replyTo,
    };
    const { data, error } = input.idempotencyKey
      ? await r.client.emails.send(message, { idempotencyKey: input.idempotencyKey })
      : await r.client.emails.send(message);
    if (error) {
      return {
        ok: false,
        providerId: null,
        error: String((error as { message?: string }).message ?? "provider rejected send").slice(0, 300),
      };
    }
    return { ok: true, providerId: (data as { id?: string } | null)?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      providerId: null,
      error: String(err instanceof Error ? err.message : "send threw").slice(0, 300),
    };
  }
}

// Template dispatch at SEND time. Fresh tokens are minted here, never stored.
// The token PURPOSE is decided at enqueue time (payload.tokenPurpose) so a
// pre-approval status link can never carry an account-claim credential.
async function dispatch(job: any): Promise<{ ok: boolean; providerId: string | null; error?: string; nonRetryable?: boolean }> {
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
      case "approved_customer_claim": {
        // Recheck the approval before minting/sending its ownership credential.
        // A stale or revoked job is a visible failure, never recorded as sent.
        const { data: application, error } = await getSupabaseAdmin().from("research_applications")
          .select("email,status,access_approval_version,approval_expires_at")
          .eq("id", job.application_id).maybeSingle();
        if (error) return { ok: false, providerId: null, error: "approved account notification source unavailable" };
        if (!application || application.email?.toLowerCase() !== String(job.recipient).toLowerCase()
          || application.status !== "approved_customer"
          || !Number.isInteger(payload.approvalVersion) || payload.approvalVersion < 1
          || application.access_approval_version !== payload.approvalVersion
          || !Number.isFinite(Date.parse(application.approval_expires_at)) || Date.parse(application.approval_expires_at) <= Date.now()) {
          return { ok: false, providerId: null, error: "approved account notification superseded, expired or revoked", nonRetryable: true };
        }
        result = await sendApprovedCustomerClaim({ email: job.recipient, firstName,
          token: makeApprovedCustomerClaimToken(String(job.application_id), application.approval_expires_at),
          approvalExpiresAt: new Date(application.approval_expires_at), idempotencyKey: String(job.event_key) });
        break;
      }
      case "approved_customer_welcome":
        result = await sendApprovedCustomerWelcome({ email: job.recipient, firstName, idempotencyKey: String(job.event_key) });
        break;
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
      case "b2b_buyer_claim":
        result = await sendB2BBuyerClaim({
          email: job.recipient,
          firstName,
          token,
          businessDisplayName: String(payload.businessDisplayName ?? "business buyer"),
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
      default: {
        if (SUPPRESSED_PER_DOCUMENT_AGREEMENT_TEMPLATES.has(job.template_key)) {
          return { ok: true, providerId: null };
        }
        // Founding-membership (fm_*) templates render from the emails.ts data
        // catalog and send with the research identity. A payload that smells
        // like receiving instructions throws EmailPayloadRefused, which the
        // outer catch records as a failure: it never sends.
        const founding = renderFoundingEmail(job.template_key, payload);
        if (founding) {
          return await sendFoundingEmail({
            to: job.recipient,
            subject: founding.subject,
            text: founding.text,
            html: founding.html,
            // Resend deduplicates a reclaimed job after a process crash between
            // provider acceptance and the local status='sent' update.
            idempotencyKey: String(job.event_key),
          });
        }
        // Member-platform templates share this ONE durable dispatch path. The
        // member-platform notifier direct-sends first and enqueues only as a
        // fallback, so this branch is the durable retry for those keys. No
        // second email system: the template functions live in
        // member-platform-emails.ts and are invoked here.
        const memberTemplate = MEMBER_PLATFORM_TEMPLATES[job.template_key as keyof typeof MEMBER_PLATFORM_TEMPLATES];
        if (memberTemplate) {
          const ok = await memberTemplate({ recipient: job.recipient, payload });
          return { ok, providerId: null, error: ok ? undefined : "provider send returned failure" };
        }
        const productDiagnostic = renderProductDiagnosticOutboxEmail(
          job.template_key,
          payload,
        );
        if (productDiagnostic) {
          return await sendFoundingEmail({
            to: job.recipient,
            subject: productDiagnostic.subject,
            text: productDiagnostic.text,
            idempotencyKey: String(job.event_key),
          });
        }
        const buyerCommerce = renderBuyerCommerceOutboxEmail(job.template_key, payload);
        if (buyerCommerce) {
          return await sendFoundingEmail({
            to: job.recipient,
            subject: buyerCommerce.subject,
            text: buyerCommerce.text,
            idempotencyKey: String(job.event_key),
          });
        }
        // Early Access customer mail shares this ONE durable path too. The
        // renderer refuses a payload carrying receiving material, so a
        // hand-inserted row cannot put a payment destination in a customer
        // inbox: the destinations live behind the authenticated Early Access
        // page and the email carries only a reference and a link to it.
        const earlyAccess = renderEarlyAccessOutboxEmail(job.template_key, payload);
        if (earlyAccess) {
          return await sendFoundingEmail({
            to: job.recipient,
            subject: earlyAccess.subject,
            text: earlyAccess.text,
            idempotencyKey: String(job.event_key),
          });
        }
        const assistedOrder = renderAssistedOrderOutboxEmail(job.template_key, payload);
        if (assistedOrder) {
          return await sendFoundingEmail({
            to: job.recipient,
            subject: assistedOrder.subject,
            text: assistedOrder.text,
            idempotencyKey: String(job.event_key),
          });
        }
        return { ok: false, providerId: null, error: `unknown template ${job.template_key}` };
      }
    }
    // A send is successful ONLY on an explicit success signal: boolean true
    // or { ok: true }. An unknown object shape is a failure, never "sent".
    const ok = result === true || (typeof result === "object" && result !== null && (result as any).ok === true);
    const providerId = ok && typeof result === "object" && result !== null ? ((result as any).id ?? null) : null;
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
  const { data: stale, error } = await getSupabaseAdmin()
    .from(OUTBOX)
    .select("*")
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .limit(20);
  if (error) {
    console.error("[outbox] stale reclaim failed:", error.message);
    return;
  }
  for (const job of (stale as any[]) ?? []) {
    // The crashed claim COUNTS as an attempt: a dispatch that reliably kills
    // the worker must walk the same backoff ladder to failed_permanent, not
    // reclaim forever.
    const attempt = (job.attempt_count ?? 0) + 1;
    const permanent = attempt >= MAX_ATTEMPTS;
    const { error: updateError } = await getSupabaseAdmin()
      .from(OUTBOX)
      .update({
        status: permanent ? "failed_permanent" : "failed_retryable",
        attempt_count: attempt,
        next_attempt_at: permanent ? job.next_attempt_at : now.toISOString(),
        last_attempt_at: now.toISOString(),
        last_error_summary: "reclaimed after stale processing claim (crashed mid-send)",
        updated_at: now.toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (updateError) {
      console.error("[outbox] stale reclaim update failed:", updateError.message);
      continue;
    }
    await getSupabaseAdmin().from(ATTEMPTS).insert({
      outbox_id: job.id,
      attempt,
      outcome: "failed",
      error_summary: "stale processing reclaim (crashed mid-send)",
    });
    if (permanent) await alertPermanentFailure(job, "reclaimed after stale processing claim (crashed mid-send)");
  }
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

  // Materialize any agreement-package candidates captured atomically with a
  // legal acceptance before claiming email jobs. This is restart-safe.
  try {
    await runAgreementPackageReconciler();
  } catch (error) {
    // A legal-package reconciliation fault must remain visible, but it must
    // not starve unrelated due notification jobs.
    console.error(
      "[outbox] agreement package reconciliation failed:",
      error instanceof Error ? error.message : "unknown",
    );
  }
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
    } else if (outcome.nonRetryable || attempt >= MAX_ATTEMPTS) {
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
