// Configuration for a managed connected-checkout qualification run.
//
// This module decides whether a run may touch anything at all. It is the half
// of the safety story that happens before any client is constructed:
// `assertQualificationTarget` checks the declared plan, `assertBindingMatchesTarget`
// checks the live clients, and this checks that the operator actually supplied
// the things a real run needs and nothing it must never have.
//
// It reads NAMES from an environment record and never logs, returns or embeds a
// value. Every secret is held behind an accessor and redacted on the way out.
// Nothing here creates an account, provisions a member or mints a credential:
// the operator provisions synthetic identities on the authorized test project
// and supplies their access tokens, and this refuses anything that does not
// look like the plan it was given.
import type { ConnectedCheckoutTarget, JourneyCapabilities, ScenarioName } from "./connected-checkout-journey";
import { REQUIRED_SCENARIOS } from "./connected-checkout-journey";

/** Every environment variable this harness reads, by name. Values never appear. */
export const MANAGED_JOURNEY_ENV = Object.freeze({
  /** Origin of the MOUNTED application under test, e.g. https://staging.example.com */
  baseUrl: "XENIOS_QUALIFY_BASE_URL",
  /** Supabase project ref for canonical reads. Must not be production. */
  projectRef: "XENIOS_QUALIFY_PROJECT_REF",
  /** Service-role key for canonical reads on that project only. */
  serviceRoleKey: "XENIOS_QUALIFY_SERVICE_ROLE_KEY",
  /** Provider test-mode credentials. Test prefixes are enforced. */
  secretKey: "STRIPE_SECRET_KEY",
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
  publishableKey: "STRIPE_PUBLISHABLE_KEY",
  /** JSON array of {memberId, accessToken} for pre-provisioned synthetic members. */
  members: "XENIOS_QUALIFY_SYNTHETIC_MEMBERS",
  /** The owner's recorded approval digest for this exact target. */
  ownerApproval: "XENIOS_QUALIFY_OWNER_APPROVAL_SHA256",
  /** Provider test payment methods. Defaults are the provider's documented ones. */
  decliningPaymentMethod: "XENIOS_QUALIFY_PM_DECLINE",
  nonChallengePaymentMethod: "XENIOS_QUALIFY_PM_NON_CHALLENGE",
  challengePaymentMethod: "XENIOS_QUALIFY_PM_CHALLENGE",
  /** Absent means no browser, which means the challenge scenario SKIPS. */
  chromePath: "XENIOS_QUALIFY_CHROME_PATH",
  /** Absent means no real restart, which means the restart scenario SKIPS. */
  restartCommand: "XENIOS_QUALIFY_RESTART_COMMAND",
  /**
   * Loopback control channel of an application the HARNESS started from the
   * qualification entry point. Absent means no fault seam exists, which means
   * the fault scenarios SKIP. A deployed application never exposes this.
   */
  faultControlUrl: "XENIOS_QUALIFY_FAULT_CONTROL_URL",
} as const);

export const DEFAULT_PAYMENT_METHODS = Object.freeze({
  decline: "pm_card_chargeDeclined",
  nonChallenge: "pm_card_authenticationRequired",
  challenge: "pm_card_authenticationRequiredChallenge",
});

/** Never construct one of these by hand; use `readManagedJourneyConfig`. */
export interface ManagedJourneyConfig {
  baseUrl: string;
  projectRef: string;
  databaseUrl: string;
  /** Held, never printed. */
  secrets: {
    serviceRoleKey(): string;
    secretKey(): string;
    webhookSecret(): string;
    accessTokenFor(memberId: string): string;
  };
  publishableKeyMode: "test";
  members: readonly string[];
  memberFor(scenario: ScenarioName): string;
  paymentMethods: { decline: string; nonChallenge: string; challenge: string };
  capabilities: JourneyCapabilities;
  chromePath: string | null;
  restartCommand: string | null;
  faultControlUrl: string | null;
  /** The target this configuration declares, for `assertQualificationTarget`. */
  target: ConnectedCheckoutTarget;
}

export class ManagedJourneyNotRun extends Error {
  constructor(
    readonly code: string,
    readonly missing: string,
  ) {
    super(`NOT_RUN ${code}: ${missing}`);
    this.name = "ManagedJourneyNotRun";
  }
}

function notRun(code: string, missing: string): never {
  throw new ManagedJourneyNotRun(code, missing);
}

const PROJECT_REF = /^[a-z]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
/** A Supabase access token is a JWT. Only its shape is checked here. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface SyntheticMember {
  memberId: string;
  accessToken: string;
}

/**
 * Anything that could carry a credential, reduced to a statement about its
 * shape. Use this on every path that reaches a log, a receipt or an operator.
 */
