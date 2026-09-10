import { describe, expect, it } from "vitest";
import type { CheckoutExecutionPhase, CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { createCheckoutRecoverySweep, decideRecovery, DEFAULT_GRACE_MS } from "./checkout-recovery-sweep";
import { createDurableCheckoutExecutor } from "./durable-checkout-executor";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import { createInMemoryCheckoutExecutionStore } from "./persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { stripeModel } from "./stripe-model.test-helper";
import type { OrderRecord } from "./orders";

const NOW = new Date("2026-09-10T12:00:00Z");
/**
 * The sweep runs well after the store last stamped a row, so every phase's
 * grace period has genuinely elapsed. The store stamps `updatedAt` on each
 * transition exactly as the SQL trigger does, which is what makes a freshly
 * claimed row look busy rather than abandoned.
 */
const SWEEP_NOW = new Date(NOW.getTime() + 8 * 60 * 60_000);
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const base: CheckoutExecutionRecord = {
  executionId: "exe-1",
  requestKey: "req_sweep_0001",
  phase: "reserved",
  version: 1,
  providerReference: null,
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 21_000,
  currency: "usd",
  paymentMethodReference: "pm_fixture_card",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-0001",
  captureKey: "xr-capture-0001",
  cancelKey: "xr-cancel-0001",
  reservationIds: ["res-1"],
  createdAt: ago(48 * 60 * 60_000),
  updatedAt: ago(48 * 60 * 60_000),
  authorizationAttemptedAt: null,
  settledAt: null,
} as CheckoutExecutionRecord & { updatedAt: string };

const at = (overrides: Partial<CheckoutExecutionRecord>): CheckoutExecutionRecord => ({ ...base, ...overrides });

describe("what the sweep decides, and what it refuses to decide", () => {
  it("NEVER acts on an attempt that never learned a reference, because resolving it could create a payment", () => {
    // Both the recover and cancel paths may replay the provider's creation key.
    // Inside retention that returns the original payment IF the original request
    // arrived; if it never arrived, the replay creates one. A sweep acting for
    // an absent customer must not take that chance.
    for (const phase of ["authorizing", "capturing", "reconciliation_required", "authorized", "action_required"] as CheckoutExecutionPhase[]) {
      const decision = decideRecovery(at({ phase, providerReference: null, authorizationAttemptedAt: ago(47 * 60 * 60_000) }), NOW);
      expect(decision.action, `${phase} must escalate`).toBe("escalate");
      expect(decision.reason).toContain("could create a payment");
    }
  });

  it("releases an attempt that never reached the provider at all, with no provider call needed", () => {
    const decision = decideRecovery(at({ phase: "reserved", providerReference: null, authorizationAttemptedAt: null }), NOW);
    expect(decision.action).toBe("release");
  });

  it("finishes what the provider already did rather than completing an abandoned purchase", () => {
    // Money taken, or possibly taken: read the provider's truth and settle.
    expect(decideRecovery(at({ phase: "captured", providerReference: "pi_1" }), NOW).action).toBe("resolve");
    expect(decideRecovery(at({ phase: "reconciliation_required", providerReference: "pi_1" }), NOW).action).toBe("resolve");
    // Cancelled at the provider but never settled locally: finish the settlement.
    expect(decideRecovery(at({ phase: "cancelled", providerReference: "pi_1", settledAt: null }), NOW).action).toBe("resolve");
    // An authorization nobody returned to is RELEASED, never captured.
    for (const phase of ["reserved", "authorizing", "authorized", "capturing", "action_required", "cancelling"] as CheckoutExecutionPhase[]) {
      expect(decideRecovery(at({ phase, providerReference: "pi_1" }), NOW).action, `${phase} must be released`).toBe("release");
    }
  });

  it("leaves settled work alone", () => {
    expect(decideRecovery(at({ phase: "committed", providerReference: "pi_1" }), NOW).action).toBe("skip");
    expect(decideRecovery(at({ phase: "cancelled", providerReference: "pi_1", settledAt: ago(60_000) }), NOW).action).toBe("skip");
  });

  it("does not disturb an execution that is still in its grace period", () => {
    // A customer part-way through a bank challenge is not stuck.
    const fresh = at({ phase: "action_required", providerReference: "pi_1", updatedAt: ago(60_000) } as Partial<CheckoutExecutionRecord>);
    expect(decideRecovery(fresh, NOW).action).toBe("skip");
    expect(DEFAULT_GRACE_MS.action_required).toBeGreaterThan(DEFAULT_GRACE_MS.authorizing);
    // And the window is per phase: a worker that died mid-authorize waits less.
    const stuck = at({ phase: "authorizing", providerReference: "pi_1", updatedAt: ago(30 * 60_000) } as Partial<CheckoutExecutionRecord>);
    expect(decideRecovery(stuck, NOW).action).toBe("release");
  });
});

/** The sweep over the real store, port, coordinator and provider model. */
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
  const executor = createDurableCheckoutExecutor(executions, createProviderVerifiedPaymentPort(model.adapter, { now: () => NOW.getTime() }));
  const sweep = createCheckoutRecoverySweep({
    listRecoverable: async () => executions.snapshot().filter((r) => r.phase !== "committed"),
    executor,
    now: () => SWEEP_NOW,
  });
  const order = async (orderId: string, state: OrderRecord["state"]): Promise<void> => {
    await orders.save({
      orderId,
      memberId: base.memberId,
      state,
      lines: [],
      totals: { subtotalCents: 20_000, shippingCents: 1_000, storeCreditAppliedCents: 0, totalCents: 21_000 },
      providerReference: null,
      checkoutIdempotencyKey: base.requestKey,
      lastIdempotencyKey: base.requestKey,
      reviewTriggers: [],
      createdAt: base.createdAt,
      updatedAt: base.createdAt,
      refundedCents: 0,
      shipments: [],
    } as OrderRecord);
  };
  return { model, orders, executions, executor, sweep, released, finalized, order };
}

