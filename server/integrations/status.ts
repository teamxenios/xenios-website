// Integration configuration status, reported without ever revealing a value.
//
// WHY THIS SHAPE, AND WHY IT CALLS NO VENDOR SDK
//
// A previous attempt at this problem in this repo was withdrawn because it
// probed Supabase through the vendor client to decide whether a key was
// publishable or service-role. @supabase/auth-js calls console.error(e) on the
// raw exception inside the library, before the caller ever sees it, and undici's
// Headers.append TypeError embeds the header value. So a line-wrapped key was
// printed in full to stderr by a tool whose stated purpose was to protect it.
//
// The lesson is not "scrub harder". It is that a module cannot promise anything
// about its own output while calling a library that prints for it. So:
//
//   * This module calls NO vendor SDK and opens NO network connection.
//   * It decides status from PRESENCE and SHAPE of an environment variable.
//   * It never stores, returns, logs, or interpolates a value. The report type
//     has no field capable of carrying one (see IntegrationReport).
//
// The cost is honest and stated: shape cannot prove a credential works. That is
// why `healthy` is reserved for checks that genuinely ran (see below) and is
// never inferred from a well-formed string.
//
// NOT REGISTERED
//
// registerIntegrationStatusApi is exported but is NOT called anywhere, because
// server/index.ts is leased to another writer. Until this line lands there:
//
//   registerIntegrationStatusApi(app);
//
// this endpoint DOES NOT EXIST AT RUNTIME. Reading this file is not evidence
// that the site reports integration status. A merged-but-unregistered module
// has already caused a false "the gate is live" reading in this repository, so
// the distinction is stated here rather than assumed.

import type { Express, Request, Response } from "express";
import { requireSupabaseAdmin } from "../routes";

/**
 * configured: present and shaped correctly. Not proof it works.
 * missing:    absent, and the feature expects it.
 * invalid:    present but the shape is wrong, so it cannot work.
 * disabled:   the feature is intentionally held. NOT a missing credential and
 *             must never be reported as one, or the configuration queue asks
 *             Samuel to go find a secret for something nobody wants turned on.
 * healthy:    a check actually ran and passed. Only used where a check exists
 *             that cannot disclose a value. Never inferred from shape.
 */
export type IntegrationState = "configured" | "missing" | "invalid" | "disabled" | "healthy";

export type IntegrationExposure = "server-only" | "public";

/**
 * The report shape. There is deliberately no `value`, `sample`, `prefix` or
 * `detail` field: a field that could carry a secret is a field that eventually
 * will. `notes` is authored here in this file and never derived from an
 * environment value, which a test asserts.
 */
export interface IntegrationReport {
  readonly key: string;
  readonly system: string;
  readonly variable: string;
  readonly exposure: IntegrationExposure;
  readonly state: IntegrationState;
  readonly enables: string;
  readonly notes: string;
}

type Env = Record<string, string | undefined>;

/** The exact string "true" is the repo's enable convention. Nothing else enables. */
function flagOn(env: Env, name: string): boolean {
  return env[name] === "true";
}

function present(env: Env, name: string): boolean {
  const raw = env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Shape checks. Each returns true when the value could plausibly be the thing
 * it claims to be. They read the value but never return or log any part of it.
 */
const SHAPE: Record<string, (raw: string) => boolean> = {
  url: (raw) => /^https:\/\/[^\s]+$/.test(raw.trim()),
  supabaseUrl: (raw) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(raw.trim()),
  // Publishable-grade only. A service-role value in a browser-exposed slot is a
  // configuration error, not a working credential, so it reports invalid.
  supabasePublishable: (raw) => {
    const v = raw.trim();
    if (v.startsWith("sb_secret_")) return false;
    return v.startsWith("sb_publishable_") || v.startsWith("eyJ");
  },
  supabaseSecret: (raw) => {
    const v = raw.trim();
    return v.startsWith("sb_secret_") || v.startsWith("eyJ");
  },
  email: (raw) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.trim()),
  nonEmpty: (raw) => raw.trim().length > 0,
};

interface Spec {
  readonly key: string;
  readonly system: string;
  readonly variable: string;
  readonly exposure: IntegrationExposure;
  readonly enables: string;
  readonly shape?: keyof typeof SHAPE;
  /** When this flag is not exactly "true", the integration is `disabled`. */
  readonly heldUnless?: string;
  readonly notes: string;
}

/**
 * Every canonical variable below was read from actual usage in this repository,
 * not invented. Systems the fleet protocol names but for which this repo has NO
 * canonical variable are recorded in MISSING_CANONICAL_NAMES rather than given
 * an invented one.
 */
