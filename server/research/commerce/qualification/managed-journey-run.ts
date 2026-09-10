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
  type HttpResponse,
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
 * THE NETWORK BOUNDARY. The shared launcher passes an unconditional
 * `--proxy-server=http://127.0.0.1:9`, which is a discard port: every request,
 * including the top-level navigation, dies there. A hosted challenge is
 * off-host, so a run that needs one must lift that. `extraArgs` is appended
 * after the built-in flags, so a later `--proxy-server=direct://` overrides it.
 * That is a deliberate, narrow relaxation for this one purpose, and this
 * function is the only place in the repository that does it.
 *
 * `enforceNetworkBoundary` is NOT called here. It pins one origin policy for
 * the life of the page, and a challenge is inherently multi-origin: the
 * provider's page hands off to the issuing bank. A boundary that cannot express
 * the journey would only fail it for the wrong reason.
 */
export function createBrowserPort(config: ManagedJourneyConfig): BrowserPort | undefined {
  const chromePath = config.chromePath;
  if (chromePath === null) return undefined;
  return {
    async completeHostedChallenge({ redirectUrl }) {
      // Harness tooling, not part of the application's type program.
      const here = import.meta.url;
      const cdp = (await import(new URL("../../../../scripts/evidence/lib/cdp.mjs", here).href)) as unknown as {
        CdpConnection: new (wsUrl: string) => { open(): Promise<unknown>; close(): Promise<void> };
        PageSession: {
          create(conn: unknown): Promise<{
            navigate(url: string, options?: Record<string, unknown>): Promise<unknown>;
            settle(options?: Record<string, unknown>): Promise<unknown>;
            evaluate(expression: string, options?: Record<string, unknown>): Promise<unknown>;
            send(method: string, params?: Record<string, unknown>): Promise<unknown>;
            close(): Promise<void>;
          }>;
        };
      };
      const chrome = (await import(new URL("../../../../scripts/evidence/lib/chrome.mjs", here).href)) as unknown as {
        launchChromium(options: { chromePath?: string; timeoutMs?: number; extraArgs?: string[] }): Promise<{
          wsUrl: string;
          close(): Promise<void> | void;
        }>;
      };

      const browser = await chrome.launchChromium({
        chromePath,
        // Appended after the built-in flags, so this wins over the discard proxy.
        extraArgs: ["--proxy-server=direct://", "--proxy-bypass-list=<-loopback>"],
      });
      const connection = new cdp.CdpConnection(browser.wsUrl);
      let page: Awaited<ReturnType<typeof cdp.PageSession.create>> | null = null;
      try {
        await connection.open();
        page = await cdp.PageSession.create(connection);
        // The URL is never logged: a hosted challenge URL carries the payment's
        // client secret.
        await page.navigate(redirectUrl, { loadTimeoutMs: 30_000, maxSettleMs: 20_000 });
        await page.settle({ maxSettleMs: 20_000 });
        await clickFirstAvailable(page, CHALLENGE_COMPLETE_SELECTORS);
        await page.settle({ maxSettleMs: 20_000 });
      } finally {
        // Three closes, not one: the target, the connection, the process.
        if (page) await page.close().catch(() => undefined);
        await connection.close().catch(() => undefined);
        await Promise.resolve(browser.close()).catch(() => undefined);
      }
    },
  };
}

/**
 * The provider's own test challenge page offers a complete control. Its id has
 * changed across provider revisions, so the driver tries the known ones in
 * order and fails loudly rather than reporting a challenge it never completed.
 */
const CHALLENGE_COMPLETE_SELECTORS: readonly string[] = [
  "#test-source-authorize-3ds",
  "button#test-source-authorize-3ds",
  "[data-testid='3ds-authorize']",
];

async function clickFirstAvailable(
  page: { evaluate(expression: string, options?: Record<string, unknown>): Promise<unknown>; send(method: string, params?: Record<string, unknown>): Promise<unknown> },
  selectors: readonly string[],
): Promise<void> {
  for (const selector of selectors) {
    const point = (await page
      .evaluate(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
      )
      .catch(() => null)) as { x: number; y: number } | null;
    if (point === null || typeof point.x !== "number") continue;
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    return;
  }
  // Never a silent pass: a challenge nobody completed is a failed scenario.
  throw new Error("the provider's hosted challenge page offered no control this driver recognises");
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * A complete checkout request.
 *
 * Every field the submit path requires is present. Four are not optional, and
 * the shipping address is dereferenced without a guard the moment evaluation
 * starts, so a partial body does not produce a clean refusal: it throws inside
 * the application, the route's own catch turns it into a 503
 * `capability_disabled`, and the run then reads exactly like a deployment where
 * card checkout was never wired.
 *
 * The idempotency key varies per call. The runner relies on that: it holds one
 * request object to prove that three concurrent identical submissions converge,
 * and calls the factory again whenever it wants a distinct checkout.
 */
export function requestFactory(config: ManagedJourneyConfig): (overrides?: Partial<CheckoutRequest>) => CheckoutRequest {
  let counter = 0;
  return (overrides = {}) => ({
    idempotencyKey: `qualify-${Date.now().toString(36)}-${++counter}`,
    acceptedAgreementKeys: [...config.requestDefaults.acceptedAgreementKeys],
    shippingAddress: { ...config.requestDefaults.shippingAddress },
    shippingService: config.requestDefaults.shippingService as CheckoutRequest["shippingService"],
    // An ordinary card by default. The scenarios that want a decline or a
    // challenge override it; the ones that do not want an ordinary success.
    paymentMethodReference: config.paymentMethods.ordinary,
    researchAttestation: true,
    ...overrides,
  });
}

/**
 * Whether the durable checkout surface is mounted at all.
 *
 * An unauthenticated request is enough: a mounted door answers 401 through its
 * guard, an unmounted path answers the application's own 404. Only the second
 * is a NOT_RUN, and telling them apart costs one request.
 */
export async function assertDurableSurfaceMounted(http: HttpPort, config: ManagedJourneyConfig): Promise<void> {
  let response: HttpResponse;
  try {
    response = await http.request({
      method: "POST",
      url: `${config.baseUrl}/api/research/checkout/durable`,
      headers: { "Content-Type": "application/json" },
      body: {},
    });
  } catch {
    throw new ManagedJourneyNotRun("application_unreachable", `${config.baseUrl} did not answer; the application must be running before a qualification run`);
  }
  if (response.status === 404) {
    throw new ManagedJourneyNotRun(
      "durable_checkout_not_mounted",
      "POST /api/research/checkout/durable answered 404: the durable checkout surface is not wired into the composition root, so there is nothing to qualify",
    );
  }
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

  const http = createFetchHttpPort();
  // One probe before thirteen scenarios fail one at a time. An application that
  // has not wired the durable surface answers the app's own 404 body, which has
  // neither `ok` nor `code`, and every scenario would report a different
  // symptom of the same missing mount.
  await assertDurableSurfaceMounted(http, config);

  const binding = createManagedJourneySurface(config, {
    http,
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
    request: requestFactory(config),
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
