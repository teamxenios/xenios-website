#!/usr/bin/env -S npx tsx

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PASS = "PASS" as const;
export const FAIL = "FAIL" as const;
export const UNVERIFIED = "UNVERIFIED" as const;

export type ProofStatus = typeof PASS | typeof FAIL | typeof UNVERIFIED;

export type ProofCheck = {
  name: string;
  status: ProofStatus;
  detail: string;
};

export const PRODUCTION_PROJECT_REF = "yvzeduaxbwgcwllhywff" as const;
export const PRODUCTION_SUPABASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co` as const;
export const PRODUCTION_SITE_ORIGIN = "https://xeniostechnology.com" as const;
export const PRODUCTION_SMTP_HOST = "smtp.resend.com" as const;
export const PRODUCTION_SMTP_PORT = "587" as const;
export const PRODUCTION_SMTP_USER = "resend" as const;
export const PRODUCTION_SMTP_SENDER_NAME = "Xenios Research" as const;
export const PRODUCTION_AUTH_SENDER = "research@xeniostechnology.com" as const;
export const PRODUCTION_RECOVERY_SUBJECT = "Reset your Xenios password" as const;

const MINIMUM_SMTP_FREQUENCY_SECONDS = 60;
const MAXIMUM_PROJECT_EMAILS_PER_HOUR = 30;
const REQUEST_TIMESTAMP_MAX_AGE_MS = 30 * 60 * 1_000;
const REQUEST_TIMESTAMP_FUTURE_SKEW_MS = 30 * 1_000;
const PROVIDER_CREATED_BEFORE_REQUEST_SKEW_MS = 30 * 1_000;
const PROVIDER_CREATED_AFTER_REQUEST_MAX_MS = 5 * 60 * 1_000;

export type CliOptions = {
  projectRef: string | null;
  supabaseUrl: string | null;
  siteOrigin: string | null;
  redirectUrl: string | null;
  expectedSmtpHost: string | null;
  expectedSender: string | null;
  expectedRecoverySubject: string | null;
  checkConfig: boolean;
  executeRecovery: boolean;
  verifyDelivery: boolean;
  help: boolean;
};

export type ValidatedOptions = Omit<CliOptions, "projectRef" | "supabaseUrl" | "siteOrigin" | "redirectUrl" | "expectedSmtpHost" | "expectedSender" | "expectedRecoverySubject"> & {
  projectRef: string;
  supabaseUrl: string;
  siteOrigin: string;
  redirectUrl: string;
  adminRedirectUrl: string;
  expectedSmtpHost: string;
  expectedSender: string;
  expectedRecoverySubject: string;
  recipient: string | null;
  managementToken: string | null;
  anonKey: string | null;
  resendApiKey: string | null;
  resendMessageId: string | null;
  requestedAfterUtc: string | null;
  senderAuthConfirmed: boolean;
  smtpPasswordConfirmed: boolean;
  minimumPasswordConfirmed: boolean;
  projectRateLimitConfirmed: boolean;
};

export type ProofRun = {
  mode: "PLAN_VALID" | "CONFIGURED" | "REQUEST_ACCEPTED" | "PROVIDER_METADATA_VERIFIED" | "INCOMPLETE";
  status: ProofStatus;
  checks: ProofCheck[];
};

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;
const validatedOptionInstances = new WeakSet<object>();

function sealValidatedOptions(options: ValidatedOptions): ValidatedOptions {
  Object.freeze(options);
  validatedOptionInstances.add(options);
  return options;
}

const VALUE_FLAGS = new Map<keyof CliOptions, string>([
  ["projectRef", "--project-ref"],
  ["supabaseUrl", "--supabase-url"],
  ["siteOrigin", "--site-origin"],
  ["redirectUrl", "--redirect-url"],
  ["expectedSmtpHost", "--expected-smtp-host"],
  ["expectedSender", "--expected-sender"],
  ["expectedRecoverySubject", "--expected-recovery-subject"],
]);

const BOOLEAN_FLAGS = new Map<keyof CliOptions, string>([
  ["checkConfig", "--check-config"],
  ["executeRecovery", "--execute-recovery"],
  ["verifyDelivery", "--verify-delivery"],
  ["help", "--help"],
]);

const CONFIG_CHECK_NAMES = [
  "management.auth_config_reachable",
  "smtp.transport_fields_present",
  "smtp.password_configured",
  "smtp.expected_host",
  "smtp.expected_port",
  "smtp.expected_user",
  "smtp.expected_sender_name",
  "smtp.expected_sender",
  "smtp.sender_domain_verified",
  "smtp.rate_limit_configured",
  "auth.project_email_rate_limit",
  "auth.email_enabled",
  "auth.confirmation_required",
  "auth.recovery_subject_exact",
  "security.minimum_password_length",
  "redirect.site_url_exact",
  "redirect.member_recovery_exact",
  "redirect.admin_recovery_exact",
  "redirect.broad_production_wildcard_absent",
  "redirect.unapproved_entries_absent",
] as const;

const USAGE = `Usage:
  npx tsx scripts/acceptance/verify-supabase-auth-email.ts \\
    --project-ref <20-char project ref> \\
    --supabase-url <exact https project URL> \\
    --site-origin <exact https production origin> \\
    --redirect-url <exact /research/reset-password URL> \\
    --expected-smtp-host <sanctioned SMTP host> \\
    --expected-sender <verified sender address> \\
    --expected-recovery-subject <pinned recovery subject> \\
    [--check-config] [--execute-recovery | --verify-delivery]

