import { getResendClient } from "../services/email";
import { adminRecipients } from "../services/email-config";

// ---------------------------------------------------------------------------
// xenios research member platform: email templates (Website 2 lane).
//
// Same posture as membership-emails.ts: plain, calm, no marketing language.
// Sensitive documents are NEVER attached; emails carry a notification plus a
// link into the member Document Center. Payloads never contain tokens, health
// answers, or document contents.
//
// MEMBER_PLATFORM_TEMPLATES is the dispatch map for these template keys. The
// integration lane wires it into the outbox dispatch() (frozen file) so the
// durable retry path recognizes the keys; until then the notifier seam
// direct-sends first and enqueues only as a fallback.
// ---------------------------------------------------------------------------

const MEMBER_AREA_URL = () =>
  `${process.env.APPLICATION_BASE_URL || "https://xeniostechnology.com"}/research/member`;

const RESEARCH_FROM_DEFAULT = "Xenios Research <research@xeniostechnology.com>";

// Same best-effort send as membership-emails.ts: missing Resend configuration
// never throws into the request path; the notifier seam treats false as
// "enqueue for the durable retry path".
async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  try {
    const r = await getResendClient();
    const from = process.env.RESEARCH_EMAIL_FROM?.trim() || r.fromEmail || RESEARCH_FROM_DEFAULT;
    const replyTo = process.env.RESEARCH_EMAIL_REPLY_TO?.trim() || r.replyToEmail || undefined;
    const { error } = await r.client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.warn("[member-platform emails] provider rejected send:", (error as { message?: string })?.message ?? "unknown error");
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[member-platform emails] send skipped/failed:", (err as Error).message);
    return false;
  }
}

type TemplateInput = { recipient: string; payload: Record<string, unknown> };
type TemplateSender = (input: TemplateInput) => Promise<boolean>;

function firstName(payload: Record<string, unknown>): string {
  const value = payload.firstName;
  return typeof value === "string" && value.trim() ? value.trim() : "there";
}

async function assessmentDue(input: TemplateInput): Promise<boolean> {
  const due = typeof input.payload.dueAt === "string" ? new Date(input.payload.dueAt) : null;
  const dueLine = due ? ` It is due by ${due.toUTCString()}.` : "";
  return sendEmail({
    to: input.recipient,
    subject: "Your Xenios Research assessment",
    text:
      `Hi ${firstName(input.payload)},\n\n` +
      `Your membership includes a short assessment (about 10 minutes). It is required to build ` +
      `your Whole-Life Blueprint and unlocks your tracker.${dueLine}\n\n` +
      `Complete it here: ${MEMBER_AREA_URL()}/assessment\n\n` +
      `Xenios Research\nresearch@xeniostechnology.com`,
  });
}

async function documentReady(input: TemplateInput): Promise<boolean> {
  const title = typeof input.payload.title === "string" ? input.payload.title : "A new document";
  return sendEmail({
    to: input.recipient,
    subject: "A document is ready in your Xenios Research Document Center",
    text:
      `Hi ${firstName(input.payload)},\n\n` +
      `${title} is ready. For your privacy it is not attached; open it from your private ` +
      `Document Center:\n\n${MEMBER_AREA_URL()}/documents\n\n` +
      `Xenios Research\nresearch@xeniostechnology.com`,
  });
}

async function questionAnswerReady(input: TemplateInput): Promise<boolean> {
  return sendEmail({
    to: input.recipient,
    subject: "Your Xenios Research question has an answer",
    text:
      `Hi ${firstName(input.payload)},\n\n` +
      `Your question has an answer ready. Read it here:\n\n` +
      `${MEMBER_AREA_URL()}/questions\n\n` +
      `Xenios Research\nresearch@xeniostechnology.com`,
  });
}

async function planPublished(input: TemplateInput): Promise<boolean> {
  const label = typeof input.payload.monthLabel === "string" ? ` for ${input.payload.monthLabel}` : "";
  return sendEmail({
    to: input.recipient,
    subject: "Your Xenios Research plan is published",
    text:
      `Hi ${firstName(input.payload)},\n\n` +
      `Your plan${label} has been reviewed and published. Open it here:\n\n` +
      `${MEMBER_AREA_URL()}\n\n` +
      `Xenios Research\nresearch@xeniostechnology.com`,
  });
}

async function adminSlaAlert(input: TemplateInput): Promise<boolean> {
  const summary = typeof input.payload.safeSummary === "string" ? input.payload.safeSummary : "SLA at risk";
  const results = await Promise.all(
    adminRecipients().map((to) =>
      sendEmail({
        to,
        subject: "Xenios Research: SLA attention needed",
        text: `${summary}\n\nOpen the admin queues to act.\n`,
      }),
    ),
  );
  return results.every(Boolean);
}

export const MEMBER_PLATFORM_TEMPLATES = {
  member_assessment_due: assessmentDue,
  member_document_ready: documentReady,
  member_question_answer_ready: questionAnswerReady,
  member_plan_published: planPublished,
  admin_sla_alert: adminSlaAlert,
} as const satisfies Record<string, TemplateSender>;

export type MemberPlatformTemplateKey = keyof typeof MEMBER_PLATFORM_TEMPLATES;
