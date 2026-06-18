import { Resend } from "resend";
import type { WaitlistSignup, ContactMessage } from "@shared/schema";

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

const ROLE_LABELS: Record<string, string> = {
  strength_coaches: "Strength coach",
  personal_trainers: "Personal trainer",
  sports_performance: "Sports performance coach",
  functional_medicine: "Functional medicine",
  longevity_clinics: "Longevity clinic",
  concierge_medicine: "Concierge medicine",
  performance_labs: "Performance lab",
  recovery_studios: "Recovery studio",
  telemedicine_startups: "Telemedicine startup",
  preventive_care: "Preventive care",
  nutrition_companies: "Nutrition company",
  supplement_brands: "Supplement brand",
  athlete_brands: "Athlete brand",
  corporate_wellness: "Corporate wellness",
  healthcare_systems: "Healthcare system",
  military: "Military",
  biohacking_clinics: "Biohacking clinic",
  physical_therapists: "Physical therapist",
  chiropractors: "Chiropractor",
  hormone_clinics: "Hormone clinic",
  peptide_clinics: "Peptide clinic",
  self_insured_employers: "Self-insured employer",
  elite_athletes: "Elite athlete",
  creators: "Creator",
  sports_agencies: "Sports agency",
  other: "Other",
};

function shell(html: string) {
  return `<div style="font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:620px;margin:0 auto;padding:48px 28px;color:#0E0E0C;background:#F4EFE6;font-weight:500;">${html}</div>`;
}

// E1 — Waitlist confirmation
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
    console.warn("Resend not configured, skipping confirmation email:", (err as Error).message);
    return;
  }

  const subject = "You are on the xenios waitlist.";

  const text = `You're in${firstName ? `, ${firstName}` : ""}.

xenios is the AI-adjunct operations system for coaches, trainers, and practitioners. The xenios agent runs the back office. The xenios client agent holds the in-between.

You are #${position} on the waitlist. ${totalCount} coaches, trainers, and practitioners are with us.

What happens next:
  1. We open the founding cohort in waves.
  2. You get founder-direct onboarding when your wave opens.
  3. Founding pricing is locked for the life of your account.

Two quick follows while you wait:
  Instagram: @officialxenios, https://www.instagram.com/officialxenios/
  LinkedIn: /company/officialxenios, https://www.linkedin.com/company/officialxenios

Reply to this email if you want to talk. A human reads every reply.

xenios
The AI-adjunct operations system for coaches, trainers, and practitioners.
Austin, TX. In stealth.
team@xeniostechnology.com
`;

  const html = shell(`
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 40px;">xenios</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">WELCOME</p>
    <h1 style="font-size:44px;font-weight:800;letter-spacing:-0.02em;line-height:1.04;margin:0 0 28px;">You're in${firstName ? `, ${firstName}` : ""}.</h1>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">xenios is the AI-adjunct operations system for coaches, trainers, and practitioners. The xenios agent runs the back office. The xenios client agent holds the in-between.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">You are <strong style="font-weight:700;font-feature-settings:'tnum';">#${position}</strong> on the waitlist. <strong style="font-weight:700;font-feature-settings:'tnum';">${totalCount}</strong> coaches, trainers, and practitioners are with us.</p>
    <hr style="border:none;border-top:1px solid rgba(14,14,12,0.12);margin:36px 0;" />
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">WHAT HAPPENS NEXT</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">1. We open the founding cohort in waves.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">2. You get founder-direct onboarding when your wave opens.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">3. Founding pricing is locked for the life of your account.</p>
    <hr style="border:none;border-top:1px solid rgba(14,14,12,0.12);margin:36px 0;" />
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">WHILE YOU WAIT</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">Instagram: <a href="https://www.instagram.com/officialxenios/" style="color:#E04F1F;font-weight:600;">@officialxenios</a></p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">LinkedIn: <a href="https://www.linkedin.com/company/officialxenios" style="color:#E04F1F;font-weight:600;">/company/officialxenios</a></p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 36px;color:#2A2A26;">Reply to this email if you want to talk. A human reads every reply.</p>
    <p style="font-size:24px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 8px;">xenios</p>
    <p style="font-size:14px;line-height:1.55;margin:0 0 4px;color:#2A2A26;">The AI-adjunct operations system for coaches, trainers, and practitioners.</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.04em;color:#6A6A62;margin:16px 0 0;">Austin, TX. In stealth. team@xeniostechnology.com</p>
  `);

  try {
    await client.emails.send({ from: fromEmail, to: email, replyTo: TEAM_EMAIL, subject, text, html });
    console.log(`[email] confirmation sent to ${email}`);
  } catch (err) {
    console.error("[email] confirmation failed:", err);
  }
}

