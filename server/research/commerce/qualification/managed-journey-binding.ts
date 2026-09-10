import { FaultBarrier, createScenarioWebhookSigner, fail, requiredString } from "./managed-runtime";
import { mapObservedOrder, mapObservedPayment, QUALIFICATION_ORDER_COLUMNS } from "./managed-observation";
import { EXECUTION_COLUMNS } from "../persistence/checkout-executions-store";
// The managed JourneySurface: the connected checkout journey against a real
// mounted application, a real database and the provider's test mode.
//
// The local binding in connected-checkout-journey.test.ts calls service objects
// in the same process. This one does not, and that is the whole point. It:
//
//   * drives the MOUNTED HTTP routes as authenticated synthetic members, so
//     route wiring, guards and serialisation are exercised rather than assumed;
//   * reads canonical records through the real PostgREST client, so what the
//     database actually holds is what is checked;
//   * reads the provider's own truth through the real adapter in test mode;
//   * posts a genuinely signed body to the mounted webhook route.
//
// What it deliberately does NOT do:
//
//   * It never falls back to an in-memory store. A missing client is a NOT_RUN,
//     not a quieter kind of evidence.
//   * It never reaches into the application process. Faults come from a
//     loopback control channel that exists only in an application this harness
//     started; when that is absent the capability is false and the scenario
//     skips.
//   * It never counts objects it did not create. Every provider count is scoped
//     to this run's window and this run's synthetic members.
//   * It never puts a secret, a client secret, a card detail or a raw provider
//     payload into a receipt, an observation or a log.
import { createHmac } from "node:crypto";
import type { CheckoutRequest } from "@shared/research/commerce-api";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { ORDER_STATES, type OrderState } from "@shared/research/commerce";
import type { OrderRecord } from "../orders";
import { rowToExecution, type CheckoutExecutionRow } from "../persistence/checkout-executions-store";
import type {
  JourneyCapabilities,
  JourneyContinuation,
  JourneyPayment,
  JourneySubmitResult,
  JourneySurface,
  JourneyTransports,
} from "./connected-checkout-journey";
import { ManagedJourneyNotRun, type ManagedJourneyConfig } from "./managed-journey-config";

// ---------------------------------------------------------------------------
// Ports. Each is the smallest thing the binding needs, so a boundary test can
// substitute one without the binding ever gaining an in-memory mode.
// ---------------------------------------------------------------------------

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface HttpPort {
  /** One request to the mounted application. `raw` bypasses JSON encoding. */
  request(input: {
    method: "GET" | "POST";
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    raw?: string;
  }): Promise<HttpResponse>;
}

/** Canonical reads. Service role, over real HTTP, against the approved project. */
export interface DatabasePort {
  /** The origin the client is actually pointed at, read from the client. */
  origin(): string;
  /** True when this is a real HTTP client rather than a substitute. */
  overHttp(): boolean;
  selectOne(table: string, columns: string, filters: Record<string, string>): Promise<Record<string, unknown> | null>;
}

/** The provider's own truth. Test mode, read-only for this binding. */
export interface ProviderPort {
  /** The mode the credential itself puts the client in. */
  mode(): "test" | "live";
  accountId(): string | null;
  retrieveIntent(reference: string): Promise<Record<string, unknown> | null>;
  /**
   * Payment intents created within this run's window whose metadata names one
   * of this run's synthetic members. Never the whole account.
   */
  listIntentsSince(createdAtSeconds: number): Promise<Array<Record<string, unknown>>>;
}

/** Drives the provider's own hosted challenge in a real browser. */
export interface BrowserPort {
  completeHostedChallenge(input: { redirectUrl: string; reference: string }): Promise<void>;
  /** Supports Stripe.js use_stripe_sdk as well as redirect-based test challenges. */
  completePaymentAuthentication?(input: { clientSecret: string; reference: string; expectation: "challenge" | "no_challenge" }): Promise<void>;
}

/** Restarts a real isolated process over the same persisted records. */
export interface ProcessPort {
  restart(): Promise<void>;
}

/**
 * The loopback control channel of an application this harness started from the
 * qualification entry point. A deployed application has none.
 */
export interface FaultPort {
  injectTransportFault(fault: "lost_response" | "server_error"): Promise<void>;
  failNextLocalCommit(): Promise<void>;
}

