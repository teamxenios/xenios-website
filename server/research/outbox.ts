import { renderCommerceReceiptOutboxEmail } from "./commerce/receipt-repair";
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
  OUTBOX_DUE_STATUSES,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RETRY_LADDER,
  outboxAttemptRow,
  outboxClaimFields,
  outboxCompletionFields,
  outboxCompletionGuard,
} from "./outbox-writes";
import {
  FOUNDING_EMAIL_TEMPLATES,
  assertEmailPayloadSafe,
  type FoundingEmailTemplate,
} from "./membership-activation/emails";
import { runAgreementPackageReconciler } from "./agreement-package-reconciliation";
import { renderProductDiagnosticOutboxEmail } from "./products-diagnostics/communications";
import { renderEarlyAccessOutboxEmail } from "./early-access/notifications/communications";
import { renderAssistedOrderOutboxEmail } from "./assisted-order/communications";
import {
  REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
  REQUEST_SUBMITTED_STAFF_TEMPLATE,
  requestSubmittedStaffNoticeConfig,
  sendRequestSubmittedStaffNotice,
} from "./assisted-order/request-intent/staff-notice";
import {
  CUSTOMER_NOTICE_TEMPLATE_KEYS,
  requestCustomerNoticeConfig,
  sendRequestCustomerNotice,
} from "./assisted-order/request-intent/customer-notice";
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

// Backoff schedule (Mega 1 section 4): immediate, 1m, 5m, 20m, 1h, 6h. The
// ladder and every row write the worker makes live in outbox-writes.ts.
const MAX_ATTEMPTS = OUTBOX_MAX_ATTEMPTS;
/** The automatic retry ladder, exported so tests can bound its span. */
export { OUTBOX_RETRY_LADDER };

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

/** A single owner registers this handler only after composing verified private quote
 * authorities. All queue acquisition, retries, admin history and provider receipt storage
 * continue through this module. No separate quote job runner is started. */
type QuoteDeliveryWorkerReply = { ok: boolean; providerId: string | null; error?: string; nonRetryable?: boolean };
let privateQuoteDispatch: ((job: unknown) => Promise<QuoteDeliveryWorkerReply>) | null = null;
export function registerPrivateQuoteDispatch(handler: (job: unknown) => Promise<QuoteDeliveryWorkerReply>): void {
  if (privateQuoteDispatch !== null && handler !== privateQuoteDispatch) throw new Error("Private quote mail handler already registered.");
  privateQuoteDispatch = handler;
}

