import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import {
  DisabledPaymentProvider,
  StripePaymentAdapter,
  TestPaymentProvider,
  supportsDurableExecution,
  type StripeRequest,
} from "../providers/payment";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore } from "./durable-checkout-executor";
import { createProviderVerifiedPaymentPort, validExecutionBinding } from "./durable-payment-port";

// ---------------------------------------------------------------------------
// Fixtures. No network: the REAL Stripe adapter runs over a scripted transport
// that models Stripe's request idempotency (same key => same payment object).
// The fake key strings match no Stripe format and never leave the transport.
// ---------------------------------------------------------------------------
const FAKE_SECRET_KEY = "sk_fake_unit_test_only";
const FAKE_WEBHOOK_SECRET = "whsec_fake_unit_test_only";

const record: CheckoutExecutionRecord = {
  executionId: "exe-1",
  requestKey: "req-1",
  phase: "reserved",
  version: 1,
  providerReference: null,
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 33_999,
  currency: "usd",
  paymentMethodReference: "pm_fixture_card",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-key-0001",
  captureKey: "xr-capture-key-0001",
  cancelKey: "xr-cancel-key-0001",
  reservationIds: ["res-1"],
  createdAt: "2026-09-09T00:00:00Z",
  authorizationAttemptedAt: null,
  settledAt: null,
};

type Intent = {
  id: string;
  status: string;
  amount: number;
  amount_capturable: number;
  amount_received: number;
  currency: string;
  metadata: { orderId: string; memberId: string };
  client_secret?: string;
};

/**
 * A minimal Stripe model: payment intents keyed by id, request idempotency by
 * key, plus scripted faults. `lostResponses` drops the response of the next
 * matching request AFTER the effect happened, which is the dangerous case.
 */
function stripeModel(options: { requiresAction?: boolean } = {}) {
  const intents = new Map<string, Intent>();
  const byKey = new Map<string, { body: string; response: { status: number; body: unknown } }>();
  const requests: StripeRequest[] = [];
  const faults = { lostResponses: 0, serverErrors: 0, rateLimits: 0 };
  let counter = 0;
  const transport = async (request: StripeRequest) => {
    requests.push(request);
    if (faults.serverErrors > 0) {
      faults.serverErrors -= 1;
      return { status: 500, body: { error: { type: "api_error", message: "boom" } } };
    }
    if (faults.rateLimits > 0) {
      faults.rateLimits -= 1;
      return { status: 429, body: { error: { type: "rate_limit_error", message: "slow down" } } };
    }
    const response = handle(request);
    // Only a WRITE can leave an effect behind while its response is lost; reads are replayed by the adapter.
    if (faults.lostResponses > 0 && request.method === "POST") {
      faults.lostResponses -= 1;
      throw new Error("socket hang up after the provider processed the request");
    }
    return response;
  };
  function handle(request: StripeRequest): { status: number; body: unknown } {
    const form = request.form ?? {};
    const body = JSON.stringify([request.method, request.path, form]);
    if (request.method === "POST" && request.path === "/v1/payment_intents") {
      const key = request.idempotencyKey;
      if (!key) return { status: 400, body: { error: { type: "invalid_request_error", message: "missing key" } } };
      const seen = byKey.get(key);
      if (seen) {
        if (seen.body !== body) {
          return { status: 400, body: { error: { type: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters." } } };
        }
        return seen.response;
      }
      const id = `pi_${String(++counter).padStart(4, "0")}`;
      const amount = Number(form.amount);
      const confirmed = form.confirm === "true";
      const status = !confirmed ? "requires_confirmation" : options.requiresAction ? "requires_action" : "requires_capture";
      const intent: Intent = {
        id,
        status,
        amount,
        amount_capturable: status === "requires_capture" ? amount : 0,
        amount_received: 0,
        currency: form.currency ?? "usd",
        metadata: { orderId: form["metadata[orderId]"] ?? "", memberId: form["metadata[memberId]"] ?? "" },
        client_secret: `${id}_secret_fixture`,
      };
      intents.set(id, intent);
      const response = { status: 200, body: { ...intent } };
      byKey.set(key, { body, response });
      return response;
    }
    const get = /^\/v1\/payment_intents\/([^/?]+)(\?.*)?$/.exec(request.path);
    if (request.method === "GET" && get) {
      const intent = intents.get(decodeURIComponent(get[1]!));
      if (!intent) return { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } };
      return { status: 200, body: { ...intent } };
    }
    const capture = /^\/v1\/payment_intents\/([^/]+)\/capture$/.exec(request.path);
    if (request.method === "POST" && capture) {
      const intent = intents.get(decodeURIComponent(capture[1]!));
      if (!intent) return { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } };
      if (intent.status !== "requires_capture") {
        return { status: 400, body: { error: { type: "invalid_request_error", message: `This PaymentIntent could not be captured because it has a status of ${intent.status}.` } } };
      }
      const amount = Number(form.amount_to_capture ?? intent.amount_capturable);
      intent.status = "succeeded";
      intent.amount_received = amount;
      intent.amount_capturable = 0;
      return { status: 200, body: { ...intent } };
    }
    const cancel = /^\/v1\/payment_intents\/([^/]+)\/cancel$/.exec(request.path);
    if (request.method === "POST" && cancel) {
      const intent = intents.get(decodeURIComponent(cancel[1]!));
      if (!intent) return { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } };
      if (intent.status === "succeeded") {
        return { status: 400, body: { error: { type: "invalid_request_error", message: "You cannot cancel this PaymentIntent because it has a status of succeeded." } } };
      }
      intent.status = "canceled";
      intent.amount_capturable = 0;
      return { status: 200, body: { ...intent } };
    }
    return { status: 400, body: { error: { type: "invalid_request_error", message: `unexpected ${request.method} ${request.path}` } } };
  }
  /** The customer completed 3DS: Stripe moves the intent to requires_capture. */
  const completeAction = (id: string) => {
    const intent = intents.get(id)!;
    intent.status = "requires_capture";
    intent.amount_capturable = intent.amount;
  };
  const adapter = new StripePaymentAdapter({ secretKey: FAKE_SECRET_KEY, webhookSecret: FAKE_WEBHOOK_SECRET, transport });
  const creates = () => requests.filter((r) => r.method === "POST" && r.path === "/v1/payment_intents");
  const captures = () => requests.filter((r) => r.method === "POST" && r.path.endsWith("/capture"));
  return { adapter, intents, requests, faults, completeAction, creates, captures };
}