export interface ManagedJourneyPorts {
  http: HttpPort;
  database: DatabasePort;
  provider: ProviderPort;
  browser?: BrowserPort;
  process?: ProcessPort;
  fault?: FaultPort;
  now?(): Date;
}

// ---------------------------------------------------------------------------

const DURABLE_CHECKOUT_PATH = "/api/research/checkout/durable";
const CONTINUATION_BASE = "/api/research/checkout/executions";
const WEBHOOK_PATH = "/api/research/webhooks/payment";

/** The provider's status words in the domain vocabulary the runner expects. */
const INTENT_STATUS: Readonly<Record<string, string>> = Object.freeze({
  requires_payment_method: "pending",
  requires_confirmation: "pending",
  requires_action: "pending",
  processing: "processing",
  requires_capture: "authorized",
  succeeded: "captured",
  canceled: "cancelled",
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function str(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
function num(record: Record<string, unknown> | null, key: string): number {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The continuation shape, mapped WITHOUT the authentication secret.
 *
 * The route returns a client secret so a browser can present a challenge. It
 * must never reach a receipt, an observation or a log, so only the fact that
 * one was offered crosses this boundary.
 */
const OBSERVED_CHECKOUT_STATES = new Set(["pending", "authentication_required", "processing", "completed", "cancelled", "reconciliation_required"]);

function continuationOf(response: HttpResponse): JourneyContinuation {
  const envelope = asRecord(response.body);
  if (response.status < 200 || response.status >= 300) return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
  if (envelope?.ok !== true) {
    return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
  }
  const continuation = asRecord(envelope.continuation);
  if (!continuation || !str(continuation, "orderId") || !OBSERVED_CHECKOUT_STATES.has(str(continuation, "state") ?? "")) {
    return { ok: false, code: `invalid_continuation_http_${response.status}` };
  }
  const reason = str(asRecord(continuation.cancellation), "reason");
  return {
    ok: true,
    state: (str(continuation, "state") ?? undefined) as JourneyContinuation["state"],
    orderId: str(continuation, "orderId") ?? undefined,
    hasAuthenticationSecret: asRecord(continuation?.authentication) !== null,
    ...(reason ? { cancellation: { reason } } : {}),
  };
}

export interface ManagedJourneyBinding {
  surface: JourneySurface;
  /** How the webhook scenario's envelope was produced. Stated, never implied. */
  webhookEvidence: "provider_delivered" | "harness_signed_through_mounted_route";
  /** Everything an operator may see about this run. No secrets. */
  describe(): Record<string, unknown>;
}

/**
 * Builds the managed surface.
 *
 * Capabilities come from the configuration, which derives them from what is
 * actually present. A port that is absent is not quietly worked around: the
 * capability is false, the runner skips that scenario naming it, and the
 * receipt cannot report the run as qualified.
 */
export function createManagedJourneySurface(config: ManagedJourneyConfig, ports: ManagedJourneyPorts): ManagedJourneyBinding {
  const now = ports.now ?? (() => new Date());
  // Everything this run created, so nothing else in the account is ever counted.
  const runStartedAtSeconds = Math.floor(now().getTime() / 1000);
  const runMembers = new Set(config.members);
  const seenReferences = new Set<string>();
  const barrier = new FaultBarrier();
  const signScenarioWebhook = createScenarioWebhookSigner(config.secrets.webhookSecret(), `run-${now().getTime()}-${globalThis.crypto.randomUUID()}`, () => now().getTime());

  if (config.capabilities.browserDrivenChallenge && !ports.browser) {
    throw new ManagedJourneyNotRun("browser_port_missing", "a browser path is configured but no browser port was supplied");
  }
  if (config.capabilities.processRestart && !ports.process) {
    throw new ManagedJourneyNotRun("process_port_missing", "a restart command is configured but no process port was supplied");
  }
  if (config.capabilities.transportFaultInjection && !ports.fault) {
    throw new ManagedJourneyNotRun("fault_port_missing", "a fault control channel is configured but no fault port was supplied");
  }

  const capabilities: JourneyCapabilities = {
    ...config.capabilities,
    browserDrivenChallenge: config.capabilities.browserDrivenChallenge && Boolean(ports.browser),
    nonChallengeAuthentication: config.capabilities.nonChallengeAuthentication && Boolean(ports.browser?.completePaymentAuthentication),
    processRestart: config.capabilities.processRestart && Boolean(ports.process),
    transportFaultInjection: config.capabilities.transportFaultInjection && Boolean(ports.fault),
    localCommitFault: config.capabilities.localCommitFault && Boolean(ports.fault),
  };

  const asMember = (memberId: string) => ({
    Authorization: `Bearer ${config.secrets.accessTokenFor(memberId)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  });

  const transports: JourneyTransports = {
    databaseUrl: ports.database.origin(),
    providerMode: ports.provider.mode(),
    providerAccountId: ports.provider.accountId(),
    // The harness signs a real body with the endpoint's own secret and posts it
    // to the mounted verified route, so the route's verification is genuinely
    // exercised. That is NOT the same as the provider having delivered it, and
    // `webhookEvidence` says so.
    signedWebhookRoute: true,
    databaseOverHttp: ports.database.overHttp(),
  };

  const remember = (reference: string | null | undefined) => {
    if (typeof reference === "string" && reference.length > 0) seenReferences.add(reference);
  };

  const surface: JourneySurface = {
    capabilities,
    transports,

    async submit(memberId, request: CheckoutRequest) {
      const response = await ports.http.request({
        method: "POST",
        url: `${config.baseUrl}${DURABLE_CHECKOUT_PATH}`,
        headers: asMember(memberId),
        body: request,
      });
      const envelope = asRecord(response.body);
      if (response.status < 200 || response.status >= 300) return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
      if (envelope?.ok !== true) {
        return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
      }
      const checkout = asRecord(envelope.checkout);
      if (!checkout || !str(checkout, "requestKey") || !str(checkout, "orderId")
        || !OBSERVED_CHECKOUT_STATES.has(str(checkout, "state") ?? "")) {
        return { ok: false, code: `invalid_checkout_http_${response.status}` };
      }
      const result: JourneySubmitResult = {
        ok: true,
        requestKey: str(checkout, "requestKey") ?? undefined,
        orderId: str(checkout, "orderId") ?? undefined,
        state: (str(checkout, "state") ?? undefined) as JourneySubmitResult["state"],
        idempotent: checkout?.idempotent === true,
      };
      const cancellation = asRecord(checkout?.cancellation);
      const reason = str(cancellation, "reason");
      return reason ? { ...result, cancellation: { reason } } : result;
    },

    async status(memberId, requestKey) {
      const response = await ports.http.request({
        method: "GET",
        url: `${config.baseUrl}${CONTINUATION_BASE}/${encodeURIComponent(requestKey)}/continuation`,
        headers: asMember(memberId),
      });
      return continuationOf(response);
    },

    async continue(memberId, requestKey) {
      const response = await ports.http.request({
        method: "POST",
        url: `${config.baseUrl}${CONTINUATION_BASE}/${encodeURIComponent(requestKey)}/continue`,
        headers: asMember(memberId),
        body: {},
      });
      return continuationOf(response);
    },

    async cancel(memberId, requestKey) {
      const response = await ports.http.request({
        method: "POST",
        url: `${config.baseUrl}${CONTINUATION_BASE}/${encodeURIComponent(requestKey)}/cancel`,
        headers: asMember(memberId),
        body: {},
      });
      return continuationOf(response);
    },

    // Frictionless authentication still requires Stripe.js to finish the
    // provider's next action. A provider GET alone does not authenticate it.
    // The owned browser must refuse an observed challenge in this scenario.
    async completeCustomerAction(providerReference) {
      remember(providerReference);
      if (!capabilities.nonChallengeAuthentication || !ports.browser?.completePaymentAuthentication) fail("non_challenge_browser_unavailable");
      const intent = await ports.provider.retrieveIntent(providerReference);
      if (!intent || intent.id !== providerReference || intent.livemode !== false || intent.status !== "requires_action") fail("non_challenge_identity_mode_or_state_mismatch");
      await ports.browser.completePaymentAuthentication({ reference: providerReference,
        clientSecret: requiredString(intent.client_secret, "non_challenge_client_secret_missing"), expectation: "no_challenge" });
    },

    ...(ports.browser
      ? {
          async completeCustomerChallenge(providerReference: string) {
            remember(providerReference);
            const intent = await ports.provider.retrieveIntent(providerReference);
            if (!intent || intent.id !== providerReference || intent.livemode !== false) fail("challenge_identity_or_mode_mismatch");
            if (ports.browser!.completePaymentAuthentication) {
              await ports.browser!.completePaymentAuthentication({ reference: providerReference, clientSecret: requiredString(intent.client_secret, "challenge_client_secret_missing"), expectation: "challenge" });
              return;
            }
            const action = asRecord(intent?.next_action);
            const redirect = asRecord(action?.redirect_to_url);
            const url = str(redirect, "url");
            if (!url) {
              throw new Error("the provider offered no hosted challenge URL for this payment");
            }
            // The URL is the provider's own hosted page. It is not logged: a
            // challenge URL carries the payment's client secret.
            await ports.browser!.completeHostedChallenge({ redirectUrl: url, reference: providerReference });
          },
        }
      : {}),

    async deliverWebhook(input) {
      remember(input.providerReference);
      const event = signScenarioWebhook(input);
      const response = await ports.http.request({ method: "POST", url: config.baseUrl + WEBHOOK_PATH, headers: { "Content-Type": "application/json", "stripe-signature": event.signature }, raw: event.raw });
      const envelope = asRecord(response.body);
      if (response.status !== 200 || envelope?.ok !== true) return { ok: false, code: str(envelope, "code") ?? "webhook_route_refused" };
      return { ok: true, applied: envelope.applied === true };
    },

    async readOrder(orderId) {
      const row = await ports.database.selectOne("research_orders", QUALIFICATION_ORDER_COLUMNS, { id: orderId });
      return row ? mapObservedOrder(row, ORDER_STATES) : null;
    },

    async readExecution(memberId, requestKey): Promise<CheckoutExecutionRecord | null> {
      const row = await ports.database.selectOne("research_checkout_executions", EXECUTION_COLUMNS, {
        member_id: memberId,
        request_key: requestKey,
      });
      if (!row) return null;
      const record = rowToExecution(row as unknown as CheckoutExecutionRow);
      if (!record) fail("execution_row_uninterpretable");
      remember(record.providerReference);
      return record;
    },

    async readProviderPayment(providerReference) {
      remember(providerReference);
      const intent = await ports.provider.retrieveIntent(providerReference);
      return intent ? mapObservedPayment(intent, providerReference) : null;
    },

    /**
     * Payments THIS RUN caused, not every payment in the account. Scoped by the
     * run's start time and by the run's own synthetic members, so a busy shared
     * test account cannot make a duplicate look like it happened, or hide one.
     */
    async providerPaymentCount() {
      const intents = await ports.provider.listIntentsSince(runStartedAtSeconds);
      return intents.filter((intent) => {
        const metadata = asRecord(intent.metadata);
        const member = str(metadata, "memberId");
        return member !== null && runMembers.has(member);
      }).length;
    },

    async providerCaptureCount() {
      const intents = await ports.provider.listIntentsSince(runStartedAtSeconds);
      return intents.filter((intent) => {
        const metadata = asRecord(intent.metadata);
        const member = str(metadata, "memberId");
        if (member === null || !runMembers.has(member)) return false;
        // A capture is money actually received. `succeeded` alone would also
        // count an automatic-capture intent that was never separately captured.
        return num(intent, "amount_received") > 0;
      }).length;
    },

    ...(ports.fault
      ? {
          injectFault(fault: "lost_response" | "server_error") { barrier.arm(() => ports.fault!.injectTransportFault(fault)); },
          failNextLocalCommit() { barrier.arm(() => ports.fault!.failNextLocalCommit()); },
        }
      : {}),

    ...(ports.process
      ? {
          async restart() {
            await ports.process!.restart();
          },
        }
      : {}),
  };

  // Arming is async: every subsequent operation waits for the control acknowledgement.
  const guarded = new Proxy(surface, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || property === "injectFault" || property === "failNextLocalCommit") return value;
      return async (...args: unknown[]) => {
        await barrier.ready();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });

  return {
    surface: guarded,
    webhookEvidence: "harness_signed_through_mounted_route",
    describe: () => ({
      baseUrl: config.baseUrl,
      databaseUrl: transports.databaseUrl,
      providerMode: transports.providerMode,
      providerAccountId: transports.providerAccountId,
      databaseOverHttp: transports.databaseOverHttp,
      capabilities,
      runStartedAtSeconds,
      syntheticMemberCount: config.members.length,
      referencesSeen: seenReferences.size,
      captureCountKind: "intents_with_positive_amount_received_not_transport_operation_count",
      webhookEvidence: "harness_signed_through_mounted_route",
    }),
  };
}