Modes:
  no mode flags         validate a redacted plan; make zero network calls
  --check-config        GET the Supabase Management Auth config (read only)
  --execute-recovery    after a green config gate, issue exactly one recovery request
  --verify-delivery     GET one existing Resend message and require delivered state

Secret / controlled-input environment variables:
  SUPABASE_ACCESS_TOKEN          required by --check-config
  SUPABASE_ANON_KEY              required by --execute-recovery
  AUTH_EMAIL_TEST_RECIPIENT      required by live recovery/delivery proof
  AUTH_EMAIL_CONFIRM_RECIPIENT   must exactly match the controlled recipient
  AUTH_EMAIL_RESEND_MESSAGE_ID   required by --verify-delivery
  AUTH_EMAIL_REQUESTED_AFTER_UTC required by --verify-delivery
  RESEND_API_KEY                 required by --verify-delivery
  AUTH_EMAIL_CONFIRM_SENDER_AUTH must equal YES after Resend domain verification
  AUTH_EMAIL_CONFIRM_SMTP_PASSWORD_PRESENT
                                 may equal YES if Management API redacts smtp_pass
  AUTH_EMAIL_CONFIRM_MIN_PASSWORD_8
                                 may equal YES if Management API omits the setting
  AUTH_EMAIL_CONFIRM_PROJECT_RATE_LIMIT
                                 may equal YES only after a dashboard limit of 1-30/hour is verified

