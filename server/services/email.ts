import { Resend } from "resend";
import type { WaitlistSignup, ContactMessage } from "@shared/schema";
import { resolveEmailConfiguration } from "./email-config";

// Credentials come from the shared resolver: direct env first (the production
// path Render actually has configured), Replit connector as a legacy fallback,
// then an explicit unavailable error. The old implementation was connector-only,
// which silently disabled ALL email on Render.
async function getCredentials() {
  const config = await resolveEmailConfiguration();
  if (config.provider === "unavailable" || !config.apiKey) {
    throw new Error("Email provider unavailable (no RESEND_API_KEY and no Replit connector)");
  }
  return { apiKey: config.apiKey, fromEmail: config.fromEmail, replyToEmail: config.replyToEmail };
}

export async function getResendClient() {
  const { apiKey, fromEmail, replyToEmail } = await getCredentials();
  return { client: new Resend(apiKey), fromEmail, replyToEmail };
}

export const TEAM_EMAIL = "team@xeniostechnology.com";
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
  virtual_coaching: "Virtual coaching business",
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
  wellness_clinics: "Wellness clinic",
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
  const subject = "You're on the xenios waitlist";

  const text = `Hi ${fn || "there"},

Thanks for joining the xenios waitlist. You're on the list.

xenios gives coaches two AI agents. One helps run the practice. One supports each client between sessions, in your voice, always disclosed as AI.

We onboard coaches in small groups, so we will reach out as soon as a spot opens for you. If you have a question before then, just reply to this email or write to team@xeniostechnology.com.

The xenios team
`;

  const html = shell(`
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 32px;">xenios</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 16px;">Hi ${fn || "there"},</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 16px;">Thanks for joining the xenios waitlist. You're on the list.</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 16px;">xenios gives coaches two AI agents. One helps run the practice. One supports each client between sessions, in your voice, always disclosed as AI.</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 24px;">We onboard coaches in small groups, so we will reach out as soon as a spot opens for you. If you have a question before then, just reply to this email or write to <a href="mailto:team@xeniostechnology.com" style="color:#E04F1F;font-weight:600;">team@xeniostechnology.com</a>.</p>
    <p style="font-size:17px;line-height:1.6;margin:0;">The xenios team</p>
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
  phone?: string | null;
  role?: string | null;
  company?: string | null;
  city?: string | null;
  handle_or_url?: string | null;
  client_count?: string | null;
  interest?: string | null;
  consent?: boolean;
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

  const subject = `New waitlist signup: ${row.name || row.email}, ${row.role || "(no role)"}`;
  const text = `New waitlist signup.

Name: ${row.name || "(none)"}
Email: ${row.email}
Phone: ${row.phone || "(none)"}
Role: ${row.role || "(none)"}
Company/gym/practice: ${row.company || "(none)"}
City: ${row.city || "(none)"}
Instagram/website: ${row.handle_or_url || "(none)"}
Clients managed: ${row.client_count || "(none)"}
Interested in: ${row.interest || "(none)"}
Consent: ${row.consent ? "yes" : "no"}

Source page: ${row.source_page || "(none)"}
Landing page: ${row.landing_page || "(none)"}
Referrer: ${row.referrer_url || "(none)"}
UTM: ${row.utm_source || "(none)"} / ${row.utm_medium || "(none)"} / ${row.utm_campaign || "(none)"} / ${row.utm_content || "(none)"} / ${row.utm_term || "(none)"}
Submitted: ${new Date().toISOString()}
IP: ${row.ip || "(none)"}

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
  const subject = "We received your interest in xenios";

  const text = `Hi ${fn || "there"},

Thanks for sharing your interest in xenios. We have received it.

To be clear, this is a non-binding indication of interest, not a contract and not a commitment to pay. It simply tells us you would like to be part of the early founding group of coaches.

Someone from our team will follow up to talk through how xenios could fit your practice. If you want to reach us first, reply here or write to team@xeniostechnology.com.

The xenios team
`;

  const html = shell(`
    <p style="font-size:28px;font-weight:900;letter-spacing:-0.04em;text-transform:lowercase;margin:0 0 32px;">xenios</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 16px;">Hi ${fn || "there"},</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 16px;">Thanks for sharing your interest in xenios. We have received it.</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 16px;">To be clear, this is a non-binding indication of interest, not a contract and not a commitment to pay. It simply tells us you would like to be part of the early founding group of coaches.</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 24px;">Someone from our team will follow up to talk through how xenios could fit your practice. If you want to reach us first, reply here or write to <a href="mailto:team@xeniostechnology.com" style="color:#E04F1F;font-weight:600;">team@xeniostechnology.com</a>.</p>
    <p style="font-size:17px;line-height:1.6;margin:0;">The xenios team</p>
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
  nonbinding_ack?: boolean;
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

  const subject = `New early-interest submission: ${row.name || row.email || "unknown"}, ${row.business_name || "(no business)"}`;
  const text = `New early-interest submission (non-binding).

Name: ${row.name || "(none)"}
Email: ${row.email || "(none)"}
Phone: ${row.phone || "(none)"}
Business name: ${row.business_name || "(none)"}
Role: ${row.role || "(none)"}
Website/Instagram: ${row.url_or_handle || "(none)"}
Clients: ${row.client_count || "(none)"}
Why interested: ${row.why_interested || "(none)"}
Non-binding acknowledged: ${row.nonbinding_ack ? "yes" : "no"}

Source page: ${row.source_page || "(none)"}
Landing page: ${row.landing_page || "(none)"}
Referrer: ${row.referrer_url || "(none)"}
UTM: ${row.utm_source || "(none)"} / ${row.utm_medium || "(none)"} / ${row.utm_campaign || "(none)"} / ${row.utm_content || "(none)"} / ${row.utm_term || "(none)"}
Submitted: ${new Date().toISOString()}
IP: ${row.ip || "(none)"}

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
