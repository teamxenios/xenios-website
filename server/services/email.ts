import { Resend } from "resend";
import type { WaitlistSignup } from "@shared/schema";
import type { ContactMessage } from "@shared/schema";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");

  const response = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
  );
  if (!response.ok) throw new Error(`Connector fetch failed with status ${response.status}`);
  const data = await response.json();
  connectionSettings = data.items?.[0];
  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error("Resend not connected");
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email,
  };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return { client: new Resend(apiKey), fromEmail };
}

const TEAM_EMAIL = "team@xeniostechnology.com";
const FROM_DEFAULT = `xenios <${TEAM_EMAIL}>`;

const PRACTITIONER_LABELS: Record<string, string> = {
  strength_coaches: "Strength coach",
  personal_trainers: "Personal trainer",
  sports_performance: "Sports performance",
  functional_medicine: "Functional medicine",
  longevity_clinics: "Longevity clinic",
  concierge_medicine: "Concierge medicine",
  performance_labs: "Performance lab",
  recovery_studios: "Recovery studio",
  telemedicine_startups: "Telemedicine startup",
  preventive_care: "Preventive care system",
  nutrition_companies: "Nutrition company",
  supplement_brands: "Supplement brand",
  athlete_brands: "Athlete brand",
  corporate_wellness: "Corporate wellness",
  healthcare_systems: "Healthcare system",
  military: "Military optimization",
  biohacking_clinics: "Biohacking clinic",
  physical_therapists: "Physical therapist",
  chiropractors: "Chiropractor",
  hormone_clinics: "Hormone clinic",
  peptide_clinics: "Peptide clinic",
  self_insured_employers: "Self-insured employer",
  elite_athletes: "Elite athlete",
  creators: "Creator / influencer",
  sports_agencies: "Sports agency",
  other: "Other",
};

// 10.2 — Confirmation email
export async function sendConfirmationEmail({
  email,
  firstName,
  position,
  totalCount,
}: {
  email: string;
  firstName: string;
  position: number;
  totalCount: number;
}) {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch (err) {
    console.warn("Resend not configured — skipping confirmation email:", (err as Error).message);
    return;
  }

  const subject = `you're on the xenios waitlist (#${position})`;

  const text = `WELCOME

you're in${firstName ? `, ${firstName}` : ""}.

xenios is the AI-native operating system for proactive health — the orchestration layer connecting every signal, every workflow, and every practitioner moving care upstream of disease.

You're #${position} on the waitlist. ${totalCount} practitioners are with us.

—

WHILE YOU WAIT

The vision shows up first on our channels. Two quick follows:

  → Instagram: @officialxenios — https://www.instagram.com/officialxenios/
  → LinkedIn:  /company/officialxenios — https://www.linkedin.com/company/officialxenios

—

A LITTLE OF WHAT'S COMING

Eight specialized AI agents and a Conductor. Telemedicine. A branded storefront. A practitioner network with agent-to-agent referrals. A programmable health ontology. A developer platform. An enterprise tier.

Every dot connected. Every hour returned. Every practitioner amplified.

The proactive health era starts now.
We are building the operating system.

—

If a friend should be on this list, forward them:
https://xeniostechnology.com/waitlist

If you want to talk, reply to this email. A human reads every reply.

—
xenios
infrastructure for the next fifty years of human health
Austin, TX · in stealth
team@xeniostechnology.com
`;

  const html = `<div style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:620px;margin:0 auto;padding:48px 28px;color:#0E0E0C;background:#F4EFE6;font-weight:500;">
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 40px;">xenios</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">WELCOME</p>
    <h1 style="font-size:48px;font-weight:800;letter-spacing:-0.02em;line-height:1.04;margin:0 0 28px;">you're in${firstName ? `, ${firstName}` : ""}.</h1>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">xenios is the AI-native operating system for proactive health — the orchestration layer connecting every signal, every workflow, and every practitioner moving care upstream of disease.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">You're <strong style="font-weight:700;font-feature-settings:'tnum';">#${position}</strong> on the waitlist. <strong style="font-weight:700;font-feature-settings:'tnum';">${totalCount}</strong> practitioners are with us.</p>
    <hr style="border:none;border-top:1px solid rgba(14,14,12,0.12);margin:36px 0;" />
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">WHILE YOU WAIT</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 12px;">The vision shows up first on our channels. Two quick follows:</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">→ Instagram: <a href="https://www.instagram.com/officialxenios/" style="color:#FF5A1F;font-weight:600;">@officialxenios</a></p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">→ LinkedIn: <a href="https://www.linkedin.com/company/officialxenios" style="color:#FF5A1F;font-weight:600;">/company/officialxenios</a></p>
    <hr style="border:none;border-top:1px solid rgba(14,14,12,0.12);margin:36px 0;" />
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">A LITTLE OF WHAT'S COMING</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">Eight specialized AI agents and a Conductor. Telemedicine. A branded storefront. A practitioner network with agent-to-agent referrals. A programmable health ontology. A developer platform. An enterprise tier.</p>
    <p style="font-size:20px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;margin:24px 0;">Every dot connected. Every hour returned. Every practitioner amplified.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">The proactive health era starts now.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">We are building the operating system.</p>
    <hr style="border:none;border-top:1px solid rgba(14,14,12,0.12);margin:36px 0;" />
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px;color:#2A2A26;">If a friend should be on this list, forward them: <a href="https://xeniostechnology.com/waitlist" style="color:#0E0E0C;">xeniostechnology.com/waitlist</a></p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 36px;color:#2A2A26;">If you want to talk, reply to this email. A human reads every reply.</p>
    <p style="font-size:24px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 8px;">xenios</p>
    <p style="font-size:14px;line-height:1.55;margin:0 0 4px;color:#2A2A26;">infrastructure for the next fifty years of human health</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.04em;color:#6A6A62;margin:16px 0 0;">Austin, TX · in stealth · team@xeniostechnology.com</p>
  </div>`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: email,
      replyTo: TEAM_EMAIL,
      subject,
      text,
      html,
    });
    console.log(`[email] confirmation sent to ${email}`);
  } catch (err) {
    console.error("[email] confirmation failed:", err);
  }
}

