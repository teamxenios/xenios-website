import type { TebraIntegrationStatus } from "@shared/care/tebra";

/**
 * Credential-late Tebra configuration.
 *
 * The connector reads credentials only from injected environment. Nothing here
 * is written to source, logs, audit rows, or handoffs, and the parsed secrets
 * are kept off every serialized shape by describeTebraConfiguration below.
 *
 * The same two Care switches that gate the existing scheduling seam gate this
 * one, so the connector cannot become live while Care itself is still held.
 */

export interface ReadyTebraConfiguration {
  state: "ready";
  endpoint: URL;
  username: string;
  password: string;
  customerKey: string;
  practiceId: string | null;
  pollIntervalMinutes: number;
  maxPagesPerRun: number;
  overlapSeconds: number;
}

export type TebraConfiguration =
  | { state: "disabled" }
  | { state: "unconfigured" }
  | { state: "invalid"; reason: TebraConfigurationProblem }
  | ReadyTebraConfiguration;

export const TEBRA_CONFIGURATION_PROBLEMS = [
  "unsafe_endpoint",
  "poll_interval_out_of_range",
  "max_pages_out_of_range",
  "overlap_out_of_range",
] as const;

export type TebraConfigurationProblem = (typeof TEBRA_CONFIGURATION_PROBLEMS)[number];

/**
 * Public Tebra guidance does not describe patient-change webhooks, so changes
 * are polled. Five to fifteen minutes is the documented working range, and the
 * parser refuses anything outside it rather than silently clamping.
 */
export const TEBRA_MIN_POLL_MINUTES = 5;
export const TEBRA_MAX_POLL_MINUTES = 15;
const DEFAULT_POLL_MINUTES = 10;

const DEFAULT_MAX_PAGES = 20;
const DEFAULT_OVERLAP_SECONDS = 120;

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * An endpoint carrying inline credentials, a query string, or a fragment is
 * refused outright. Those are the shapes that leak a secret into a log line the
 * moment anything prints a URL.
 */
function safeEndpoint(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (!present(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return null;
  return value;
}

export function parseTebraConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): TebraConfiguration {
  if (env.CARE_ENABLED !== "true" || env.CARE_ENABLE_APPROVED !== "true") {
    return { state: "disabled" };
  }
  if (env.CARE_TEBRA_SYNC_ENABLED !== "true") {
    return { state: "unconfigured" };
  }

  const endpointRaw = env.CARE_TEBRA_SOAP_ENDPOINT;
  const username = env.CARE_TEBRA_USERNAME;
  const password = env.CARE_TEBRA_PASSWORD;
  const customerKey = env.CARE_TEBRA_CUSTOMER_KEY;
  if (![endpointRaw, username, password, customerKey].every(present)) {
    return { state: "unconfigured" };
  }

  const endpoint = safeEndpoint(endpointRaw as string);
  if (!endpoint) return { state: "invalid", reason: "unsafe_endpoint" };

  const pollIntervalMinutes = boundedInteger(
    env.CARE_TEBRA_POLL_INTERVAL_MINUTES,
    DEFAULT_POLL_MINUTES,
    TEBRA_MIN_POLL_MINUTES,
    TEBRA_MAX_POLL_MINUTES,
  );
  if (pollIntervalMinutes === null) {
    return { state: "invalid", reason: "poll_interval_out_of_range" };
  }

  const maxPagesPerRun = boundedInteger(env.CARE_TEBRA_MAX_PAGES, DEFAULT_MAX_PAGES, 1, 200);
  if (maxPagesPerRun === null) {
    return { state: "invalid", reason: "max_pages_out_of_range" };
  }

  const overlapSeconds = boundedInteger(
    env.CARE_TEBRA_CURSOR_OVERLAP_SECONDS,
    DEFAULT_OVERLAP_SECONDS,
    0,
    900,
  );
  if (overlapSeconds === null) {
    return { state: "invalid", reason: "overlap_out_of_range" };
  }

  return {
    state: "ready",
    endpoint,
    username: (username as string).trim(),
    password: password as string,
    customerKey: (customerKey as string).trim(),
    practiceId: present(env.CARE_TEBRA_PRACTICE_ID) ? env.CARE_TEBRA_PRACTICE_ID.trim() : null,
    pollIntervalMinutes,
    maxPagesPerRun,
    overlapSeconds,
  };
}

export function isReadyTebraConfiguration(
  config: TebraConfiguration,
): config is ReadyTebraConfiguration {
  return config.state === "ready";
}

/**
 * The only shape allowed to leave the server for an operator. It reports state
 * and cadence, never the endpoint host, username, password, customer key, or
 * practice id, because an admin status page is still a place a secret can end
 * up in a screenshot or a support ticket.
 */
export function describeTebraConfiguration(input: {
  config: TebraConfiguration;
  transportBound: boolean;
  careEnabled: boolean;
  cursors: TebraIntegrationStatus["cursors"];
  now?: () => Date;
}): TebraIntegrationStatus {
  const { config } = input;
  return {
    integration: "tebra",
    state: config.state,
    // Every gate must agree. Reporting ready on configuration alone would tell
    // an operator the integration is live while the Care capability holds it.
    ready: config.state === "ready" && input.transportBound && input.careEnabled,
    transportBound: input.transportBound,
    careEnabled: input.careEnabled,
    pollIntervalMinutes: config.state === "ready" ? config.pollIntervalMinutes : null,
    cursors: input.cursors,
    checkedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}
