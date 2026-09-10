import express, { type Request, type Response } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { createCheckoutContinuationService, registerCheckoutContinuationApi, CHECKOUT_CONTINUATION_PATHS } from "./checkout-continuation";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore } from "./durable-checkout-executor";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import { stripeModel } from "./stripe-model.test-helper";

const record: CheckoutExecutionRecord = {
  executionId: "exe-1",
  requestKey: "req_continuation_0001",
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
const OTHER_MEMBER = "33333333-3333-4333-8333-333333333333";

/** Version-CAS execution store double. Test only. */
function executionStore(initial: CheckoutExecutionRecord) {
  let current = structuredClone(initial);
  const cas = (expected: number, next: Partial<CheckoutExecutionRecord>) => {
    if (current.version !== expected) return null;
    current = { ...current, ...next, version: expected + 1 };
    return structuredClone(current);
  };
  const store: CanonicalCheckoutExecutionStore = {
    authority: "canonical_checkout_transaction_v1",
    getForMember: async (memberId, requestKey) => (current.memberId === memberId && current.requestKey === requestKey ? structuredClone(current) : null),
    // Mirrors the SQL claim: the first authorizing claim stamps the attempt with
    // the database clock. A fixed past stamp would put the record outside the
    // port's creation-key retention window and make every replay uncertain.
    claim: async (_id, expected, phase) => cas(expected, { phase, authorizationAttemptedAt: phase === "authorizing" ? (current.authorizationAttemptedAt ?? new Date().toISOString()) : current.authorizationAttemptedAt }),
    recordProvider: async (_id, expected, result) =>
      cas(expected, {
        phase: result.kind === "unknown" || result.kind === "refused" ? "reconciliation_required" : result.kind,
        providerReference: "providerReference" in result ? result.providerReference : current.providerReference,
        lastProviderResult: result,
      }),
    commitCaptured: async (_id, expected) => cas(expected, { phase: "committed" }),
    commitCancelled: async (_id, expected) => cas(expected, { phase: "cancelled", settledAt: "2026-09-09T00:00:02Z" }),
  };
  return { store, snapshot: () => structuredClone(current) };
}

function composition(options: { requiresAction?: boolean } = {}) {
  const model = stripeModel({ requiresAction: options.requiresAction ?? true });
  const { store, snapshot } = executionStore(record);
  const port = createProviderVerifiedPaymentPort(model.adapter);
  const executor = createDurableCheckoutExecutor(store, port);
  const service = createCheckoutContinuationService({ store, provider: model.adapter, executor });
  return { model, store, snapshot, executor, service };
}

describe("checkout continuation service", () => {
  it("stops at authentication with the provider's client secret, and only for the owner", async () => {
    const c = composition();
    expect((await c.executor.run(record.memberId, record.requestKey)).kind).toBe("action_required");
    const status = await c.service.status(record.memberId, record.requestKey);
    expect(status).toEqual({
      ok: true,
      continuation: {
        requestKey: record.requestKey,
        orderId: record.orderId,
        state: "authentication_required",
        amountCents: 33_999,
        currency: "usd",
        authentication: { providerReference: "pi_0001", clientSecret: "pi_0001_secret_fixture" },
      },
    });
    expect(await c.service.status(OTHER_MEMBER, record.requestKey)).toEqual({ ok: false, code: "not_found" });
    expect(await c.service.continue(OTHER_MEMBER, record.requestKey)).toEqual({ ok: false, code: "not_found" });
    expect(c.model.creates()).toHaveLength(1);
  });

  it("continue while the customer has not finished changes nothing and never creates a second payment", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    const before = c.snapshot();
    const result = await c.service.continue(record.memberId, record.requestKey);
    expect(result.ok && result.continuation.state).toBe("authentication_required");
    expect(result.ok && result.continuation.authentication?.clientSecret).toBe("pi_0001_secret_fixture");
    expect(c.snapshot()).toEqual(before);
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.captures()).toHaveLength(0);
  });

  it("after the customer completes authentication, continue reconciles the provider truth and completes the order", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    c.model.completeAction("pi_0001");
    const result = await c.service.continue(record.memberId, record.requestKey);
    expect(result).toEqual({ ok: true, continuation: { requestKey: record.requestKey, orderId: record.orderId, state: "completed", amountCents: 33_999, currency: "usd" } });
    expect(c.snapshot().phase).toBe("committed");
    expect(c.model.creates()).toHaveLength(1);
    expect(c.model.captures()).toHaveLength(1);
    // The secret is never offered again after completion.
    const status = await c.service.status(record.memberId, record.requestKey);
    expect(status.ok && status.continuation).toEqual({ requestKey: record.requestKey, orderId: record.orderId, state: "completed", amountCents: 33_999, currency: "usd" });
  });

  it("a redirect-style claim of success is not trusted: an abandoned or failed authentication stays pending", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    // The customer "returns" but the provider still says requires_action.
    for (let i = 0; i < 3; i++) {
      const result = await c.service.continue(record.memberId, record.requestKey);
      expect(result.ok && result.continuation.state).toBe("authentication_required");
    }
    expect(c.snapshot().phase).toBe("action_required");
    expect(c.model.captures()).toHaveLength(0);
  });

  it("a cancelled payment reports cancelled and offers no secret", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    c.model.intents.get("pi_0001")!.status = "canceled";
    const status = await c.service.status(record.memberId, record.requestKey);
    expect(status.ok && status.continuation).toMatchObject({ state: "cancelled" });
    expect(status.ok && status.continuation.authentication).toBeUndefined();
  });

  it("provider evidence that names another buyer's money is reported as needing reconciliation, never authenticated", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    c.model.intents.get("pi_0001")!.metadata.memberId = OTHER_MEMBER;
    const status = await c.service.status(record.memberId, record.requestKey);
    expect(status.ok && status.continuation).toMatchObject({ state: "reconciliation_required" });
    expect(status.ok && status.continuation.authentication).toBeUndefined();
    const result = await c.service.continue(record.memberId, record.requestKey);
    expect(result.ok && result.continuation.state).toBe("reconciliation_required");
    expect(c.snapshot().phase).toBe("action_required");
  });

  it("concurrent continues after completion advance the execution once", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    c.model.completeAction("pi_0001");
    const results = await Promise.all([c.service.continue(record.memberId, record.requestKey), c.service.continue(record.memberId, record.requestKey)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(c.snapshot().phase).toBe("committed");
    expect(c.model.captures()).toHaveLength(1);
    const final = await c.service.status(record.memberId, record.requestKey);
    expect(final.ok && final.continuation.state).toBe("completed");
  });

  it("cancel releases an authentication-pending payment at the provider and settles locally; the answer is cancelled with no secret", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    expect(c.snapshot().phase).toBe("action_required");
    const result = await c.service.cancel(record.memberId, record.requestKey);
    expect(result).toEqual({ ok: true, continuation: { requestKey: record.requestKey, orderId: record.orderId, state: "cancelled", amountCents: 33_999, currency: "usd", cancellation: { reason: "customer" } } });
    expect(c.model.intents.get("pi_0001")!.status).toBe("canceled");
    expect(c.snapshot().phase).toBe("cancelled");
    expect(c.model.captures()).toHaveLength(0);
    expect(await c.service.cancel(OTHER_MEMBER, record.requestKey)).toEqual({ ok: false, code: "not_found" });
    // A second cancel is a no-op answer, not a second provider effect.
    const again = await c.service.cancel(record.memberId, record.requestKey);
    expect(again.ok && again.continuation.state).toBe("cancelled");
  });

  it("cancel cannot undo a payment the provider already captured: the order completes instead", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    c.model.completeAction("pi_0001");
    // The customer finished with the bank and the provider captured on its side before the execution learned it.
    const intent = c.model.intents.get("pi_0001")!;
    intent.status = "succeeded";
    intent.amount_received = intent.amount;
    intent.amount_capturable = 0;
    const result = await c.service.cancel(record.memberId, record.requestKey);
    expect(result.ok && result.continuation.state).toBe("completed");
    expect(c.snapshot().phase).toBe("committed");
  });

  it("cancel of an execution whose creation response was lost learns the payment first and cancels THAT payment", async () => {
    const c = composition({ requiresAction: false });
    // The creation reached the provider but the response never came back.
    c.model.faults.lostResponses = 1;
    expect((await c.executor.run(record.memberId, record.requestKey)).kind).toBe("reconciliation_required");
    expect(c.snapshot().providerReference).toBeNull();
    expect(c.model.creates()).toHaveLength(1);
    const result = await c.service.cancel(record.memberId, record.requestKey);
    expect(result.ok && result.continuation.state).toBe("cancelled");
    expect(c.model.intents.get("pi_0001")!.status).toBe("canceled");
    expect(c.snapshot()).toMatchObject({ phase: "cancelled", providerReference: "pi_0001" });
    // The creation key was replayed to learn the payment; the provider answered with the ORIGINAL intent.
    expect(c.model.intents.size).toBe(1);
    expect(c.model.captures()).toHaveLength(0);
  });

  it("check-status on a parked execution performs one bounded reconciliation: a captured payment whose commit was interrupted completes", async () => {
    const c = composition({ requiresAction: false });
    c.model.faults.lostResponses = 1;
    expect((await c.executor.run(record.memberId, record.requestKey)).kind).toBe("reconciliation_required");
    expect((await c.service.status(record.memberId, record.requestKey)).ok && (await c.service.status(record.memberId, record.requestKey))).toMatchObject({ continuation: { state: "reconciliation_required" } });
    const result = await c.service.continue(record.memberId, record.requestKey);
    expect(result.ok && result.continuation.state).toBe("completed");
    expect(c.model.intents.size).toBe(1);
    expect(c.model.captures()).toHaveLength(1);
  });

  it("a declined card ends the attempt: the intent is released at the provider and the buyer is told declined, nothing charged", async () => {
    const model = stripeModel({ requiresAction: false });
    const { store, snapshot } = executionStore({ ...record, paymentMethodReference: "pm_card_chargeDeclined" });
    const port = createProviderVerifiedPaymentPort(model.adapter);
    const executor = createDurableCheckoutExecutor(store, port);
    const service = createCheckoutContinuationService({ store, provider: model.adapter, executor });
    expect((await executor.run(record.memberId, record.requestKey)).kind).toBe("cancelled");
    expect(model.intents.get("pi_0001")).toMatchObject({ status: "canceled", amount_received: 0 });
    expect(snapshot()).toMatchObject({ phase: "cancelled", providerReference: "pi_0001", lastProviderResult: { kind: "cancelled", reason: "declined" } });
    const status = await service.status(record.memberId, record.requestKey);
    expect(status).toEqual({ ok: true, continuation: { requestKey: record.requestKey, orderId: record.orderId, state: "cancelled", amountCents: 33_999, currency: "usd", cancellation: { reason: "declined" } } });
    // A customer cancel carries its own reason.
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    const cancelled = await c.service.cancel(record.memberId, record.requestKey);
    expect(cancelled.ok && cancelled.continuation.cancellation).toEqual({ reason: "customer" });
  });

  it("reports the plain phases for executions that never needed authentication", async () => {
    const c = composition({ requiresAction: false });
    expect((await c.service.status(record.memberId, record.requestKey)).ok && (await c.service.status(record.memberId, record.requestKey))).toMatchObject({ continuation: { state: "pending" } });
    expect((await c.executor.run(record.memberId, record.requestKey)).kind).toBe("committed");
    const status = await c.service.status(record.memberId, record.requestKey);
    expect(status.ok && status.continuation.state).toBe("completed");
  });
});

