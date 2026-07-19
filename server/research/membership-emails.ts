import { getResendClient, TEAM_EMAIL } from "../services/email";

// xenios research membership lifecycle emails (Phase 4 set).
// Tone per spec: calm, direct, premium, no emojis, no urgency. Every send is
// best-effort: a missing Resend configuration must never fail the API call.

const SITE = process.env.SITE_URL || "https://xeniostechnology.com";

async function send(to: string, subject: string, text: string): Promise<boolean> {
  try {
    const r = await getResendClient();
    await r.client.emails.send({
      from: r.fromEmail || `xenios <${TEAM_EMAIL}>`,
      to,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.warn("[research emails] send skipped/failed:", (err as Error).message);
    return false;
  }
}

export function statusUrl(token: string): string {
  return `${SITE}/research/apply/status?token=${encodeURIComponent(token)}`;
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

export async function sendInternalApplicationAlert(input: { email: string; name: string; applicantType: string }) {
  return send(
    TEAM_EMAIL,
    `New research membership application: ${input.name}`,
    `A new xenios research membership application was submitted.

Name: ${input.name}
Email: ${input.email}
Type: ${input.applicantType}

Review it in the admin research queue.`,
  );
}
