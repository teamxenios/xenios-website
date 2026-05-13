import { Resend } from "resend";
import type { Waitlist } from "@shared/schema";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  const response = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
  );

  if (!response.ok) {
    throw new Error(`Connector fetch failed with status ${response.status}`);
  }

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
const FROM_DEFAULT = `Xenios <${TEAM_EMAIL}>`;
const FROM_INTERNAL = `Xenios Waitlist <${TEAM_EMAIL}>`;

const ROLE_LABELS: Record<string, string> = {
  personal_trainer: "Personal trainer / strength coach",
  nutritionist: "Nutritionist / registered dietitian",
  glp1_coach: "GLP-1 / metabolic health coach",
  longevity_specialist: "Longevity / performance specialist",
  functional_medicine: "Functional medicine practitioner",
  health_coach: "Health coach / wellness pro",
  rn_rd_cashpay: "RN or RD in cash-pay practice",
  recovery_sleep_mind: "Recovery, sleep, or mind coach",
  biohacker: "Biohacker / paid 1:1 program",
  sports_team: "Sports / performance team",
  other: "Other",
};

const TEAM_SIZE_LABELS: Record<string, string> = {
  solo: "Solo",
  "2_5": "2–5",
  "6_20": "6–20",
  "21_100": "21–100",
  "100_plus": "100+",
};

const CLIENTS_LABELS: Record<string, string> = {
  "0_10": "0–10",
  "11_50": "11–50",
  "51_200": "51–200",
  "201_1000": "201–1,000",
  "1000_plus": "1,000+",
};

export async function sendConfirmationEmail({
  email,
  position,
  count,
}: {
  email: string;
  position: number;
  count: number;
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

  const text = `Hi —

You just joined the Xenios waitlist. We are glad you did.

A short note about what you've stepped into:

We are building the operating system for proactive and preventive health practitioners — the people working upstream of disease, alongside their clients, every day. An AI-native workspace that takes the administrative weight off your hands, holds the full picture of every client you serve, and stays out of the way of the human work that only you can do.

We are not in a hurry to be loud. We are in a hurry to be right. The product is being built carefully, with practitioners we trust, in small waves. You are now on the very short list of people we will be talking to as those waves open.

Your position on the waitlist: #${position} of ${count}
(That number updates live on the site.)

While you wait, two small asks:

→ Follow @officialxenios on Instagram: https://www.instagram.com/officialxenios/
→ Follow us on LinkedIn: https://www.linkedin.com/company/officialxenios

That is where the early signals will appear first.

If anything you want us to know didn't fit in the form, just reply to this email. A human reads every reply.

— The team at Xenios
Austin, Texas
team@xeniostechnology.com
`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#1A1A1A;background:#F2EDE2;">
    <p style="font-size:24px;font-weight:800;letter-spacing:-0.03em;margin:0 0 32px;">xenios<span style="color:#E97D42">.</span></p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Hi —</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">You just joined the Xenios waitlist. We are glad you did.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">A short note about what you've stepped into:</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">We are building the operating system for proactive and preventive health practitioners — the people working upstream of disease, alongside their clients, every day. An AI-native workspace that takes the administrative weight off your hands, holds the full picture of every client you serve, and stays out of the way of the human work that only you can do.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">We are not in a hurry to be loud. We are in a hurry to be right. The product is being built carefully, with practitioners we trust, in small waves. You are now on the very short list of people we will be talking to as those waves open.</p>
    <div style="background:#FBF7EC;border-radius:16px;padding:24px;margin:24px 0;text-align:center;">
      <p style="margin:0 0 8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#3A3A3A;">Your position</p>
      <p style="margin:0;font-size:48px;font-weight:800;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;">#${position} <span style="color:#3A3A3A;font-weight:500;font-size:24px;">of ${count}</span></p>
      <p style="margin:8px 0 0;font-size:12px;color:#3A3A3A;">That number updates live on the site.</p>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">While you wait, two small asks:</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">→ Follow <a href="https://www.instagram.com/officialxenios/" style="color:#D85F1F;">@officialxenios on Instagram</a></p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">→ Follow us on <a href="https://www.linkedin.com/company/officialxenios" style="color:#D85F1F;">LinkedIn</a></p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">That is where the early signals will appear first.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">If anything you want us to know didn't fit in the form, just reply to this email. A human reads every reply.</p>
    <p style="font-size:16px;line-height:1.6;margin:32px 0 0;">— The team at Xenios<br/>Austin, Texas<br/><a href="mailto:team@xeniostechnology.com" style="color:#1A1A1A;">team@xeniostechnology.com</a></p>
  </div>`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: email,
      replyTo: TEAM_EMAIL,
      subject: "You're on the list. Welcome to Xenios.",
      text,
      html,
    });
    console.log(`[email] confirmation sent to ${email}`);
  } catch (err) {
    console.error("[email] confirmation failed:", err);
  }
}

export async function sendInternalNotification({
  submission,
  position,
  count,
  referrer,
  source,
  country,
}: {
  submission: Waitlist;
  position: number;
  count: number;
  referrer?: string | null;
  source?: string | null;
  country?: string | null;
}) {
  let client: Resend;
  let fromEmail: string;
  try {
    const r = await getResendClient();
    client = r.client;
    fromEmail = r.fromEmail || FROM_INTERNAL;
  } catch {
    return;
  }

  const role = ROLE_LABELS[submission.role] ?? submission.role;
  const teamSize = TEAM_SIZE_LABELS[submission.teamSize] ?? submission.teamSize;
  const clients = CLIENTS_LABELS[submission.clientsActive] ?? submission.clientsActive;
  const practice = submission.practiceName || "—";
  const tools = submission.toolsToday || "—";
  const message = submission.message || "— none —";

  const text = `NEW WAITLIST SIGNUP
———————————————

Email:            ${submission.email}
Role:             ${role}
Practice:         ${practice}
Team size:        ${teamSize}
Active clients:   ${clients}
Tools today:      ${tools}
Consent:          ${submission.consent ? "yes" : "no"}

Message:
${message}

———————————————

Position:         #${position} of ${count}
Source:           ${source ?? "direct"}
Referrer:         ${referrer ?? "—"}
IP country:       ${country ?? "—"}
Timestamp:        ${submission.createdAt.toISOString()}
ID:               ${submission.id}

Reply to this email to reach them directly.
`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: TEAM_EMAIL,
      replyTo: submission.email,
      subject: `New waitlist signup — ${role} · ${teamSize} · ${practice}`,
      text,
    });
    console.log(`[email] internal notification sent for ${submission.email}`);
  } catch (err) {
    console.error("[email] internal notification failed:", err);
  }
}
