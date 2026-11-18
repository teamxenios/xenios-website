import { z } from "zod";
import { getResendClient } from "../../../services/email";
import { getSupabaseAdmin } from "../../../supabase";

/**
 * Customer notices for the request workflow. The workflow records one notice
 * per business event, in the event's own transaction, under the key
 * `ea-request-customer-<event id>`. This module only sends what was recorded.
 */
export const CUSTOMER_NOTICE_TEMPLATES = {
  request_received_queued: "ea_request_received_queued_customer_v1",
  request_reviewing: "ea_request_reviewing_customer_v1",
} as const;
export type CustomerNoticeKind = keyof typeof CUSTOMER_NOTICE_TEMPLATES;
export const CUSTOMER_NOTICE_TEMPLATE_KEYS: readonly string[] = Object.values(CUSTOMER_NOTICE_TEMPLATES);
export const CUSTOMER_NOTICE_DELIVERY_RPC = "request_intent_customer_notice_delivery";

/**
 * Resend recognises a repeated idempotency key for 24 hours, and a notice that
 * arrives a day late no longer describes what the customer is waiting for. So
 * none is sent more than this long after it was recorded.
 */
export const CUSTOMER_NOTICE_SEND_LIMIT_MS = 23 * 60 * 60 * 1000;

export const CUSTOMER_NOTICE_BEFORE_START = "Not sent: recorded before customer notices were switched on.";
/** The database projection reads this exact text as "may have been delivered". */
export const CUSTOMER_NOTICE_UNCONFIRMED = "Customer notice send had no confirmed result.";
export const CUSTOMER_NOTICE_REFUSED = "Customer notice was refused by the mail provider.";

const timestamp = z.string().datetime({ offset: true });
const environment = z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/);
const address = z.string().max(254).regex(/^[a-z0-9._+%-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
const payloadSchema = z.object({
  reference: z.string().regex(/^XRI-[0-9A-F]{32}$/),
  eventAt: timestamp,
  kind: z.enum(["request_received_queued", "request_reviewing"]),
  revision: z.number().int().nonnegative(),
  environment,
}).strict();
const deliverySchema = z.object({ address: z.string().nullable(), superseded: z.boolean() }).strict();
const eventKey = /^ea-request-customer-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const centralTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago",
});

/**
 * Off unless the switch is "true", the start time is a timestamp and the
 * workflow's own environment name is set. The environment is the workflow's
 * setting, read here, so the two can never name different deployments.
 */
export function requestCustomerNoticeConfig(env: NodeJS.ProcessEnv) {
  if (env.EA_REQUEST_CUSTOMER_NOTICE_ENABLED !== "true") return null;
  const since = timestamp.safeParse(env.EA_REQUEST_CUSTOMER_NOTICE_START_AT);
  const deployment = environment.safeParse(env.RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT);
  if (!since.success || !deployment.success) return null;
  return { since: since.data, environment: deployment.data };
}
export type CustomerNoticeConfig = NonNullable<ReturnType<typeof requestCustomerNoticeConfig>>;

type CustomerNoticeJob = {
  event_key: unknown;
  event_type: unknown;
  template_key?: unknown;
  recipient: unknown;
  payload: unknown;
  created_at?: unknown;
  last_attempt_at?: unknown;
};

export type CustomerNoticeResult = {
  ok: boolean;
  providerId: string | null;
  error?: string;
  nonRetryable?: boolean;
  /** Deliberately not sent and never tried: closed without a failure alert. */
  cancel?: boolean;
};

export type RenderedCustomerNotice = Readonly<{ subject: string; text: string; html: string }>;

// The wording is the proposed integration copy for these two events, in its
// form for a request with no online status page: no button and no link. Its
// reply invitation is left out until a monitored reply route is proven.
const KEEP = "Keep this reference. The team will contact you at the address you supplied when there is an update or if more information is needed.";
const NO_RESEND = "You do not need to submit again.";
const RECEIPT_ONLY = "This is a request receipt. It is not a purchase, prescription or shipment confirmation.";

type NoticeCopy = Readonly<{
  subject: (reference: string) => string;
  heading: string;
  milestone: (reference: string, at: string) => string;
  footer?: string;
}>;
const COPY: Record<CustomerNoticeKind, NoticeCopy> = {
  request_received_queued: {
    subject: (reference) => `Your request is in the review queue · ${reference}`,
    heading: "Received and added to the review queue",
    milestone: (reference, at) => `Request ${reference} was received and added to our review queue at ${at}.`,
    footer: RECEIPT_ONLY,
  },
  request_reviewing: {
    subject: (reference) => `Your request is being reviewed · ${reference}`,
    heading: "Review has started",
    milestone: (reference, at) => `The team started reviewing request ${reference} at ${at}.`,
  },
};

/**
 * The same message on every attempt: it is built from the kind, the reference
 * and the event time alone. It names no product, address, goal or price. It
 * carries no link and invites no reply, because a request has no online
 * status page and no reply route has been proven.
 */
