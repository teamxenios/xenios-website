// ---------------------------------------------------------------------------
// Email configuration resolver (Mega 1 section 2). Root cause of the silent
// email loss: the client fetched Resend credentials ONLY through the Replit
// connector, which does not exist on Render, so every send threw and was
// swallowed. Resolution order:
//   1. direct environment variables (production path)
//   2. Replit connector (legacy/local fallback)
//   3. explicit unavailable state
// Server-only. Never log keys or full recipient lists.
// ---------------------------------------------------------------------------

export type EmailConfiguration = {
  provider: "resend-env" | "resend-replit-connector" | "unavailable";
  apiKey?: string;
  fromEmail?: string;
  replyToEmail?: string;
  adminRecipients: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(...sources: Array<string | undefined>): string[] {
  const out: string[] = [];
  for (const source of sources) {
    for (const raw of (source ?? "").split(",")) {
      const email = raw.trim().toLowerCase();
      if (email && EMAIL_RE.test(email) && !out.includes(email)) out.push(email);
    }
  }
  return out;
}

// One normalized admin-recipient list for every internal alert.
export function adminRecipients(): string[] {
  const list = parseRecipients(
    process.env.RESEARCH_NOTIFICATION_EMAILS,
    process.env.ADMIN_EMAILS,
    process.env.ADMIN_EMAIL,
  );
  return list.length ? list : ["samuel@xeniostechnology.com"];
}

async function tryReplitConnector(): Promise<{ apiKey: string; fromEmail?: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !xReplitToken) return null;
  try {
    const response = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
      { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const settings = data.items?.[0]?.settings;
    if (!settings?.api_key) return null;
    return { apiKey: settings.api_key, fromEmail: settings.from_email };
  } catch {
    return null;
  }
}

export async function resolveEmailConfiguration(): Promise<EmailConfiguration> {
  const recipients = adminRecipients();
  const direct = process.env.RESEND_API_KEY?.trim();
  if (direct) {
    return {
      provider: "resend-env",
      apiKey: direct,
      fromEmail: process.env.FROM_EMAIL?.trim() || undefined,
      replyToEmail: process.env.REPLY_TO_EMAIL?.trim() || undefined,
      adminRecipients: recipients,
    };
  }
  const connector = await tryReplitConnector();
  if (connector) {
    return {
      provider: "resend-replit-connector",
      apiKey: connector.apiKey,
      fromEmail: connector.fromEmail || process.env.FROM_EMAIL?.trim() || undefined,
      replyToEmail: process.env.REPLY_TO_EMAIL?.trim() || undefined,
      adminRecipients: recipients,
    };
  }
  return { provider: "unavailable", adminRecipients: recipients };
}

// Startup diagnostic: booleans and counts only, never values.
export async function logEmailStartupDiagnostics(log: (message: string, source?: string) => void) {
  const config = await resolveEmailConfiguration();
  log(
    `provider=${config.provider} apiKey=${config.apiKey ? "set" : "MISSING"} ` +
      `from=${config.fromEmail ? "set" : "default"} replyTo=${config.replyToEmail ? "set" : "unset"} ` +
      `adminRecipients=${config.adminRecipients.length}`,
    "email",
  );
}