// E2 — Internal alert
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

  const role = ROLE_LABELS[signup.practitionerType] ?? signup.practitionerType;
  const subject = `New waitlist signup: ${signup.firstName} ${signup.lastName} (${role})`;

  const text = `New waitlist signup
====================

Name:       ${signup.firstName} ${signup.lastName}
Email:      ${signup.email}
Role:       ${role}
Location:   ${signup.city}, ${signup.country}
Free text:  ${signup.freeText || "(none)"}
Source:     ${signup.howHeard || "(none)"}

Position:   #${signup.position} of ${totalCount}
Time:       ${new Date().toISOString()}

Reply to reach them directly.

xenios
`;

  try {
    await client.emails.send({ from: fromEmail, to: TEAM_EMAIL, replyTo: signup.email, subject, text });
    console.log(`[email] internal alert sent for ${signup.email}`);
  } catch (err) {
    console.error("[email] internal alert failed:", err);
  }
}

// E4 — Contact forward to team inbox
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
    practitioner: "[Founding Cohort]",
    investor: "[Investor]",
    journalist_creator: "[Press]",
    integration_partner: "[Partnership]",
    enterprise: "[Enterprise]",
    candidate: "[Careers]",
    other: "[Hello]",
  };
  const prefix = PREFIX_BY_PERSONA[msg.persona] ?? "[Hello]";
  const stripped = msg.subject.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  const subject = `${prefix} ${stripped}`.trim();

  const text = `New inbound from /contact

name:    ${msg.name}
email:   ${msg.email}
persona: ${msg.persona}
subject: ${subject}

message:
${msg.message}

xenios
`;

  try {
    await client.emails.send({ from: fromEmail, to: TEAM_EMAIL, replyTo: msg.email, subject, text });
    console.log(`[email] contact forwarded for ${msg.email} (${prefix})`);
  } catch (err) {
    console.error("[email] contact forward failed:", err);
  }
}

// E5 — Contact auto-reply
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

  const PREFIX_BY_PERSONA: Record<string, string> = {
    practitioner: "Founding Cohort",
    investor: "Investor",
    journalist_creator: "Press",
    integration_partner: "Partnership",
    enterprise: "Enterprise",
    candidate: "Careers",
    other: "Hello",
  };
  const prefixLabel = PREFIX_BY_PERSONA[msg.persona] ?? "Hello";

  const subject = `We received your note (${prefixLabel}).`;

  const text = `Thanks for writing.

We received your message and routed it to the right human on our team. We reply to every serious note inside two business days.

While you wait:
  Instagram: @officialxenios
  LinkedIn:  /company/officialxenios

xenios
The AI-adjunct operations system for coaches, trainers, and practitioners.
`;

  const html = shell(`
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 32px;">xenios</p>
    <h1 style="font-size:36px;font-weight:800;letter-spacing:-0.02em;line-height:1.05;margin:0 0 24px;">Thanks for writing.</h1>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">We received your message (${prefixLabel}) and routed it to the right human on our team. We reply to every serious note inside two business days.</p>
    <p style="font-size:17px;line-height:1.55;margin:24px 0 8px;">While you wait:</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">Instagram: <a href="https://www.instagram.com/officialxenios/" style="color:#E04F1F;font-weight:600;">@officialxenios</a></p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 32px;">LinkedIn: <a href="https://www.linkedin.com/company/officialxenios" style="color:#E04F1F;font-weight:600;">/company/officialxenios</a></p>
    <p style="font-size:20px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 8px;">xenios</p>
    <p style="font-size:13px;line-height:1.55;margin:0;color:#2A2A26;">The AI-adjunct operations system for coaches, trainers, and practitioners.</p>
  `);

  try {
    await client.emails.send({ from: fromEmail, to: msg.email, replyTo: TEAM_EMAIL, subject, text, html });
    console.log(`[email] contact auto-reply sent to ${msg.email}`);
  } catch (err) {
    console.error("[email] contact auto-reply failed:", err);
  }
}

// ===========================================================================
// v3 templates (Supabase-backed waitlist + early interest). Each returns a
// boolean so the caller can persist email_status = sent | failed.
// ===========================================================================

