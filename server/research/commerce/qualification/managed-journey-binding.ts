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
import { EXECUTION_COLUMNS, rowToExecution, type CheckoutExecutionRow } from "../persistence/checkout-executions-store";
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

/**
 * Exactly the columns readOrder maps. Selecting "*" instead is what makes a
 * wrong column name silent: PostgREST answers 400 for an unknown column in a
 * select list, but returns the row without the key when the list is "*", and
 * `?? null` then turns a typo into a plausible-looking null.
 */
const ORDER_COLUMNS = [
  "id",
  "member_id",
  "state",
  "subtotal_cents",
  "shipping_cents",
  "store_credit_applied_cents",
  "total_cents",
  "authorized_amount_cents",
  "captured_amount_cents",
  "refunded_cents",
  "payment_reference",
  "checkout_idempotency_key",
  "last_idempotency_key",
  "review_triggers",
  "created_at",
  "updated_at",
].join(", ");

/** Which amount field the provider's own translation reads, per event type. */
const WEBHOOK_AMOUNT_FIELD: Readonly<Record<string, string>> = Object.freeze({
  "payment.authorized": "amount_capturable",
  "payment.captured": "amount_received",
  "payment.refunded": "amount_refunded",
});

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
function continuationOf(response: HttpResponse): JourneyContinuation {
  const envelope = asRecord(response.body);
  if (envelope?.ok !== true) {
    // A refusal that carries no code is still distinguishable by its status. A
    // guard's 401 and an unmounted path's 404 must not read as the same word.
    return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
  }
  const continuation = asRecord(envelope.continuation);
  if (continuation === null) {
    // `{ok:true}` with no payload is not this door answering. Every commerce
    // route wraps success the same way, so a path collision or a shadowing
    // registration answers ok:true with nothing in it, and a scenario that
    // asserts only `.ok === true` would pass on it.
    return { ok: false, code: `ok_without_continuation_http_${response.status}` };
  }
  const cancellation = asRecord(continuation.cancellation);
  const reason = str(cancellation, "reason");
  return {
    ok: true,
    state: (str(continuation, "state") ?? undefined) as JourneyContinuation["state"],
    orderId: str(continuation, "orderId") ?? undefined,
    hasAuthenticationSecret: asRecord(continuation.authentication) !== null,
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
  /** The exact bytes delivered per event id, so a redelivery is a REdelivery. */
  const deliveredBodies = new Map<string, string>();

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
      if (envelope?.ok !== true) {
        return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
      }
      const checkout = asRecord(envelope.checkout);
      if (checkout === null) {
        return { ok: false, code: `ok_without_checkout_http_${response.status}` };
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

    // A test method that authenticates straight through needs no browser: the
    // provider settles it on confirmation. This exists so the runner can
    // distinguish the easy path from the challenge, and it is NOT challenge
    // evidence.
    async completeCustomerAction(providerReference) {
      remember(providerReference);
      const intent = await ports.provider.retrieveIntent(providerReference);
      const status = str(intent, "status");
      if (status === "requires_action") {
        throw new Error("this payment presents a customer challenge; the non-challenge path cannot complete it");
      }
    },

    ...(ports.browser
      ? {
          async completeCustomerChallenge(providerReference: string) {
            remember(providerReference);
            const intent = await ports.provider.retrieveIntent(providerReference);
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
      // A real provider event body, signed with the endpoint's own secret, in
      // the provider's own signature scheme, posted to the mounted route. The
      // route verifies it exactly as it verifies a delivered one.
      // A REDELIVERY must be the same bytes. Replay identity is a digest of the
      // body, so re-synthesising it with a fresh `created` makes the same event
      // id arrive with a different digest, which the inbox correctly refuses as
      // a conflict; the redelivery scenario would then fail for the wrong
      // reason.
      let payload = deliveredBodies.get(input.eventId);
      if (payload === undefined) {
        const account = ports.provider.accountId();
        const amountField = WEBHOOK_AMOUNT_FIELD[input.eventType] ?? "amount_received";
        payload = JSON.stringify({
          id: input.eventId,
          type: input.eventType,
          created: Math.floor(now().getTime() / 1000),
          // Present only for a connected account. The adapter refuses a delivery
          // whose account does not equal the one it is bound to, and a null
          // binding must be matched by an ABSENT key, not by a null one.
          ...(account === null ? {} : { account }),
          data: {
            object: {
              id: input.providerReference,
              object: "payment_intent",
              currency: "usd",
              amount: input.amountCents,
              // The provider's translation reads ONE field per event type, and
              // it is not `amount`. Sending the wrong one makes the amount read
              // as zero or undefined, the binding isolate the event, and the
              // route still answer 200, so the scenario passes having applied
              // nothing.
              [amountField]: input.amountCents,
              metadata: { orderId: input.orderId, memberId: input.memberId },
            },
          },
        });
        deliveredBodies.set(input.eventId, payload);
      }
      const timestamp = Math.floor(now().getTime() / 1000);
      const signature = createHmac("sha256", config.secrets.webhookSecret()).update(`${timestamp}.${payload}`).digest("hex");
      const response = await ports.http.request({
        method: "POST",
        url: `${config.baseUrl}${WEBHOOK_PATH}`,
        headers: { "Content-Type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
        raw: payload,
      });
      const envelope = asRecord(response.body);
      if (response.status >= 500) return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
      if (envelope?.ok !== true) return { ok: false, code: str(envelope, "code") ?? `http_${response.status}` };
      return { ok: true, applied: envelope.applied === true || envelope.outcome === "applied" };
    },

    async readOrder(orderId) {
      const row = await ports.database.selectOne("research_orders", ORDER_COLUMNS, { id: orderId });
      if (!row) return null;
      // Only the fields the journey reconciles. A customer row never travels
      // further than this function.
      // A state the domain does not know is refused rather than passed
      // through: the journey reconciles against this word, so an unrecognised
      // one must not be able to satisfy an expectation by accident.
      const state = String(row.state ?? "");
      if (!(ORDER_STATES as readonly string[]).includes(state)) {
        throw new Error(`the order carries a state this build does not know: ${JSON.stringify(state)}`);
      }
      return {
        orderId: String(row.id ?? orderId),
        memberId: String(row.member_id ?? ""),
        state: state as OrderState,
        lines: [],
        totals: {
          subtotalCents: Number(row.subtotal_cents ?? 0),
          shippingCents: Number(row.shipping_cents ?? 0),
          storeCreditAppliedCents: Number(row.store_credit_applied_cents ?? 0),
          totalCents: Number(row.total_cents ?? 0),
        },
        // research_orders names this column `payment_reference`. There IS a
        // `provider_reference` column, on two OTHER tables.
        providerReference: (row.payment_reference as string | null) ?? null,
        authorizedAmountCents: row.authorized_amount_cents === null ? undefined : Number(row.authorized_amount_cents ?? 0),
        capturedAmountCents: row.captured_amount_cents === null ? undefined : Number(row.captured_amount_cents ?? 0),
        refundedCents: Number(row.refunded_cents ?? 0),
        checkoutIdempotencyKey: (row.checkout_idempotency_key as string | null) ?? null,
        lastIdempotencyKey: (row.last_idempotency_key as string | null) ?? null,
        reviewTriggers: Array.isArray(row.review_triggers) ? (row.review_triggers as string[]) : [],
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
      } satisfies OrderRecord;
    },

    async readExecution(memberId, requestKey): Promise<CheckoutExecutionRecord | null> {
      const row = await ports.database.selectOne("research_checkout_executions", EXECUTION_COLUMNS, {
        member_id: memberId,
        request_key: requestKey,
      });
      if (!row) return null;
      const record = rowToExecution(row as unknown as CheckoutExecutionRow);
      if (record === null) {
        // A row that exists but this build cannot interpret is NOT absence.
        // Returning null there makes the scenarios that guard on
        // `execution?.providerReference` quietly stop checking the provider.
        throw new Error("a checkout execution row exists but this build cannot interpret it");
      }
      remember(record.providerReference);
      return record;
    },

    async readProviderPayment(providerReference): Promise<JourneyPayment | null> {
      remember(providerReference);
      const intent = await ports.provider.retrieveIntent(providerReference);
      if (!intent) return null;
      const status = str(intent, "status") ?? "";
      return {
        status: INTENT_STATUS[status] ?? "processing",
        amountCapturableCents: num(intent, "amount_capturable"),
        amountReceivedCents: num(intent, "amount_received"),
      };
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
          injectFault(fault: "lost_response" | "server_error") {
            // The runner's seam is synchronous; the control channel is not.
            // A failure here must not be swallowed into a false pass, so it is
            // surfaced on the next await through a rejected promise the
            // scenario will observe.
            void ports.fault!.injectTransportFault(fault).catch((error: unknown) => {
              pendingFault = error instanceof Error ? error : new Error("fault injection failed");
            });
          },
          failNextLocalCommit() {
            void ports.fault!.failNextLocalCommit().catch((error: unknown) => {
              pendingFault = error instanceof Error ? error : new Error("local commit fault failed");
            });
          },
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

  let pendingFault: Error | null = null;
  // Any fault-channel failure becomes a real failure at the next surface call
  // rather than a scenario that quietly proved nothing.
  const guarded = new Proxy(surface, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || property === "injectFault" || property === "failNextLocalCommit") return value;
      return (...args: unknown[]) => {
        if (pendingFault) {
          const error = pendingFault;
          pendingFault = null;
          throw error;
        }
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
      webhookEvidence: "harness_signed_through_mounted_route",
    }),
  };
}