// 10.1 — Internal alert
export async function sendInternalNotification({
  signup,
  totalCount,
}: {
  signup: WaitlistSignup;
  totalCount: number;
}) {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch {
    return;
  }

  const ptype = PRACTITIONER_LABELS[signup.practitionerType] ?? signup.practitionerType;
  const subject = `[WAITLIST] +1 — ${signup.firstName} ${signup.lastName} — #${signup.position} — ${ptype}`;

  const text = `NEW WAITLIST SIGNUP
———————————————

Name:           ${signup.firstName} ${signup.lastName}
Email:          ${signup.email}
Practitioner:   ${ptype}
Location:       ${signup.city}, ${signup.country}
Free text:      ${signup.freeText || "—"}
Source:         ${signup.howHeard || "—"}

Position:       #${signup.position} of ${totalCount}
Timestamp:      ${new Date().toISOString()}

Reply to this email to reach them directly.

—
xenios
`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: TEAM_EMAIL,
      replyTo: signup.email,
      subject,
      text,
    });
    console.log(`[email] internal alert sent for ${signup.email}`);
  } catch (err) {
    console.error("[email] internal alert failed:", err);
  }
}

// Contact-form forward to team inbox (with prefix)
export async function sendContactMessage(msg: ContactMessage) {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch {
    return;
  }

  const PREFIX_BY_PERSONA: Record<string, string> = {
    practitioner: "[PRACTITIONER]",
    investor: "[INVESTOR]",
    journalist_creator: "[PRESS]",
    integration_partner: "[PARTNER]",
    enterprise: "[ENTERPRISE]",
    candidate: "[ROLE — OPEN]",
    other: "[HELLO]",
  };
  const prefix = PREFIX_BY_PERSONA[msg.persona] ?? "[HELLO]";
  // Strip any user-supplied bracketed prefix and authoritatively apply the
  // persona-derived one so inbox routing is always consistent server-side.
  const stripped = msg.subject.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  const subject = `${prefix} ${stripped}`.trim();

  const text = `New inbound from /contact

name:    ${msg.name}
email:   ${msg.email}
persona: ${msg.persona}
subject: ${subject}

message:
${msg.message}

—
xenios
`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: TEAM_EMAIL,
      replyTo: msg.email,
      subject,
      text,
    });
    console.log(`[email] contact forwarded for ${msg.email} (${prefix})`);
  } catch (err) {
    console.error("[email] contact forward failed:", err);
  }
}

// 10.4 — Contact-form auto-reply
export async function sendContactAutoReply(msg: ContactMessage) {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch {
    return;
  }

  const text = `Thanks for writing.

Every message that hits team@xeniostechnology.com is read by a human. We reply to every serious note inside two business days.

In the meantime, two quick follows:

  → Instagram: @officialxenios
  → LinkedIn:  /company/officialxenios

—
xenios
`;

  const html = `<div style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:620px;margin:0 auto;padding:48px 28px;color:#0E0E0C;background:#F4EFE6;font-weight:500;">
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 32px;">xenios</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">Thanks for writing.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">Every message that hits <a href="mailto:team@xeniostechnology.com" style="color:#0E0E0C;">team@xeniostechnology.com</a> is read by a human. We reply to every serious note inside two business days.</p>
    <p style="font-size:17px;line-height:1.55;margin:24px 0 8px;">In the meantime, two quick follows:</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">→ Instagram: <a href="https://www.instagram.com/officialxenios/" style="color:#FF5A1F;font-weight:600;">@officialxenios</a></p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 32px;">→ LinkedIn: <a href="https://www.linkedin.com/company/officialxenios" style="color:#FF5A1F;font-weight:600;">/company/officialxenios</a></p>
    <p style="font-size:20px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0;">xenios</p>
  </div>`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: msg.email,
      replyTo: TEAM_EMAIL,
      subject: "we have it. — xenios",
      text,
      html,
    });
    console.log(`[email] contact auto-reply sent to ${msg.email}`);
  } catch (err) {
    console.error("[email] contact auto-reply failed:", err);
  }
}
