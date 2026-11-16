import { z } from "zod";
import { getResendClient } from "../../../services/email";
import { getSupabaseAdmin } from "../../../supabase";

export const REQUEST_SUBMITTED_STAFF_TEMPLATE = "ea_request_submitted_staff_v1";
/** Queued for requests created after the detail cutoff. The template, never a setting, picks the body. */
export const REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE = "ea_request_submitted_staff_full_v1";
export const STAFF_NOTICE_DETAIL_RPC = "request_intent_staff_notice_detail";

const address = z.string().max(254).regex(/^[a-z0-9._+%-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
const twoRecipients = z.tuple([address, address]).refine(([first, second]) => first !== second);
const timestamp = z.string().datetime({ offset: true });
const payloadSchema = z.object({
  reference: z.string().regex(/^XRI-[0-9A-F]{32}$/),
  submittedAt: timestamp,
  itemCount: z.number().int().positive(),
  recipients: twoRecipients,
}).strict();

type StaffNoticeJob = {
  event_key: unknown;
  event_type: unknown;
  template_key?: unknown;
  recipient: unknown;
  payload: unknown;
  created_at?: unknown;
  last_attempt_at?: unknown;
};

/**
 * Resend recognises a repeated idempotency key for 24 hours. A job tried before
 * may already have been delivered with its response lost, so once it is older
 * than this it is not sent again. The job's creation time is used because it is
 * never later than the first attempt, which leaves an hour's margin at least.
 */
export const STAFF_NOTICE_RESEND_LIMIT_MS = 23 * 60 * 60 * 1000;

const eventKey = /^ea-request-submitted-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const centralTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago",
});

export function requestSubmittedStaffNoticeConfig(env: NodeJS.ProcessEnv) {
  if (env.EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED !== "true") return null;
  const recipients = twoRecipients.safeParse(env.EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS
    ?.split(",").map(email => email.trim().toLowerCase()));
  const since = timestamp.safeParse(env.EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT);
  if (!recipients.success || !since.success) return null;
  let site: URL;
  try { site = new URL(env.SITE_URL ?? ""); } catch { return null; }
  if (site.protocol !== "https:" || site.pathname !== "/" || site.search || site.hash || site.username || site.password) return null;
  // The full request email has its own switch and cutoff. Without both, new
  // jobs are queued as the short alert and queued full jobs wait, unsent.
  const detailSince = env.EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL === "full"
    ? timestamp.safeParse(env.EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT) : null;
  return {
    since: since.data,
    recipients: recipients.data,
    queueUrl: new URL("/care/request-intents", site).href,
    detailSince: detailSince?.success ? detailSince.data : null,
  };
}

type StaffNoticeConfig = NonNullable<ReturnType<typeof requestSubmittedStaffNoticeConfig>>;

type MailResult = {
  ok: boolean;
  providerId: string | null;
  error?: string;
  nonRetryable?: boolean;
};

