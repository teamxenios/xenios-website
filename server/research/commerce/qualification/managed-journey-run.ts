// The executable entry point for a managed connected-checkout qualification run.
//
//   node --import tsx server/research/commerce/qualification/managed-journey-run.ts
//
// It builds the real ports, runs the existing scenario runner against the
// mounted application, and prints a receipt that contains no secret. It exits
// non-zero unless the run qualified, so it can gate a release rather than
// decorate one.
//
// It performs no writes of its own beyond the journey's own checkout requests
// against synthetic members on an authorized test project, and it will not
// start at all if the configuration does not name one.
import { spawn } from "node:child_process";
import {
  assertQualificationTarget,
  runConnectedCheckoutJourney,
  type JourneyReceipt,
  type ScenarioName,
} from "./connected-checkout-journey";
import {
  createManagedJourneySurface,
  type BrowserPort,
  type DatabasePort,
  type FaultPort,
  type HttpPort,
  type ProcessPort,
  type ProviderPort,
} from "./managed-journey-binding";
import {
  describeConfig,
  ManagedJourneyNotRun,
  readManagedJourneyConfig,
  type ManagedJourneyConfig,
} from "./managed-journey-config";
import type { CheckoutRequest } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Real ports
// ---------------------------------------------------------------------------

/** The mounted application, over the network, exactly as a browser reaches it. */
export function createFetchHttpPort(): HttpPort {
  return {
    async request({ method, url, headers, body, raw }) {
      const response = await fetch(url, {
        method,
        headers,
        body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        // A non-JSON body is kept as text; the caller decides what that means.
      }
      const flat: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        flat[key] = value;
      });
      return { status: response.status, headers: flat, body: parsed };
    },
  };
}

/** Canonical reads through PostgREST, service role, on the approved project. */
export function createPostgrestDatabasePort(config: ManagedJourneyConfig): DatabasePort {
  const origin = config.databaseUrl;
  const key = config.secrets.serviceRoleKey();
  return {
    origin: () => origin,
    // This client is HTTP and nothing else. There is no in-memory mode to fall
    // back to, which is what makes `databaseOverHttp` a fact rather than a flag.
    overHttp: () => true,
    async selectOne(table, columns, filters) {
      const url = new URL(`${origin}/rest/v1/${table}`);
      url.searchParams.set("select", columns);
      for (const [column, value] of Object.entries(filters)) url.searchParams.set(column, `eq.${value}`);
      url.searchParams.set("limit", "1");
      const response = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      });
      if (!response.ok) {
        // The body can carry column names and filter values; only the status
        // and the table reach the operator.
        throw new Error(`canonical read of ${table} failed with status ${response.status}`);
      }
      const rows = (await response.json()) as unknown;
      return Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
    },
  };
}

/** The provider's own truth, read-only, in test mode. */
export function createStripeProviderPort(config: ManagedJourneyConfig): ProviderPort {
  const key = config.secrets.secretKey();
  const mode: "test" | "live" = /^(sk|rk)_test_/.test(key) ? "test" : "live";
  const get = async (path: string): Promise<Record<string, unknown> | null> => {
    const response = await fetch(`https://api.stripe.com${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`provider read failed with status ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };
  return {
    mode: () => mode,
    // The platform account. A connected-account run would set this from the
    // adapter's own configured account rather than from the plan.
    accountId: () => null,
    retrieveIntent: (reference) => get(`/v1/payment_intents/${encodeURIComponent(reference)}`),
    async listIntentsSince(createdAtSeconds) {
      // Scoped by creation time so a shared test account's other activity can
      // never be counted as this run's.
      const collected: Array<Record<string, unknown>> = [];
      let startingAfter: string | null = null;
      for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({ limit: "100", "created[gte]": String(createdAtSeconds) });
        if (startingAfter) query.set("starting_after", startingAfter);
        const body = await get(`/v1/payment_intents?${query.toString()}`);
        const data = Array.isArray(body?.data) ? (body!.data as Array<Record<string, unknown>>) : [];
        collected.push(...data);
        if (body?.has_more !== true || data.length === 0) break;
        startingAfter = String(data[data.length - 1]!.id ?? "");
        if (!startingAfter) break;
      }
      return collected;
    },
  };
}

/**
 * A real isolated process restarted over the same persisted records.
 *
 * Rebuilding an object graph is not this, which is why the local binding
 * declares `processRestart: false`. The command is the operator's, run in a
 * shell, and the harness waits for it before continuing.
 */
export function createProcessPort(config: ManagedJourneyConfig): ProcessPort | undefined {
  const command = config.restartCommand;
  if (command === null) return undefined;
  return {
    restart() {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(command, { shell: true, stdio: "ignore" });
        child.on("error", () => reject(new Error("the restart command could not be started")));
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`the restart command exited with ${code}`))));
      });
    },
  };
}

/**
 * The loopback control channel of an application THIS harness started from the
 * qualification entry point.
 *
 * The configuration refuses a non-loopback URL, so a deployed application can
 * never present one. When it is absent the fault capabilities are false and the
 * two scenarios that need them skip, naming the capability.
 */
export function createFaultPort(config: ManagedJourneyConfig): FaultPort | undefined {
  const base = config.faultControlUrl;
  if (base === null) return undefined;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`the fault control channel refused ${path} with status ${response.status}`);
  };
  return {
    injectTransportFault: (fault) => post("/__qualification/fault", { fault }),
    failNextLocalCommit: () => post("/__qualification/fail-next-commit", {}),
  };
}

