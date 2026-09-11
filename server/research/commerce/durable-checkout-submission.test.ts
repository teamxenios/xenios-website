import express, { type Request, type Response } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";
import type { ReservationSeam } from "./checkout";
import { createCheckoutContinuationService } from "./checkout-continuation";
import { createDurableCheckoutExecutor } from "./durable-checkout-executor";
import { createDurableCheckoutSubmission, quoteFingerprint, registerDurableCheckoutApi, DURABLE_CHECKOUT_PATH } from "./durable-checkout-submission";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import type { OrderRecord } from "./orders";
import { CheckoutCreditReservationRefused, createInMemoryCheckoutExecutionStore, requestBodySha256 } from "./persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { stripeModel } from "./stripe-model.test-helper";

const MEMBER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-09-09T12:00:00Z");
const cart: CartDto = {
  lines: [
    { sku: "SKU-A", displayName: "Fixture A", quantity: 2, purchaseMode: "one_time", unitPriceCents: 10_000, lineTotalCents: 20_000, blockedReason: null },
    { sku: "SKU-B", displayName: "Fixture B", quantity: 1, purchaseMode: "one_time", unitPriceCents: 12_999, lineTotalCents: 12_999, blockedReason: null },
  ],
  shipmentGroups: [{ owner: "xenios", skus: ["SKU-A", "SKU-B"] }],
  subtotalCents: 32_999,
  shippingCents: 1_000,
  storeCreditAppliedCents: 0,
  estimatedTotalCents: 33_999,
  checkoutReady: true,
  blockingReasons: [],
  requiredAgreements: ["research-use"],
};
const quote: ShippingQuote = { kind: "configured_standard", service: "standard", amountCents: 1_000, estimatedDeliveryRange: null, disclosure: "fixture" } as ShippingQuote;
const request = (overrides: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  shippingAddress: { line1: "1 Fixture St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
  shippingService: "standard",
  acceptedAgreementKeys: ["research-use"],
  researchAttestation: true,
  idempotencyKey: "req_durable_0001",
  checkoutConsent: { policyVersion: "all-available-items-v1", totalCents: 33_999, appliedCents: 0 },
  paymentMethodReference: "pm_fixture_card",
  ...overrides,
});

function reservationSeam() {
  const events: string[] = [];
  let counter = 0;
  let refuse = false;
  const seam: ReservationSeam = {
    async reserve(_memberId, lines) {
      if (refuse) return { ok: false, refusals: ["insufficient_stock"] } as never;
      const ids = lines.map(() => `res-${++counter}`);
      events.push(`reserve:${ids.join("+")}`);
      return { ok: true, reservationIds: ids };
    },
    async release(ids) {
      events.push(`release:${ids.join("+")}`);
    },
    async finalize(ids) {
      events.push(`finalize:${ids.join("+")}`);
    },
  };
  return { seam, events, setRefuse: (value: boolean) => { refuse = value; } };
}

function composition(options: { requiresAction?: boolean; denials?: CheckoutRequest["acceptedAgreementKeys"]; fraud?: boolean; storeCredit?: number; cart?: CartDto } = {}) {
  const model = stripeModel({ requiresAction: options.requiresAction ?? false });
  const orders = createInMemoryOrderStore();
  const clock = { now: NOW };
  const executions = createInMemoryCheckoutExecutionStore({ now: () => clock.now });
  const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => clock.now.getTime() });
  const executor = createDurableCheckoutExecutor(executions, port);
  const holds = reservationSeam();
  const committed: string[] = [];
  let ids = 0;
  const submission = createDurableCheckoutSubmission({
    evaluate: async () => ({
      denials: (options.denials ?? []) as never,
      cart: options.cart ?? (options.storeCredit ? { ...cart, storeCreditAppliedCents: options.storeCredit, estimatedTotalCents: 33_999 - options.storeCredit } : cart),
      quote,
    }),
    orders,
    executions,
    executor,
    inventory: holds.seam,
    isFraudFlagged: () => options.fraud ?? false,
    now: () => NOW,
    newId: () => `${String(++ids).padStart(8, "0")}-0000-4000-8000-000000000000`,
    onCommitted: (order) => {
      committed.push(order.orderId);
    },
  });
  const continuation = createCheckoutContinuationService({ store: executions, provider: model.adapter, executor });
  return { model, orders, executions, submission, holds, committed, continuation, clock };
}