// Template dispatch at SEND time. Fresh tokens are minted here, never stored.
// The token PURPOSE is decided at enqueue time (payload.tokenPurpose) so a
// pre-approval status link can never carry an account-claim credential.
async function dispatch(
  job: any,
  staffNotice: ReturnType<typeof requestSubmittedStaffNoticeConfig>,
  now: Date,
  customerNotice: ReturnType<typeof requestCustomerNoticeConfig> = null,
): Promise<{ ok: boolean; providerId: string | null; error?: string; nonRetryable?: boolean; cancel?: boolean }> {
  if (CUSTOMER_NOTICE_TEMPLATE_KEYS.includes(job?.template_key)) {
    if (!customerNotice) return { ok: false, providerId: null, error: "Customer notices paused." };
    // The same research identity as other customer mail from this outbox.
    return sendRequestCustomerNotice(
      job, { from: process.env.RESEARCH_EMAIL_FROM?.trim() || RESEARCH_SENDER_DEFAULT }, customerNotice,
      process.env, undefined, now);
  }
  if (job?.template_key === REQUEST_SUBMITTED_STAFF_TEMPLATE || job?.template_key === REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE) {
    if (!staffNotice) return { ok: false, providerId: null, error: "Staff notices paused." };
    return sendRequestSubmittedStaffNotice(job, staffNotice, process.env, undefined, now);
  }
  if (job?.template_key === "ea_private_quote_notice_v1") {
    if (!privateQuoteDispatch) return { ok: false, providerId: null, error: "Private quote channel unavailable." };
    return privateQuoteDispatch(job);
  }
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
    if (job.template_key === "applicant_approved" || job.template_key === "fm_activation_obligation_created"
      || /^fm_membership_/.test(job.template_key) || /^fm_renewal_/.test(job.template_key)) {
      return { ok: false, providerId: null, error: "paid membership notification retired; customer access requires the approved-account workflow", nonRetryable: true };
    }
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
        // Registration is explicit; enabling a dispatcher is a separately approved communication effect.
        if (job.template_key === "commerce_payment_received") {
          if (process.env.RESEARCH_COMMERCE_RECEIPTS_ENABLED !== "true") return { ok: false, providerId: null, error: "commerce receipt delivery disabled" };
          const receipt = renderCommerceReceiptOutboxEmail(job.template_key, payload);
          if (!receipt) return { ok: false, providerId: null, error: "commerce receipt invalid" };
          return await sendFoundingEmail({ to: job.recipient, subject: receipt.subject, text: receipt.text, idempotencyKey: String(job.event_key) });
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

// A crash between the "processing" claim and the outcome write used to strand
// the row forever (invisible to every retry path). Reclaim anything stuck in
// processing longer than this window back to retryable.
const STALE_PROCESSING_MINUTES = 15;

// ---------------------------------------------------------------------------
// No-mail designation (fixture no-mail design, revision 2).
//
// The candidate schema adds `mail_disposition` ("ordinary" | "fixture_no_mail")
// to the outbox. The database itself refuses a designated job's claim and its
// attempt rows. The worker additionally keeps designated jobs out of every path
// that could claim, reclaim, requeue or alert on them, so they cannot fill a
// batch ahead of real mail and no attempt, counter or alert is written for them.
//
// Every consequential pass first reads the database's own guard status,
// public.request_intent_fixture_mail_guard_status(). Only the exact protocol
// with ready:true enables the installed path, where the ordinary filter is
// named in every read and write guard. ready:false, a wrong or malformed
// protocol, and any error or unavailable reply withhold the whole pass: nothing
// is reconciled, reclaimed, claimed, requeued, attempted, sent or alerted.
//
// The legacy schema (before this install) is the one other outcome, and it
// needs a positive proof, never an unknown, read before any consequential path:
// the status function is reported missing (PGRST202 / 42883) AND a zero-row
// selection of exactly research_notification_outbox.mail_disposition fails with
// PostgreSQL's own undefined-column error (42703) for that exact column. A
// successful or empty selection, any other error, a permission or network
// failure, or a schema-cache miss is not that proof and withholds the pass. Rows
// that later show the column are still treated as a partial install.
//
// On the installed schema only exactly "ordinary" may be claimed; any other
// value, including null or a missing key, is withheld, never treated as ordinary.
// ---------------------------------------------------------------------------
export const ORDINARY_MAIL_DISPOSITION = "ordinary";
export const FIXTURE_MAIL_GUARD_STATUS_RPC = "request_intent_fixture_mail_guard_status";
export const FIXTURE_MAIL_GUARD_PROTOCOL = "request-intent/fixture-no-mail/v1";

// "ready": installed and attested. "legacy": the status function is missing and
// the column is positively absent. "withheld": anything else.
export type MailGuardState = "ready" | "legacy" | "withheld";

// PostgreSQL's own message for this exact relation and column.
export const LEGACY_COLUMN_ABSENT_MESSAGE = "column research_notification_outbox.mail_disposition does not exist";

async function mailDispositionColumnProvenAbsent(): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin().from(OUTBOX).select("mail_disposition").limit(0);
    const failure = error as { code?: unknown; message?: unknown } | null;
    return failure !== null && failure.code === "42703" && failure.message === LEGACY_COLUMN_ABSENT_MESSAGE;
  } catch {
    return false;
  }
}

export async function readMailGuardStatus(): Promise<MailGuardState> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(FIXTURE_MAIL_GUARD_STATUS_RPC);
    if (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== "PGRST202" && code !== "42883") return "withheld";
      return (await mailDispositionColumnProvenAbsent()) ? "legacy" : "withheld";
    }
    const status = data as { protocol?: unknown; ready?: unknown } | null;
    return status !== null && typeof status === "object" && !Array.isArray(status)
      && status.protocol === FIXTURE_MAIL_GUARD_PROTOCOL && status.ready === true
      ? "ready"
      : "withheld";
  } catch {
    return "withheld";
  }
}