/**
 * Drives the provider's own hosted authentication challenge in a real browser.
 *
 * This is the only thing that proves the challenge path; a test method that
 * authenticates straight through does not. It uses the repository's existing
 * CDP session rather than adding a browser dependency, loaded through a
 * computed path so the qualification harness stays out of the application's
 * compiled program.
 *
 * IMPORTANT: the repository's evidence harness deliberately seals its browser
 * to loopback (a closed proxy, a null host-resolver rule, and request blocking
 * for off-origin hosts). A hosted challenge lives at the provider, so this
 * launcher must be run with that boundary opened for the provider's domains
 * only. That is a decision to make explicitly, not a default, which is why
 * this port exists only when a browser path is configured.
 */
export function createBrowserPort(config: ManagedJourneyConfig): BrowserPort | undefined {
  const chromePath = config.chromePath;
  if (chromePath === null) return undefined;
  return {
    async completeHostedChallenge({ redirectUrl }) {
      // Loaded by computed path: the CDP library is harness tooling and is not
      // part of the application's type program.
      const modulePath = new URL("../../../../scripts/evidence/lib/cdp.mjs", import.meta.url).href;
      const cdp = (await import(modulePath)) as unknown as {
        openPage(options: { chromePath: string; url: string }): Promise<{
          click(selector: string): Promise<void>;
          settle(): Promise<void>;
          close(): Promise<void>;
        }>;
      };
      if (typeof cdp.openPage !== "function") {
        throw new Error("the CDP harness does not expose openPage; the challenge driver needs a page session");
      }
      // The URL is never logged: a hosted challenge URL carries the payment's
      // client secret.
      const page = await cdp.openPage({ chromePath, url: redirectUrl });
      try {
        await page.settle();
        // The provider's own test challenge page. Its complete control is the
        // only thing that finishes the authentication.
        await page.click("#test-source-authorize-3ds");
        await page.settle();
      } finally {
        await page.close();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** A request the journey can vary per call. Amounts stay small and synthetic. */
function requestFactory(): (overrides?: Partial<CheckoutRequest>) => CheckoutRequest {
  let counter = 0;
  return (overrides = {}) => ({
    idempotencyKey: `qualify-${Date.now().toString(36)}-${++counter}`,
    acceptedAgreementKeys: ["research-use"],
    ...overrides,
  }) as CheckoutRequest;
}

export interface ManagedRunResult {
  receipt: JourneyReceipt;
  binding: Record<string, unknown>;
  config: Record<string, unknown>;
}

export async function runManagedJourney(env: Record<string, string | undefined> = process.env): Promise<ManagedRunResult> {
  const config = readManagedJourneyConfig(env);
  // The plan gate, on the declared target. The live-client gate runs inside the
  // journey against what the constructed clients report about themselves.
  const target = assertQualificationTarget(config.target);

  const binding = createManagedJourneySurface(config, {
    http: createFetchHttpPort(),
    database: createPostgrestDatabasePort(config),
    provider: createStripeProviderPort(config),
    browser: createBrowserPort(config),
    process: createProcessPort(config),
    fault: createFaultPort(config),
  });

  const receipt = await runConnectedCheckoutJourney({
    surface: binding.surface,
    target,
    memberFor: (scenario: ScenarioName) => config.memberFor(scenario),
    request: requestFactory(),
    decliningPaymentMethod: config.paymentMethods.decline,
    nonChallengePaymentMethod: config.paymentMethods.nonChallenge,
    challengePaymentMethod: config.paymentMethods.challenge,
  });

  return { receipt, binding: binding.describe(), config: describeConfig(config) };
}

/** What an operator sees. Contains no secret, no client secret, no customer row. */
export function formatReceipt(result: ManagedRunResult): string {
  const { receipt } = result;
  const lines: string[] = [
    `binding: ${receipt.binding}   mode: ${receipt.mode}   project: ${receipt.projectRef ?? "none"}`,
    `evidence: ${receipt.evidenceClass}`,
    `webhook evidence: ${String(result.binding.webhookEvidence)}`,
    `qualified: ${receipt.qualified}`,
    `passed ${receipt.passed}   failed ${receipt.failed}   skipped ${receipt.skipped}`,
    "",
  ];
  for (const scenario of receipt.scenarios) {
    const mark = scenario.status === "passed" ? "PASS" : scenario.status === "failed" ? "FAIL" : "SKIP";
    lines.push(`${mark}  ${scenario.scenario}`);
    if (scenario.failure) lines.push(`      failure: ${scenario.failure}`);
    if (scenario.missingCapability) lines.push(`      missing: ${scenario.missingCapability}`);
  }
  if (receipt.missingRequired.length > 0) {
    lines.push("", `required scenarios that did not execute: ${receipt.missingRequired.join(", ")}`);
  }
  return lines.join("\n");
}

/** True when this module is the process entry point. */
const isEntryPoint = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  runManagedJourney()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result.config, null, 2)}\n\n${formatReceipt(result)}\n`);
      // A run that did not qualify must not look like a success to a pipeline.
      process.exitCode = result.receipt.qualified ? 0 : 1;
    })
    .catch((error: unknown) => {
      if (error instanceof ManagedJourneyNotRun) {
        // NOT_RUN is a distinct outcome from a failure: nothing was attempted,
        // and exactly one thing is missing.
        process.stdout.write(`NOT_RUN ${error.code}\n${error.missing}\n`);
        process.exitCode = 2;
        return;
      }
      process.stdout.write(`the qualification run could not complete: ${error instanceof Error ? error.message : "unknown"}\n`);
      process.exitCode = 1;
    });
}