describe("durable checkout submission", () => {
  it("places one order end to end: gates, hold, order, intent, provider, commit, and reports completed", async () => {
    const c = composition();
    const outcome = await c.submission.submit(MEMBER, request(), NOW);
    expect(outcome).toEqual({ ok: true, requestKey: "req_durable_0001", orderId: "00000001-0000-4000-8000-000000000000", state: "completed", idempotent: false });
    const order = (await c.orders.get("00000001-0000-4000-8000-000000000000"))!;
    expect(order).toMatchObject({ memberId: MEMBER, state: "checkout_pending", checkoutIdempotencyKey: "req_durable_0001", totals: { totalCents: 33_999, shippingCents: 1_000 }, providerReference: null });
    const execution = c.executions.snapshot()[0]!;
    expect(execution).toMatchObject({ phase: "committed", orderId: order.orderId, amountCents: 33_999, providerReference: "pi_0001", reservationIds: ["res-1", "res-2"], paymentMethodReference: "pm_fixture_card" });
    expect(execution.authorizationKey).toMatch(/^xr-auth-/);
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.captures()).toHaveLength(1);
    expect(c.model.creates()[0]!.form).toMatchObject({ amount: "33999", "metadata[orderId]": order.orderId, "metadata[memberId]": MEMBER });
    expect(c.holds.events).toEqual(["reserve:res-1+res-2"]);
    expect(c.committed).toEqual([order.orderId]);
  });

  it("orders the durable steps: hold, then order, then intent, then provider; nothing is charged before the intent exists", async () => {
    const c = composition();
    const sequence: string[] = [];
    const originalSave = c.orders.save.bind(c.orders);
    c.orders.save = async (order) => { sequence.push(`order:${order.state}`); return originalSave(order); };
    const originalCreate = c.executions.create.bind(c.executions);
    c.executions.create = async (record) => { sequence.push("intent"); return originalCreate(record); };
    const originalReserve = c.holds.seam.reserve.bind(c.holds.seam);
    c.holds.seam.reserve = async (...args) => { sequence.push("hold"); return originalReserve(...args); };
    await c.submission.submit(MEMBER, request(), NOW);
    expect(sequence).toEqual(["hold", "order:checkout_pending", "intent"]);
    expect(c.model.creates()).toHaveLength(1);
  });

  it("re-reads a committed execution after a lost create response without cancelling its order or holds", async () => {
    const c = composition();
    const create = c.executions.create.bind(c.executions);
    c.executions.create = async record => { await create(record); throw new Error("create_response_lost"); };
    const outcome = await c.submission.submit(MEMBER, request(), NOW);
    expect(outcome).toMatchObject({ ok: true, state: "completed", idempotent: false });
    expect(c.executions.snapshot()).toHaveLength(1);
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.captures()).toHaveLength(1);
    expect(c.holds.events).toEqual(["reserve:res-1+res-2"]);
    expect((await c.orders.listByMember(MEMBER))[0].state).toBe("checkout_pending");
  });

  it("preserves unresolved order and holds when create fails and its outcome is not yet visible", async () => {
    const c = composition();
    c.executions.create = async () => { throw new Error("create_outcome_unknown"); };
    await expect(c.submission.submit(MEMBER, request(), NOW)).rejects.toThrow("create_outcome_unknown");
    expect(c.holds.events).toEqual(["reserve:res-1+res-2"]);
    expect((await c.orders.listByMember(MEMBER))[0].state).toBe("checkout_pending");
    expect(c.model.requests).toEqual([]);
  });

  it.each(["credit_reservation_insufficient", "credit_expiry_allocation_not_qualified"] as const)(
    "compensates only a confirmed rejected credit intent without contacting the provider: %s", async reason => {
      const c = composition({ storeCredit: 400 });
      c.executions.create = async () => { throw new CheckoutCreditReservationRefused(reason); };
      const result = await c.submission.submit(MEMBER, request({ checkoutConsent: { policyVersion: "all-available-items-v1", totalCents: 33_599, appliedCents: 400 } }), NOW);
      expect(result).toMatchObject({ ok: false, code: reason === "credit_reservation_insufficient" ? "cart_revalidation_failed" : "capability_disabled" });
      expect(c.executions.snapshot()).toEqual([]);
      expect(c.model.requests).toEqual([]);
      expect(c.holds.events).toEqual(["reserve:res-1+res-2", "release:res-1+res-2"]);
      expect((await c.orders.listByMember(MEMBER))[0]).toMatchObject({ state: "cancelled", cancellationReason: "credit_reservation_refused" });
    });

  it("does not compensate a credit refusal when its order read-back is unavailable", async () => {
    const c = composition({ storeCredit: 400 });
    c.executions.create = async () => { throw new CheckoutCreditReservationRefused("credit_reservation_insufficient"); };
    c.executions.findByOrder = async () => { throw new Error("order_intent_lookup_unavailable"); };
    await expect(c.submission.submit(MEMBER, request({ checkoutConsent: { policyVersion: "all-available-items-v1", totalCents: 33_599, appliedCents: 400 } }), NOW)).rejects.toThrow("order_intent_lookup_unavailable");
    expect(c.holds.events).toEqual(["reserve:res-1+res-2"]);
    expect(c.model.requests).toEqual([]);
    expect((await c.orders.listByMember(MEMBER))[0].state).toBe("checkout_pending");
  });

  it("does not compensate or contact the provider if the creation read-back itself fails", async () => {
    const c = composition();
    const create = c.executions.create.bind(c.executions);
    c.executions.create = async record => {
      await create(record);
      c.executions.getForMember = async () => { throw new Error("creation_read_back_unavailable"); };
      throw new Error("create_response_lost");
    };
    await expect(c.submission.submit(MEMBER, request(), NOW)).rejects.toThrow("creation_read_back_unavailable");
    expect(c.executions.snapshot()[0].phase).toBe("reserved");
    expect(c.holds.events).toEqual(["reserve:res-1+res-2"]);
    expect((await c.orders.listByMember(MEMBER))[0].state).toBe("checkout_pending");
    expect(c.model.requests).toEqual([]);
  });

  it("stops at authentication with a truthful state, and the continuation completes the same order without a second payment", async () => {
    const c = composition({ requiresAction: true });
    const first = await c.submission.submit(MEMBER, request(), NOW);
    expect(first).toMatchObject({ ok: true, state: "authentication_required", idempotent: false });
    const status = await c.continuation.status(MEMBER, "req_durable_0001");
    expect(status.ok && status.continuation.authentication?.providerReference).toBe("pi_0001");
    // The customer retries the submit while still unauthenticated: same execution, same state, no new intent.
    expect(await c.submission.submit(MEMBER, request(), NOW)).toMatchObject({ ok: true, state: "authentication_required", idempotent: true });
    c.model.completeAction("pi_0001");
    const done = await c.continuation.continue(MEMBER, "req_durable_0001");
    expect(done.ok && done.continuation.state).toBe("completed");
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.captures()).toHaveLength(1);
    expect((await c.orders.listByMember(MEMBER)).filter((o) => o.state !== "cancelled")).toHaveLength(1);
  });

  it("retries with the same request continue the same execution; changed details conflict; another buyer cannot use the key", async () => {
    const c = composition();
    const first = await c.submission.submit(MEMBER, request(), NOW);
    const retry = await c.submission.submit(MEMBER, request(), NOW);
    expect(retry).toEqual({ ...first, idempotent: true });
    expect(await c.submission.submit(MEMBER, request({ shippingService: "expedited_2day" }), NOW)).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect(await c.submission.submit(MEMBER, request({ paymentMethodReference: "pm_other_card" }), NOW)).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect((await c.orders.listByMember(MEMBER))).toHaveLength(1);
    expect(c.model.creates()).toHaveLength(1);
    // The other buyer's identical key is simply a new request for them, with their own order and intent.
    const other = await c.submission.submit(OTHER, request(), NOW);
    expect(other).toMatchObject({ ok: true, idempotent: false });
    expect((await c.orders.listByMember(OTHER))).toHaveLength(1);
    expect(c.model.creates()).toHaveLength(2);
  });

  it.each([undefined, null, {}, [], true, "consent", 33999,
    { totalCents: 33_999, appliedCents: 0 },
    { policyVersion: "all-available-items-v1", totalCents: 33_999 },
    { policyVersion: "old-policy", totalCents: 33_999, appliedCents: 0 },
    { policyVersion: "all-available-items-v1", totalCents: 33_998, appliedCents: 0 },
    { policyVersion: "all-available-items-v1", totalCents: 33_999, appliedCents: 1 },
    ...["0", null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(appliedCents => ({ policyVersion: "all-available-items-v1", totalCents: 33_999, appliedCents })),
  ])("requires complete current consent for every NEW intent: %j", async checkoutConsent => {
    const c = composition();
    const result = await c.submission.submit(MEMBER, request({ checkoutConsent: checkoutConsent as never, expectedTotalCents: 33_999 }), NOW);
    expect(result).toMatchObject({ ok: false, code: "cart_revalidation_failed" });
    expect(await c.orders.listByMember(MEMBER)).toEqual([]);
    expect(c.executions.snapshot()).toEqual([]);
    expect(c.model.requests).toEqual([]);
    expect(c.holds.events).toEqual([]);
    expect(c.committed).toEqual([]);
  });

  it("refuses extra credit consumption even when cash payable stays unchanged", async () => {
    const c = composition({ cart: { ...cart, subtotalCents: 34_999, storeCreditAppliedCents: 2_000,
      lines: [cart.lines[0], { ...cart.lines[1], unitPriceCents: 14_999, lineTotalCents: 14_999 }],
    } });
    expect(await c.submission.submit(MEMBER, request(), NOW)).toMatchObject({ ok: false, code: "cart_revalidation_failed" });
    expect(c.holds.events).toEqual([]);
    expect(c.model.requests).toEqual([]);
    expect(c.executions.snapshot()).toEqual([]);
    expect(await c.orders.listByMember(MEMBER)).toEqual([]);
  });

  it.each([null, "0", -1, 1.5, 400])("refuses a contradictory legacy requested-credit field: %j", async applyStoreCreditCents => {
    const c = composition();
    expect(await c.submission.submit(MEMBER, request({ applyStoreCreditCents: applyStoreCreditCents as never }), NOW))
      .toMatchObject({ ok: false, code: "cart_revalidation_failed" });
    expect(c.holds.events).toEqual([]);
    expect(c.model.requests).toEqual([]);
  });

  it("continues an exact historical pre-consent request before fresh gates, never rewriting its body", async () => {
    const source = composition();
    await source.submission.submit(MEMBER, request(), NOW);
    const record = source.executions.snapshot()[0];
    const historical = request({ checkoutConsent: undefined });
    const c = composition({ denials: ["cart_revalidation_failed"] });
    await c.orders.save((await source.orders.get(record.orderId))!);
    // Explicit historical fixture; not a new-intent qualification shortcut.
    await c.executions.create({ ...record, requestBodySha256: requestBodySha256(historical), priceVersion: null });
    expect(await c.submission.submit(MEMBER, historical, NOW)).toMatchObject({ ok: true, state: "completed", idempotent: true, orderId: record.orderId });
    expect(await c.submission.submit(MEMBER, request(), NOW)).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect(c.holds.events).toEqual([]);
    expect(c.model.requests).toEqual([]);
    expect(c.executions.snapshot()).toHaveLength(1);
    expect(await c.orders.listByMember(MEMBER)).toHaveLength(1);
  });

  it("refuses to charge an amount the buyer did not approve", async () => {
    const c = composition();
    // The page approved a figure that this fresh revalidation does not price.
    const stale = await c.submission.submit(MEMBER, request({ expectedTotalCents: 30_000 }), NOW);
    expect(stale).toMatchObject({ ok: false, code: "cart_revalidation_failed" });
    // Nothing was held, created or charged on the refusal.
    expect(c.executions.snapshot()).toEqual([]);
    expect(c.model.requests).toHaveLength(0);
    expect(c.holds.events).toEqual([]);
    // Complete consent goes through; the legacy scalar is not needed when the tuple is present.
    expect(await c.submission.submit(MEMBER, request({ expectedTotalCents: 33_999 }), NOW)).toMatchObject({ ok: true, state: "completed" });
    expect(await c.submission.submit(MEMBER, request({ idempotencyKey: "req_durable_0002" }), NOW)).toMatchObject({ ok: true, state: "completed" });
  });

  it.each([null, "33999", "30000", true, false, {}, [], [33999], -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuses a malformed supplied consent total without side effects: %j", async expectedTotalCents => {
      const c = composition();
      const result = await c.submission.submit(MEMBER, request({ expectedTotalCents: expectedTotalCents as never }), NOW);
      expect(result).toMatchObject({ ok: false, code: "cart_revalidation_failed" });
      expect(await c.orders.listByMember(MEMBER)).toEqual([]);
      expect(c.executions.snapshot()).toEqual([]);
      expect(c.model.requests).toEqual([]);
      expect(c.holds.events).toEqual([]);
      expect(c.committed).toEqual([]);
    });

  it("denies before anything is held, created or charged", async () => {
    const denied = composition({ denials: ["agreement_required", "address_invalid"] });
    expect(await denied.submission.submit(MEMBER, request(), NOW)).toEqual({ ok: false, code: "agreement_required", codes: ["agreement_required", "address_invalid"] });
    expect(denied.holds.events).toEqual([]);
    expect(await denied.orders.listByMember(MEMBER)).toEqual([]);
    expect(denied.executions.snapshot()).toEqual([]);
    expect(denied.model.requests).toHaveLength(0);
    const noMethod = composition();
    expect(await noMethod.submission.submit(MEMBER, request({ paymentMethodReference: undefined }), NOW)).toMatchObject({ ok: false, code: "payment_method_required" });
    expect(await noMethod.submission.submit(MEMBER, request({ paymentMethodReference: "4242424242424242" }), NOW)).toMatchObject({ ok: false, code: "payment_method_required" });
    expect(await noMethod.submission.submit(MEMBER, request({ idempotencyKey: "short" }), NOW)).toMatchObject({ ok: false, code: "idempotency_conflict" });
    const fraud = composition({ fraud: true });
    expect(await fraud.submission.submit(MEMBER, request(), NOW)).toMatchObject({ ok: false, code: "large_order_review_required" });
    expect(fraud.holds.events).toEqual([]);
    const stock = composition();
    stock.holds.setRefuse(true);
    expect(await stock.submission.submit(MEMBER, request(), NOW)).toMatchObject({ ok: false, code: "insufficient_stock", reservationRefusals: ["insufficient_stock"] });
    expect(await stock.orders.listByMember(MEMBER)).toEqual([]);
  });

  it("keeps a lost provider response as reconciliation with the order pending, never as failure or success", async () => {
    const c = composition();
    c.model.faults.lostResponses = 1;
    const outcome = await c.submission.submit(MEMBER, request(), NOW);
    expect(outcome).toMatchObject({ ok: true, state: "reconciliation_required" });
    expect((await c.orders.get("00000001-0000-4000-8000-000000000000"))!.state).toBe("checkout_pending");
    expect(c.executions.snapshot()[0]!.phase).toBe("reconciliation_required");
    expect(c.model.intents.size).toBe(1);
    expect(c.committed).toEqual([]);
    expect(c.holds.events).toEqual(["reserve:res-1+res-2"]);
    // The buyer retries the identical request inside the retention window: the
    // creation key is replayed (the provider returns the ORIGINAL payment), the
    // execution completes, and there is still exactly one payment.
    const retry = await c.submission.submit(MEMBER, request(), NOW);
    expect(retry).toMatchObject({ ok: true, state: "completed", idempotent: true });
    expect(c.model.intents.size).toBe(1);
    expect(c.model.captures()).toHaveLength(1);
    expect(c.committed).toEqual(["00000001-0000-4000-8000-000000000000"]);
  });

  it("outside the retention window a retry of a lost-response execution stays parked: no replay, no second payment, no false failure", async () => {
    const c = composition();
    c.model.faults.lostResponses = 1;
    expect(await c.submission.submit(MEMBER, request(), NOW)).toMatchObject({ ok: true, state: "reconciliation_required" });
    // Later than the port's replay window: the record's first-attempt stamp is NOW.
    const later = new Date(NOW.getTime() + 21 * 60 * 60 * 1000);
    c.clock.now = later;
    const retry = await c.submission.submit(MEMBER, request(), later);
    expect(retry).toMatchObject({ ok: true, state: "reconciliation_required", idempotent: true });
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.captures()).toHaveLength(0);
    expect(c.committed).toEqual([]);
  });

  it("concurrent duplicate submissions leave one live order and one payment", async () => {
    const c = composition();
    const outcomes = await Promise.all([c.submission.submit(MEMBER, request(), NOW), c.submission.submit(MEMBER, request(), NOW), c.submission.submit(MEMBER, request(), NOW)]);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    const live = (await c.orders.listByMember(MEMBER)).filter((o) => o.state !== "cancelled");
    expect(live).toHaveLength(1);
    expect(c.executions.snapshot()).toHaveLength(1);
    // Losers that fold into the winner may replay the SAME creation key while
    // the winner is in flight; the provider answers with the original payment.
    expect(new Set(c.model.creates().map((r) => r.idempotencyKey)).size).toBe(1);
    expect(c.model.intents.size).toBe(1);
    expect(c.model.captures()).toHaveLength(1);
    const orderIds = new Set(outcomes.map((o) => (o.ok ? o.orderId : "")));
    expect(orderIds).toEqual(new Set([live[0]!.orderId]));
    // Compensated duplicates released their holds.
    const releases = c.holds.events.filter((e) => e.startsWith("release:"));
    expect(releases.length).toBe(c.holds.events.filter((e) => e.startsWith("reserve:")).length - 1);
  });

  it("answers a legacy settled order for the key without creating an execution", async () => {
    const c = composition();
    const legacy: OrderRecord = {
      orderId: "44444444-4444-4444-8444-444444444444",
      memberId: MEMBER,
      state: "payment_captured",
      lines: [],
      totals: { subtotalCents: 1, shippingCents: 0, storeCreditAppliedCents: 0, totalCents: 1 },
      providerReference: "pi_legacy",
      checkoutIdempotencyKey: "req_durable_0001",
      lastIdempotencyKey: "req_durable_0001",
      reviewTriggers: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    await c.orders.save(legacy);
    expect(await c.submission.submit(MEMBER, request(), NOW)).toEqual({ ok: true, requestKey: "req_durable_0001", orderId: legacy.orderId, state: "completed", idempotent: true });
    expect(c.executions.snapshot()).toEqual([]);
    expect(c.model.requests).toHaveLength(0);
  });

  it("binds the price identity to every priced line, the quote and the credit applied", () => {
    const a = quoteFingerprint(cart, quote, 0);
    expect(quoteFingerprint(cart, quote, 0)).toBe(a);
    expect(quoteFingerprint({ ...cart, lines: [{ ...cart.lines[0]!, unitPriceCents: 9_999 }, cart.lines[1]!] }, quote, 0)).not.toBe(a);
    expect(quoteFingerprint(cart, { ...quote, amountCents: 1_500 }, 0)).not.toBe(a);
    expect(quoteFingerprint(cart, quote, 500)).not.toBe(a);
    expect(quoteFingerprint(cart, quote, 0, "next-policy")).not.toBe(a);
  });
});

describe("durable checkout route", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });
  it("submits for the authenticated buyer only, with private no-store headers and denial codes intact", async () => {
    const c = composition({ requiresAction: true });
    const app = express();
    app.use(express.json());
    registerDurableCheckoutApi(
      app,
      {
        requireActiveMember: (req: Request, res: Response, next) => {
          const token = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
          if (token !== "token-owner") {
            res.status(401).json({ ok: false, code: "unauthorized" });
            return;
          }
          (req as Request & { researchMember?: { id: string } }).researchMember = { id: MEMBER };
          next();
        },
      },
      { submission: c.submission, now: () => NOW },
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const post = async (body: unknown, token?: string) =>
      fetch(`${origin}${DURABLE_CHECKOUT_PATH}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    expect((await post(request())).status).toBe(401);
    const ok = await post(request(), "token-owner");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(await ok.json()).toEqual({ ok: true, checkout: { requestKey: "req_durable_0001", orderId: "00000001-0000-4000-8000-000000000000", state: "authentication_required", idempotent: false } });
    const conflict = await post(request({ shippingService: "expedited_2day" }), "token-owner");
    expect(conflict.status).toBe(400);
    expect(await conflict.json()).toMatchObject({ ok: false, code: "idempotency_conflict" });
  });
});
