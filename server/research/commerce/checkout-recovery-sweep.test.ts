// What the unattended recovery pass is allowed to do, stated decisively.
//
// These tests exist because of one rule: a worker running on a schedule, with
// no customer present, must never complete a purchase the customer abandoned,
// and must never bring a payment into existence. An assertion that accepts
// "either cancelled or committed" proves neither, so every outcome below is
// asserted exactly, against the real store, the real port, the real
// coordinator, and a model of the provider's own API.
import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { createCheckoutRecoverySweep, shouldAttempt, DEFAULT_GRACE_MS } from "./checkout-recovery-sweep";
import { createDurableCheckoutExecutor } from "./durable-checkout-executor";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import {
  createInMemoryCheckoutExecutionStore,
  microsSinceEpoch,
  type CheckoutExecutionCreate,
} from "./persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { stripeModel } from "./stripe-model.test-helper";
import type { OrderRecord } from "./orders";
import type { OrderState } from "@shared/research/commerce";

const NOW = new Date("2026-09-10T12:00:00Z");
/** The pass runs long after the store last stamped a row, so every grace window has elapsed. */
const SWEEP_NOW = new Date(NOW.getTime() + 8 * 60 * 60_000);
const HOUR = 60 * 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const base: CheckoutExecutionCreate = {
  executionId: "00000000-0000-4000-8000-0000000000e1",
  requestKey: "req_sweep_0001",
  requestBodySha256: "a".repeat(64),
  priceVersion: null,
  phase: "reserved",
  version: 1,
  providerReference: null,
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 33_999,
  currency: "usd",
  paymentMethodReference: "pm_fixture_card",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-0001",
  captureKey: "xr-capture-0001",
  cancelKey: "xr-cancel-0001",
  reservationIds: ["res-1"],
  createdAt: ago(48 * HOUR),
  updatedAt: ago(48 * HOUR),
  authorizationAttemptedAt: null,
  settledAt: null,
};
const at = (overrides: Partial<CheckoutExecutionCreate>): CheckoutExecutionCreate => ({ ...base, ...overrides });

describe("when the pass will try a row, and when it leaves it alone", () => {
  it("leaves settled work and anything still inside its grace window", () => {
    expect(shouldAttempt(at({ phase: "committed" }), NOW)).toMatchObject({ attempt: false });
    expect(shouldAttempt(at({ phase: "cancelled", settledAt: ago(60_000) }), NOW)).toMatchObject({ attempt: false });
    // A customer part-way through a bank challenge is not stuck.
    const midChallenge = shouldAttempt(at({ phase: "action_required", updatedAt: ago(60_000) }), NOW);
    expect(midChallenge).toMatchObject({ attempt: false });
    expect(midChallenge.attempt === false && midChallenge.reason).toContain("grace period");
    expect(DEFAULT_GRACE_MS.action_required).toBeGreaterThan(DEFAULT_GRACE_MS.authorizing);
  });

  it("tries a row whose own phase window has elapsed", () => {
    expect(shouldAttempt(at({ phase: "authorizing", updatedAt: ago(30 * 60_000) }), NOW)).toEqual({ attempt: true });
    // A provider-side cancellation whose local settlement never ran: the order
    // is still pending and the inventory holds are still held.
    expect(shouldAttempt(at({ phase: "cancelled", settledAt: null, updatedAt: ago(HOUR) }), NOW)).toEqual({ attempt: true });
  });
});