/** An in-memory execution store with real version compare-and-swap. Test double only; never production. */
function executionStore(initial: CheckoutExecutionRecord) {
  let current: CheckoutExecutionRecord = structuredClone(initial);
  const history: string[] = [];
  const cas = (expected: number, next: Partial<CheckoutExecutionRecord>) => {
    if (current.version !== expected) return null;
    current = { ...current, ...next, version: expected + 1 };
    return structuredClone(current);
  };
  const store: CanonicalCheckoutExecutionStore = {
    authority: "canonical_checkout_transaction_v1",
    getForMember: async (memberId, requestKey) =>
      current.memberId === memberId && current.requestKey === requestKey ? structuredClone(current) : null,
    claim: async (_id, expected, phase) => {
      history.push(`claim:${phase}`);
      return cas(expected, { phase });
    },
    recordProvider: async (_id, expected, result) => {
      history.push(`record:${result.kind}`);
      const phase: CheckoutExecutionRecord["phase"] =
        result.kind === "unknown" || result.kind === "refused" ? "reconciliation_required" : result.kind;
      return cas(expected, { phase, providerReference: "providerReference" in result ? result.providerReference : current.providerReference });
    },
    commitCaptured: async (_id, expected) => {
      history.push("commit");
      return cas(expected, { phase: "committed" });
    },
    commitCancelled: async (_id, expected) => {
      history.push("commit-cancelled");
      return cas(expected, { phase: "cancelled" });
    },
  };
  return { store, history, snapshot: () => structuredClone(current), reset: (next: CheckoutExecutionRecord) => { current = structuredClone(next); } };
}