// ---------------------------------------------------------------------------
// The request as submitted, mapped field by field. Anything else the reader
// returns is dropped here, so it can never reach the email or a log.
// ---------------------------------------------------------------------------
const text = (max: number) => z.string().min(1).max(max);
const addressSchema = z.object({
  line1: text(200), line2: text(200).optional(), city: text(200),
  region: text(200), postalCode: text(200), countryCode: text(200),
});
const detailSchema = z.object({
  reference: z.string().regex(/^XRI-[0-9A-F]{32}$/),
  submittedAt: timestamp,
  contact: z.object({
    fullLegalName: text(320),
    email: text(320),
    mobilePhone: text(320),
    organizationName: text(320).optional(),
    shippingAddress: addressSchema.optional(),
    billingSameAsShipping: z.boolean(),
    billingAddress: addressSchema.optional(),
  }),
  lines: z.array(z.object({
    productName: text(300),
    specification: text(300).nullable().optional(),
    variantId: text(300),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(200),
});

type NoticeAddress = Readonly<{
  line1: string; line2?: string; city: string; region: string; postalCode: string; countryCode: string;
}>;
export type StaffNoticeDetail = Readonly<{
  reference: string;
  submittedAt: string;
  contact: Readonly<{
    fullLegalName: string;
    email: string;
    mobilePhone: string;
    organizationName?: string;
    shippingAddress: NoticeAddress | null;
    billingSameAsShipping: boolean;
    billingAddress: NoticeAddress | null;
  }>;
  lines: readonly Readonly<{ productName: string; specification: string | null; variantId: string; quantity: number }>[];
}>;

function mapAddress(value: z.infer<typeof addressSchema> | undefined): NoticeAddress | null {
  if (!value) return null;
  return {
    line1: value.line1, ...(value.line2 ? { line2: value.line2 } : {}), city: value.city,
    region: value.region, postalCode: value.postalCode, countryCode: value.countryCode,
  };
}

export function mapStaffNoticeDetail(raw: unknown): StaffNoticeDetail | null {
  const parsed = detailSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { reference, submittedAt, contact, lines } = parsed.data;
  return {
    reference,
    submittedAt,
    contact: {
      fullLegalName: contact.fullLegalName,
      email: contact.email,
      mobilePhone: contact.mobilePhone,
      ...(contact.organizationName ? { organizationName: contact.organizationName } : {}),
      shippingAddress: mapAddress(contact.shippingAddress),
      billingSameAsShipping: contact.billingSameAsShipping,
      billingAddress: contact.billingSameAsShipping ? null : mapAddress(contact.billingAddress),
    },
    lines: lines.map(line => ({
      productName: line.productName,
      specification: line.specification ?? null,
      variantId: line.variantId,
      quantity: line.quantity,
    })),
  };
}

// Customer text is shown as one line: no control characters, no line breaks,
// and no direction overrides that could make it display in a different order.
function plain(value: string): string {
  return value.replace(/[\u202a-\u202e\u2066-\u2069]/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function html(value: string): string {
  return plain(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addressLines(value: NoticeAddress): string[] {
  return [
    value.line1,
    ...(value.line2 ? [value.line2] : []),
    `${value.city}, ${value.region} ${value.postalCode}`,
    value.countryCode,
  ].map(plain);
}

export function requestLink(queueUrl: string, reference: string): string {
  const url = new URL(queueUrl);
  url.searchParams.set("reference", reference);
  return url.href;
}

export type RenderedStaffNotice = Readonly<{ subject: string; text: string; html: string }>;

/** Renders the full request email in plain text and HTML from mapped fields only. */
export function renderFullStaffNotice(detail: StaffNoticeDetail, queueUrl: string): RenderedStaffNotice {
  const { contact, lines, reference } = detail;
  const submitted = `${centralTime.format(new Date(detail.submittedAt))} Central`;
  const link = requestLink(queueUrl, reference);
  const billing = contact.billingSameAsShipping ? ["Same as shipping"]
    : contact.billingAddress ? addressLines(contact.billingAddress) : ["Not provided"];
  const shipping = contact.shippingAddress ? addressLines(contact.shippingAddress) : ["Not provided"];
  const customer = [
    `Name: ${plain(contact.fullLegalName)}`,
    `Email: ${plain(contact.email)}`,
    `Mobile: ${plain(contact.mobilePhone)}`,
    ...(contact.organizationName ? [`Organization: ${plain(contact.organizationName)}`] : []),
  ];
  const items = lines.flatMap((line, index) => [
    `${index + 1}. ${plain(line.productName)}`,
    `   Specification: ${line.specification ? plain(line.specification) : "Not stated"}`,
    `   Variant: ${plain(line.variantId)}`,
    `   Quantity: ${line.quantity}`,
  ]);
  const textBody = [
    `Request ${reference}`,
    `Submitted ${submitted}`,
    "",
    "Customer",
    ...customer,
    "",
    "Shipping address",
    ...shipping,
    "",
    "Billing address",
    ...billing,
    "",
    `Requested items (${lines.length})`,
    ...items,
    "",
    "Open this request in the private staff queue (sign-in required):",
    link,
  ].join("\n");

  const cell = "padding:8px 0;border-top:1px solid #e5e5e5;vertical-align:top";
  const section = (title: string, rows: readonly string[]) =>
    `<h2 style="font-size:16px;margin:20px 0 6px">${html(title)}</h2>`
    + `<p style="margin:0;line-height:1.5">${rows.join("<br>")}</p>`;
  const itemRows = lines.map((line, index) => `<tr>`
    + `<td style="${cell};padding-right:12px">${index + 1}.</td>`
    + `<td style="${cell};width:100%"><strong>${html(line.productName)}</strong><br>`
    + `Specification: ${line.specification ? html(line.specification) : "Not stated"}<br>`
    + `<span style="font-family:monospace;font-size:13px;color:#555">Variant: ${html(line.variantId)}</span></td>`
    + `<td style="${cell};padding-left:12px;white-space:nowrap;text-align:right">Qty <strong>${line.quantity}</strong></td>`
    + `</tr>`).join("");
  const htmlBody = `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111">`
    + `<div style="max-width:560px;margin:0 auto">`
    + `<h1 style="font-size:20px;margin:0 0 4px">Request ${html(reference)}</h1>`
    + `<p style="margin:0;color:#555">Submitted ${html(submitted)}</p>`
    + section("Customer", customer.map(html))
    + section("Shipping address", shipping.map(html))
    + section("Billing address", billing.map(html))
    + `<h2 style="font-size:16px;margin:20px 0 6px">Requested items (${lines.length})</h2>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${itemRows}</table>`
    + `<p style="margin:24px 0 0"><a href="${html(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px">Open in the private staff queue</a></p>`
    + `<p style="margin:8px 0 0;color:#555;font-size:13px">Sign-in required.</p>`
    + `</div></body></html>`;
  return { subject: `New Early Access request ${reference}`, text: textBody, html: htmlBody };
}

export type StaffNoticeDetailReader = (eventKey: string) => Promise<unknown>;

/** Throws on a failed read, so the outbox retries instead of sending less. */
export const readStaffNoticeDetail: StaffNoticeDetailReader = async (key) => {
  const { data, error } = await getSupabaseAdmin().rpc(STAFF_NOTICE_DETAIL_RPC, { p_event_key: key });
  if (error) throw new Error("Staff notice detail read failed.");
  return data;
};

export async function sendRequestSubmittedStaffNotice(
  job: StaffNoticeJob, config: StaffNoticeConfig, env = process.env,
  readDetail: StaffNoticeDetailReader = readStaffNoticeDetail,
  now: Date = new Date(),
): Promise<MailResult> {
  const payload = payloadSchema.safeParse(job.payload);
  const full = job.event_type === REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE;
  if (!payload.success || typeof job.event_key !== "string" || !eventKey.test(job.event_key)
    || (job.event_type !== REQUEST_SUBMITTED_STAFF_TEMPLATE && !full)
    || (job.template_key !== undefined && job.template_key !== job.event_type)
    || job.recipient !== config.recipients[0]
    || payload.data.recipients.some((email, index) => email !== config.recipients[index])
    || payload.data.reference !== "XRI-" + job.event_key.slice("ea-request-submitted-".length).replace(/-/g, "").toUpperCase()) {
    return { ok: false, providerId: null, error: "Invalid staff notice binding.", nonRetryable: true };
  }
  if (job.last_attempt_at != null) {
    const created = typeof job.created_at === "string" ? Date.parse(job.created_at) : Number.NaN;
    if (!Number.isFinite(created) || now.getTime() - created > STAFF_NOTICE_RESEND_LIMIT_MS) {
      return {
        ok: false, providerId: null, nonRetryable: true,
        error: "Not resent: an earlier attempt is past the provider's 24-hour duplicate check. Open the request in the private queue.",
      };
    }
  }
  if (!env.RESEND_API_KEY?.trim()) {
    return { ok: false, providerId: null, error: "Staff notice email is unconfigured." };
  }

  const { reference, itemCount, submittedAt } = payload.data;
  const shortLines = [
    `Request ${reference}`,
    `Submitted ${centralTime.format(new Date(submittedAt))} Central`,
    `Items: ${itemCount}`,
    `Private staff queue: ${config.queueUrl}`,
  ];
  let message: { subject: string; text: string; html?: string } = {
    subject: "New Early Access request",
    text: shortLines.join("\n"),
  };
  // The job's own template decides the body, so every retry sends the same one.
  if (full) {
    // A paused full channel never downgrades a queued full job to the short body.
    if (!config.detailSince) return { ok: false, providerId: null, error: "Full staff notices paused." };
    let raw: unknown;
    try {
      raw = await readDetail(job.event_key);
    } catch {
      return { ok: false, providerId: null, error: "Staff notice detail was unavailable." };
    }
    const detail = mapStaffNoticeDetail(raw);
    if (detail && detail.reference === reference && detail.lines.length === itemCount) {
      message = renderFullStaffNotice(detail, config.queueUrl);
    } else {
      // The saved request is immutable, so this outcome is the same on every
      // retry. Staff still learn of the request and open it in the queue.
      message = {
        subject: `New Early Access request ${reference}`,
        text: [...shortLines, "Full details could not be included. Open the request in the private queue."].join("\n"),
      };
    }
  }
  try {
    const { client, fromEmail } = await getResendClient();
    if (!fromEmail) return { ok: false, providerId: null, error: "Staff notice sender is unconfigured." };
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: config.recipients,
      ...message,
    }, { idempotencyKey: job.event_key });
    if (!error && data?.id) return { ok: true, providerId: data.id };
  } catch {
    // The outbox worker records a sanitized failure and retries independently.
  }
  return { ok: false, providerId: null, error: "Staff notice email was not accepted." };
}