/** The real store, the real port, the real coordinator, and a model of the provider. */
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
  const sweep = createCheckoutRecoverySweep({
    listRecoverable: (request) => executions.listRecoverable!(request),
    settleUnattended: executor.settleUnattended,
    now: () => SWEEP_NOW,
  });

  const seedOrder = async (orderId: string, state: OrderState = "checkout_pending") => {
    const order: OrderRecord = {
      orderId,
      memberId: base.memberId,
      state,
      lines: [],
      totals: { subtotalCents: 32_999, shippingCents: 1_000, storeCreditAppliedCents: 0, totalCents: 33_999 },
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
  const seed = async (overrides: Partial<CheckoutExecutionCreate> = {}) => {
    const record = at(overrides);
    await seedOrder(record.orderId);
    await executions.create(record);
    return record;
  };
  /**
   * Put a real authorization at the provider, the way a customer's own request
   * would, and hand back the reference it minted.
   */
  const authorizeAtProvider = async (record: CheckoutExecutionRecord) => {
    const result = await port.authorize({ ...record, providerReference: null, authorizationAttemptedAt: null });
    if (result.kind !== "authorized") throw new Error(`expected an authorization, got ${result.kind}`);
    return result.providerReference;
  };
  return { model, orders, executions, port, executor, sweep, released, finalized, seed, seedOrder, authorizeAtProvider };
}

describe("the unattended operation, outcome by outcome", () => {
  it("RELEASES an authorization nobody came back for, and captures nothing", async () => {
    const h = harness();
    const record = at({ phase: "reconciliation_required", authorizationAttemptedAt: ago(47 * HOUR) });
    const reference = await h.authorizeAtProvider(record);
    await h.seedOrder(record.orderId);
    await h.executions.create({ ...record, providerReference: reference });
    // The provider is holding the money and has taken none of it.
    expect(h.model.intents.get(reference)).toMatchObject({ status: "requires_capture", amount_capturable: 33_999 });

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.model.captures()).toHaveLength(0);
    expect(h.model.intents.get(reference)).toMatchObject({ status: "canceled", amount_received: 0, amount_capturable: 0 });
    const settled = h.executions.snapshot()[0]!;
    expect(settled.phase).toBe("cancelled");
    expect(settled.settledAt).not.toBeNull();
    expect((await h.orders.get(record.orderId))?.state).toBe("cancelled");
    expect(h.released).toEqual(["res-1"]);
    expect(h.finalized).toEqual([]);
  });

  it("COMMITS a payment the provider already took, because money taken is a fact", async () => {
    const h = harness();
    const record = at({ phase: "reconciliation_required", authorizationAttemptedAt: ago(47 * HOUR) });
    const reference = await h.authorizeAtProvider(record);
    // The customer's own worker captured, then died before writing anything down.
    const captured = await h.port.capture({ ...record, providerReference: reference });
    expect(captured.kind).toBe("captured");
    await h.seedOrder(record.orderId);
    await h.executions.create({ ...record, providerReference: reference });

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "committed", orderId: record.orderId });
    // Exactly the one capture that already happened. The pass added none.
    expect(h.model.captures()).toHaveLength(1);
    expect(h.executions.snapshot()[0]!.phase).toBe("committed");
    const order = await h.orders.get(record.orderId);
    expect(order?.state).toBe("payment_captured");
    expect(order?.capturedAmountCents).toBe(record.amountCents);
    expect(order?.providerReference).toBe(reference);
    expect(h.finalized).toEqual(["res-1"]);
    expect(h.released).toEqual([]);
  });

  it("ESCALATES an attempt that never learned a reference, and asks the provider NOTHING", async () => {
    const h = harness();
    const record = await h.seed({
      phase: "reconciliation_required",
      providerReference: null,
      authorizationAttemptedAt: ago(47 * HOUR),
    });

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome.kind).toBe("escalated");
    expect(outcome.kind === "escalated" && outcome.reason).toContain("only a person");
    // The whole point of the escalation: no request is sent, so the creation
    // key cannot be replayed into a second payment.
    expect(h.model.requests).toHaveLength(0);
    expect(h.executions.snapshot()[0]!.phase).toBe("reconciliation_required");
    expect((await h.orders.get(record.orderId))?.state).toBe("checkout_pending");
    expect(h.released).toEqual([]);
  });

  it("releases an execution that never reached the provider without calling it at all", async () => {
    const h = harness();
    const record = await h.seed({ phase: "reserved", providerReference: null, authorizationAttemptedAt: null });

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.model.requests).toHaveLength(0);
    expect(h.executions.snapshot()[0]!).toMatchObject({ phase: "cancelled", providerReference: null });
    expect((await h.orders.get(record.orderId))?.state).toBe("cancelled");
    expect(h.released).toEqual(["res-1"]);
  });

  it("finishes a cancellation the provider already made but nobody settled locally", async () => {
    const h = harness();
    const record = at({ phase: "cancelled", authorizationAttemptedAt: ago(47 * HOUR) });
    const reference = await h.authorizeAtProvider(record);
    await h.port.cancel({ ...record, providerReference: reference });
    expect(h.model.intents.get(reference)!.status).toBe("canceled");
    await h.seedOrder(record.orderId);
    // The provider's answer was written down; the local transaction never ran.
    await h.executions.create({
      ...record,
      providerReference: reference,
      settledAt: null,
      lastProviderResult: { kind: "cancelled", providerReference: reference, capturedAmountCents: 0, reason: "customer" },
    });

    const outcome = await h.executor.settleUnattended(record.memberId, record.requestKey);

    expect(outcome).toEqual({ kind: "cancelled", orderId: record.orderId });
    expect(h.executions.snapshot()[0]!.settledAt).not.toBeNull();
    expect((await h.orders.get(record.orderId))?.state).toBe("cancelled");
    expect(h.released).toEqual(["res-1"]);
    expect(h.model.captures()).toHaveLength(0);
  });

  it("is idempotent: a second pass over the same row changes nothing", async () => {
    const h = harness();
    const record = at({ phase: "reconciliation_required", authorizationAttemptedAt: ago(47 * HOUR) });
    const reference = await h.authorizeAtProvider(record);
    await h.seedOrder(record.orderId);
    await h.executions.create({ ...record, providerReference: reference });
    expect(await h.executor.settleUnattended(record.memberId, record.requestKey)).toEqual({
      kind: "cancelled",
      orderId: record.orderId,
    });
    const releasedOnce = [...h.released];
    const version = h.executions.snapshot()[0]!.version;

    expect(await h.executor.settleUnattended(record.memberId, record.requestKey)).toEqual({
      kind: "cancelled",
      orderId: record.orderId,
    });
    expect(h.released).toEqual(releasedOnce);
    expect(h.executions.snapshot()[0]!.version).toBe(version);
    expect(h.model.captures()).toHaveLength(0);
  });

  it("has no way to reach the payment progression that captures", () => {
    // Structural, not behavioural. The sweep is handed ONE operation; if this
    // ever widens back to the whole coordinator, the capture path returns with
    // it and the rule above stops being enforceable by construction.
    const h = harness();
    const given = createCheckoutRecoverySweep({
      listRecoverable: async () => [],
      settleUnattended: h.executor.settleUnattended,
      now: () => SWEEP_NOW,
    });
    expect(Object.keys(given)).toEqual(["sweep"]);
  });
});