The tool never prints credentials, recipient addresses, message content, or action links.`;

function emptyOptions(): CliOptions {
  return {
    projectRef: null,
    supabaseUrl: null,
    siteOrigin: null,
    redirectUrl: null,
    expectedSmtpHost: null,
    expectedSender: null,
    expectedRecoverySubject: null,
    checkConfig: false,
    executeRecovery: false,
    verifyDelivery: false,
    help: false,
  };
}

export function parseArgs(argv: string[]): CliOptions {
  const options = emptyOptions();
  const seen = new Set<string>();
  const valueByFlag = new Map(Array.from(VALUE_FLAGS, ([key, flag]) => [flag, key]));
  const booleanByFlag = new Map(Array.from(BOOLEAN_FLAGS, ([key, flag]) => [flag, key]));

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const valueKey = valueByFlag.get(token);
    const booleanKey = booleanByFlag.get(token);

    if (valueKey) {
      if (seen.has(token)) throw new Error("A singleton flag was supplied more than once.");
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("A required flag value is missing.");
      (options[valueKey] as string | null) = value;
      seen.add(token);
      index += 1;
      continue;
    }

    if (booleanKey) {
      if (seen.has(token)) throw new Error("A singleton flag was supplied more than once.");
      (options[booleanKey] as boolean) = true;
      seen.add(token);
      continue;
    }

    // Never echo an unknown argument: a caller may have accidentally put a
    // credential or recipient on the command line.
    throw new Error("An unknown or positional argument was refused.");
  }

  return options;
}

function required(value: string | null, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function exactHttpsOrigin(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) throw new Error(`${name} must be an exact HTTPS origin with no path, port, credentials, query, or fragment.`);
  return parsed.origin;
}

function exactRecoveryUrl(value: string, siteOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--redirect-url must be a valid URL.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.origin !== siteOrigin
    || parsed.pathname !== "/research/reset-password"
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) throw new Error("--redirect-url must be the exact HTTPS /research/reset-password URL on --site-origin.");
  return parsed.href;
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizedControlledRecipient(env: Environment): string | null {
  const recipient = env.AUTH_EMAIL_TEST_RECIPIENT?.trim().toLowerCase() ?? "";
  const confirmation = env.AUTH_EMAIL_CONFIRM_RECIPIENT?.trim().toLowerCase() ?? "";
  if (!recipient && !confirmation) return null;
  if (!validEmail(recipient) || recipient !== confirmation) {
    throw new Error("Controlled recipient confirmation is missing, invalid, or does not exactly match.");
  }
  return recipient;
}

function requestTimestampIsRecent(value: string | null, nowMs: number): boolean {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp)
    && timestamp >= nowMs - REQUEST_TIMESTAMP_MAX_AGE_MS
    && timestamp <= nowMs + REQUEST_TIMESTAMP_FUTURE_SKEW_MS;
}

export function validateOptions(
  options: CliOptions,
  env: Environment = process.env,
  nowMs = Date.now(),
): ValidatedOptions {
  if (options.help) {
    return sealValidatedOptions({
      ...options,
      projectRef: "",
      supabaseUrl: "",
      siteOrigin: "",
      redirectUrl: "",
      adminRedirectUrl: "",
      expectedSmtpHost: "",
      expectedSender: "",
      expectedRecoverySubject: "",
      recipient: null,
      managementToken: null,
      anonKey: null,
      resendApiKey: null,
      resendMessageId: null,
      requestedAfterUtc: null,
      senderAuthConfirmed: false,
      smtpPasswordConfirmed: false,
      minimumPasswordConfirmed: false,
      projectRateLimitConfirmed: false,
    });
  }

  const projectRef = required(options.projectRef, "--project-ref").toLowerCase();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("--project-ref must be an exact 20-character Supabase project ref.");
  if (projectRef !== PRODUCTION_PROJECT_REF) throw new Error("--project-ref is not the reviewed Xenios production project.");

  const supabaseUrl = exactHttpsOrigin(required(options.supabaseUrl, "--supabase-url"), "--supabase-url");
  if (new URL(supabaseUrl).hostname !== `${projectRef}.supabase.co`) {
    throw new Error("--supabase-url does not match --project-ref.");
  }
  if (supabaseUrl !== PRODUCTION_SUPABASE_URL) throw new Error("--supabase-url is not the reviewed Xenios production Auth origin.");

  const siteOrigin = exactHttpsOrigin(required(options.siteOrigin, "--site-origin"), "--site-origin");
  if (siteOrigin !== PRODUCTION_SITE_ORIGIN) throw new Error("--site-origin is not the reviewed Xenios production origin.");
  const redirectUrl = exactRecoveryUrl(required(options.redirectUrl, "--redirect-url"), siteOrigin);
  const adminRedirectUrl = new URL("/admin", siteOrigin).href;

  const expectedSmtpHost = required(options.expectedSmtpHost, "--expected-smtp-host").toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(expectedSmtpHost)) throw new Error("--expected-smtp-host is invalid.");
  if (expectedSmtpHost !== PRODUCTION_SMTP_HOST) throw new Error("--expected-smtp-host is not the reviewed production provider.");

  const expectedSender = required(options.expectedSender, "--expected-sender").toLowerCase();
  if (!validEmail(expectedSender)) throw new Error("--expected-sender must be a valid address.");
  if (expectedSender !== PRODUCTION_AUTH_SENDER) throw new Error("--expected-sender is not the reviewed Xenios Auth sender.");
  const expectedRecoverySubject = required(options.expectedRecoverySubject, "--expected-recovery-subject");
  if (expectedRecoverySubject.length > 200 || /[\r\n]/.test(expectedRecoverySubject)) {
    throw new Error("--expected-recovery-subject must be a single line of at most 200 characters.");
  }
  if (expectedRecoverySubject !== PRODUCTION_RECOVERY_SUBJECT) {
    throw new Error("--expected-recovery-subject is not the reviewed Xenios recovery template subject.");
  }

  if (options.executeRecovery && !options.checkConfig) {
    throw new Error("--execute-recovery requires --check-config so a send cannot bypass the configuration gate.");
  }
  if (options.executeRecovery && options.verifyDelivery) {
    throw new Error("Recovery request and delivery verification must be separate runs.");
  }

  const recipient = normalizedControlledRecipient(env);
  if ((options.executeRecovery || options.verifyDelivery) && !recipient) {
    throw new Error("Live proof requires a double-confirmed controlled recipient in the environment.");
  }

  const resendMessageId = env.AUTH_EMAIL_RESEND_MESSAGE_ID?.trim() || null;
  if (options.verifyDelivery && (!resendMessageId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resendMessageId))) {
    throw new Error("--verify-delivery requires a valid provider message ID in the environment.");
  }
  const requestedAfterRaw = env.AUTH_EMAIL_REQUESTED_AFTER_UTC?.trim() || null;
  const requestedAfterTime = requestedAfterRaw ? Date.parse(requestedAfterRaw) : Number.NaN;
  if (options.verifyDelivery && (!requestedAfterRaw || !Number.isFinite(requestedAfterTime))) {
    throw new Error("--verify-delivery requires a valid recovery-request UTC timestamp in the environment.");
  }
  if (options.verifyDelivery && !requestTimestampIsRecent(requestedAfterRaw, nowMs)) {
    throw new Error("The recovery-request timestamp is stale or implausibly future-dated; issue a fresh controlled request.");
  }

  return sealValidatedOptions({
    ...options,
    projectRef,
    supabaseUrl,
    siteOrigin,
    redirectUrl,
    adminRedirectUrl,
    expectedSmtpHost,
    expectedSender,
    expectedRecoverySubject,
    recipient,
    managementToken: env.SUPABASE_ACCESS_TOKEN?.trim() || null,
    anonKey: env.SUPABASE_ANON_KEY?.trim() || null,
    resendApiKey: env.RESEND_API_KEY?.trim() || null,
    resendMessageId,
    requestedAfterUtc: requestedAfterRaw ? new Date(requestedAfterTime).toISOString() : null,
    senderAuthConfirmed: env.AUTH_EMAIL_CONFIRM_SENDER_AUTH?.trim().toUpperCase() === "YES",
    smtpPasswordConfirmed: env.AUTH_EMAIL_CONFIRM_SMTP_PASSWORD_PRESENT?.trim().toUpperCase() === "YES",
    minimumPasswordConfirmed: env.AUTH_EMAIL_CONFIRM_MIN_PASSWORD_8?.trim().toUpperCase() === "YES",
    projectRateLimitConfirmed: env.AUTH_EMAIL_CONFIRM_PROJECT_RATE_LIMIT?.trim().toUpperCase() === "YES",
  });
}

function record(checks: ProofCheck[], name: string, status: ProofStatus, detail: string): void {
  checks.push({ name, status, detail });
}

function overall(checks: ProofCheck[]): ProofStatus {
  if (checks.some((check) => check.status === FAIL)) return FAIL;
  if (checks.some((check) => check.status === UNVERIFIED)) return UNVERIFIED;
  return PASS;
}

function allowList(config: Record<string, unknown>): { entries: string[]; valid: boolean } {
  const raw = config.uri_allow_list;
  if (Array.isArray(raw)) {
    const valid = raw.length > 0 && raw.every((value) => typeof value === "string" && value.trim().length > 0);
    return {
      entries: raw.filter((value): value is string => typeof value === "string").map((value) => value.trim()),
      valid,
    };
  }
  if (typeof raw === "string") {
    const entries = raw.split(",").map((value) => value.trim());
    return { entries, valid: entries.length > 0 && entries.every(Boolean) };
  }
  return { entries: [], valid: false };
}

function normalizedExactUrl(value: string): string | null {
  if (value.includes("*")) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

function smtpPasswordIsMasked(value: string): boolean {
  const normalized = value.trim();
  return /^\*+$/.test(normalized)
    || /^x+$/i.test(normalized)
    || /^\[?redacted\]?$/i.test(normalized)
    || /^<redacted>$/i.test(normalized);
}

function markConfigUnavailable(checks: ProofCheck[], detail: string): void {
  for (const name of CONFIG_CHECK_NAMES) record(checks, name, UNVERIFIED, detail);
}

export function evaluateAuthConfig(
  config: Record<string, unknown>,
  options: ValidatedOptions,
  checks: ProofCheck[] = [],
): ProofCheck[] {
  record(checks, "management.auth_config_reachable", PASS, "Management Auth config returned JSON; raw values were not logged.");

  const requiredTransportFields = ["smtp_host", "smtp_port", "smtp_user", "smtp_admin_email", "smtp_sender_name"];
  const missing = requiredTransportFields.filter((field) => {
    const value = config[field];
    return (typeof value !== "string" && typeof value !== "number") || String(value).trim() === "";
  });
  record(
    checks,
    "smtp.transport_fields_present",
    missing.length === 0 ? PASS : FAIL,
    missing.length === 0 ? "Required Custom SMTP transport fields are populated." : `Missing or empty fields: ${missing.join(", ")}.`,
  );

  if (!("smtp_pass" in config)) {
    record(
      checks,
      "smtp.password_configured",
      options.smtpPasswordConfirmed ? PASS : UNVERIFIED,
      options.smtpPasswordConfirmed
        ? "Management API redacted the SMTP password and a dashboard-only presence check was explicitly attested."
        : "Management API omitted the SMTP password field; verify it in the dashboard without exporting it.",
    );
  } else {
    const password = config.smtp_pass;
    const passwordText = typeof password === "string" ? password.trim() : "";
    const isMasked = Boolean(passwordText) && smtpPasswordIsMasked(passwordText);
    record(
      checks,
      "smtp.password_configured",
      !passwordText ? FAIL : isMasked ? (options.smtpPasswordConfirmed ? PASS : UNVERIFIED) : PASS,
      !passwordText
        ? "SMTP password is explicitly empty."
        : isMasked
          ? options.smtpPasswordConfirmed
            ? "Management API returned a mask and dashboard-only password presence was explicitly attested."
            : "Management API returned a mask; verify password presence in the dashboard without exporting it."
          : "Management API reports configured password material; value was ignored.",
    );
  }

  const actualHost = typeof config.smtp_host === "string" ? config.smtp_host.trim().toLowerCase() : "";
  record(checks, "smtp.expected_host", actualHost === options.expectedSmtpHost ? PASS : FAIL, "SMTP host was compared to the pinned sanctioned provider without logging either value.");

  const actualPort = typeof config.smtp_port === "string" ? config.smtp_port.trim() : "";
  record(checks, "smtp.expected_port", actualPort === PRODUCTION_SMTP_PORT ? PASS : FAIL, `SMTP port must be the reviewed TLS submission port ${PRODUCTION_SMTP_PORT}.`);

  const actualUser = typeof config.smtp_user === "string" ? config.smtp_user.trim().toLowerCase() : "";
  record(checks, "smtp.expected_user", actualUser === PRODUCTION_SMTP_USER ? PASS : FAIL, "SMTP username was compared to the reviewed provider value without logging it.");

  const actualSenderName = typeof config.smtp_sender_name === "string" ? config.smtp_sender_name.trim() : "";
  record(checks, "smtp.expected_sender_name", actualSenderName === PRODUCTION_SMTP_SENDER_NAME ? PASS : FAIL, "SMTP sender name was compared to the reviewed Xenios Auth identity without logging it.");

  const actualSender = typeof config.smtp_admin_email === "string" ? config.smtp_admin_email.trim().toLowerCase() : "";
  record(checks, "smtp.expected_sender", actualSender === options.expectedSender ? PASS : FAIL, "Sender was compared to the pinned verified address without logging either value.");
  record(
    checks,
    "smtp.sender_domain_verified",
    options.senderAuthConfirmed ? PASS : UNVERIFIED,
    options.senderAuthConfirmed
      ? "Resend sender-domain authentication was explicitly attested after dashboard verification."
      : "SPF/DKIM/domain verification is not exposed by Supabase; confirm it in Resend before sending.",
  );

  const frequency = typeof config.smtp_max_frequency === "number" ? config.smtp_max_frequency : Number.NaN;
  record(
    checks,
    "smtp.rate_limit_configured",
    Number.isInteger(frequency) && frequency >= MINIMUM_SMTP_FREQUENCY_SECONDS ? PASS : FAIL,
    `Per-recipient SMTP frequency must be at least ${MINIMUM_SMTP_FREQUENCY_SECONDS} seconds.`,
  );
  const projectEmailLimitPresent = Object.prototype.hasOwnProperty.call(config, "rate_limit_email_sent");
  const projectEmailLimit = typeof config.rate_limit_email_sent === "number" ? config.rate_limit_email_sent : Number.NaN;
  const projectLimitVisible = Number.isInteger(projectEmailLimit)
    && projectEmailLimit >= 1
    && projectEmailLimit <= MAXIMUM_PROJECT_EMAILS_PER_HOUR;
  record(
    checks,
    "auth.project_email_rate_limit",
    projectLimitVisible ? PASS : projectEmailLimitPresent ? FAIL : options.projectRateLimitConfirmed ? PASS : UNVERIFIED,
    projectLimitVisible
      ? `Management API reports a project email limit within the reviewed 1-${MAXIMUM_PROJECT_EMAILS_PER_HOUR}/hour launch ceiling.`
      : projectEmailLimitPresent
        ? `Present project email limit must be an integer within the reviewed 1-${MAXIMUM_PROJECT_EMAILS_PER_HOUR}/hour launch ceiling.`
        : options.projectRateLimitConfirmed
          ? `Management API omitted the project email limit and a dashboard value within 1-${MAXIMUM_PROJECT_EMAILS_PER_HOUR}/hour was explicitly attested.`
          : "Management API omitted the project email limit; verify the project-wide value in the dashboard.",
  );
  record(checks, "auth.email_enabled", config.external_email_enabled === true ? PASS : FAIL, "Email/password Auth must remain enabled.");
  record(checks, "auth.confirmation_required", config.mailer_autoconfirm === false ? PASS : FAIL, "Automatic email confirmation must remain disabled.");
  const recoverySubject = typeof config.mailer_subjects_recovery === "string" ? config.mailer_subjects_recovery : "";
  record(checks, "auth.recovery_subject_exact", recoverySubject === options.expectedRecoverySubject ? PASS : FAIL, "Recovery subject was compared to the pinned Auth template without logging either value.");

  const minimumPresent = Object.prototype.hasOwnProperty.call(config, "password_min_length");
  const minimum = typeof config.password_min_length === "number" ? config.password_min_length : Number.NaN;
  if (!minimumPresent) {
    record(
      checks,
      "security.minimum_password_length",
      options.minimumPasswordConfirmed ? PASS : UNVERIFIED,
      options.minimumPasswordConfirmed
        ? "Management API omitted the setting and the dashboard minimum of at least 8 was explicitly attested."
        : "Management API did not expose a numeric minimum-password setting.",
    );
  } else if (!Number.isInteger(minimum)) {
    record(checks, "security.minimum_password_length", FAIL, "Present minimum-password setting is malformed and cannot be replaced by attestation.");
  } else {
    record(checks, "security.minimum_password_length", minimum >= 8 ? PASS : FAIL, "Minimum password length must be at least 8.");
  }

  let configuredSite: string | null = null;
  if (typeof config.site_url === "string") {
    try {
      const parsed = new URL(config.site_url);
      if (
        parsed.protocol === "https:"
        && !parsed.username
        && !parsed.password
        && !parsed.port
        && parsed.pathname === "/"
        && !parsed.search
        && !parsed.hash
      ) configuredSite = parsed.origin;
    } catch {
      configuredSite = null;
    }
  }
  record(checks, "redirect.site_url_exact", configuredSite === options.siteOrigin ? PASS : FAIL, "Site URL was compared to the pinned production origin.");

  const { entries: allowed, valid: allowListShapeValid } = allowList(config);
  const normalized = new Set(allowed.map(normalizedExactUrl).filter((value): value is string => Boolean(value)));
  record(checks, "redirect.member_recovery_exact", normalized.has(options.redirectUrl) ? PASS : FAIL, "Exact member recovery callback must be allowlisted.");
  record(checks, "redirect.admin_recovery_exact", normalized.has(options.adminRedirectUrl) ? PASS : FAIL, "Exact admin recovery callback must be allowlisted.");

  const anyWildcard = allowed.some((entry) => entry.includes("*"));
  record(checks, "redirect.broad_production_wildcard_absent", anyWildcard ? FAIL : PASS, "Production callbacks must be exact; every wildcard grant is refused.");

  const approvedCallbacks = new Set([options.redirectUrl, options.adminRedirectUrl]);
  const unapprovedEntries = allowed.filter((entry) => {
    const normalizedEntry = normalizedExactUrl(entry);
    return !normalizedEntry || !approvedCallbacks.has(normalizedEntry);
  });
  record(
    checks,
    "redirect.unapproved_entries_absent",
    allowListShapeValid && unapprovedEntries.length === 0 ? PASS : FAIL,
    "Additional Redirect URLs must be the closed reviewed member/admin callback set; values were not logged.",
  );
  return checks;
}

async function getAuthConfig(options: ValidatedOptions, fetchImpl: FetchLike, checks: ProofCheck[]): Promise<boolean> {
  if (!options.managementToken) {
    markConfigUnavailable(checks, "SUPABASE_ACCESS_TOKEN is unavailable; no configuration claim was made.");
    return false;
  }

  let response: Response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${options.projectRef}/config/auth`, {
      method: "GET",
      headers: { Authorization: `Bearer ${options.managementToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    markConfigUnavailable(checks, "Management Auth config request failed or timed out; no configuration claim was made.");
    return false;
  }

  if (!response.ok) {
    markConfigUnavailable(checks, `Management Auth config returned HTTP ${response.status}; response body was not logged.`);
    return false;
  }

  let config: unknown;
  try {
    config = await response.json();
  } catch {
    markConfigUnavailable(checks, "Management Auth config did not return JSON; response body was not logged.");
    return false;
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    markConfigUnavailable(checks, "Management Auth config shape was invalid; response body was not logged.");
    return false;
  }

  evaluateAuthConfig(config as Record<string, unknown>, options, checks);
  return overall(checks.filter((check) => CONFIG_CHECK_NAMES.includes(check.name as typeof CONFIG_CHECK_NAMES[number]))) === PASS;
}

async function executeRecovery(options: ValidatedOptions, fetchImpl: FetchLike, checks: ProofCheck[]): Promise<void> {
  if (!options.anonKey) {
    record(checks, "recovery.auth_request", UNVERIFIED, "SUPABASE_ANON_KEY is unavailable; no recovery request was sent.");
    return;
  }
  if (!options.recipient) {
    record(checks, "recovery.auth_request", UNVERIFIED, "Controlled recipient confirmation is unavailable; no recovery request was sent.");
    return;
  }

  // Capture before the request so the provider message cannot legitimately predate
  // the operator's correlation timestamp merely because the HTTP response was slow.
  const requestStartedAt = new Date().toISOString();
  let response: Response;
  try {
    const endpoint = new URL("/auth/v1/recover", options.supabaseUrl);
    endpoint.searchParams.set("redirect_to", options.redirectUrl);
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        apikey: options.anonKey,
        Authorization: `Bearer ${options.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: options.recipient }),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    record(checks, "recovery.auth_request", UNVERIFIED, "Auth recovery request failed or timed out; recipient and credentials were not logged.");
    return;
  }

  if (response.status === 429) {
    record(checks, "recovery.auth_request", UNVERIFIED, "Auth recovery endpoint was rate-limited (HTTP 429); do not retry automatically.");
  } else if (response.ok) {
    record(checks, "recovery.auth_request", PASS, `Auth accepted exactly one controlled recovery request started at ${requestStartedAt} (HTTP ${response.status}); delivery is not yet proven.`);
  } else {
    record(checks, "recovery.auth_request", FAIL, `Auth rejected the controlled recovery request (HTTP ${response.status}); response body was not logged.`);
  }
}