const V3_DESCRIPTOR = "An AI workspace for health and performance professionals.";
const V3_MOTIF = "The AI drafts. The coach decides.";
const IG = "https://www.instagram.com/officialxenios/";
const LI = "https://www.linkedin.com/company/officialxenios";

function firstNameFrom(name?: string | null): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] || "";
}

// E1 — Waitlist confirmation (v3)
export async function sendWaitlistConfirmationV3(input: {
  email: string;
  name?: string | null;
}): Promise<boolean> {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch (err) {
    console.warn("[email] Resend not configured, waitlist confirmation skipped:", (err as Error).message);
    return false;
  }

  const fn = firstNameFrom(input.name);
  const subject = "You're on the xenios waitlist.";

  const text = `You're on the xenios waitlist${fn ? `, ${fn}` : ""}.

${V3_MOTIF}

xenios gives every coach two AI agents. Xen runs your practice. Athena supports each client between sessions, in your voice, always disclosed as AI and always yours to approve.

We onboard coaches in small groups, so we will reach out as soon as a spot opens.

While you wait:
  Instagram: @officialxenios, ${IG}
  LinkedIn: /company/officialxenios, ${LI}

Reply to this email if you want to talk. A human reads every reply.

xenios
${V3_DESCRIPTOR}
Austin, TX.
team@xeniostechnology.com
`;

  const html = shell(`
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 36px;">xenios</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#B964D4;margin:0 0 12px;">${V3_MOTIF}</p>
    <h1 style="font-size:40px;font-weight:800;letter-spacing:-0.02em;line-height:1.06;margin:0 0 28px;">You're on the xenios waitlist${fn ? `, ${fn}` : ""}.</h1>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">xenios gives every coach two AI agents. <strong style="font-weight:700;">Xen</strong> runs your practice. <strong style="font-weight:700;">Athena</strong> supports each client between sessions, in your voice, always disclosed as AI and always yours to approve.</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">We onboard coaches in small groups, so we will reach out as soon as a spot opens.</p>
    <hr style="border:none;border-top:1px solid rgba(14,14,12,0.12);margin:36px 0;" />
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6A6A62;margin:0 0 12px;">WHILE YOU WAIT</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">Instagram: <a href="${IG}" style="color:#E04F1F;font-weight:600;">@officialxenios</a></p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 24px;">LinkedIn: <a href="${LI}" style="color:#E04F1F;font-weight:600;">/company/officialxenios</a></p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 36px;color:#2A2A26;">Reply to this email if you want to talk. A human reads every reply.</p>
    <p style="font-size:24px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 8px;">xenios</p>
    <p style="font-size:14px;line-height:1.55;margin:0 0 4px;color:#2A2A26;">${V3_DESCRIPTOR}</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.04em;color:#6A6A62;margin:16px 0 0;">Austin, TX. team@xeniostechnology.com</p>
  `);

  try {
    await client.emails.send({ from: fromEmail, to: input.email, replyTo: TEAM_EMAIL, subject, text, html });
    console.log(`[email] waitlist confirmation sent to ${input.email}`);
    return true;
  } catch (err) {
    console.error("[email] waitlist confirmation failed:", err);
    return false;
  }
}

// E3 — Waitlist internal alert (v3) — full attribution
export async function sendWaitlistInternalAlertV3(row: {
  name?: string | null;
  email: string;
  role?: string | null;
  company?: string | null;
  city?: string | null;
  interest?: string | null;
  source_page?: string | null;
  landing_page?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ip?: string | null;
}): Promise<boolean> {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch {
    return false;
  }

  const subject = `New waitlist signup: ${row.name || row.email}${row.role ? ` (${row.role})` : ""}`;
  const text = `New waitlist signup
====================

Name:        ${row.name || "(none)"}
Email:       ${row.email}
Role:        ${row.role || "(none)"}
Company:     ${row.company || "(none)"}
City:        ${row.city || "(none)"}
Interest:    ${row.interest || "(none)"}

Attribution
-----------
Source page: ${row.source_page || "(none)"}
Landing:     ${row.landing_page || "(none)"}
Referrer:    ${row.referrer_url || "(none)"}
utm_source:  ${row.utm_source || "(none)"}
utm_medium:  ${row.utm_medium || "(none)"}
utm_campaign:${row.utm_campaign || "(none)"}
utm_content: ${row.utm_content || "(none)"}
utm_term:    ${row.utm_term || "(none)"}
IP:          ${row.ip || "(none)"}

Time:        ${new Date().toISOString()}

Reply to reach them directly.

xenios
`;

  try {
    await client.emails.send({ from: fromEmail, to: TEAM_EMAIL, replyTo: row.email, subject, text });
    console.log(`[email] waitlist internal alert sent for ${row.email}`);
    return true;
  } catch (err) {
    console.error("[email] waitlist internal alert failed:", err);
    return false;
  }
}