export function renderCustomerNotice(kind: CustomerNoticeKind, reference: string, eventAt: string): RenderedCustomerNotice {
  const copy = COPY[kind];
  const milestone = copy.milestone(reference, `${centralTime.format(new Date(eventAt))} Central`);
  const paragraphs = [milestone, KEEP, NO_RESEND, ...(copy.footer ? [copy.footer] : [])];
  const text = [copy.heading, ...paragraphs].join("\n\n");
  const html = `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111">`
    + `<div style="max-width:560px;margin:0 auto;overflow-wrap:anywhere">`
    + `<h1 style="font-size:20px;margin:0 0 14px">${copy.heading}</h1>`
    + paragraphs.map((value) => `<p style="margin:0 0 14px;line-height:1.5">${value}</p>`).join("")
    + `</div></body></html>`;
  return { subject: copy.subject(reference), text, html };
}

export type CustomerNoticeDeliveryReader = (eventKey: string) => Promise<unknown>;

/** Throws on a failed read, so the outbox retries instead of guessing an address. */
export const readCustomerNoticeDelivery: CustomerNoticeDeliveryReader = async (key) => {
  const { data, error } = await getSupabaseAdmin().rpc(CUSTOMER_NOTICE_DELIVERY_RPC, { p_event_key: key });
  if (error) throw new Error("Customer notice delivery read failed.");
  return data;
};

// Provider answers that say the message was not taken. Anything else, a
// thrown error or a reply without an id leaves the result unknown.
const DEFINITE_REFUSALS = new Set([
  "missing_required_field", "invalid_idempotency_key", "invalid_access", "invalid_parameter", "invalid_region",
  "rate_limit_exceeded", "missing_api_key", "invalid_api_Key", "invalid_from_address", "validation_error",
  "not_found", "method_not_allowed",
]);

const held = (error: string): CustomerNoticeResult => ({ ok: false, providerId: null, nonRetryable: true, error });
const later = (error: string): CustomerNoticeResult => ({ ok: false, providerId: null, error });

export async function sendRequestCustomerNotice(
  job: CustomerNoticeJob,
  sender: Readonly<{ from: string }>,
  config: CustomerNoticeConfig,
  env: NodeJS.ProcessEnv = process.env,
  readDelivery: CustomerNoticeDeliveryReader = readCustomerNoticeDelivery,
  now: Date = new Date(),
): Promise<CustomerNoticeResult> {
  const payload = payloadSchema.safeParse(job.payload);
  if (!payload.success || typeof job.event_key !== "string" || !eventKey.test(job.event_key)
    || job.event_type !== CUSTOMER_NOTICE_TEMPLATES[payload.data.kind]
    || (job.template_key !== undefined && job.template_key !== job.event_type)
    || job.recipient !== "customer:" + payload.data.reference) {
    return held("Invalid customer notice binding.");
  }
  const { reference, eventAt, kind } = payload.data;
  const tried = job.last_attempt_at != null;
  const created = typeof job.created_at === "string" ? Date.parse(job.created_at) : Number.NaN;
  if (!Number.isFinite(created)) return held("Invalid customer notice binding.");
  if (payload.data.environment !== config.environment) return held("Not sent: recorded for another environment.");
  if (created < Date.parse(config.since)) {
    return tried ? held("Not resent: recorded before customer notices were switched on.")
      : { ok: false, providerId: null, cancel: true, error: CUSTOMER_NOTICE_BEFORE_START };
  }
  if (now.getTime() - created > CUSTOMER_NOTICE_SEND_LIMIT_MS) {
    return held(tried
      ? "Not resent: an earlier attempt is past the provider's 24-hour duplicate check. Open the request in the private queue."
      : "Not sent: recorded more than 23 hours ago. Open the request in the private queue.");
  }
  if (!env.RESEND_API_KEY?.trim()) return later("Customer notice email is unconfigured.");
  if (!sender.from.trim()) return later("Customer notice sender is unconfigured.");

  let raw: unknown;
  try {
    raw = await readDelivery(job.event_key);
  } catch {
    return later("Customer notice delivery facts were unavailable.");
  }
  if (raw === null || raw === undefined) return held("Not sent: no saved request for this notice.");
  const delivery = deliverySchema.safeParse(raw);
  if (!delivery.success) return later("Customer notice delivery facts were unavailable.");
  // A later event for the same request has its own notice. This one would now
  // tell the customer something that is no longer current.
  if (delivery.data.superseded) {
    return tried ? held("Not resent: a later update replaced this one after an earlier attempt.")
      : { ok: false, providerId: null, cancel: true, error: "Not sent: a later update replaced this one." };
  }
  const to = address.safeParse(delivery.data.address);
  if (!to.success) return held("Not sent: the saved contact address cannot be used for email.");

  try {
    const { client } = await getResendClient();
    const { data, error } = await client.emails.send({
      from: sender.from,
      to: to.data,
      ...renderCustomerNotice(kind, reference, eventAt),
    }, { idempotencyKey: job.event_key });
    if (!error && data?.id) return { ok: true, providerId: data.id };
    if (error && DEFINITE_REFUSALS.has(String((error as { name?: unknown }).name))) return later(CUSTOMER_NOTICE_REFUSED);
  } catch {
    // The outbox worker records a sanitized failure and retries independently.
  }
  return later(CUSTOMER_NOTICE_UNCONFIRMED);
}
