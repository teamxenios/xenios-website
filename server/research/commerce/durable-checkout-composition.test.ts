// The composed durable purchasing surface, exercised over HTTP the way the
// checkout page uses it. Provider: the REAL StripePaymentAdapter over the
// in-test Stripe idempotency model (scripted transport, deliberate faults).
// Stores: the in-memory references with the SQL commit's order/hold effects,
// allowed only under NODE_ENV=test. This is local qualification; it does not
// establish the SQL or the real provider.
import express, { type Request, type Response } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";
import { DisabledPaymentProvider } from "../providers/payment";
import type { ReservationSeam } from "./checkout";
import { composeDurableCheckout, registerDurableCheckoutSurface, resolveDurableCheckoutStores, DURABLE_CHECKOUT_SURFACE_PATHS } from "./durable-checkout-composition";
import type { OrderRecord } from "./orders";
import { createInMemoryCheckoutExecutionStore } from "./persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { stripeModel } from "./stripe-model.test-helper";
import { createInMemoryWebhookExecutionInbox } from "./webhook-execution-processor";

const MEMBER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-09-09T12:00:00Z");
const cart: CartDto = {
  lines: [{ sku: "SKU-A", displayName: "Fixture A", quantity: 2, purchaseMode: "one_time", unitPriceCents: 10_000, lineTotalCents: 20_000, blockedReason: null }],
  shipmentGroups: [{ owner: "xenios", skus: ["SKU-A"] }],
  subtotalCents: 20_000,
  shippingCents: 1_000,
  storeCreditAppliedCents: 0,
  estimatedTotalCents: 21_000,
  checkoutReady: true,
  blockingReasons: [],
  requiredAgreements: ["research-use"],
};
const quote = { kind: "configured_standard", service: "standard", amountCents: 1_000, estimatedDeliveryRange: null, disclosure: "fixture" } as ShippingQuote;
const request = (overrides: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  shippingAddress: { line1: "1 Fixture St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
  shippingService: "standard",
  acceptedAgreementKeys: ["research-use"],
  researchAttestation: true,
  idempotencyKey: "req_composed_0001",
  paymentMethodReference: "pm_fixture_card",
  ...overrides,
});