describe("checkout continuation routes", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function serve(service: ReturnType<typeof createCheckoutContinuationService>) {
    const app = express();
    // The canonical active-member guard is injected; this double resolves the subject from a bearer token only.
    const members: Record<string, string> = { "token-owner": record.memberId, "token-other": OTHER_MEMBER };
    registerCheckoutContinuationApi(
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
      { service },
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const call = async (method: "GET" | "POST", path: string, token?: string) => {
      const response = await fetch(`${origin}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
      return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
    };
    return { call };
  }

  it("answers only the authenticated owner, with private no-store headers and no secret outside authentication", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    const { call } = await serve(c.service);
    const path = CHECKOUT_CONTINUATION_PATHS.status.replace(":requestKey", record.requestKey);
    const owner = await call("GET", path, "token-owner");
    expect(owner.status).toBe(200);
    expect(owner.headers.get("cache-control")).toBe("private, no-store");
    expect(owner.body).toMatchObject({ ok: true, continuation: { state: "authentication_required", authentication: { providerReference: "pi_0001" } } });
    expect(await call("GET", path, "token-other")).toMatchObject({ status: 404, body: { ok: false, code: "not_found" } });
    expect((await call("GET", path)).status).toBe(401);
    expect((await call("GET", CHECKOUT_CONTINUATION_PATHS.status.replace(":requestKey", "bad%20key"), "token-owner")).status).toBe(400);

    c.model.completeAction("pi_0001");
    const continued = await call("POST", CHECKOUT_CONTINUATION_PATHS.continue.replace(":requestKey", record.requestKey), "token-owner");
    expect(continued.status).toBe(200);
    expect(continued.body).toEqual({ ok: true, continuation: { requestKey: record.requestKey, orderId: record.orderId, state: "completed", amountCents: 33_999, currency: "usd" } });
    expect(JSON.stringify(continued.body)).not.toContain("secret");
  });

  it("cancel is a door for the owner only, with the same headers", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    const { call } = await serve(c.service);
    const path = CHECKOUT_CONTINUATION_PATHS.cancel.replace(":requestKey", record.requestKey);
    expect(await call("POST", path, "token-other")).toMatchObject({ status: 404, body: { ok: false, code: "not_found" } });
    expect((await call("POST", path)).status).toBe(401);
    expect(c.snapshot().phase).toBe("action_required");
    const cancelled = await call("POST", path, "token-owner");
    expect(cancelled.status).toBe(200);
    expect(cancelled.headers.get("cache-control")).toBe("private, no-store");
    expect(cancelled.body).toEqual({ ok: true, continuation: { requestKey: record.requestKey, orderId: record.orderId, state: "cancelled", amountCents: 33_999, currency: "usd", cancellation: { reason: "customer" } } });
    expect(c.snapshot().phase).toBe("cancelled");
  });

  it("never echoes a provider or store failure", async () => {
    const c = composition();
    await c.executor.run(record.memberId, record.requestKey);
    const broken = createCheckoutContinuationService({
      store: { ...c.store, getForMember: async () => { throw new Error("pi_0001_secret_fixture leaked in an error"); } },
      provider: c.model.adapter,
      executor: c.executor,
    });
    const { call } = await serve(broken);
    const result = await call("GET", CHECKOUT_CONTINUATION_PATHS.status.replace(":requestKey", record.requestKey), "token-owner");
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("secret_fixture");
  });
});
