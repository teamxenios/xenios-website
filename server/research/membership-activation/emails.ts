// ---------------------------------------------------------------------------
// xenios research founding membership activation: the email catalog.
//
// Every founding-membership notification is an OUTBOX row first (the durable
// research_notification_outbox path in server/research/outbox.ts), enqueued
// through the one existing enqueue function, never a second email system. This
// module owns:
//
//   - the 24 template keys of the activation spec (17 lifecycle moments plus
//     the 7 renewal notices renewals.ts defines as data), with the
//     member-facing subject and body copy carried as DATA so the renderer
//     wave consumes one source of truth,
//   - the mapping from the renewals.ts notice schedule to concrete, dated
//     notice instances for one obligation, and an idempotent enqueue for the
//     instances that are due,
//   - the enqueue helpers the surface composition calls at domain
//     transitions, each with a deterministic event key so a retried request
//     or repeated tick can never double-send (the outbox unique event_key is
//     the guarantee).
//
// HARD RULE, enforced structurally here and by test: receiving instructions
// (payment destinations, handles, cash tags, account identifiers) NEVER
// appear in any email. The payload builder accepts only the allow-listed
// fields below, and a payload key that smells like instruction material is
// refused loudly. Emails carry the method LABEL and the XRM memo reference
// only; a member gets the destination inside the authenticated portal, never
// over email.
// ---------------------------------------------------------------------------

import {
  DEFAULT_RENEWAL_POLICY,
  NO_AUTOMATIC_BILLING_CONTRACT,
  renewalNoticeSchedule,
  type RenewalPolicy,
} from "./renewals";
import { SUBMISSION_DISPLAY_CONTRACT, type ObligationRecord } from "./obligations";

// ---------------------------------------------------------------------------
// The enqueue seam (the existing outbox enqueue function's exact shape)
// ---------------------------------------------------------------------------

export interface FoundingEmailEnqueueInput {
  eventKey: string;
  eventType: string;
  templateKey: string;
  recipient: string;
  applicationId?: string | null;
  payload?: Record<string, unknown>;
}

export type FoundingEmailEnqueue = (input: FoundingEmailEnqueueInput) => Promise<boolean>;

// ---------------------------------------------------------------------------
// The 24 templates
// ---------------------------------------------------------------------------

export interface FoundingEmailTemplate {
  key: string;
  subject: string;
  /** Member-facing body copy, line by line, as data for the renderer wave. */
  bodyLines: readonly string[];
  audience: "member";
}

function template(key: string, subject: string, bodyLines: readonly string[]): FoundingEmailTemplate {
  return { key, subject, bodyLines, audience: "member" };
}

const PORTAL_LINE = "Sign in to your member portal for the details and next steps.";

/**
 * The 17 lifecycle templates. Amounts, references, and method LABELS are
 * payload variables; no body line ever carries a payment destination.
 */
const LIFECYCLE_TEMPLATES: readonly FoundingEmailTemplate[] = [
  template("fm_activation_obligation_created", "Your founding membership activation is ready", [
    "Your $50 founding membership activation is ready to pay.",
    "Your payment reference is {{xeniosRef}}. Include it with your payment so we can match it to you.",
    "The payment destination is shown inside your member portal only, never in email.",
    PORTAL_LINE,
  ]),
  template("fm_payment_report_received", "We received your payment report", [
    "We received the payment report for {{xeniosRef}}.",
    SUBMISSION_DISPLAY_CONTRACT,
    PORTAL_LINE,
  ]),
  template("fm_payment_info_requested", "We need one more detail about your payment", [
    "We need a little more information to verify the payment reported for {{xeniosRef}}.",
    PORTAL_LINE,
  ]),
  template("fm_payment_mismatch", "Your reported payment does not match what we expected", [
    "The payment reported for {{xeniosRef}} does not match what we expected, so it is on hold for review.",
    PORTAL_LINE,
  ]),
  template("fm_payment_duplicate", "Your payment report needs a second look", [
    "The payment reported for {{xeniosRef}} matched an earlier report, so a person is taking a second look.",
    PORTAL_LINE,
  ]),
  template("fm_payment_rejected", "Your payment report was declined", [
    "The payment reported for {{xeniosRef}} could not be verified and was declined.",
    "You can submit a corrected report from your member portal.",
  ]),
  template("fm_payment_verified_receipt", "Your payment is verified. Receipt {{receiptNumber}}", [
    "We verified your {{methodLabel}} payment of {{amount}} for {{xeniosRef}}.",
    "Your receipt number is {{receiptNumber}}. The full receipt is in your member portal.",
  ]),
  template("fm_membership_activated", "Your founding membership is active", [
    "Your founding membership is active as of {{effectiveAt}}.",
    "Your first 30 days are included in your activation payment. Your first $25 renewal is due {{renewalDueAt}}.",
    NO_AUTOMATIC_BILLING_CONTRACT,
    PORTAL_LINE,
  ]),
  template("fm_renewal_obligation_created", "Your next renewal is scheduled", [
    "Your next $25 membership renewal is due {{renewalDueAt}} with reference {{xeniosRef}}.",
    NO_AUTOMATIC_BILLING_CONTRACT,
  ]),
  template("fm_renewal_verified", "Your membership renewal is confirmed", [
    "We verified your renewal payment for {{xeniosRef}}.",
    "Your membership is covered through {{coveredThrough}}.",
    NO_AUTOMATIC_BILLING_CONTRACT,
  ]),
  template("fm_membership_suspended", "Your membership is suspended", [
    "Your membership was suspended because a renewal was not received in time.",
    "You can restore access by sending your renewal and reporting it in the portal; a person verifies every payment.",
  ]),
  template("fm_membership_reinstated", "Your membership is restored", [
    "Your renewal was verified and your membership is active again, covered through {{coveredThrough}}.",
  ]),
  template("fm_payment_reversed", "A verified payment was reversed", [
    "A payment previously verified for {{xeniosRef}} was reversed by the sender or their bank.",
    PORTAL_LINE,
  ]),
  template("fm_payment_refunded", "Your payment was refunded", [
    "Your payment for {{xeniosRef}} was refunded by Xenios.",
    PORTAL_LINE,
  ]),
  template("fm_obligation_cancelled", "A payment obligation was closed", [
    "The obligation {{xeniosRef}} was closed without payment. Nothing is due on it.",
  ]),
  template("fm_identity_verified", "Your identity check is complete", [
    "A member of our team confirmed your legal name and age requirement. This step of activation is complete.",
  ]),
  template("fm_identity_rejected", "Your identity check needs another try", [
    "We could not complete your identity check: {{rejectionCategory}}.",
    "You can try again from your member portal. Your uploaded document is deleted on schedule either way.",
  ]),
];