type MailEligibility = "legacy" | "ordinary" | "withheld";

export function outboxMailEligibility(row: unknown, schemaInstalled = false): MailEligibility {
  const installed = schemaInstalled || mailDispositionInstalled(row);
  if (!installed) return "legacy";
  return mailDispositionInstalled(row) && (row as { mail_disposition: unknown }).mail_disposition === ORDINARY_MAIL_DISPOSITION
    ? "ordinary"
    : "withheld";
}

function mailDispositionInstalled(row: unknown): boolean {
  return row !== null && typeof row === "object" && Object.prototype.hasOwnProperty.call(row, "mail_disposition");
}

type EligibleRead = { rows: any[]; partial: boolean; error: { message: string } | null };

// Reads a batch. Installed: the ordinary filter is in the query itself, before
// the limit, so held rows never take real mail's places; each row is still
// checked. Legacy: the query is unchanged, and a row showing the column means a
// partial install, so nothing from that read is used.
async function readEligibleBatch(
  guard: "ready" | "legacy",
  read: (ordinaryOnly: boolean) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<EligibleRead> {
  const reply = await read(guard === "ready");
  if (reply.error) return { rows: [], partial: false, error: reply.error };
  const rows = Array.isArray(reply.data) ? (reply.data as any[]) : [];
  if (guard === "ready") {
    return { rows: rows.filter((row) => outboxMailEligibility(row, true) === "ordinary"), partial: false, error: null };
  }
  if (rows.some(mailDispositionInstalled)) return { rows: [], partial: true, error: null };
  return { rows, partial: false, error: null };
}

const PARTIAL_INSTALL_MESSAGE =
  "[outbox] no-mail column present without its guard status; partial install, this pass sends nothing";

async function reclaimStaleProcessing(now: Date, guard: "ready" | "legacy"): Promise<{ partial: boolean }> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString();
  const read = await readEligibleBatch(guard, (ordinaryOnly) => {
    let query = getSupabaseAdmin()
      .from(OUTBOX)
      .select("*")
      .eq("status", "processing")
      .lt("updated_at", cutoff);
    if (ordinaryOnly) query = query.eq("mail_disposition", ORDINARY_MAIL_DISPOSITION);
    return query.limit(20);
  });
  if (read.error) {
    console.error("[outbox] stale reclaim failed:", read.error.message);
    return { partial: false };
  }
  if (read.partial) return { partial: true };
  // A designated job left in processing keeps its real claim evidence. It is not
  // read, reclaimed, counted as an attempt, given an attempt row or alerted on.
  const stale = read.rows;
  for (const job of stale) {
    // The crashed claim COUNTS as an attempt: a dispatch that reliably kills
    // the worker must walk the same backoff ladder to failed_permanent, not
    // reclaim forever.
    const attempt = (job.attempt_count ?? 0) + 1;
    const permanent = attempt >= MAX_ATTEMPTS;
    // Matched on the stale claim as read: if another pass reclaimed the job
    // and it has been claimed again since, that newer claim is left alone.
    let reclaim = getSupabaseAdmin()
      .from(OUTBOX)
      .update({
        status: permanent ? "failed_permanent" : "failed_retryable",
        attempt_count: attempt,
        next_attempt_at: permanent ? job.next_attempt_at : now.toISOString(),
        last_attempt_at: now.toISOString(),
        completed_at: permanent ? now.toISOString() : null,
        last_error_summary: "reclaimed after stale processing claim (crashed mid-send)",
        updated_at: now.toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing")
      .eq("updated_at", job.updated_at);
    // A designation that lands after the read still wins: no row, no attempt.
    if (guard === "ready") reclaim = reclaim.eq("mail_disposition", ORDINARY_MAIL_DISPOSITION);
    const { data: reclaimed, error: updateError } = await reclaim.select("id");
    if (updateError) {
      console.error("[outbox] stale reclaim update failed:", updateError.message);
      continue;
    }
    // Another pass moved it first and records that attempt itself.
    if (Array.isArray(reclaimed) && reclaimed.length === 0) continue;
    await getSupabaseAdmin().from(ATTEMPTS).insert({
      outbox_id: job.id,
      attempt,
      outcome: "failed",
      error_summary: "stale processing reclaim (crashed mid-send)",
    });
    if (permanent) await alertPermanentFailure(job, "reclaimed after stale processing claim (crashed mid-send)");
  }
  return { partial: false };
}

// A permanently failed notification must never be silent: alert every admin
// recipient through the outbox itself. Failing admin_* templates never alert
// (no alert loops).
async function alertPermanentFailure(job: any, errorSummary: string | null): Promise<void> {
  if (String(job.template_key ?? "").startsWith("admin_")) return;
  // A designated job never produces a derivative failure email. The worker
  // cannot reach this for one, but a future caller must not either.
  if (outboxMailEligibility(job) === "withheld") return;
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
// `withheld` appears only when the installed schema held designated jobs back
// this pass, so the summary is unchanged everywhere else. Withheld jobs are
// never counted as sent, retried or failed.
export type OutboxTickSummary = { sent: number; retried: number; failed: number; withheld?: number };

export async function runOutboxTick(now: Date = new Date()): Promise<OutboxTickSummary> {
  const result: OutboxTickSummary = { sent: 0, retried: 0, failed: 0 };
  if (!supabaseConfigured()) return result;

  // Read before every consequential path, including both reconciliations.
  const guard = await readMailGuardStatus();
  if (guard === "withheld") {
    console.error("[outbox] no-mail guard status not ready or unavailable; this pass sends nothing");
    return result;
  }

  const staffNotice = requestSubmittedStaffNoticeConfig(process.env);
  if (staffNotice) {
    try {
      // With the full email off, the existing two-argument reconciliation runs
      // unchanged, so this build also works before the detail migration.
      const shortOnly = { p_since: staffNotice.since, p_recipients: staffNotice.recipients };
      let { error } = await getSupabaseAdmin().rpc("request_intent_enqueue_staff_notices",
        staffNotice.detailSince ? { ...shortOnly, p_detail_since: staffNotice.detailSince } : shortOnly);
      // If the full email is switched on before its migration is applied, the
      // three-argument function does not exist yet. Queue the short alert then,
      // so the switch can never silence staff notices.
      if (error && staffNotice.detailSince && (error.code === "PGRST202" || error.code === "42883")) {
        ({ error } = await getSupabaseAdmin().rpc("request_intent_enqueue_staff_notices", shortOnly));
        console.error("[outbox] full staff notices need the detail migration; short alerts queued instead");
      }
      if (error) console.error("[outbox] staff notice reconciliation failed");
    } catch {
      console.error("[outbox] staff notice reconciliation failed");
    }
  }

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
  const stale = await reclaimStaleProcessing(now, guard);
  if (stale.partial) {
    console.error(PARTIAL_INSTALL_MESSAGE);
    return result;
  }

  const customerNotice = requestCustomerNoticeConfig(process.env);
  // The same due filters serve the batch read and the designated-job count.
  const dueBase = (count = false): any => {
    let dueQuery: any = (count
      ? getSupabaseAdmin().from(OUTBOX).select("id", { count: "exact", head: true }) as any
      : getSupabaseAdmin().from(OUTBOX).select("*") as any)
      .in("status", [...OUTBOX_DUE_STATUSES])
      .lte("next_attempt_at", now.toISOString());
    // Paused staff jobs are left out in the query itself, so they cannot fill
    // the batch ahead of other mail.
    if (!staffNotice) dueQuery = dueQuery.neq("template_key", REQUEST_SUBMITTED_STAFF_TEMPLATE);
    if (!staffNotice?.detailSince) dueQuery = dueQuery.neq("template_key", REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE);
    // The workflow records customer notices whether or not this sender is on.
    // While it is off they wait, left out of the batch like paused staff jobs.
    if (!customerNotice) {
      for (const template of CUSTOMER_NOTICE_TEMPLATE_KEYS) dueQuery = dueQuery.neq("template_key", template);
    }
    return dueQuery;
  };
  const read = await readEligibleBatch(guard, (ordinaryOnly) => {
    const dueQuery = dueBase();
    return (ordinaryOnly ? dueQuery.eq("mail_disposition", ORDINARY_MAIL_DISPOSITION) : dueQuery).limit(20);
  });
  if (read.error) {
    console.error("[outbox] due read failed:", read.error.message);
    return result;
  }
  if (read.partial) {
    console.error(PARTIAL_INSTALL_MESSAGE);
    return result;
  }
  if (guard === "ready") {
    // The exact number of designated jobs that were due this pass, not capped by
    // the batch. If the count cannot be read, none is reported rather than a guess.
    const { count, error: countError } = await dueBase(true)
      .neq("mail_disposition", ORDINARY_MAIL_DISPOSITION);
    if (countError || typeof count !== "number") console.error("[outbox] designated no-mail count unavailable");
    else if (count > 0) result.withheld = count;
  }
  const due = read.rows;
  if (!due.length) return result;

  for (const job of due) {
    // Only an ordinary job, or any job on the schema before designations
    // existed, may be claimed. The batch is already filtered; this is per row.
    if (outboxMailEligibility(job, guard === "ready") === "withheld") continue;
    // Claim: only one runner may move it to processing. The claim also
    // records the attempt before any send, so a worker that dies after the
    // provider accepted still leaves durable evidence that a send may have
    // happened. Dispatch reads the row as it was before this claim.
    let claim = getSupabaseAdmin()
      .from(OUTBOX)
      .update(outboxClaimFields(now))
      .eq("id", job.id)
      .eq("status", job.status);
    // A designation that lands between the read and the claim still wins: the
    // claim matches no row, so there is no processing state, attempt or send.
    if (guard === "ready") claim = claim.eq("mail_disposition", ORDINARY_MAIL_DISPOSITION);
    const { data: claimed } = await claim.select().single();
    if (!claimed) continue;

    const attempt = (job.attempt_count ?? 0) + 1;
    const outcome = await dispatch(job, staffNotice, now, customerNotice);

    await getSupabaseAdmin().from(ATTEMPTS).insert(outboxAttemptRow(job.id, attempt, outcome));

    const fields = outboxCompletionFields(outcome, attempt, now);
    const guard = outboxCompletionGuard(now);
    const { data: completed, error: completionError } = await getSupabaseAdmin()
      .from(OUTBOX)
      .update(fields)
      .eq("id", job.id)
      .eq("status", guard.status)
      .eq("last_attempt_at", guard.last_attempt_at)
      .select("id");
    // The claim was reclaimed before this dispatch finished. The later claim
    // owns the row, its counters and any alert; the attempt row above stays.
    if (!completionError && Array.isArray(completed) && completed.length === 0) {
      console.error("[outbox] completion not recorded: the job was reclaimed before its dispatch finished");
      continue;
    }
    if (fields.status === "sent") {
      result.sent += 1;
    } else if (fields.status === "failed_permanent") {
      await alertPermanentFailure(job, outcome.error ?? null);
      result.failed += 1;
    } else if (fields.status === "failed_retryable") {
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
      // The guard status is read before the row and before any write.
      const guard = await readMailGuardStatus();
      if (guard === "withheld") {
        return res.status(503).json({
          ok: false,
          code: "mail_guard_unavailable",
          message: "Messages cannot be requeued until the no-mail guard is ready.",
        });
      }
      const { data: row } = await getSupabaseAdmin().from(OUTBOX).select("*").eq("id", id).maybeSingle();
      if (!row || !REQUEUEABLE.includes((row as any).status)) {
        return res.status(409).json({ ok: false, message: "Only failed or stuck messages can be requeued." });
      }
      // A designated no-mail job is refused before anything is written: no reset,
      // no pending state and no manual-requeue attempt row. Its real earlier
      // claim or failure evidence stays as it is.
      if (guard === "legacy" && mailDispositionInstalled(row)) {
        return res.status(503).json({
          ok: false,
          code: "mail_guard_unavailable",
          message: "Messages cannot be requeued until the no-mail guard is ready.",
        });
      }
      const installed = guard === "ready";
      if (outboxMailEligibility(row, installed) === "withheld") {
        return res.status(409).json({
          ok: false,
          code: "mail_withheld",
          message: "This message is held by a no-mail designation and cannot be requeued.",
        });
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
      // A processing row was claimed, so a send may have reached the provider.
      // Keep that evidence (a claim from before claims were stamped falls back
      // to its claim time), so the requeued job is never treated as unattempted.
      const attempted = (row as any).status === "processing"
        ? { last_attempt_at: (row as any).last_attempt_at ?? (row as any).updated_at ?? now }
        : {};
      let requeue = getSupabaseAdmin()
        .from(OUTBOX)
        .update({
          status: "pending",
          attempt_count: 0,
          next_attempt_at: now,
          last_error_summary: null,
          completed_at: null,
          updated_at: now,
          ...attempted,
        })
        .eq("id", id)
        .eq("status", (row as any).status);
      // A designation that lands after the read matches no row: the 409 below.
      if (installed) requeue = requeue.eq("mail_disposition", ORDINARY_MAIL_DISPOSITION);
      const { data: updated, error } = await requeue.select().single();
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

  // Safe booleans and counts only (Mega 1 section 8). Every outbox figure is
  // either an exact count or explicitly unavailable: a failed or missing read
  // is never reported as zero, and nothing is capped. If any figure is
  // unavailable the response is 503, so a reader that only knows the complete
  // shape shows "not reachable" instead of a false zero. The body still
  // carries the same safe fields, with null for each unavailable figure and
  // the list of what could not be read.
  app.get("/api/admin/research/system-status", requireSupabaseAdmin, async (_req, res) => {
    const email = await resolveEmailConfiguration();
    const storage = supabaseConfigured();
    const counts: Record<OutboxHealthStatus, number | null> = {
      pending: null,
      processing: null,
      failed_retryable: null,
      failed_permanent: null,
      sent: null,
    };
    const unavailable: string[] = [];
    for (const status of OUTBOX_HEALTH_STATUSES) {
      counts[status] = storage ? await countOutboxStatus(status) : null;
      if (counts[status] === null) unavailable.push(`outbox.${status}`);
    }
    const lastSent = storage ? await readLastSuccessfulSend() : { ok: false as const };
    if (!lastSent.ok) unavailable.push("lastSuccessfulSend");
    const complete = unavailable.length === 0;
    res.status(complete ? 200 : 503).json({
      ok: complete,
      ...(complete
        ? {}
        : { code: "system_status_incomplete", message: "Some system status figures could not be read." }),
      system: {
        supabaseConfigured: storage,
        emailProvider: email.provider,
        emailConfigured: email.provider !== "unavailable",
        verifiedSenderConfigured: Boolean(email.fromEmail),
        adminRecipientCount: adminRecipients().length,
        outbox: counts,
        lastSuccessfulSend: lastSent.ok ? lastSent.value : null,
        unavailable,
        workerRunning: Boolean(workerTimer),
        driveExportsEnabled: process.env.RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED === "true",
      },
    });
  });
}

const OUTBOX_HEALTH_STATUSES = ["pending", "processing", "failed_retryable", "failed_permanent", "sent"] as const;
type OutboxHealthStatus = (typeof OUTBOX_HEALTH_STATUSES)[number];

/** The exact number of outbox jobs in one status, or null when it cannot be read. */
async function countOutboxStatus(status: OutboxHealthStatus): Promise<number | null> {
  try {
    const { count, error } = await getSupabaseAdmin()
      .from(OUTBOX)
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (error || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return null;
    return count;
  } catch {
    return null;
  }
}

/** The newest completed send. `value: null` means a successful read that found none. */
async function readLastSuccessfulSend(): Promise<{ ok: true; value: string | null } | { ok: false }> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(OUTBOX)
      .select("completed_at")
      .eq("status", "sent")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error || !Array.isArray(data)) return { ok: false };
    const value = (data[0] as { completed_at?: unknown } | undefined)?.completed_at;
    if (value === undefined || value === null) return { ok: true, value: null };
    return typeof value === "string" ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}
