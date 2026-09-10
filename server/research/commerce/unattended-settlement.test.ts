// The eight properties an unattended settlement must have, each on a decisive
// fixture.
//
// This worker runs on a schedule with no customer present. It must never
// complete a purchase somebody abandoned, never bring a payment into
// existence, and never claim an outcome the provider did not state. Those are
// not comments in a scheduling loop: they are properties of one operation,
// `settleUnattended`, and every test below drives the real store, the real
// provider-verified port, the real coordinator and a model of Stripe's own API.
//
// Properties 1 to 4 are proven in checkout-recovery-sweep.test.ts, which owns
// the discovery side. This file owns the five that are only visible when
// something goes wrong: a record that moves under the worker, a provider that
// does not answer, a response that is lost, and another writer that got there
// first.
import { describe, expect, it } from "vitest";
import type { ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import { createDurableCheckoutExecutor } from "./durable-checkout-executor";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import {
  CheckoutCommitPrecondition,
  createInMemoryCheckoutExecutionStore,
  type CheckoutExecutionCreate,
} from "./persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { stripeModel } from "./stripe-model.test-helper";
import type { OrderRecord } from "./orders";

const NOW = new Date("2026-09-10T12:00:00Z");
const HOUR = 60 * 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const base: CheckoutExecutionCreate = {
  executionId: "00000000-0000-4000-8000-0000000000u1".replace("u", "d"),
  requestKey: "req_unattended_0001",
  requestBodySha256: "b".repeat(64),
  priceVersion: null,
  phase: "reserved",
  version: 1,
  providerReference: null,
  orderId: "11111111-2222-4111-8111-111111111111",
  memberId: "22222222-3333-4222-8222-222222222222",
  amountCents: 41_250,
  currency: "usd",
  paymentMethodReference: "pm_fixture_card",
  quoteFingerprint: "quote-unattended",
  authorizationKey: "xr-auth-unatt-1",
  captureKey: "xr-capture-unatt-1",
  cancelKey: "xr-cancel-unatt-1",
  reservationIds: ["res-1"],
  createdAt: ago(48 * HOUR),
  updatedAt: ago(48 * HOUR),
  authorizationAttemptedAt: null,
  settledAt: null,
};
const at = (o: Partial<CheckoutExecutionCreate>): CheckoutExecutionCreate => ({ ...base, ...o });

function harness() {
  const model = stripeModel();
  const orders = createInMemoryOrderStore();
  const released: string[] = [];
  const finalized: string[] = [];
  const executions = createInMemoryCheckoutExecutionStore({
    now: () => NOW,
    effects: {
      orders,
      inventory: {
        async release(ids) {
          released.push(...ids);
        },
        async finalize(ids) {
          finalized.push(...ids);
        },
      },
    },
  });
  const port = createProviderVerifiedPaymentPort(model.adapter, { now: () => NOW.getTime() });
  const executor = createDurableCheckoutExecutor(executions, port);

  const seedOrder = async (orderId: string) => {
    const order: OrderRecord = {
      orderId,
      memberId: base.memberId,
      state: "checkout_pending",
      lines: [],
      totals: { subtotalCents: 39_250, shippingCents: 2_000, storeCreditAppliedCents: 0, totalCents: 41_250 },
      providerReference: null,
      checkoutIdempotencyKey: base.requestKey,
      lastIdempotencyKey: base.requestKey,
      reviewTriggers: [],
      createdAt: base.createdAt,
      updatedAt: base.createdAt,
      refundedCents: 0,
      shipments: [],
    };
    await orders.save(order);
  };

  /** A record whose payment really exists at the provider, holding the money. */
  const withLiveAuthorization = async (overrides: Partial<CheckoutExecutionCreate> = {}) => {
    const record = at({ phase: "reconciliation_required", authorizationAttemptedAt: ago(47 * HOUR), ...overrides });
    const authorized = await port.authorize({ ...record, providerReference: null, authorizationAttemptedAt: null });
    if (authorized.kind !== "authorized") throw new Error(`expected an authorization, got ${authorized.kind}`);
    await seedOrder(record.orderId);
    await executions.create({ ...record, providerReference: authorized.providerReference });
    return { record, reference: authorized.providerReference };
  };

  const cancelPosts = () => model.requests.filter((r) => r.method === "POST" && r.path.endsWith("/cancel"));
  const row = () => executions.snapshot()[0]!;

  return { model, orders, executions, port, executor, released, finalized, seedOrder, withLiveAuthorization, cancelPosts, row };
}

// ---------------------------------------------------------------------------
// 5. A stale discovery snapshot never decides anything.
// ---------------------------------------------------------------------------

describe("5. the record decides, not the snapshot the worker was handed", () => {
  it("does not release locally when the row learned of an attempt after it was listed", async () => {
    const h = harness();
    const record = at({ phase: "reserved", providerReference: null, authorizationAttemptedAt: null });
    await h.seedOrder(record.orderId);
    await h.executions.create(record);

    // Between the listing and the attempt, a customer's own worker claimed the
    // authorization. That claim stamps the first-attempt time, which is exactly
    // the state a local release must not be taken on.
    const listed = (await h.executions.getForMember(record.memberId, record.requestKey))!;
    expect(listed.authorizationAttemptedAt).toBeNull();
    const claimed = (await h.executions.claim(listed.executionId, listed.version, "authorizing"))!;
    await h.executions.recordProvider(claimed.executionId, claimed.version, { kind: "unknown" });

    // The worker acts on the identity it was given, and re-reads.
    const outcome = await h.executor.settleUnattended(listed.memberId, listed.requestKey);

    expect(outcome.kind).toBe("escalated");
    expect(outcome.kind === "escalated" && outcome.reason).toContain("only a person");
    expect(h.model.requests).toHaveLength(0);
    expect(h.row()).toMatchObject({ phase: "reconciliation_required", providerReference: null, settledAt: null });
    expect((await h.orders.get(record.orderId))?.state).toBe("checkout_pending");
    expect(h.released).toEqual([]);
  });

  it("does not cancel an execution the customer finished while it was being listed", async () => {
    const h = harness();
    const record = at({ phase: "reserved", providerReference: null, authorizationAttemptedAt: null });
    await h.seedOrder(record.orderId);
    await h.executions.create(record);

    // The customer came back. Their own path authorizes, captures and commits.
    const listed = (await h.executions.getForMember(record.memberId, record.requestKey))!;
    const authClaim = (await h.executions.claim(listed.executionId, listed.version, "authorizing"))!;
    const authorized = await h.port.authorize(authClaim);
    const authed = (await h.executions.recordProvider(authClaim.executionId, authClaim.version, authorized))!;
    const capClaim = (await h.executions.claim(authed.executionId, authed.version, "capturing"))!;
    const captured = await h.port.capture(capClaim);
    const done = (await h.executions.recordProvider(capClaim.executionId, capClaim.version, captured))!;
    await h.executions.commitCaptured(done.executionId, done.version);
    const capturesByCustomer = h.model.captures().length;
    expect(capturesByCustomer).toBe(1);

    const outcome = await h.executor.settleUnattended(listed.memberId, listed.requestKey);

    // The purchase stands. The worker neither undid it nor charged again.
    expect(outcome).toEqual({ kind: "committed", orderId: record.orderId });
    expect(h.model.captures()).toHaveLength(capturesByCustomer);
    expect(h.cancelPosts()).toHaveLength(0);
    expect(h.released).toEqual([]);
    expect(h.finalized).toEqual(["res-1"]);
    expect((await h.orders.get(record.orderId))?.state).toBe("payment_captured");
  });
});

// ---------------------------------------------------------------------------
// 6. A cancellation is terminal only when the provider says so.
// ---------------------------------------------------------------------------

describe("6. an unfinished release leaves the row where nothing can capture it", () => {
  it("leaves the execution in cancelling when the release did not conclude, and never captures from there", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    // The read succeeds; the release attempt then hits a provider error.
    const flaky = {
      ...h.port,
      async inspect(r: Parameters<typeof h.port.inspect>[0]) {
        const truth = await h.port.inspect(r);
        h.model.faults.serverErrors = 1;
        return truth;
      },
    };
    const executor = createDurableCheckoutExecutor(h.executions, flaky);

    const outcome = await executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "pending", orderId: record.orderId });
    expect(h.row()).toMatchObject({ phase: "cancelling", settledAt: null });
    // The money is still held, the holds are still held, and nothing was taken.
    expect(h.model.intents.get(reference)).toMatchObject({ status: "requires_capture", amount_capturable: 41_250 });
    expect(h.model.captures()).toHaveLength(0);
    expect(h.released).toEqual([]);
    expect((await h.orders.get(record.orderId))?.state).toBe("checkout_pending");

    // A later pass finishes it, and still never captures.
    const second = await h.executor.settleUnattended(record.memberId, record.requestKey);
    expect(second).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.model.captures()).toHaveLength(0);
    expect(h.released).toEqual(["res-1"]);
  });

  it("treats an inconclusive answer as unfinished, and does not release the holds on it", async () => {
    const h = harness();
    const { record } = await h.withLiveAuthorization();
    // Both the release and the read-back that follows it fail.
    const flaky = {
      ...h.port,
      async inspect(r: Parameters<typeof h.port.inspect>[0]) {
        const truth = await h.port.inspect(r);
        h.model.faults.serverErrors = 2;
        return truth;
      },
    };
    const executor = createDurableCheckoutExecutor(h.executions, flaky);

    const outcome = await executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "pending", orderId: record.orderId });
    expect(h.row()).toMatchObject({ phase: "cancelling", settledAt: null });
    // "We do not know" is not "it was released": the holds stay held.
    expect(h.released).toEqual([]);
    expect(h.model.captures()).toHaveLength(0);
    expect((await h.orders.get(record.orderId))?.state).toBe("checkout_pending");
  });

  it("does not read a payment that has taken nothing as a payment that was released", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    // Zero received, zero capturable, and still not a terminal word.
    const intent = h.model.intents.get(reference)!;
    intent.status = "processing";
    intent.amount_capturable = 0;
    intent.amount_received = 0;

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome.kind).toBe("escalated");
    expect(outcome.kind === "escalated" && outcome.reason).toContain("not conclusive");
    expect(h.row()).toMatchObject({ phase: "reconciliation_required", settledAt: null });
    expect(h.released).toEqual([]);
    expect(h.cancelPosts()).toHaveLength(0);
    expect(h.model.captures()).toHaveLength(0);
  });

  it("does release a payment still waiting on the customer, because that word IS conclusive", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    // The same zero amounts as the case above. The status is what differs.
    const intent = h.model.intents.get(reference)!;
    intent.status = "requires_action";
    intent.amount_capturable = 0;
    intent.amount_received = 0;

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.model.intents.get(reference)!.status).toBe("canceled");
    expect(h.model.captures()).toHaveLength(0);
    expect(h.released).toEqual(["res-1"]);
  });

  it("refuses to settle a cancellation locally without positive zero-capture evidence", async () => {
    const executions = createInMemoryCheckoutExecutionStore({ now: () => NOW });
    const record = at({ phase: "reserved" });
    await executions.create(record);

    // A row driven to `cancelled` whose recorded evidence is not a cancellation.
    const claimed = (await executions.claim(record.executionId, record.version, "cancelling"))!;
    const noEvidence = (await executions.recordProvider(claimed.executionId, claimed.version, {
      kind: "cancelled",
      providerReference: null,
      capturedAmountCents: 0,
      reason: "abandoned",
    }))!;
    // Overwrite the evidence with a partial capture, which is what a confused
    // provider answer looks like.
    const partial = (await executions.recordProvider(noEvidence.executionId, noEvidence.version, {
      kind: "cancelled",
      providerReference: null,
      capturedAmountCents: 1,
      reason: "provider",
    }))!;

    await expect(executions.commitCancelled(partial.executionId, partial.version)).rejects.toThrow(CheckoutCommitPrecondition);
    await expect(executions.commitCancelled(partial.executionId, partial.version)).rejects.toThrow(/zero-capture evidence/);
  });
});