function providerAddresses(value: unknown, allowAbsent: boolean): { addresses: string[]; valid: boolean } {
  if (value === undefined && allowAbsent) return { addresses: [], valid: true };
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : null;
  if (!values) return { addresses: [], valid: false };
  const valid = values.every((item) => typeof item === "string" && validEmail(item.trim().toLowerCase()));
  return {
    addresses: values.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()),
    valid,
  };
}

function providerSenderMatches(value: unknown, expectedMailbox: string): boolean {
  if (typeof value !== "string" || /[\r\n]/.test(value)) return false;
  const sender = value.trim();
  const displayMailbox = /^([^<>,]+?)\s*<([^<>\s]+)>$/.exec(sender);
  if (!displayMailbox) return false;
  const displayName = displayMailbox[1].trim();
  const mailbox = displayMailbox[2].trim().toLowerCase();
  return displayName === PRODUCTION_SMTP_SENDER_NAME
    && validEmail(mailbox)
    && mailbox === expectedMailbox;
}

async function verifyDelivery(options: ValidatedOptions, fetchImpl: FetchLike, checks: ProofCheck[]): Promise<void> {
  if (!options.resendApiKey || !options.resendMessageId || !options.recipient) {
    record(checks, "delivery.provider_record", UNVERIFIED, "Provider key, message ID, or controlled recipient is unavailable; no delivery claim was made.");
    record(checks, "delivery.delivered", UNVERIFIED, "Provider delivery state was not inspected.");
    return;
  }
  if (!requestTimestampIsRecent(options.requestedAfterUtc, Date.now())) {
    record(checks, "delivery.request_timestamp_recent", FAIL, "Recovery-request timestamp is stale or implausibly future-dated; provider lookup was refused.");
    record(checks, "delivery.provider_record", UNVERIFIED, "Provider record was not requested with an unsafe correlation timestamp.");
    record(checks, "delivery.delivered", UNVERIFIED, "Provider delivery state was not inspected.");
    return;
  }
  record(checks, "delivery.request_timestamp_recent", PASS, "Recovery-request timestamp is recent and within the allowed clock-skew boundary.");

  let response: Response;
  try {
    response = await fetchImpl(`https://api.resend.com/emails/${encodeURIComponent(options.resendMessageId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${options.resendApiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    record(checks, "delivery.provider_record", UNVERIFIED, "Provider record request failed or timed out; no delivery claim was made.");
    record(checks, "delivery.delivered", UNVERIFIED, "Provider delivery state was not inspected.");
    return;
  }

  if (!response.ok) {
    record(checks, "delivery.provider_record", UNVERIFIED, `Provider record returned HTTP ${response.status}; response body was not logged.`);
    record(checks, "delivery.delivered", UNVERIFIED, "Provider delivery state was not inspected.");
    return;
  }

  let provider: any;
  try {
    provider = await response.json();
  } catch {
    provider = null;
  }
  if (!provider || typeof provider !== "object") {
    record(checks, "delivery.provider_record", FAIL, "Provider record shape was invalid; response body was not logged.");
    record(checks, "delivery.delivered", UNVERIFIED, "Provider delivery state was not inspectable.");
    return;
  }

  const providerId = typeof provider.id === "string" ? provider.id.trim().toLowerCase() : "";
  const messageIdMatches = providerId === options.resendMessageId.toLowerCase();
  record(checks, "delivery.message_id_exact", messageIdMatches ? PASS : FAIL, "Provider record ID was bound to the exact requested message ID; neither was logged.");

  const recipients = providerAddresses(provider.to, false);
  const cc = providerAddresses(provider.cc, true);
  const bcc = providerAddresses(provider.bcc, true);
  const recipientMatches = recipients.valid
    && cc.valid
    && bcc.valid
    && recipients.addresses.length === 1
    && recipients.addresses[0] === options.recipient
    && cc.addresses.length === 0
    && bcc.addresses.length === 0;
  record(checks, "delivery.recipient_exact", recipientMatches ? PASS : FAIL, "Provider record must have exactly one To recipient matching the controlled address and no Cc/Bcc recipients; addresses were not logged.");

  const senderMatches = providerSenderMatches(provider.from, options.expectedSender);
  record(checks, "delivery.sender_exact", senderMatches ? PASS : FAIL, "Provider sender was compared to the reviewed exact Auth sender without logging either value.");

  record(
    checks,
    "delivery.provider_record",
    messageIdMatches && recipientMatches && senderMatches ? PASS : FAIL,
    "Provider record identity, exclusive recipient, and sender binding were evaluated before delivery state.",
  );

  const subjectMatches = typeof provider.subject === "string" && provider.subject === options.expectedRecoverySubject;
  record(checks, "delivery.recovery_subject", subjectMatches ? PASS : FAIL, "Provider subject was compared to the pinned Supabase recovery template without logging either value.");

  const createdAt = typeof provider.created_at === "string" ? Date.parse(provider.created_at) : Number.NaN;
  const requestedAfter = options.requestedAfterUtc ? Date.parse(options.requestedAfterUtc) : Number.NaN;
  const createdInWindow = Number.isFinite(createdAt)
    && Number.isFinite(requestedAfter)
    && createdAt >= requestedAfter - PROVIDER_CREATED_BEFORE_REQUEST_SKEW_MS
    && createdAt <= requestedAfter + PROVIDER_CREATED_AFTER_REQUEST_MAX_MS
    && createdAt <= Date.now() + REQUEST_TIMESTAMP_FUTURE_SKEW_MS;
  record(
    checks,
    "delivery.message_created_in_window",
    createdInWindow ? PASS : FAIL,
    "Provider message creation must fall within the bounded controlled-request window and cannot be stale or future-dated.",
  );

  const event = typeof provider.last_event === "string" ? provider.last_event.toLowerCase() : "";
  const delivered = new Set(["delivered", "opened", "clicked"]);
  const failed = new Set(["bounced", "failed", "suppressed", "canceled", "complained"]);
  record(
    checks,
    "delivery.delivered",
    delivered.has(event) ? PASS : failed.has(event) ? FAIL : UNVERIFIED,
    delivered.has(event)
      ? "Provider reports delivery to the recipient mail server. Inbox placement and link behavior remain separate proofs."
      : failed.has(event)
        ? "Provider reports a terminal or unsafe delivery outcome."
        : "Provider has not yet reported a delivered or terminal outcome.",
  );
}

function runtimeTargetIsPinned(options: ValidatedOptions): boolean {
  return options.projectRef === PRODUCTION_PROJECT_REF
    && options.supabaseUrl === PRODUCTION_SUPABASE_URL
    && options.siteOrigin === PRODUCTION_SITE_ORIGIN
    && options.redirectUrl === new URL("/research/reset-password", options.siteOrigin).href
    && options.adminRedirectUrl === new URL("/admin", options.siteOrigin).href
    && options.expectedSmtpHost === PRODUCTION_SMTP_HOST
    && options.expectedSender === PRODUCTION_AUTH_SENDER
    && options.expectedRecoverySubject === PRODUCTION_RECOVERY_SUBJECT;
}

export async function runProof(options: ValidatedOptions, fetchImpl: FetchLike = fetch): Promise<ProofRun> {
  const checks: ProofCheck[] = [];

  // Exported functions may be called without validateOptions(). Keep mutation safety
  // inside the network-capable boundary as well as in the CLI parser.
  if (!validatedOptionInstances.has(options) || !Object.isFrozen(options)) {
    record(checks, "safety.validated_options_required", FAIL, "Network proof was refused because options were not the immutable result of this module's validator.");
    return { mode: "INCOMPLETE", status: FAIL, checks };
  }
  if (!runtimeTargetIsPinned(options)) {
    record(checks, "safety.production_target_pinned", FAIL, "Network proof was refused because the runtime target or expected Auth identity is not the reviewed production contract.");
    return { mode: "INCOMPLETE", status: FAIL, checks };
  }
  if (options.executeRecovery && !options.checkConfig) {
    record(checks, "safety.config_gate_required", FAIL, "Recovery request was refused because the read-only configuration gate was not enabled.");
    return { mode: "INCOMPLETE", status: FAIL, checks };
  }
  if (options.executeRecovery && options.verifyDelivery) {
    record(checks, "safety.separate_network_phases", FAIL, "Recovery request and delivery lookup must be separate runs.");
    return { mode: "INCOMPLETE", status: FAIL, checks };
  }

  if (!options.checkConfig && !options.executeRecovery && !options.verifyDelivery) {
    record(checks, "plan.pins_valid", PASS, "Project, origins, callback, provider host, and sender pins are syntactically valid.");
    record(checks, "plan.zero_network", PASS, "Dry run made zero network calls and sent no email.");
    return { mode: "PLAN_VALID", status: PASS, checks };
  }

  let configPass = false;
  if (options.checkConfig) configPass = await getAuthConfig(options, fetchImpl, checks);

  if (options.executeRecovery) {
    if (!configPass) {
      record(checks, "recovery.auth_request", UNVERIFIED, "Recovery request was not sent because the configuration gate was not fully proven.");
    } else {
      await executeRecovery(options, fetchImpl, checks);
    }
  }

  if (options.verifyDelivery) await verifyDelivery(options, fetchImpl, checks);

  const status = overall(checks);
  let mode: ProofRun["mode"] = "INCOMPLETE";
  if (status === PASS) {
    if (options.verifyDelivery) mode = "PROVIDER_METADATA_VERIFIED";
    else if (options.executeRecovery) mode = "REQUEST_ACCEPTED";
    else mode = "CONFIGURED";
  }
  return { mode, status, checks };
}

function printRun(run: ProofRun): void {
  for (const check of run.checks) {
    const mark = check.status === PASS ? " ok " : check.status === FAIL ? "FAIL" : "????";
    console.log(`[${mark}] ${check.name}\n       ${check.detail}`);
  }
  console.log(`\n${run.mode}: ${run.status}`);
}

function exitCode(status: ProofStatus): number {
  return status === PASS ? 0 : status === FAIL ? 1 : 2;
}

export async function main(
  argv = process.argv.slice(2),
  env: Environment = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  let parsed: CliOptions;
  let options: ValidatedOptions;
  try {
    parsed = parseArgs(argv);
    if (parsed.help) {
      console.log(USAGE);
      return 0;
    }
    options = validateOptions(parsed, env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid arguments.");
    console.error("Use --help for the redacted usage contract.");
    return 64;
  }

  const run = await runProof(options, fetchImpl);
  printRun(run);
  return exitCode(run.status);
}

const invokedDirectly = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) process.exitCode = await main();