function holds() {
  const events: string[] = [];
  let n = 0;
  const seam: ReservationSeam = {
    async reserve(_m, lines) {
      const ids = lines.map(() => `res-${++n}`);
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
  return { seam, events };
}

function build(options: { requiresAction?: boolean; env?: NodeJS.ProcessEnv; allowInMemoryStores?: boolean; provider?: "stripe" | "disabled" } = {}) {
  const model = stripeModel({ requiresAction: options.requiresAction ?? false });
  const orders = createInMemoryOrderStore();
  const inventory = holds();
  const executions = createInMemoryCheckoutExecutionStore({ now: () => NOW, effects: { orders, inventory: inventory.seam } });
  const committed: string[] = [];
  let ids = 0;
  const composition = composeDurableCheckout({
    env: options.env ?? { NODE_ENV: "test", STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_test_fake_unit_test_only" },
    provider: options.provider === "disabled" ? new DisabledPaymentProvider() : model.adapter,
    checkout: { evaluate: async () => ({ denials: [], cart, quote }) },
    orders,
    executions: { store: executions, durable: false },
    webhookInbox: { store: createInMemoryWebhookExecutionInbox(), durable: false },
    inventory: inventory.seam,
    onCommitted: (order: OrderRecord) => {
      committed.push(order.orderId);
    },
    now: () => NOW,
    newId: () => `${String(++ids).padStart(8, "0")}-0000-4000-8000-000000000000`,
    allowInMemoryStores: options.allowInMemoryStores ?? true,
  });
  return { model, orders, executions, inventory, committed, composition };
}

describe("durable checkout composition readiness", () => {
  it("is not ready with the production Disabled provider, and the client configuration says payment_disabled", () => {
    const { composition } = build({ provider: "disabled" });
    expect(composition).toMatchObject({ ready: false, reason: "provider_not_durable" });
    expect(composition.clientConfig()).toEqual({ ok: false, code: "payment_disabled" });
  });
  it("never runs the money path over in-memory stores outside NODE_ENV=test, even when asked", () => {
    for (const NODE_ENV of ["production", "development", undefined]) {
      const { composition } = build({ env: { NODE_ENV, STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_test_fake" }, allowInMemoryStores: true });
      expect(composition).toMatchObject({ ready: false, reason: "execution_store_not_durable" });
    }
    const { composition } = build({ allowInMemoryStores: false });
    expect(composition).toMatchObject({ ready: false, reason: "execution_store_not_durable" });
  });
  it("resolves in-memory references only when the managed database is not configured, and labels them not durable", () => {
    const local = resolveDurableCheckoutStores(() => false, () => NOW);
    expect(local.executions.durable).toBe(false);
    expect(local.webhookInbox.durable).toBe(false);
  });
  it("is ready for a durable provider under the test allowance and answers the browser configuration", () => {
    const { composition } = build();
    expect(composition.ready).toBe(true);
    expect(composition.clientConfig()).toEqual({ ok: true, config: { provider: "stripe", publishableKey: "pk_test_abcdefgh12345678", mode: "test" } });
  });
});

describe("durable checkout surface over HTTP", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function serve(composition: ReturnType<typeof build>["composition"]) {
    const app = express();
    app.use(express.json());
    const members: Record<string, string> = { "token-owner": MEMBER, "token-other": OTHER };
    registerDurableCheckoutSurface(
      app,
      {
        requireActiveMember: (req: Request, res: Response, next) => {
          const token = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
          const memberId = members[token];
          if (!memberId) {
            res.status(401).json({ ok: false, code: "unauthorized" });
            return;
          }
          (req as Request & { researchMember?: { id: string } }).researchMember = { id: memberId };
          next();
        },
      },
      composition,
      { now: () => NOW },
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    return async (method: "GET" | "POST", path: string, token?: string, body?: unknown) => {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, body: JSON.parse(text) as Record<string, unknown> };
    };
  }
  const at = (path: string, key = "req_composed_0001") => path.replace(":requestKey", key);

  it("mounts every door as a precise refusal while the composition is not ready", async () => {
    const { composition, executions, model } = build({ provider: "disabled" });
    const call = await serve(composition);
    expect(await call("GET", DURABLE_CHECKOUT_SURFACE_PATHS.config, "token-owner")).toMatchObject({ status: 503, body: { ok: false, code: "payment_disabled" } });
    expect(await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request())).toMatchObject({ status: 503, body: { ok: false, code: "capability_disabled" } });
    expect(await call("GET", at(DURABLE_CHECKOUT_SURFACE_PATHS.status), "token-owner")).toMatchObject({ status: 503, body: { ok: false, code: "capability_disabled" } });
    expect(await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.continue), "token-owner")).toMatchObject({ status: 503 });
    expect(await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.cancel), "token-owner")).toMatchObject({ status: 503 });
    expect((await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, undefined, request())).status).toBe(401);
    expect(executions.snapshot()).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  it("carries one buyer from configuration through authentication to a committed order visible in the order record, with downstream fired once", async () => {
    const c = build({ requiresAction: true });
    const call = await serve(c.composition);
    const config = await call("GET", DURABLE_CHECKOUT_SURFACE_PATHS.config, "token-owner");
    expect(config.body).toEqual({ ok: true, config: { provider: "stripe", publishableKey: "pk_test_abcdefgh12345678", mode: "test" } });

    const submitted = await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request());
    expect(submitted.status).toBe(200);
    expect(submitted.body).toEqual({ ok: true, checkout: { requestKey: "req_composed_0001", orderId: "00000001-0000-4000-8000-000000000000", state: "authentication_required", idempotent: false } });
    expect((await c.orders.get("00000001-0000-4000-8000-000000000000"))?.state).toBe("checkout_pending");

    // The identical retry (a timeout, a refresh) continues the SAME execution: no second payment, no second order.
    const retried = await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request());
    expect(retried.body).toMatchObject({ ok: true, checkout: { orderId: "00000001-0000-4000-8000-000000000000", state: "authentication_required", idempotent: true } });
    expect(c.model.creates()).toHaveLength(1);
    // Changed details under the same key conflict instead of reusing the intent.
    expect(await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request({ paymentMethodReference: "pm_other_card" }))).toMatchObject({ status: 400, body: { ok: false, code: "idempotency_conflict" } });

    const status = await call("GET", at(DURABLE_CHECKOUT_SURFACE_PATHS.status), "token-owner");
    expect(status.body).toMatchObject({ ok: true, continuation: { state: "authentication_required", amountCents: 21_000, authentication: { providerReference: "pi_0001" } } });
    expect(status.headers.get("cache-control")).toBe("private, no-store");
    // Another account cannot read, continue or cancel it.
    expect((await call("GET", at(DURABLE_CHECKOUT_SURFACE_PATHS.status), "token-other")).status).toBe(404);
    expect((await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.cancel), "token-other")).status).toBe(404);

    // The customer "returns" before finishing: nothing moves.
    expect((await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.continue), "token-owner")).body).toMatchObject({ continuation: { state: "authentication_required" } });
    c.model.completeAction("pi_0001");
    const done = await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.continue), "token-owner");
    expect(done.body).toEqual({ ok: true, continuation: { requestKey: "req_composed_0001", orderId: "00000001-0000-4000-8000-000000000000", state: "completed", amountCents: 21_000, currency: "usd" } });
    expect(done.text).not.toContain("secret");

    const order = await c.orders.get("00000001-0000-4000-8000-000000000000");
    expect(order).toMatchObject({ state: "payment_captured", providerReference: "pi_0001", capturedAmountCents: 21_000 });
    expect(c.inventory.events).toEqual(["reserve:res-1", "finalize:res-1"]);
    expect(c.model.captures()).toHaveLength(1);
    // Downstream ran once, and neither a repeated continue nor a repeated submit fires it again.
    await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.continue), "token-owner");
    expect((await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request())).body).toMatchObject({ checkout: { state: "completed", idempotent: true } });
    expect(c.committed).toEqual(["00000001-0000-4000-8000-000000000000"]);
  });

  it("a declined card is a definitive, truthful outcome: cancelled with reason declined, intent released, order cancelled, hold released, nothing charged; a retry says the same", async () => {
    const c = build();
    const call = await serve(c.composition);
    const declined = await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request({ paymentMethodReference: "pm_card_chargeDeclined" }));
    expect(declined.status).toBe(200);
    expect(declined.body).toEqual({ ok: true, checkout: { requestKey: "req_composed_0001", orderId: "00000001-0000-4000-8000-000000000000", state: "cancelled", idempotent: false, cancellation: { reason: "declined" } } });
    expect(c.model.intents.get("pi_0001")).toMatchObject({ status: "canceled", amount_received: 0 });
    expect((await c.orders.get("00000001-0000-4000-8000-000000000000"))?.state).toBe("cancelled");
    expect(c.inventory.events).toEqual(["reserve:res-1", "release:res-1"]);
    expect(c.committed).toEqual([]);
    // The identical retry replays the creation key, meets the same decline, and reports the same settled truth without a second intent.
    const again = await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request({ paymentMethodReference: "pm_card_chargeDeclined" }));
    expect(again.body).toMatchObject({ ok: true, checkout: { state: "cancelled", idempotent: true, cancellation: { reason: "declined" } } });
    expect(c.model.intents.size).toBe(1);
    expect(c.inventory.events).toEqual(["reserve:res-1", "release:res-1"]);
    const status = await call("GET", at(DURABLE_CHECKOUT_SURFACE_PATHS.status), "token-owner");
    expect(status.body).toMatchObject({ continuation: { state: "cancelled", cancellation: { reason: "declined" } } });
    expect(status.text).not.toContain("secret");
  });

  it("cancels an unpaid checkout: the provider authorization is released, the order is cancelled and the hold settles once", async () => {
    const c = build({ requiresAction: true });
    const call = await serve(c.composition);
    await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request());
    const cancelled = await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.cancel), "token-owner");
    expect(cancelled.body).toEqual({ ok: true, continuation: { requestKey: "req_composed_0001", orderId: "00000001-0000-4000-8000-000000000000", state: "cancelled", amountCents: 21_000, currency: "usd", cancellation: { reason: "customer" } } });
    expect(c.model.intents.get("pi_0001")?.status).toBe("canceled");
    expect((await c.orders.get("00000001-0000-4000-8000-000000000000"))?.state).toBe("cancelled");
    expect(c.inventory.events).toEqual(["reserve:res-1", "release:res-1"]);
    // Settled once: another cancel or status read changes nothing.
    await call("POST", at(DURABLE_CHECKOUT_SURFACE_PATHS.cancel), "token-owner");
    expect(c.inventory.events).toEqual(["reserve:res-1", "release:res-1"]);
    expect(c.committed).toEqual([]);
    expect(c.model.captures()).toHaveLength(0);
  });

  it("keeps a captured payment whose local commit failed as reconciliation_required with the evidence intact, then completes it on a later continue", async () => {
    const c = build();
    const call = await serve(c.composition);
    // The local commit fails AFTER the provider captured: the order repository refuses the write once.
    const save = c.orders.save.bind(c.orders);
    let failures = 1;
    c.orders.save = async (order: OrderRecord) => {
      if (failures > 0 && order.state === "payment_captured") {
        failures -= 1;
        throw new Error("simulated database failure after capture");
      }
      return save(order);
    };
    const submitted = await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request());
    expect(submitted.status).toBe(200);
    expect(submitted.body).toMatchObject({ ok: true, checkout: { state: "reconciliation_required" } });
    expect(c.model.captures()).toHaveLength(1);
    expect(c.executions.snapshot()[0]).toMatchObject({ phase: "reconciliation_required", providerReference: "pi_0001" });
    expect((await c.orders.get("00000001-0000-4000-8000-000000000000"))?.state).toBe("checkout_pending");
    expect(c.committed).toEqual([]);
    // Recovery: the same key, the same request; the provider is read back (captured) and the local commit succeeds this time.
    const recovered = await call("POST", DURABLE_CHECKOUT_SURFACE_PATHS.submit, "token-owner", request());
    expect(recovered.body).toMatchObject({ ok: true, checkout: { state: "completed", idempotent: true } });
    // Money truth: one payment, captured exactly once for the order's amount (a repeated capture request is refused and read back).
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.intents.get("pi_0001")).toMatchObject({ status: "succeeded", amount_received: 21_000 });
    expect((await c.orders.get("00000001-0000-4000-8000-000000000000"))?.state).toBe("payment_captured");
    expect(c.committed).toEqual(["00000001-0000-4000-8000-000000000000"]);
  });
});