// ---------------------------------------------------------------------------
// 7. A lost response is resolved by reading, never by assuming.
// ---------------------------------------------------------------------------

describe("7. a lost response is resolved from the provider's own record", () => {
  it("finishes a cancellation whose response never came back, with one cancel request in total", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    // The model drops the response of the next write AFTER it has taken effect.
    h.model.faults.lostResponses = 1;

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.cancelPosts()).toHaveLength(1);
    expect(h.model.intents.get(reference)).toMatchObject({ status: "canceled", amount_received: 0 });
    expect(h.model.captures()).toHaveLength(0);
    expect(h.row()).toMatchObject({ phase: "cancelled" });
    expect(h.row().settledAt).not.toBeNull();
    expect((await h.orders.get(record.orderId))?.state).toBe("cancelled");
    expect(h.released).toEqual(["res-1"]);
  });

  it("refuses to guess a cancellation it could not read back, even when the guess would be right", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    // The release really happens; the worker never learns that it did.
    const blind = {
      ...h.port,
      async cancel(r: Parameters<typeof h.port.cancel>[0]): Promise<ProviderExecutionResult> {
        await h.port.cancel(r);
        return { kind: "unknown" };
      },
    };
    const executor = createDurableCheckoutExecutor(h.executions, blind);

    const outcome = await executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "pending", orderId: record.orderId });
    expect(h.row()).toMatchObject({ phase: "cancelling", settledAt: null });
    expect(h.released).toEqual([]);
    // It WAS released. The worker was right and still would not say so.
    expect(h.model.intents.get(reference)!.status).toBe("canceled");

    // The next pass reads the truth and settles, without a second release.
    const second = await h.executor.settleUnattended(record.memberId, record.requestKey);
    expect(second).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.cancelPosts()).toHaveLength(1);
    expect(h.released).toEqual(["res-1"]);
  });

  it("commits when the release attempt discovers the money was already taken", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    const captured = await h.port.capture({ ...record, providerReference: reference });
    expect(captured.kind).toBe("captured");

    // The worker's read is stale: it still believes the money is only held.
    const stale = {
      ...h.port,
      async inspect(r: Parameters<typeof h.port.inspect>[0]): Promise<ProviderExecutionResult> {
        await h.port.inspect(r);
        return {
          kind: "authorized",
          providerReference: r.providerReference!,
          amountCents: r.amountCents,
          currency: "usd",
          memberId: r.memberId,
          orderId: r.orderId,
        };
      },
    };
    const executor = createDurableCheckoutExecutor(h.executions, stale);

    const outcome = await executor.settleUnattended(record.memberId, record.requestKey);

    // The release was refused because the payment had succeeded, the read-back
    // said so, and the records caught up with the money.
    expect(outcome).toEqual({ kind: "committed", orderId: record.orderId });
    expect(h.cancelPosts()).toHaveLength(1);
    expect(h.model.captures()).toHaveLength(1);
    expect(h.row()).toMatchObject({ phase: "committed" });
    expect((await h.orders.get(record.orderId))?.state).toBe("payment_captured");
    expect(h.finalized).toEqual(["res-1"]);
    expect(h.released).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. A lost compare-and-swap defers a record. It does not undo an effect.
// ---------------------------------------------------------------------------

describe("8. losing a race defers the bookkeeping, it never retracts what was sent", () => {
  it("reports contention after a release that really happened, and leaves the release standing", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    // Another writer touches the row while the release is in flight.
    const racing = {
      ...h.port,
      async cancel(r: Parameters<typeof h.port.cancel>[0]) {
        const proof = await h.port.cancel(r);
        await h.executions.claim(r.executionId, r.version, "cancelling");
        return proof;
      },
    };
    const executor = createDurableCheckoutExecutor(h.executions, racing);

    const outcome = await executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "contended", orderId: record.orderId });
    // The external effect stands. No compare-and-swap could have taken it back.
    expect(h.model.intents.get(reference)).toMatchObject({ status: "canceled", amount_received: 0 });
    // And nothing local was faked on the strength of a write that did not land.
    expect(h.row()).toMatchObject({ phase: "cancelling", settledAt: null });
    expect((await h.orders.get(record.orderId))?.state).toBe("checkout_pending");
    expect(h.released).toEqual([]);

    // A later pass reads the provider and settles, releasing nothing twice.
    const second = await h.executor.settleUnattended(record.memberId, record.requestKey);
    expect(second).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.cancelPosts()).toHaveLength(1);
    expect(h.released).toEqual(["res-1"]);
  });

  it("reports contention after reading a capture, and does not un-take the money", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();
    await h.port.capture({ ...record, providerReference: reference });
    const racing = {
      ...h.port,
      async inspect(r: Parameters<typeof h.port.inspect>[0]) {
        const truth = await h.port.inspect(r);
        await h.executions.claim(r.executionId, r.version, "cancelling");
        return truth;
      },
    };
    const executor = createDurableCheckoutExecutor(h.executions, racing);

    const outcome = await executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "contended", orderId: record.orderId });
    expect(h.model.captures()).toHaveLength(1);
    const order = await h.orders.get(record.orderId);
    expect(order?.state).not.toBe("payment_captured");
    expect(order?.state).not.toBe("cancelled");
    expect(h.finalized).toEqual([]);
    expect(h.released).toEqual([]);

    // The deferral was only that. The next pass records the money that was taken.
    const second = await h.executor.settleUnattended(record.memberId, record.requestKey);
    expect(second).toEqual({ kind: "committed", orderId: record.orderId });
    expect(h.model.captures()).toHaveLength(1);
    expect(h.finalized).toEqual(["res-1"]);
    expect((await h.orders.get(record.orderId))?.state).toBe("payment_captured");
  });
});

// ---------------------------------------------------------------------------
// The port-level guarantee the whole policy rests on.
// ---------------------------------------------------------------------------

describe("the read the unattended worker is limited to cannot create a payment", () => {
  it("refuses a record that names no payment, rather than falling back to the creation key", async () => {
    const h = harness();
    const record = at({ providerReference: null, authorizationAttemptedAt: ago(47 * HOUR) });

    const result = await h.port.inspect(record);

    expect(result).toEqual({ kind: "refused", definitiveNoEffect: true });
    expect(h.model.requests).toHaveLength(0);
    expect(h.model.creates()).toHaveLength(0);
  });

  it("reads back the payment a record does name, and reports the provider's word", async () => {
    const h = harness();
    const { record, reference } = await h.withLiveAuthorization();

    const result = await h.port.inspect({ ...record, providerReference: reference });

    expect(result).toMatchObject({ kind: "authorized", providerReference: reference, amountCents: record.amountCents });
    // One read. No creation, ever.
    expect(h.model.creates()).toHaveLength(1);
    expect(h.model.requests.filter((r) => r.method === "GET")).toHaveLength(1);
  });
});
