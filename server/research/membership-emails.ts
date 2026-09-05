import { getResendClient } from "../services/email";

// xenios research membership lifecycle emails (Phase 4 set).
// Tone per spec: calm, direct, premium, no emojis, no urgency. Every send is
// best-effort: a missing Resend configuration must never fail the API call.
//
// Sender identity: the canonical member-facing sender is
// research@xeniostechnology.com. Research-specific overrides are allowed, but
// the unrelated site-wide sender is never a fallback for Research mail.

const SITE = process.env.SITE_URL || "https://xeniostechnology.com";
const RESEARCH_FROM_DEFAULT = "Xenios Research <research@xeniostechnology.com>";
const RESEARCH_REPLY_TO_DEFAULT = "research@xeniostechnology.com";

export type SendResult = { ok: boolean; id: string | null; errorCode?: string | null };

async function send(to: string, subject: string, text: string, health?: { idempotencyKey: string }): Promise<SendResult> {
  try {
    const r = await getResendClient();
    const from = health ? "Xenios Health <team@xeniostechnology.com>" : process.env.RESEARCH_EMAIL_FROM?.trim() || RESEARCH_FROM_DEFAULT;
    const replyTo = health ? "team@xeniostechnology.com" : process.env.RESEARCH_EMAIL_REPLY_TO?.trim() || RESEARCH_REPLY_TO_DEFAULT;
    // The Resend SDK reports API rejections via the error field WITHOUT
    // throwing; treating a non-throw as success recorded provider failures
    // as "sent". Inspect the result.
    const message = {
      from,
      to,
      subject,
      text,
      replyTo,
    };
    const { data, error } = health
      ? await r.client.emails.send(message, { idempotencyKey: health.idempotencyKey })
      : await r.client.emails.send(message);
    if (error) {
      console.warn("[research emails] provider rejected send:", (error as any)?.message ?? "unknown error");
      return { ok: false, id: null, errorCode: (error as any)?.name ?? "provider_rejected" };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    console.warn("[research emails] send skipped/failed:", (err as Error).message);
    return { ok: false, id: null, errorCode: "send_threw" };
  }
}

export function statusUrl(token: string): string {
  return `${SITE}/research/apply/status?token=${encodeURIComponent(token)}`;
}

export function sendApprovedCustomerClaim(input: { email: string; firstName: string; token: string; approvalExpiresAt: Date; idempotencyKey: string }) {
  const expires = input.approvalExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return send(input.email, "Your Xenios Health account access is approved", `Hi ${input.firstName},

Your customer account access has been approved. Open your secure link to finish setting up your account:
${statusUrl(input.token)}

If you already have a sign-in for this email, sign in normally and reopen the link to continue. This link is available until ${expires}.

Your account will show the products, requests and services available to you. Partner access is reviewed separately.

For help, reply to this email.

Xenios Health
team@xeniostechnology.com`, { idempotencyKey: input.idempotencyKey });
}

export function sendApprovedCustomerWelcome(input: { email: string; firstName: string; idempotencyKey: string }) {
  return send(input.email, "Your Xenios Health account is ready", `Hi ${input.firstName},

Your customer account is ready. Sign in to view your account, browse available products and follow your requests:
${SITE}/research/sign-in?returnTo=%2Fresearch%2Faccount

For help, reply to this email.

Xenios Health
team@xeniostechnology.com`, { idempotencyKey: input.idempotencyKey });
}

export async function sendApplicationReceived(input: { email: string; firstName: string; token: string }) {
  return send(
    input.email,
    "Your xenios research application is in review",
    `Hi ${input.firstName},

Thank you for applying to xenios research. Your application has been received and will be reviewed individually.

You will hear from us by email. You will not be charged unless your application is approved and you choose to activate the membership.

Check your application status any time:
${statusUrl(input.token)}

xenios`,
  );
}

export async function sendApplicationApproved(input: {
  email: string;
  firstName: string;
  token: string;
  approvalExpiresAt: Date;
}) {
  const date = input.approvalExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return send(
    input.email,
    "Your xenios research application has been approved",
    `Hi ${input.firstName},

Your application to xenios research has been approved.

The next step is to activate your membership: a one-time $50 activation fee plus the $25 monthly membership. After activation, you will complete the in-depth Whole-Life Onboarding so xenios can build a plan around your actual schedule, environment, priorities, and available resources.

Activate your membership:
${statusUrl(input.token)}

Your approval expires on ${date}. Membership does not guarantee access to every product or professional pathway.

xenios`,
  );
}

export async function sendB2BBuyerClaim(input: {
  email: string;
  firstName: string;
  token: string;
  businessDisplayName: string;
  approvalExpiresAt: Date;
}) {
  const date = input.approvalExpiresAt.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  return send(
    input.email,
    `Set up your ${input.businessDisplayName} Xenios account`,
    `Hi ${input.firstName},

You have been approved as an operator for the ${input.businessDisplayName} business buyer account.

Choose your own password and create your Xenios sign-in:
${statusUrl(input.token)}

This link expires on ${date}. This invitation does not request a personal membership payment. Product eligibility and channel restrictions still apply.

xenios`,
  );
}

export async function sendApplicationDeclined(input: { email: string; firstName: string }) {
  return send(
    input.email,
    "An update on your xenios research application",
    `Hi ${input.firstName},

Thank you for taking the time to apply to xenios research. We are not able to approve the application at this time.

This decision does not reflect a medical judgment or personal assessment. xenios may reopen applications or introduce additional membership pathways in the future.

xenios`,
  );
}

export async function sendMoreInformationRequested(input: {
  email: string;
  firstName: string;
  token: string;
  note: string | null;
}) {
  const noteBlock = input.note ? `\n${input.note}\n` : "";
  return send(
    input.email,
    "Your xenios research application needs one more step",
    `Hi ${input.firstName},

Thank you for applying to xenios research. To finish the review, we need a little more information.
${noteBlock}
Reply to this email with the requested details, or review your status here:
${statusUrl(input.token)}

xenios`,
  );
}

// Sent to the address already on file when someone asks for a status link or
// submits again with the same email. Deliberately generic: it works whether the
// requester was the applicant or a stranger probing the address.
export async function sendStatusLink(input: { email: string; firstName: string; token: string }) {
  return send(
    input.email,
    "Your xenios research status link",
    `Hi ${input.firstName},

A status link for your xenios research application was requested. If this was you, use the secure link below. If it was not you, no action is needed and nothing about your application was shared.

${statusUrl(input.token)}

xenios`,
  );
}

// Internal admin alert. The recipient comes from the caller (the outbox job's
// recipient column, fanned out per configured admin); the canonical Research
// inbox is only the last-resort fallback.
export async function sendInternalApplicationAlert(input: {
  to?: string;
  email: string;
  name: string;
  applicantType: string;
  kind?: "new" | "resubmitted";
}) {
  const resubmitted = input.kind === "resubmitted";
  return send(
    input.to || RESEARCH_REPLY_TO_DEFAULT,
    resubmitted
      ? `Research application resubmitted: ${input.name}`
      : `New research membership application: ${input.name}`,
    `${resubmitted ? "A xenios research membership application was resubmitted with the requested information." : "A new xenios research membership application was submitted."}

Name: ${input.name}
Email: ${input.email}
Type: ${input.applicantType}

Review it in the admin research queue.`,
  );
}

// Confirmation to the applicant after resubmitting requested information.
export async function sendResubmittedConfirmation(input: { email: string; firstName: string; token: string }) {
  return send(
    input.email,
    "Your updated xenios research application is back in review",
    `Hi ${input.firstName},

Thank you. Your updated application has been received and has returned to review.

You will hear from us by email. Check your application status any time:
${statusUrl(input.token)}

xenios`,
  );
}

// Sent after a successful account claim: confirms the account exists and where
// to sign in. Also a security signal: if the recipient did NOT set up the
// account, they learn immediately.
export async function sendAccountClaimSuccess(input: { email: string; firstName: string }) {
  return send(
    input.email,
    "Your xenios research member account is ready",
    `Hi ${input.firstName},

Your xenios research member account has been created. You can sign in with your email and the password you chose:
${SITE}/research/sign-in

Membership activates after the one-time $50 activation and the $25 monthly membership are both verified. Until then your account shows as pending activation.

If you did not set up this account, reply to this email immediately.

xenios`,
  );
}

// Internal alert when a notification exhausts its retries. Never sent for a
// failing admin_* template (no alert loops).
export async function sendEmailFailureAlert(input: {
  to: string;
  failedTemplate: string;
  failedRecipient: string;
  applicationId: string | null;
  errorSummary: string | null;
}) {
  return send(
    input.to,
    `Research email delivery failure: ${input.failedTemplate}`,
    `A xenios research notification could not be delivered after all retries.

Template: ${input.failedTemplate}
Recipient: ${input.failedRecipient}
Application: ${input.applicationId ?? "n/a"}
Last error: ${input.errorSummary ?? "unknown"}

It is visible in the admin outbox (status failed_permanent) and can be requeued from there.`,
  );
}

// Manual diagnostic send, admin-triggered, admin-addressed only (the route
// enforces the allowlist). Proves the provider path end to end.
export async function sendAdminTestEmail(input: { to: string }) {
  return send(
    input.to,
    "xenios research email system test",
    `This is a manual test of the xenios research email path.

Time: ${new Date().toISOString()}

If you received this, the provider, sender identity, and delivery path are working.`,
  );
}