export function redactSecret(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return "<absent>";
  const prefix = /^(pk_test|sk_test|rk_test|whsec|pk_live|sk_live|rk_live|eyJ)/.exec(value);
  return prefix ? `<${prefix[1]}_… ${value.length} chars>` : `<redacted ${value.length} chars>`;
}

function required(env: Record<string, string | undefined>, name: string, code: string, what: string): string {
  const value = (env[name] ?? "").trim();
  if (value.length === 0) notRun(code, `${name} is not set: ${what}`);
  return value;
}

function parseMembers(raw: string): SyntheticMember[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    notRun("synthetic_members_unreadable", `${MANAGED_JOURNEY_ENV.members} is not valid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    notRun("synthetic_members_missing", `${MANAGED_JOURNEY_ENV.members} must be a non-empty JSON array of {memberId, accessToken}`);
  }
  const members: SyntheticMember[] = [];
  for (const entry of parsed) {
    const record = entry as { memberId?: unknown; accessToken?: unknown };
    if (typeof record.memberId !== "string" || !UUID.test(record.memberId)) {
      notRun("synthetic_member_not_a_uuid", `${MANAGED_JOURNEY_ENV.members} contains a member id that is not a uuid`);
    }
    if (typeof record.accessToken !== "string" || !JWT.test(record.accessToken)) {
      // The value is never echoed, only the fact that it is not a token.
      notRun("synthetic_member_token_missing", `${MANAGED_JOURNEY_ENV.members} entry ${record.memberId} has no access token in JWT form`);
    }
    members.push({ memberId: record.memberId, accessToken: record.accessToken });
  }
  if (new Set(members.map((m) => m.memberId)).size !== members.length) {
    notRun("synthetic_members_not_distinct", `${MANAGED_JOURNEY_ENV.members} repeats a member id`);
  }
  // The runner asks for a distinct member per scenario so one scenario cannot
  // see another's orders. Fewer than that is a plan that cannot isolate.
  if (members.length < REQUIRED_SCENARIOS.length) {
    notRun(
      "synthetic_members_insufficient",
      `${MANAGED_JOURNEY_ENV.members} supplies ${members.length} members; the journey needs ${REQUIRED_SCENARIOS.length}, one per scenario, so account isolation is real`,
    );
  }
  return members;
}

function httpsOrigin(value: string, name: string, code: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    notRun(code, `${name} is not a URL`);
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !loopback) {
    notRun(code, `${name} must be https, or loopback for a harness-started application`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    notRun(code, `${name} must be an origin with no path`);
  }
  return url.origin;
}

/**
 * Reads and validates a run's configuration.
 *
 * Every refusal is a NOT_RUN naming exactly one missing or wrong thing, so an
 * operator is told what to fix rather than handed a stack trace. It throws
 * rather than returning a partial config: a half-configured run against a real
 * provider is worse than no run.
 */
export function readManagedJourneyConfig(env: Record<string, string | undefined> = process.env): ManagedJourneyConfig {
  const E = MANAGED_JOURNEY_ENV;

  const baseUrl = httpsOrigin(
    required(env, E.baseUrl, "base_url_missing", "the harness drives the MOUNTED application's HTTP routes and needs its origin"),
    E.baseUrl,
    "base_url_invalid",
  );

  const projectRef = required(env, E.projectRef, "project_ref_missing", "canonical reads need the authorized project");
  if (!PROJECT_REF.test(projectRef)) notRun("project_ref_invalid", `${E.projectRef} is not a project ref`);

  const serviceRoleKey = required(env, E.serviceRoleKey, "service_role_key_missing", "canonical reads use the project's service role");
  const secretKey = required(env, E.secretKey, "secret_key_missing", "the provider adapter needs a test-mode secret key");
  const webhookSecret = required(env, E.webhookSecret, "webhook_secret_missing", "signed webhook delivery needs the endpoint's signing secret");
  const publishableKey = required(
    env,
    E.publishableKey,
    "publishable_key_missing",
    "the mounted payment-config route serves this to the browser; it is required by the application and absent from the environment example",
  );

  // Mode is checked here as well as in the plan gate, because a live key must
  // never reach a client constructor even for a moment.
  if (/^(sk|rk)_live_/.test(secretKey)) notRun("live_secret_key_refused", `${E.secretKey} is a live key; a qualification run is test mode only`);
  if (/^pk_live_/.test(publishableKey)) notRun("live_publishable_key_refused", `${E.publishableKey} is a live key; a qualification run is test mode only`);
  // The SAME shapes the plan gate enforces. Checking them here too means an
  // operator is told at configuration time, before any client is constructed,
  // rather than after a key has already been handed to one.
  if (!/^(sk|rk)_test_[A-Za-z0-9]{4,}$/.test(secretKey)) notRun("secret_key_malformed", `${E.secretKey} is not a test-mode secret key`);
  if (!/^pk_test_[A-Za-z0-9]{8,}$/.test(publishableKey)) notRun("publishable_key_malformed", `${E.publishableKey} is not a test-mode publishable key`);
  if (!/^whsec_[A-Za-z0-9]{4,}$/.test(webhookSecret)) notRun("webhook_secret_malformed", `${E.webhookSecret} is not a webhook signing secret`);

  const members = parseMembers(required(env, E.members, "synthetic_members_missing", "the journey drives one synthetic member per scenario"));
  const ownerApproval = required(env, E.ownerApproval, "owner_approval_missing", "the recorded approval digest for this exact target");
  if (!SHA256.test(ownerApproval)) notRun("owner_approval_malformed", `${E.ownerApproval} is not a sha256 digest`);

  const chromePath = (env[E.chromePath] ?? "").trim() || null;
  const restartCommand = (env[E.restartCommand] ?? "").trim() || null;
  const rawFaultUrl = (env[E.faultControlUrl] ?? "").trim() || null;
  const faultControlUrl = rawFaultUrl === null ? null : httpsOrigin(rawFaultUrl, E.faultControlUrl, "fault_control_url_invalid");
  if (faultControlUrl !== null) {
    const host = new URL(faultControlUrl).hostname;
    // The fault seam exists only inside an application this harness started. A
    // reachable one on a deployed host would be a production failure switch.
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
      notRun("fault_control_not_loopback", `${E.faultControlUrl} must be loopback; a fault seam reachable off-host is a production failure switch`);
    }
  }

  const byMember = new Map(members.map((m) => [m.memberId, m.accessToken]));
  const ids = members.map((m) => m.memberId);

  return {
    baseUrl,
    projectRef,
    databaseUrl: `https://${projectRef}.supabase.co`,
    secrets: {
      serviceRoleKey: () => serviceRoleKey,
      secretKey: () => secretKey,
      webhookSecret: () => webhookSecret,
      accessTokenFor(memberId) {
        const token = byMember.get(memberId);
        if (!token) throw new Error(`no synthetic access token is configured for ${memberId}`);
        return token;
      },
    },
    publishableKeyMode: "test",
    members: ids,
    memberFor(scenario) {
      const index = REQUIRED_SCENARIOS.indexOf(scenario);
      // A scenario the runner adds later still gets a distinct member rather
      // than silently sharing one with `ordinary_payment`.
      const slot = index >= 0 ? index : REQUIRED_SCENARIOS.length + (scenario.length % Math.max(1, ids.length - REQUIRED_SCENARIOS.length || 1));
      return ids[slot % ids.length]!;
    },
    paymentMethods: {
      decline: (env[E.decliningPaymentMethod] ?? "").trim() || DEFAULT_PAYMENT_METHODS.decline,
      nonChallenge: (env[E.nonChallengePaymentMethod] ?? "").trim() || DEFAULT_PAYMENT_METHODS.nonChallenge,
      challenge: (env[E.challengePaymentMethod] ?? "").trim() || DEFAULT_PAYMENT_METHODS.challenge,
    },
    capabilities: {
      // Declared from what is CONFIGURED, never assumed. A capability that is
      // false skips its scenario with the exact reason, and the receipt then
      // reports the run as not qualified.
      browserDrivenChallenge: chromePath !== null,
      nonChallengeAuthentication: true,
      transportFaultInjection: faultControlUrl !== null,
      processRestart: restartCommand !== null,
      localCommitFault: faultControlUrl !== null,
    },
    chromePath,
    restartCommand,
    faultControlUrl,
    target: {
      binding: "managed",
      projectRef,
      publishableKey,
      secretKey,
      webhookSecret,
      syntheticMemberIds: ids,
      ownerApprovalSha256: ownerApproval,
    },
  };
}

/** What an operator may safely be shown or have written to a file. */
export function describeConfig(config: ManagedJourneyConfig): Record<string, unknown> {
  return {
    baseUrl: config.baseUrl,
    projectRef: config.projectRef,
    databaseUrl: config.databaseUrl,
    syntheticMemberCount: config.members.length,
    paymentMethods: config.paymentMethods,
    capabilities: config.capabilities,
    browser: config.chromePath === null ? "not configured" : "configured",
    restart: config.restartCommand === null ? "not configured" : "configured",
    faultSeam: config.faultControlUrl === null ? "not configured" : "loopback control channel",
    secrets: {
      serviceRoleKey: redactSecret(config.secrets.serviceRoleKey()),
      secretKey: redactSecret(config.secrets.secretKey()),
      webhookSecret: redactSecret(config.secrets.webhookSecret()),
    },
  };
}
