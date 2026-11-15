import { z } from "zod";
import { getResendClient } from "../../../services/email";

export const REQUEST_SUBMITTED_STAFF_TEMPLATE = "ea_request_submitted_staff_v1";

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
  recipient: unknown;
  payload: unknown;
};

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
  return {
    since: since.data,
    recipients: recipients.data,
    queueUrl: new URL("/care/request-intents", site).href,
  };
}

type StaffNoticeConfig = NonNullable<ReturnType<typeof requestSubmittedStaffNoticeConfig>>;

type MailResult = {
  ok: boolean;
  providerId: string | null;
  error?: string;
  nonRetryable?: boolean;
};

export async function sendRequestSubmittedStaffNotice(
  job: StaffNoticeJob, config: StaffNoticeConfig, env = process.env,
): Promise<MailResult> {
  const payload = payloadSchema.safeParse(job.payload);
  if (!payload.success || typeof job.event_key !== "string" || !eventKey.test(job.event_key)
    || job.event_type !== REQUEST_SUBMITTED_STAFF_TEMPLATE || job.recipient !== config.recipients[0]
    || payload.data.recipients.some((email, index) => email !== config.recipients[index])
    || payload.data.reference !== "XRI-" + job.event_key.slice("ea-request-submitted-".length).replace(/-/g, "").toUpperCase()) {
    return { ok: false, providerId: null, error: "Invalid staff notice binding.", nonRetryable: true };
  }
  if (!env.RESEND_API_KEY?.trim()) {
    return { ok: false, providerId: null, error: "Staff notice email is unconfigured." };
  }

  const { reference, itemCount, submittedAt } = payload.data;
  try {
    const { client, fromEmail } = await getResendClient();
    if (!fromEmail) return { ok: false, providerId: null, error: "Staff notice sender is unconfigured." };
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: config.recipients,
      subject: "New Early Access request",
      text: [
        `Request ${reference}`,
        `Submitted ${centralTime.format(new Date(submittedAt))} Central`,
        `Items: ${itemCount}`,
        `Private staff queue: ${config.queueUrl}`,
      ].join("\n"),
    }, { idempotencyKey: job.event_key });
    if (!error && data?.id) return { ok: true, providerId: data.id };
  } catch {
    // The outbox worker records a sanitized failure and retries independently.
  }
  return { ok: false, providerId: null, error: "Staff notice email was not accepted." };
}