/** The renewal notice bodies, one per notice key renewals.ts defines. */
const NOTICE_BODY: Record<string, readonly string[]> = {
  fm_renewal_upcoming_7d: ["Your $25 membership renewal {{xeniosRef}} is due in 7 days, on {{dueAt}}."],
  fm_renewal_upcoming_3d: ["Your $25 membership renewal {{xeniosRef}} is due in 3 days, on {{dueAt}}."],
  fm_renewal_due_today: ["Your $25 membership renewal {{xeniosRef}} is due today."],
  fm_renewal_overdue_1d: ["Your $25 membership renewal {{xeniosRef}} was due yesterday and has not been verified yet."],
  fm_renewal_grace_started: [
    "Your renewal {{xeniosRef}} is past due and your membership has entered its grace window.",
  ],
  fm_renewal_suspension_warning: [
    "Your membership will be suspended soon if the renewal {{xeniosRef}} is not received and verified.",
  ],
  fm_renewal_suspension_confirmed: [
    "Your membership is suspended. Send and report your renewal {{xeniosRef}} to restore access.",
  ],
};

const NOTICE_SUBJECT: Record<string, string> = {
  fm_renewal_upcoming_7d: "Your membership renewal is due in 7 days",
  fm_renewal_upcoming_3d: "Your membership renewal is due in 3 days",
  fm_renewal_due_today: "Your membership renewal is due today",
  fm_renewal_overdue_1d: "Your membership renewal is past due",
  fm_renewal_grace_started: "Your membership entered its grace window",
  fm_renewal_suspension_warning: "Your membership will be suspended soon",
  fm_renewal_suspension_confirmed: "Your membership is suspended",
};

/** The 7 notice templates, derived from the renewals.ts schedule DATA so the
 * two can never drift: a schedule entry without copy here is a build error the
 * test catches, and every notice body carries the no-automatic-billing line. */
const NOTICE_TEMPLATES: readonly FoundingEmailTemplate[] = renewalNoticeSchedule().map((notice) => {
  const body = NOTICE_BODY[notice.template];
  const subject = NOTICE_SUBJECT[notice.template];
  if (!body || !subject) {
    throw new Error(`renewal notice ${notice.template} has no email copy registered`);
  }
  return template(notice.template, subject, [...body, NO_AUTOMATIC_BILLING_CONTRACT]);
});

/** The complete catalog: 17 lifecycle templates + 7 renewal notices = 24. */
export const FOUNDING_EMAIL_TEMPLATES: readonly FoundingEmailTemplate[] = [
  ...LIFECYCLE_TEMPLATES,
  ...NOTICE_TEMPLATES,
];

export const FOUNDING_EMAIL_TEMPLATE_KEYS: readonly string[] = FOUNDING_EMAIL_TEMPLATES.map((t) => t.key);

const TEMPLATE_BY_KEY: ReadonlyMap<string, FoundingEmailTemplate> = new Map(
  FOUNDING_EMAIL_TEMPLATES.map((t) => [t.key, t]),
);

export function foundingEmailTemplate(key: string): FoundingEmailTemplate {
  const found = TEMPLATE_BY_KEY.get(key);
  if (!found) throw new Error(`Unknown founding email template ${key}.`);
  return found;
}

// ---------------------------------------------------------------------------
// Payload discipline: no instruction material has a field to travel in
// ---------------------------------------------------------------------------