describe("provider-verified payment port: contract", () => {
  it("requires a durable provider and refuses a bare PaymentProvider", () => {
    const bare = { name: "bare", supportsDeferredCapture: true } as never;
    expect(() => createProviderVerifiedPaymentPort(bare)).toThrow(/DurablePaymentProvider/);
    expect(supportsDurableExecution(new DisabledPaymentProvider())).toBe(true);
    expect(supportsDurableExecution(new TestPaymentProvider())).toBe(true);
    expect(createProviderVerifiedPaymentPort(new TestPaymentProvider()).authority).toBe("provider_verified_idempotent_execution_v1");
  });
  it("refuses an invalid money binding before any provider call, as definitive no-effect", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    for (const bad of [
      { amountCents: 0 },
      { amountCents: 12.5 },
      { currency: "eur" as never },
      { paymentMethodReference: "4242424242424242" },
      { paymentMethodReference: "" },
      { authorizationKey: "short" },
      { orderId: "" },
    ]) {
      const result = await port.authorize({ ...record, ...bad });
      expect(result).toEqual({ kind: "refused", definitiveNoEffect: true });
    }
    expect(model.requests).toHaveLength(0);
    expect(validExecutionBinding(record, /^pm_[A-Za-z0-9_]+$/)).toBe(true);
  });
  it("reports a disabled provider as definitive no-effect for every operation", async () => {
    const port = createProviderVerifiedPaymentPort(new DisabledPaymentProvider());
    const bound = { ...record, providerReference: "pi_0001" };
    expect(await port.authorize(record)).toEqual({ kind: "refused", definitiveNoEffect: true });
    expect(await port.capture(bound)).toEqual({ kind: "refused", definitiveNoEffect: true });
    expect(await port.cancel(bound)).toEqual({ kind: "refused", definitiveNoEffect: true });
    expect(await port.reconcile(record)).toEqual({ kind: "refused", definitiveNoEffect: true });
  });
});