describe("the queue advances", () => {
  /** A row that can only ever escalate: an attempt was made, no reference was learned. */
  const stuck = (index: number): CheckoutExecutionCreate =>
    at({
      executionId: `00000000-0000-4000-8000-00000000000${index}`,
      requestKey: `req_stuck_000${index}`,
      orderId: `1111111${index}-1111-4111-8111-111111111111`,
      phase: "reconciliation_required",
      providerReference: null,
      authorizationAttemptedAt: ago(47 * HOUR),
      updatedAt: ago((48 - index) * HOUR),
    });

  it("pages past rows it cannot resolve, so an escalated head does not hide the work behind it", async () => {
    const h = harness();
    for (let i = 1; i <= 3; i++) {
      const record = stuck(i);
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }
    const reachable = at({
      executionId: "00000000-0000-4000-8000-0000000000ff",
      requestKey: "req_reachable_0001",
      orderId: "99999999-1111-4111-8111-111111111111",
      phase: "reserved",
      providerReference: null,
      authorizationAttemptedAt: null,
      updatedAt: ago(40 * HOUR),
    });
    await h.seedOrder(reachable.orderId);
    await h.executions.create(reachable);

    // Two rows per page: without a cursor this pass would read the same three
    // stuck rows for ever and never reach the fourth.
    const report = await h.sweep.sweep({ pageSize: 2, maxPages: 5, maxAttempts: 10 });

    expect(report.pages).toBeGreaterThan(1);
    expect(report.escalated).toHaveLength(3);
    expect(report.settled).toBe(1);
    expect(report.entries.find((e) => e.orderId === reachable.orderId)?.outcome).toBe("cancelled");
    expect((await h.orders.get(reachable.orderId))?.state).toBe("cancelled");
    // The three stuck rows were left exactly as they were, and reported.
    for (const entry of report.escalated) {
      expect(entry.reason).toContain("only a person");
      expect(entry.providerReference).toBeNull();
      expect(entry.phase).toBe("reconciliation_required");
    }
    expect(h.model.requests).toHaveLength(0);
  });

  it("resumes where the previous pass stopped rather than re-reading the head", async () => {
    const h = harness();
    for (let i = 1; i <= 4; i++) {
      const record = stuck(i);
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }

    const first = await h.sweep.sweep({ pageSize: 2, maxPages: 1, maxAttempts: 10 });
    expect(first.considered).toBe(2);
    expect(first.exhausted).toBe(false);
    expect(first.checkpoint).not.toBeNull();

    const second = await h.sweep.sweep({ pageSize: 2, maxPages: 1, maxAttempts: 10, checkpoint: first.checkpoint });

    const firstIds = first.entries.map((e) => e.executionId);
    const secondIds = second.entries.map((e) => e.executionId);
    expect(secondIds).toHaveLength(2);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    // All four rows seen across the two passes, none of them twice.
    expect(new Set([...firstIds, ...secondIds]).size).toBe(4);
  });

  it("keeps going when one row cannot be settled, instead of starving the rest", async () => {
    const h = harness();
    for (let i = 1; i <= 3; i++) {
      const record = at({
        executionId: `00000000-0000-4000-8000-0000000004${i}0`,
        requestKey: `req_throw_000${i}`,
        orderId: `8888888${i}-1111-4111-8111-111111111111`,
        phase: "reserved",
        providerReference: null,
        authorizationAttemptedAt: null,
        updatedAt: ago((48 - i) * HOUR),
      });
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }
    const sweep = createCheckoutRecoverySweep({
      listRecoverable: (request) => h.executions.listRecoverable!(request),
      async settleUnattended(memberId, requestKey, expected) {
        // The first row fails every time. It must not block the two behind it.
        if (requestKey === "req_throw_0001") throw new Error("the store went away");
        return h.executor.settleUnattended(memberId, requestKey, expected);
      },
      now: () => SWEEP_NOW,
    });

    const report = await sweep.sweep({ pageSize: 10, maxPages: 2, maxAttempts: 10 });

    expect(report.entries[0]!.code).toBe("attempt_failed");
    expect(report.settled).toBe(2);
    expect(report.deferred).toBe(1);
    // The failure is reported for a person, and carries no provider text.
    expect(report.entries[0]!.reason).toContain("left for the next one");
    expect(h.executions.snapshot().filter((r) => r.phase === "cancelled")).toHaveLength(2);
  });

  it("hands the discovery snapshot to the settle, so a row that moved is left alone", async () => {
    const h = harness();
    await h.seed({ phase: "reserved", providerReference: null, authorizationAttemptedAt: null });
    const seen: Array<{ updatedAt: string | null } | undefined> = [];
    const sweep = createCheckoutRecoverySweep({
      listRecoverable: (request) => h.executions.listRecoverable!(request),
      async settleUnattended(memberId, requestKey, expected) {
        seen.push(expected);
        return h.executor.settleUnattended(memberId, requestKey, expected);
      },
      now: () => SWEEP_NOW,
    });
    await sweep.sweep();
    expect(seen).toHaveLength(1);
    expect(typeof seen[0]!.updatedAt).toBe("string");
  });

  it("reports what an operator needs, and nothing an operator must not see", async () => {
    const h = harness();
    const record = await h.seed({
      phase: "reconciliation_required",
      providerReference: null,
      authorizationAttemptedAt: ago(47 * HOUR),
    });

    const report = await h.sweep.sweep();

    expect(report.escalated).toHaveLength(1);
    const entry = report.escalated[0]!;
    expect(entry).toMatchObject({
      executionId: record.executionId,
      orderId: record.orderId,
      phase: "reconciliation_required",
      providerReference: null,
    });
    expect(entry.reason).toBeTruthy();
    const serialized = JSON.stringify(report);
    for (const withheld of ["pm_fixture_card", "secret", "xr-auth-0001", "xr-capture-0001", "a".repeat(64)]) {
      expect(serialized).not.toContain(withheld);
    }
  });

  it("stops at its own limits rather than draining the whole queue in one pass", async () => {
    const h = harness();
    for (let i = 1; i <= 5; i++) {
      const record = at({
        executionId: `00000000-0000-4000-8000-0000000001${i}0`,
        requestKey: `req_limit_000${i}`,
        orderId: `3333333${i}-1111-4111-8111-111111111111`,
        phase: "reserved",
        providerReference: null,
        authorizationAttemptedAt: null,
        updatedAt: ago((48 - i) * HOUR),
      });
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }

    const report = await h.sweep.sweep({ maxAttempts: 2, pageSize: 10, maxPages: 5 });

    expect(report.attempted).toBe(2);
    expect(report.settled).toBe(2);
    // The rest are untouched and still there for the next pass.
    expect(h.executions.snapshot().filter((r) => r.phase === "reserved")).toHaveLength(3);
  });

  it("keeps one horizon for a whole cycle, and drops it when the cycle finishes", async () => {
    const h = harness();
    for (let i = 1; i <= 4; i++) {
      const record = stuck(i);
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }

    const first = await h.sweep.sweep({ pageSize: 2, maxPages: 1, maxAttempts: 10 });
    const second = await h.sweep.sweep({ pageSize: 2, maxPages: 1, maxAttempts: 10, checkpoint: first.checkpoint });
    // Same horizon carried forward, not recomputed. A recomputed horizon lets
    // the eligible set grow under a cursor that only moves forward.
    expect(second.checkpoint?.before).toBe(first.checkpoint?.before);

    const third = await h.sweep.sweep({ pageSize: 2, maxPages: 2, maxAttempts: 10, checkpoint: second.checkpoint });
    expect(third.exhausted).toBe(true);
    // Null, so the next scheduled cycle takes a fresh horizon and reconsiders
    // everything this one escalated.
    expect(third.checkpoint).toBeNull();
  });

  it("never lets the cursor pass a row it did not examine", async () => {
    const h = harness();
    // Five eligible rows, and a pass allowed to act on only two of them.
    for (let i = 1; i <= 5; i++) {
      const record = at({
        executionId: `00000000-0000-4000-8000-0000000002${i}0`,
        requestKey: `req_starve_000${i}`,
        orderId: `5555555${i}-1111-4111-8111-111111111111`,
        phase: "reserved",
        providerReference: null,
        authorizationAttemptedAt: null,
        updatedAt: ago((48 - i) * HOUR),
      });
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }

    const first = await h.sweep.sweep({ pageSize: 5, maxPages: 1, maxAttempts: 2 });
    expect(first.attempted).toBe(2);
    // The checkpoint sits on the SECOND row, not the fifth. Advancing to the end
    // of the page would step over three rows nobody looked at, and the cursor
    // only moves forward, so they would starve for the whole cycle.
    expect(first.checkpoint?.after?.executionId).toBe(first.entries[1]!.executionId);
    expect(first.exhausted).toBe(false);

    // The rest are reachable, and the cycle drains.
    const second = await h.sweep.sweep({ pageSize: 5, maxPages: 3, maxAttempts: 10, checkpoint: first.checkpoint });
    expect(second.attempted).toBe(3);
    expect(h.executions.snapshot().filter((r) => r.phase === "reserved")).toHaveLength(0);
  });

  it("does not report a queue as exhausted when a limit is what stopped it", async () => {
    const h = harness();
    for (let i = 1; i <= 3; i++) {
      const record = at({
        executionId: `00000000-0000-4000-8000-0000000003${i}0`,
        requestKey: `req_short_000${i}`,
        orderId: `6666666${i}-1111-4111-8111-111111111111`,
        phase: "reserved",
        providerReference: null,
        authorizationAttemptedAt: null,
        updatedAt: ago((48 - i) * HOUR),
      });
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }
    // A short page (3 rows against a page size of 10) cut off after one row.
    const report = await h.sweep.sweep({ pageSize: 10, maxPages: 1, maxAttempts: 1 });
    expect(report.attempted).toBe(1);
    expect(report.exhausted).toBe(false);
    expect(report.checkpoint).not.toBeNull();
  });

  it("records a page durably BEFORE it moves past it, and replays the page when recording fails", async () => {
    const h = harness();
    for (let i = 1; i <= 4; i++) {
      const record = stuck(i);
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }
    const recorded: string[][] = [];
    let failNext = false;
    const sweep = createCheckoutRecoverySweep({
      listRecoverable: (request) => h.executions.listRecoverable!(request),
      settleUnattended: h.executor.settleUnattended,
      now: () => SWEEP_NOW,
      async record(entries) {
        if (failNext) throw new Error("the operator store is unavailable");
        recorded.push(entries.map((e) => e.executionId));
      },
    });

    const first = await sweep.sweep({ pageSize: 2, maxPages: 1, maxAttempts: 10 });
    // One call per row, so a failure loses at most the row in hand.
    expect(recorded.flat()).toHaveLength(2);
    expect(first.checkpoint?.after?.executionId).toBe(recorded.flat()[1]);

    // The store fails on the next row: the pass stops and hands back the last
    // position it did record, so the rest replay rather than being passed over.
    failNext = true;
    const failed = await sweep.sweep({ pageSize: 2, maxPages: 3, maxAttempts: 10, checkpoint: first.checkpoint });
    expect(failed.checkpoint?.after?.executionId).toBe(first.checkpoint?.after?.executionId);
    expect(recorded.flat()).toHaveLength(2);

    failNext = false;
    const retried = await sweep.sweep({ pageSize: 2, maxPages: 1, maxAttempts: 10, checkpoint: failed.checkpoint });
    expect(recorded.flat()).toHaveLength(4);
    // The replayed rows are the ones that were never recorded, not the first two.
    const before = recorded.flat().slice(0, 2);
    expect(recorded.flat().slice(2).some((id) => before.includes(id))).toBe(false);
    expect(retried.checkpoint?.after).not.toBeNull();
  });

  it("carries a fixed code beside every outcome, so an operator store need not read prose", async () => {
    const h = harness();
    await h.seed({ phase: "reserved", providerReference: null, authorizationAttemptedAt: null });
    const other = at({
      executionId: "00000000-0000-4000-8000-0000000000c1",
      requestKey: "req_code_0002",
      orderId: "44444444-1111-4111-8111-111111111111",
      phase: "reconciliation_required",
      providerReference: null,
      authorizationAttemptedAt: ago(47 * HOUR),
      updatedAt: ago(41 * HOUR),
    });
    await h.seedOrder(other.orderId);
    await h.executions.create(other);

    const report = await h.sweep.sweep();

    expect(report.entries.map((e) => e.code).sort()).toEqual(["needs_person", "settled_cancelled"]);
    for (const entry of report.entries) expect(typeof entry.code).toBe("string");
  });
});