// E2 — Early-interest / LOI confirmation (v3)
export async function sendLoiConfirmationV3(input: {
  email: string;
  name?: string | null;
}): Promise<boolean> {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch {
    return false;
  }

  const fn = firstNameFrom(input.name);
  const subject = "We received your interest in xenios.";

  const text = `Thanks${fn ? `, ${fn}` : ""}.

We received your interest. This is non-binding. The xenios team will follow up.

${V3_MOTIF}

While you wait:
  Instagram: @officialxenios, ${IG}
  LinkedIn: /company/officialxenios, ${LI}

xenios
${V3_DESCRIPTOR}
team@xeniostechnology.com
`;

  const html = shell(`
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 32px;">xenios</p>
    <h1 style="font-size:36px;font-weight:800;letter-spacing:-0.02em;line-height:1.05;margin:0 0 24px;">Thanks${fn ? `, ${fn}` : ""}.</h1>
    <p style="font-size:17px;line-height:1.55;margin:0 0 16px;">We received your interest. This is non-binding. The xenios team will follow up.</p>
    <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#B964D4;margin:24px 0 24px;">${V3_MOTIF}</p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 8px;">Instagram: <a href="${IG}" style="color:#E04F1F;font-weight:600;">@officialxenios</a></p>
    <p style="font-size:17px;line-height:1.55;margin:0 0 32px;">LinkedIn: <a href="${LI}" style="color:#E04F1F;font-weight:600;">/company/officialxenios</a></p>
    <p style="font-size:20px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 8px;">xenios</p>
    <p style="font-size:13px;line-height:1.55;margin:0;color:#2A2A26;">${V3_DESCRIPTOR}</p>
  `);

  try {
    await client.emails.send({ from: fromEmail, to: input.email, replyTo: TEAM_EMAIL, subject, text, html });
    console.log(`[email] LOI confirmation sent to ${input.email}`);
    return true;
  } catch (err) {
    console.error("[email] LOI confirmation failed:", err);
    return false;
  }
}

// Early-interest / LOI internal alert (v3)
export async function sendLoiInternalAlertV3(row: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  business_name?: string | null;
  role?: string | null;
  url_or_handle?: string | null;
  client_count?: string | null;
  why_interested?: string | null;
  source_page?: string | null;
  landing_page?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ip?: string | null;
}): Promise<boolean> {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_DEFAULT;
  } catch {
    return false;
  }

  const subject = `New early-interest: ${row.name || row.email || "unknown"}${row.business_name ? ` (${row.business_name})` : ""}`;
  const text = `New early-interest / LOI submission
===================================

Name:         ${row.name || "(none)"}
Email:        ${row.email || "(none)"}
Phone:        ${row.phone || "(none)"}
Business:     ${row.business_name || "(none)"}
Role:         ${row.role || "(none)"}
URL/handle:   ${row.url_or_handle || "(none)"}
Client count: ${row.client_count || "(none)"}

Why interested:
${row.why_interested || "(none)"}

Attribution
-----------
Source page: ${row.source_page || "(none)"}
Landing:     ${row.landing_page || "(none)"}
Referrer:    ${row.referrer_url || "(none)"}
utm_source:  ${row.utm_source || "(none)"}
utm_medium:  ${row.utm_medium || "(none)"}
utm_campaign:${row.utm_campaign || "(none)"}
utm_content: ${row.utm_content || "(none)"}
utm_term:    ${row.utm_term || "(none)"}
IP:          ${row.ip || "(none)"}

Time:        ${new Date().toISOString()}

xenios
`;

  try {
    await client.emails.send({ from: fromEmail, to: TEAM_EMAIL, replyTo: row.email || TEAM_EMAIL, subject, text });
    console.log(`[email] LOI internal alert sent for ${row.email}`);
    return true;
  } catch (err) {
    console.error("[email] LOI internal alert failed:", err);
    return false;
  }
}