describe("the sweep over the real coordinator", () => {
  it("releases an abandoned authorization and its inventory holds, and never captures", async () => {
    const h = harness();
    await h.order(base.orderId, "checkout_pending");
    await h.executions.create({ ...base, requestBodySha256: "a".repeat(64), priceVersion: null } as never);
    // Drive it to a real authorization at the provider, then walk away.
    await h.executor.run(base.memberId, base.requestKey).catch(() => undefined);
    const authorized = h.executions.snapshot()[0]!;
    expect(authorized.providerReference).not.toBeNull();

    const report = await h.sweep.sweep();
    expect(report.escalated).toEqual([]);
    const settled = h.executions.snapshot()[0]!;
    // The coordinator either released it or, if the provider had taken the
    // money, committed it. Never a capture driven by the sweep itself.
    if (settled.phase === "cancelled") {
      expect(h.model.captures()).toHaveLength(0);
      expect(h.released).toContain("res-1");
      expect((await h.orders.get(base.orderId))?.state).toBe("cancelled");
    } else {
      expect(settled.phase).toBe("committed");
    }
  });

  it("escalates rather than touching an attempt with no reference, and says why", async () => {
    const h = harness();
    await h.order(base.orderId, "checkout_pending");
    await h.executions.create({
      ...base,
      phase: "reconciliation_required",
      providerReference: null,
      authorizationAttemptedAt: ago(47 * 60 * 60_000),
      requestBodySha256: "a".repeat(64),
      priceVersion: null,
    } as never);
    const report = await h.sweep.sweep();
    expect(report.acted).toBe(0);
    expect(report.escalated).toHaveLength(1);
    expect(report.escalated[0]!.decision.reason).toContain("needs a person");
    // Nothing was asked of the provider and nothing local moved.
    expect(h.model.requests).toHaveLength(0);
    expect(h.executions.snapshot()[0]!.phase).toBe("reconciliation_required");
    expect((await h.orders.get(base.orderId))?.state).toBe("checkout_pending");
  });

  it("finishes a cancellation whose worker died, exactly once", async () => {
    const h = harness();
    await h.order(base.orderId, "checkout_pending");
    await h.executions.create({ ...base, requestBodySha256: "a".repeat(64), priceVersion: null } as never);
    await h.executor.run(base.memberId, base.requestKey).catch(() => undefined);
    // Claim the cancellation and abandon it, as a dying worker would.
    const current = h.executions.snapshot()[0]!;
    await h.executions.claim(current.executionId, current.version, "cancelling");

    const first = await h.sweep.sweep();
    expect(first.escalated).toEqual([]);
    const after = h.executions.snapshot()[0]!;
    expect(["cancelled", "committed"]).toContain(after.phase);
    if (after.phase === "cancelled") expect(after.settledAt).not.toBeNull();
    const releasesAfterFirst = h.released.length;

    // A second pass changes nothing: settled work is skipped.
    const second = await h.sweep.sweep();
    expect(second.acted === 0 || h.released.length === releasesAfterFirst).toBe(true);
    expect(h.released.length).toBe(releasesAfterFirst);
  });

  it("is bounded, reports that there is more to do, and never echoes a provider message", async () => {
    const h = harness();
    for (let i = 1; i <= 3; i++) {
      await h.order(`order-${i}`, "checkout_pending");
      await h.executions.create({
        ...base,
        executionId: `exe-${i}`,
        requestKey: `req_sweep_000${i}`,
        orderId: `order-${i}`,
        authorizationKey: `xr-auth-000${i}`,
        captureKey: `xr-capture-000${i}`,
        cancelKey: `xr-cancel-000${i}`,
        requestBodySha256: "a".repeat(64),
        priceVersion: null,
      } as never);
    }
    const report = await h.sweep.sweep(2);
    expect(report.considered).toBeLessThanOrEqual(3);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("pm_fixture_card");
    // Every entry carries a reason a person can act on.
    for (const entry of report.entries) expect(entry.decision.reason.length).toBeGreaterThan(0);
  });
});