describe("the cursor keeps the precision the database keeps", () => {
  it("converts a Postgres timestamp to whole microseconds", () => {
    expect(microsSinceEpoch("2026-09-10T12:00:00.123456Z")).toBe(1789041600123456n);
    // Six digits kept exactly, not rounded through milliseconds.
    expect(microsSinceEpoch("2026-09-10T12:00:00.123999Z")! - microsSinceEpoch("2026-09-10T12:00:00.123456Z")!).toBe(543n);
    // PostgREST's own shapes.
    expect(microsSinceEpoch("2026-09-10T12:00:00.123456+00:00")).toBe(1789041600123456n);
    expect(microsSinceEpoch("2026-09-10 12:00:00.123456+00")).toBe(1789041600123456n);
    // Fewer digits are padded, not misread as microseconds.
    expect(microsSinceEpoch("2026-09-10T12:00:00.5Z")).toBe(1789041600500000n);
    expect(microsSinceEpoch("2026-09-10T12:00:00Z")).toBe(1789041600000000n);
    expect(microsSinceEpoch("not a timestamp")).toBeNull();
    expect(microsSinceEpoch(null)).toBeNull();
  });

  it("refuses a cursor it cannot read rather than silently rewinding to the head", async () => {
    const h = harness();
    const record = await h.seed({ phase: "reserved" });
    // The SQL compares against a timestamptz and would raise. Treating this as
    // "no cursor" would quietly re-read the whole queue and hide the corruption.
    await expect(
      h.executions.listRecoverable!({
        before: SWEEP_NOW,
        limit: 10,
        after: { updatedAt: "yesterday afternoon", executionId: record.executionId },
      }),
    ).rejects.toThrow(/unusable timestamp/);
  });

  it("refuses half a cursor, exactly as the SQL does", async () => {
    const h = harness();
    await h.seed({ phase: "reserved" });
    // Ignoring an incomplete cursor returns page one for ever: the caller
    // advances its own position and is handed page one again.
    await expect(
      h.executions.listRecoverable!({ before: SWEEP_NOW, limit: 10, after: { updatedAt: "2026-09-08T00:00:00Z", executionId: "" } }),
    ).rejects.toThrow(/cursor is incomplete/);
    await expect(
      h.executions.listRecoverable!({ before: SWEEP_NOW, limit: 10, after: { executionId: "e" } as never }),
    ).rejects.toThrow(/cursor is incomplete/);
  });

  it("orders ids the same way it filters them", async () => {
    const h = harness();
    // "exec-1" and "exec_1" sort one way under localeCompare and the other way
    // under a plain comparison. A filter and a sort that disagree drop rows.
    const ids = ["exec-1", "exec_1"];
    for (const [index, id] of ids.entries()) {
      const record = at({
        executionId: id,
        requestKey: `req_ord_${index}`,
        orderId: `7777777${index}-1111-4111-8111-111111111111`,
        phase: "reserved",
        updatedAt: "2026-09-08T00:00:00.000000Z",
      });
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }
    const page = await h.executions.listRecoverable!({ before: SWEEP_NOW, limit: 10 });
    const sorted = page.map((r) => r.executionId);
    expect(sorted).toEqual([...ids].sort((a, b) => (a === b ? 0 : a > b ? 1 : -1)));

    // And paging from the first returns exactly the second, never nothing.
    const rest = await h.executions.listRecoverable!({
      before: SWEEP_NOW,
      limit: 10,
      after: { updatedAt: "2026-09-08T00:00:00.000000Z", executionId: sorted[0]! },
    });
    expect(rest.map((r) => r.executionId)).toEqual([sorted[1]!]);
  });

  it("does not lose a row whose timestamp differs from the cursor only in microseconds", async () => {
    const h = harness();
    // Two rows inside the SAME millisecond. Ordered by (updated_at, id) the
    // earlier one is "zzz", so a cursor at "zzz" must still return "aaa".
    // Compared in milliseconds they look simultaneous, the id tie-break takes
    // over, "aaa" sorts before "zzz", and "aaa" is never returned again.
    const earlier = at({
      executionId: "00000000-0000-4000-8000-00000000zzzz".replace(/z/g, "9"),
      requestKey: "req_micro_zzz",
      orderId: "55555555-1111-4111-8111-111111111111",
      phase: "reserved",
      updatedAt: "2026-09-08T00:00:00.123456Z",
    });
    const later = at({
      executionId: "00000000-0000-4000-8000-00000000aaaa",
      requestKey: "req_micro_aaa",
      orderId: "66666666-1111-4111-8111-111111111111",
      phase: "reserved",
      updatedAt: "2026-09-08T00:00:00.123999Z",
    });
    for (const record of [earlier, later]) {
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }

    const page = await h.executions.listRecoverable!({
      before: SWEEP_NOW,
      limit: 10,
      after: { updatedAt: earlier.updatedAt!, executionId: earlier.executionId },
    });

    expect(page.map((r) => r.executionId)).toEqual([later.executionId]);
  });

  it("orders two rows in the same millisecond by their microseconds, not by their ids", async () => {
    const h = harness();
    const first = at({
      executionId: "00000000-0000-4000-8000-0000000000bb",
      requestKey: "req_order_bb",
      orderId: "77777777-1111-4111-8111-111111111111",
      phase: "reserved",
      updatedAt: "2026-09-08T00:00:00.100100Z",
    });
    const second = at({
      executionId: "00000000-0000-4000-8000-0000000000aa",
      requestKey: "req_order_aa",
      orderId: "88888888-1111-4111-8111-111111111111",
      phase: "reserved",
      updatedAt: "2026-09-08T00:00:00.100900Z",
    });
    for (const record of [second, first]) {
      await h.seedOrder(record.orderId);
      await h.executions.create(record);
    }

    const page = await h.executions.listRecoverable!({ before: SWEEP_NOW, limit: 10 });

    // "bb" is later in the alphabet but earlier in time, and time wins.
    expect(page.map((r) => r.executionId)).toEqual([first.executionId, second.executionId]);
  });
});