/** Payload keys that smell like payment-destination material are refused. */
export const FORBIDDEN_EMAIL_PAYLOAD_KEY_PATTERNS: readonly RegExp[] = [
  /instruction/i,
  /receiving/i,
  /destination/i,
  /handle/i,
  /cash.?tag/i,
  /account/i,
  /routing/i,
  /iban/i,
  /deep.?link/i,
];

export class EmailPayloadRefused extends Error {
  constructor(keys: string[]) {
    super(
      `An email payload carried forbidden keys (${keys.join(", ")}). ` +
        "Receiving instructions never travel in email.",
    );
    this.name = "EmailPayloadRefused";
  }
}

export function assertEmailPayloadSafe(payload: Record<string, unknown>): void {
  const offending = Object.keys(payload).filter((key) =>
    FORBIDDEN_EMAIL_PAYLOAD_KEY_PATTERNS.some((pattern) => pattern.test(key)),
  );
  if (offending.length > 0) throw new EmailPayloadRefused(offending);
}

// ---------------------------------------------------------------------------
// Enqueue helpers (deterministic event keys, idempotent through the outbox)
// ---------------------------------------------------------------------------

export const FOUNDING_EMAIL_EVENT_TYPE = "founding_membership_activation";

/** One deterministic key per (template, subject id): a replayed transition
 * cannot enqueue a second copy because the outbox event_key is unique. */
export function foundingEmailEventKey(templateKey: string, subjectId: string): string {
  return `fm:${templateKey}:${subjectId}`;
}

/**
 * Enqueue one founding-membership email through the EXISTING outbox enqueue.
 * The payload is checked against the forbidden-key patterns first, so
 * instruction material is refused before it can reach a row. Failures are the
 * caller's to swallow: email must never block a money action.
 */
export async function enqueueFoundingEmail(
  enqueue: FoundingEmailEnqueue,
  input: {
    templateKey: string;
    recipient: string;
    /** The id the event key is derived from (obligation id, case id). */
    subjectId: string;
    payload?: Record<string, unknown>;
  },
): Promise<boolean> {
  const templateRecord = foundingEmailTemplate(input.templateKey);
  const payload = input.payload ?? {};
  assertEmailPayloadSafe(payload);
  return enqueue({
    eventKey: foundingEmailEventKey(templateRecord.key, input.subjectId),
    eventType: FOUNDING_EMAIL_EVENT_TYPE,
    templateKey: templateRecord.key,
    recipient: input.recipient,
    payload,
  });
}

// ---------------------------------------------------------------------------
// The renewal notice schedule, mapped to concrete dated instances
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RenewalNoticeInstance {
  key: string;
  templateKey: string;
  /** The instant this notice becomes due to send. */
  sendAt: string;
}

/** The renewals.ts notice schedule projected onto one obligation's due date. */
export function renewalNoticeInstances(
  dueAtIso: string,
  policy: RenewalPolicy = DEFAULT_RENEWAL_POLICY,
): RenewalNoticeInstance[] {
  const dueMs = Date.parse(dueAtIso);
  if (!Number.isFinite(dueMs)) throw new Error(`Not a valid due date: ${dueAtIso}`);
  return renewalNoticeSchedule(policy).map((notice) => ({
    key: notice.key,
    templateKey: notice.template,
    sendAt: new Date(dueMs + notice.offsetDaysFromDue * DAY_MS).toISOString(),
  }));
}

/** Statuses a notice still makes sense for: money is still owed. */
const NOTICEABLE_STATUSES: ReadonlySet<string> = new Set([
  "upcoming",
  "due",
  "overdue",
  "in_grace",
  "suspended",
]);

/**
 * Enqueue every renewal notice that is DUE at `now` for the given renewal
 * obligations. Pure over its inputs plus the injected enqueue; safe to call
 * from any scheduler tick because the event key is deterministic per
 * (obligation, notice), so a repeated tick re-enqueues nothing (the outbox
 * unique event_key absorbs it). Verified, terminal, and mid-review
 * obligations get no reminders: a human is already in the loop.
 */
export async function enqueueDueRenewalNotices(input: {
  obligations: readonly ObligationRecord[];
  recipientFor: (memberId: string) => Promise<string | null>;
  enqueue: FoundingEmailEnqueue;
  now: Date;
  policy?: RenewalPolicy;
}): Promise<number> {
  let enqueued = 0;
  for (const obligation of input.obligations) {
    if (obligation.type !== "renewal_25") continue;
    if (!NOTICEABLE_STATUSES.has(obligation.status)) continue;
    const recipient = await input.recipientFor(obligation.memberId);
    if (!recipient) continue;
    for (const notice of renewalNoticeInstances(obligation.dueAt, input.policy)) {
      if (Date.parse(notice.sendAt) > input.now.getTime()) continue;
      const ok = await enqueueFoundingEmail(input.enqueue, {
        templateKey: notice.templateKey,
        recipient,
        subjectId: `${obligation.obligationId}:${notice.key}`,
        payload: { xeniosRef: obligation.humanRef, dueAt: obligation.dueAt },
      });
      if (ok) enqueued += 1;
    }
  }
  return enqueued;
}