export const INTEGRATION_SPECS: readonly Spec[] = [
  {
    key: "supabase_runtime_url",
    system: "Supabase runtime",
    variable: "SUPABASE_URL",
    exposure: "server-only",
    enables: "every server read and write backed by Supabase",
    shape: "supabaseUrl",
    notes: "Project URL. Shape checked against the supabase.co project form.",
  },
  {
    key: "supabase_anon_key",
    system: "Supabase runtime",
    variable: "SUPABASE_ANON_KEY",
    exposure: "public",
    enables: "browser session verification via auth.getUser",
    shape: "supabasePublishable",
    notes:
      "Served to anonymous callers by the client bootstrap with a public cache header, so it must be publishable grade. A value beginning sb_secret_ reports invalid rather than configured: it would work, which is exactly the danger.",
  },
  {
    key: "supabase_service_role",
    system: "Supabase runtime",
    variable: "SUPABASE_SERVICE_ROLE_KEY",
    exposure: "server-only",
    enables: "server writes that bypass RLS",
    shape: "supabaseSecret",
    notes: "Never sent to a browser. The runtime client self-tests this slot separately at boot.",
  },
  {
    key: "session_secret",
    system: "Research gateway",
    variable: "RESEARCH_SESSION_SECRET",
    exposure: "server-only",
    enables: "the gated Research session cookie",
    shape: "nonEmpty",
    notes: "Rotating it signs every existing session out.",
  },
  {
    key: "access_password",
    system: "Research gateway",
    variable: "RESEARCH_ACCESS_PASSWORD",
    exposure: "server-only",
    enables: "the gateway wall in front of Research while it is private",
    shape: "nonEmpty",
    notes: "Only consulted while RESEARCH_PUBLIC is not true.",
  },
  {
    key: "email_provider",
    system: "Email",
    variable: "RESEND_API_KEY",
    exposure: "server-only",
    enables: "application, approval and notification email",
    shape: "nonEmpty",
    notes: "Without it the outbox worker has no transport and mail queues rather than sends.",
  },
  {
    key: "email_from",
    system: "Email",
    variable: "RESEARCH_EMAIL_FROM",
    exposure: "server-only",
    enables: "the From address on outbound mail",
    shape: "email",
    notes: "Must be on a domain the provider has verified, which this check cannot confirm.",
  },
  {
    key: "email_reply_to",
    system: "Email",
    variable: "RESEARCH_EMAIL_REPLY_TO",
    exposure: "server-only",
    enables: "the Reply-To address on outbound mail",
    shape: "email",
    notes: "",
  },
  {
    key: "turnstile_secret",
    system: "Turnstile",
    variable: "TURNSTILE_SECRET_KEY",
    exposure: "server-only",
    enables: "server-side verification of the human check",
    shape: "nonEmpty",
    notes: "Without it the form either accepts unverified submissions or fails closed, depending on the caller.",
  },
  {
    key: "turnstile_site",
    system: "Turnstile",
    variable: "TURNSTILE_SITE_KEY",
    exposure: "public",
    enables: "rendering the human check widget",
    shape: "nonEmpty",
    notes: "Public by design; it appears in the browser bundle.",
  },
  {
    key: "payment_provider",
    system: "Payments",
    variable: "PAYMENTS_PROVIDER",
    exposure: "server-only",
    enables: "authorisation and capture at checkout",
    heldUnless: "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
    shape: "nonEmpty",
    notes:
      "Research commerce is held, so this reports disabled rather than missing. It is not a credential Samuel needs to find today.",
  },
  {
    key: "payment_instructions_key",
    system: "Payments",
    variable: "PAYMENT_INSTRUCTIONS_ENC_KEY",
    exposure: "server-only",
    enables: "encryption of stored payout instructions",
    heldUnless: "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
    shape: "nonEmpty",
    notes: "Held with commerce.",
  },
  {
    key: "tebra_base_url",
    system: "Care / Tebra",
    variable: "CARE_TEBRA_BASE_URL",
    exposure: "server-only",
    enables: "the Tebra scheduling handoff",
    heldUnless: "CARE_TEBRA_SCHEDULING_ENABLED",
    shape: "url",
    notes: "Care is held. Unconfigured Tebra must never fabricate a scheduling confirmation; the concierge fallback is the intended path.",
  },
  {
    key: "tebra_api_key",
    system: "Care / Tebra",
    variable: "CARE_TEBRA_API_KEY",
    exposure: "server-only",
    enables: "authenticated Tebra scheduling calls",
    heldUnless: "CARE_TEBRA_SCHEDULING_ENABLED",
    shape: "nonEmpty",
    notes: "Held with Care.",
  },
  {
    key: "shipping_base_url",
    system: "Shipping",
    variable: "SHIPPING_API_BASE_URL",
    exposure: "server-only",
    enables: "live rates and tracking",
    heldUnless: "RESEARCH_LIVE_SHIPPING_ENABLED",
    shape: "url",
    notes: "Held. RESEARCH_SHIPPING_DISABLED is a separate emergency stop.",
  },
  {
    key: "shipping_auth",
    system: "Shipping",
    variable: "SHIPPING_API_AUTH_HEADER",
    exposure: "server-only",
    enables: "authenticated shipping calls",
    heldUnless: "RESEARCH_LIVE_SHIPPING_ENABLED",
    shape: "nonEmpty",
    notes: "Held with shipping.",
  },
  {
    key: "product_media_bucket",
    system: "Media storage",
    variable: "RESEARCH_PRODUCT_MEDIA_BUCKET",
    exposure: "server-only",
    enables: "product image storage and signed delivery",
    shape: "nonEmpty",
    notes: "A bucket name, not a credential. Access is via the Supabase service role.",
  },
  {
    key: "coa_bucket",
    system: "Media storage",
    variable: "RESEARCH_COA_BUCKET",
    exposure: "server-only",
    enables: "certificate-of-analysis document storage",
    shape: "nonEmpty",
    notes: "",
  },
  {
    key: "admin_email",
    system: "Admin access",
    variable: "ADMIN_EMAIL",
    exposure: "server-only",
    enables: "the admin allowlist behind requireSupabaseAdmin",
    shape: "nonEmpty",
    notes: "May be a list. Membership is checked server-side and never read from a request.",
  },
  {
    key: "site_url",
    system: "Site",
    variable: "SITE_URL",
    exposure: "server-only",
    enables: "absolute links in email and redirects",
    shape: "url",
    notes: "A wrong value sends real users to the wrong host, so shape alone is not sufficient assurance.",
  },
];