describe("provider-verified payment port over the real Stripe adapter", () => {
  it("authorizes with the record's key and exact evidence, then captures the same payment", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    const authorized = await port.authorize(record);
    expect(authorized).toEqual({
      kind: "authorized",
      providerReference: "pi_0001",
      amountCents: record.amountCents,
      currency: "usd",
      memberId: record.memberId,
      orderId: record.orderId,
    });
    const create = model.creates();
    expect(create).toHaveLength(1);
    expect(create[0]!.idempotencyKey).toBe(record.authorizationKey);
    expect(create[0]!.form).toMatchObject({ amount: "33999", currency: "usd", capture_method: "manual", payment_method: "pm_fixture_card", confirm: "true" });
    expect(JSON.stringify(create[0]!.form)).not.toContain("description");
    const captured = await port.capture({ ...record, phase: "capturing", providerReference: "pi_0001" });
    expect(captured).toEqual({ kind: "captured", providerReference: "pi_0001", amountCents: record.amountCents, currency: "usd", memberId: record.memberId, orderId: record.orderId });
    expect(model.captures()[0]!.form).toEqual({ amount_to_capture: "33999" });
  });

  it("retry after a lost create response replays the same key and gets the SAME payment, never a second charge", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    model.faults.lostResponses = 1;
    expect(await port.authorize(record)).toEqual({ kind: "unknown" });
    expect(model.intents.size).toBe(1); // the effect happened at the provider
    // The coordinator moves the record to authorizing and later reconciles; the reference is still unknown.
    const reconciled = await port.reconcile({ ...record, phase: "authorizing" });
    expect(reconciled).toMatchObject({ kind: "authorized", providerReference: "pi_0001", amountCents: record.amountCents });
    expect(model.intents.size).toBe(1);
    expect(new Set(model.creates().map((r) => r.idempotencyKey))).toEqual(new Set([record.authorizationKey]));
  });

  it("the same key with a changed body is refused by the provider and never authorizes", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    expect((await port.authorize(record)).kind).toBe("authorized");
    const tampered = { ...record, amountCents: record.amountCents + 100 };
    const result = await port.authorize(tampered);
    expect(result).toEqual({ kind: "refused", definitiveNoEffect: false });
    expect(model.intents.size).toBe(1);
    const sameMember = { ...record, orderId: "33333333-3333-4333-8333-333333333333" };
    expect(await port.authorize(sameMember)).toEqual({ kind: "refused", definitiveNoEffect: false });
    expect(model.intents.size).toBe(1);
  });

  it("maps provider outages and rate limits to unknown, not to failure", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    model.faults.serverErrors = 1;
    expect(await port.authorize(record)).toEqual({ kind: "unknown" });
    model.faults.rateLimits = 1;
    expect(await port.authorize(record)).toEqual({ kind: "unknown" });
    expect(model.intents.size).toBe(0);
    expect((await port.authorize(record)).kind).toBe("authorized");
  });

  it("surfaces a customer action with the payment reference, then reconciles to authorized after completion", async () => {
    const model = stripeModel({ requiresAction: true });
    const port = createProviderVerifiedPaymentPort(model.adapter);
    const pending = await port.authorize(record);
    expect(pending).toEqual({ kind: "action_required", providerReference: "pi_0001" });
    const bound = { ...record, phase: "action_required" as const, providerReference: "pi_0001" };
    expect(await port.reconcile(bound)).toEqual({ kind: "action_required", providerReference: "pi_0001" });
    expect(await port.capture({ ...bound, phase: "capturing" })).toEqual({ kind: "action_required", providerReference: "pi_0001" });
    model.completeAction("pi_0001");
    expect(await port.reconcile(bound)).toMatchObject({ kind: "authorized", providerReference: "pi_0001", amountCents: record.amountCents });
    expect(model.creates()).toHaveLength(1);
  });

  it("reconciles a lost capture response from the provider's read-back, never a second capture", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    expect((await port.authorize(record)).kind).toBe("authorized");
    const capturing = { ...record, phase: "capturing" as const, providerReference: "pi_0001" };
    model.faults.lostResponses = 1; // the capture happened; the response was lost
    const captured = { kind: "captured", providerReference: "pi_0001", amountCents: record.amountCents, currency: "usd", memberId: record.memberId, orderId: record.orderId };
    // The port resolves the lost write from the provider's read-back instead of guessing.
    expect(await port.capture(capturing)).toEqual(captured);
    expect(model.intents.get("pi_0001")!.status).toBe("succeeded");
    expect(await port.reconcile(capturing)).toEqual(captured);
    // A retried capture is refused by the adapter's own pre-read and resolved the same way: one capture ever.
    expect(await port.capture(capturing)).toEqual(captured);
    expect(model.captures()).toHaveLength(1);
    expect(model.intents.get("pi_0001")!.amount_received).toBe(record.amountCents);
  });

  it("cancels an uncaptured authorization with zero-capture evidence, and reports captured money when cancel is refused", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    expect((await port.authorize(record)).kind).toBe("authorized");
    const bound = { ...record, phase: "cancelling" as const, providerReference: "pi_0001" };
    expect(await port.cancel(bound)).toEqual({ kind: "cancelled", providerReference: "pi_0001", capturedAmountCents: 0 });
    expect(await port.reconcile(bound)).toEqual({ kind: "cancelled", providerReference: "pi_0001", capturedAmountCents: 0 });

    const paid = stripeModel();
    const paidPort = createProviderVerifiedPaymentPort(paid.adapter);
    expect((await paidPort.authorize(record)).kind).toBe("authorized");
    expect((await paidPort.capture({ ...record, phase: "capturing", providerReference: "pi_0001" })).kind).toBe("captured");
    const late = await paidPort.cancel({ ...record, phase: "cancelling", providerReference: "pi_0001" });
    expect(late).toMatchObject({ kind: "captured", providerReference: "pi_0001", amountCents: record.amountCents });
  });

  it("treats provider evidence that names another order, member, amount or reference as unknown", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter);
    expect((await port.authorize(record)).kind).toBe("authorized");
    const foreignOrder = { ...record, phase: "authorizing" as const, providerReference: "pi_0001", orderId: "44444444-4444-4444-8444-444444444444" };
    expect(await port.reconcile(foreignOrder)).toEqual({ kind: "unknown" });
    const wrongAmount = { ...record, phase: "authorizing" as const, providerReference: "pi_0001", amountCents: 1 };
    expect(await port.reconcile(wrongAmount)).toEqual({ kind: "unknown" });
    const unknownReference = { ...record, phase: "authorizing" as const, providerReference: "pi_9999" };
    expect(await port.reconcile(unknownReference)).toEqual({ kind: "unknown" });
    const boundElsewhere = { ...record, providerReference: "pi_9999" };
    expect(await port.authorize(boundElsewhere)).toEqual({ kind: "unknown" });
    expect(model.creates()).toHaveLength(1);
  });
});