/**
 * Systems the fleet protocol lists as required for which this repository has NO
 * canonical variable in use. They are reported rather than invented, because a
 * fabricated name in a configuration queue sends Samuel to a dashboard to create
 * a secret that no code will ever read.
 */
export const MISSING_CANONICAL_NAMES: readonly { system: string; note: string }[] = [
  {
    system: "Error monitoring (Sentry)",
    note: "No DSN variable is read anywhere in server or shared. Either error monitoring is not wired, or it is wired under a name this scan did not find. Needs a decision before it appears in the configuration queue.",
  },
  {
    system: "Google service account and Sheet IDs",
    note: "No service-account or sheet-id variable is read. RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED exists as a flag, so the feature is anticipated but its credentials have no canonical name yet.",
  },
  {
    system: "DNS",
    note: "Not an application credential. Owned at the hosting provider, so it belongs in the configuration queue but not in this endpoint.",
  },
];

function evaluate(spec: Spec, env: Env): IntegrationState {
  if (spec.heldUnless && !flagOn(env, spec.heldUnless)) return "disabled";
  if (!present(env, spec.variable)) return "missing";
  const raw = env[spec.variable] as string;
  if (spec.shape && !SHAPE[spec.shape](raw)) return "invalid";
  return "configured";
}

/** Build the full report. Pure: takes an env, returns records with no values. */
export function buildIntegrationStatus(env: Env = process.env): IntegrationReport[] {
  return INTEGRATION_SPECS.map((spec) => ({
    key: spec.key,
    system: spec.system,
    variable: spec.variable,
    exposure: spec.exposure,
    state: evaluate(spec, env),
    enables: spec.enables,
    notes: spec.notes,
  }));
}

export interface IntegrationStatusResponse {
  readonly ok: true;
  readonly integrations: IntegrationReport[];
  readonly missingCanonicalNames: readonly { system: string; note: string }[];
  readonly summary: Record<IntegrationState, number>;
}

export function integrationStatusResponse(env: Env = process.env): IntegrationStatusResponse {
  const integrations = buildIntegrationStatus(env);
  const summary: Record<IntegrationState, number> = {
    configured: 0,
    missing: 0,
    invalid: 0,
    disabled: 0,
    healthy: 0,
  };
  for (const row of integrations) summary[row.state] += 1;
  return { ok: true, integrations, missingCanonicalNames: MISSING_CANONICAL_NAMES, summary };
}

/**
 * NOT REGISTERED. See the module header. Add to server/index.ts:
 *   registerIntegrationStatusApi(app);
 */
export function registerIntegrationStatusApi(app: Express): void {
  app.get("/api/admin/integrations/status", requireSupabaseAdmin, (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.json(integrationStatusResponse());
  });
}