describe("provider-verified payment port: creation-key retention", () => {
  const T0 = Date.parse("2026-09-09T12:00:00Z");
  const HOUR = 60 * 60 * 1000;
  const attempted = (hoursAgo: number, phase: CheckoutExecutionRecord["phase"] = "authorizing") => ({
    ...record,
    phase,
    authorizationAttemptedAt: new Date(T0 - hoursAgo * HOUR).toISOString(),
  });
  it("replays the creation key inside the provider's retention window and recovers the same payment", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => T0 });
    model.faults.lostResponses = 1;
    expect(await port.authorize(attempted(0))).toEqual({ kind: "unknown" });
    expect(await port.reconcile(attempted(1))).toMatchObject({ kind: "authorized", providerReference: "pi_0001" });
    expect(await port.reconcile(attempted(19.9))).toMatchObject({ kind: "authorized", providerReference: "pi_0001" });
    expect(model.intents.size).toBe(1);
    expect(model.creates()).toHaveLength(3);
    expect(new Set(model.creates().map((r) => r.idempotencyKey)).size).toBe(1);
  });
  it("never replays creation once the first attempt is older than the retention window: uncertainty is preserved", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => T0 });
    model.faults.lostResponses = 1;
    expect(await port.authorize(attempted(0))).toEqual({ kind: "unknown" });
    expect(await port.reconcile(attempted(20.1))).toEqual({ kind: "unknown" });
    expect(await port.reconcile(attempted(25))).toEqual({ kind: "unknown" });
    expect(await port.authorize(attempted(25))).toEqual({ kind: "unknown" });
    expect(model.creates()).toHaveLength(1);
    expect(model.intents.size).toBe(1);
  });
  it("honours an injected retention and refuses a malformed or future first-attempt stamp", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => T0, creationKeyRetentionMs: HOUR });
    expect(await port.reconcile(attempted(0.5))).toMatchObject({ kind: "authorized" });
    expect(await port.reconcile(attempted(2))).toEqual({ kind: "unknown" });
    expect(await port.reconcile({ ...record, phase: "authorizing", authorizationAttemptedAt: "not-a-date" })).toEqual({ kind: "unknown" });
    expect(await port.reconcile(attempted(-1))).toEqual({ kind: "unknown" });
    expect(model.creates()).toHaveLength(1);
  });
  it("recovers by reference regardless of age once the reference is known", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => T0 });
    expect((await port.authorize(attempted(0))).kind).toBe("authorized");
    const old = { ...attempted(48), providerReference: "pi_0001" };
    expect(await port.reconcile(old)).toMatchObject({ kind: "authorized", providerReference: "pi_0001" });
    expect(model.creates()).toHaveLength(1);
  });
  it("concurrent reconciliations inside the window resolve to the same single payment", async () => {
    const model = stripeModel();
    const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => T0 });
    model.faults.lostResponses = 1;
    await port.authorize(attempted(0));
    const results = await Promise.all([port.reconcile(attempted(1)), port.reconcile(attempted(1)), port.reconcile(attempted(1))]);
    expect(results.every((r) => r.kind === "authorized" && r.providerReference === "pi_0001")).toBe(true);
    expect(model.intents.size).toBe(1);
  });
});

describe("provider-verified payment port with the deterministic test provider", () => {
  it("exposes the customer-action lifecycle through the durable extension", async () => {
    const provider = new TestPaymentProvider();
    provider.requireCustomerAction(record.paymentMethodReference);
    const port = createProviderVerifiedPaymentPort(provider);
    const pending = await port.authorize(record);
    expect(pending).toEqual({ kind: "action_required", providerReference: "test_auth_1" });
    const legacy = await provider.createAuthorization({ amountCents: record.amountCents, currency: "usd", orderId: record.orderId, memberId: record.memberId, idempotencyKey: record.authorizationKey, paymentMethodReference: record.paymentMethodReference });
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) expect(legacy.message).toContain("not authorized yet");
    expect(provider.completeCustomerAction("test_auth_1")).toBe(true);
    expect(await port.reconcile({ ...record, phase: "action_required", providerReference: "test_auth_1" })).toMatchObject({ kind: "authorized", providerReference: "test_auth_1" });
  });
});

describe("coordinator + port + real Stripe adapter: end-to-end recovery", () => {
  const run = (model: ReturnType<typeof stripeModel>, initial: CheckoutExecutionRecord) => {
    const store = executionStore(initial);
    const executor = createDurableCheckoutExecutor(store.store, createProviderVerifiedPaymentPort(model.adapter));
    return { store, executor };
  };

  it("commits exactly one authorization and one capture on the happy path", async () => {
    const model = stripeModel();
    const { store, executor } = run(model, record);
    const outcome = await executor.run(record.memberId, record.requestKey);
    expect(outcome).toEqual({ kind: "committed", orderId: record.orderId, executionId: record.executionId });
    expect(store.history).toEqual(["claim:authorizing", "record:authorized", "claim:capturing", "record:captured", "commit"]);
    expect(model.creates()).toHaveLength(1);
    expect(model.captures()).toHaveLength(1);
    expect(store.snapshot().providerReference).toBe("pi_0001");
  });

  it("a lost create response stops for reconciliation; the next run recovers the same payment and commits with one key", async () => {
    const model = stripeModel();
    const { store, executor } = run(model, record);
    model.faults.lostResponses = 1;
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("reconciliation_required");
    expect(store.snapshot().phase).toBe("reconciliation_required");
    expect(model.intents.size).toBe(1);
    // An operator/continuation path re-enters the in-flight phase; the coordinator reconciles, never re-authorizes.
    store.reset({ ...store.snapshot(), phase: "authorizing" });
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("committed");
    expect(model.intents.size).toBe(1);
    expect(new Set(model.creates().map((r) => r.idempotencyKey)).size).toBe(1);
    expect(model.captures()).toHaveLength(1);
  });

  it("concurrent duplicate submissions produce one provider authorization", async () => {
    const model = stripeModel();
    const { store, executor } = run(model, record);
    const [a, b] = await Promise.all([executor.run(record.memberId, record.requestKey), executor.run(record.memberId, record.requestKey)]);
    expect([a.kind, b.kind].sort()).toEqual(["committed", "pending"]);
    expect(model.creates()).toHaveLength(1);
    expect(model.captures()).toHaveLength(1);
    expect(store.snapshot().phase).toBe("committed");
  });

  it("a customer action stops the run explicitly and continues to commit after completion", async () => {
    const model = stripeModel({ requiresAction: true });
    const { store, executor } = run(model, record);
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("action_required");
    expect(store.snapshot()).toMatchObject({ phase: "action_required", providerReference: "pi_0001" });
    model.completeAction("pi_0001");
    // Continuation after the customer's action re-enters reconciliation of the existing payment.
    store.reset({ ...store.snapshot(), phase: "authorizing" });
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("committed");
    expect(model.creates()).toHaveLength(1);
  });

  it("another principal cannot read or resume the execution", async () => {
    const model = stripeModel();
    const { executor } = run(model, record);
    expect((await executor.run("55555555-5555-4555-8555-555555555555", record.requestKey)).kind).toBe("missing");
    expect(model.requests).toHaveLength(0);
  });

  it("an idempotency conflict at the provider stops for reconciliation without capture", async () => {
    const model = stripeModel();
    // A previous execution already used this key for a different body.
    await createProviderVerifiedPaymentPort(model.adapter).authorize({ ...record, amountCents: 1_000 });
    const { store, executor } = run(model, record);
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("reconciliation_required");
    expect(store.history).toEqual(["claim:authorizing", "record:refused"]);
    expect(model.captures()).toHaveLength(0);
  });

  it("a record whose amount drifted from the provider's payment is never captured or committed", async () => {
    const model = stripeModel();
    const { store, executor } = run(model, record);
    // The payment was authorized for 33,999 by an earlier run whose capture never started.
    expect((await createProviderVerifiedPaymentPort(model.adapter).authorize(record)).kind).toBe("authorized");
    store.reset({ ...record, phase: "authorizing", providerReference: "pi_0001", amountCents: 34_000 });
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("reconciliation_required");
    expect(store.history).toEqual(["record:unknown"]);
    expect(model.captures()).toHaveLength(0);
    expect(model.intents.get("pi_0001")!.status).toBe("requires_capture");
  });
});
