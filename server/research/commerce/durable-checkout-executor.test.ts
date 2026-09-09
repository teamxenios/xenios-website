import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import { exactPaymentEvidence } from "@shared/research/durable-checkout-execution";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore, type IdempotentCheckoutPaymentPort } from "./durable-checkout-executor";

// Ported from the XENIOS_IMPLEMENTATION_20260908 package's node tests for the
// coordinator, unchanged in intent. Store and port are recording doubles.
const base: CheckoutExecutionRecord = {
  executionId: "exe-fixture",
  requestKey: "request-fixture",
  phase: "reserved",
  version: 1,
  providerReference: null,
  orderId: "order-fixture",
  memberId: "member-fixture",
  amountCents: 1234,
  currency: "usd",
  paymentMethodReference: "pm_fixture",
  quoteFingerprint: "fingerprint",
  authorizationKey: "authorize-fixture",
  captureKey: "capture-fixture",
  cancelKey: "cancel-fixture",
  reservationIds: ["reservation-fixture"],
  createdAt: "2026-09-08T00:00:00Z",
  authorizationAttemptedAt: null,
  settledAt: null,
};

function harness({
  unknown = false,
  badAmount = false,
  contended = false,
  initial = "reserved" as CheckoutExecutionRecord["phase"],
  reconcileAnswer = undefined as ProviderExecutionResult | undefined,
  cancelAnswer = undefined as ProviderExecutionResult | undefined,
  reference = null as string | null,
  attempted = false,
} = {}) {
  let r: CheckoutExecutionRecord = { ...base, phase: initial, providerReference: reference, authorizationAttemptedAt: attempted ? "2026-09-08T00:00:01Z" : null };
  const calls: string[] = [];
  const store: CanonicalCheckoutExecutionStore = {
    authority: "canonical_checkout_transaction_v1",
    getForMember: async () => structuredClone(r),
    claim: async (_id, version, phase) => {
      calls.push(`claim:${phase}`);
      if (contended) return null;
      r = { ...r, phase, version: version + 1 };
      return structuredClone(r);
    },
    recordProvider: async (_id, version, p) => {
      calls.push(`record:${p.kind}`);
      r = {
        ...r,
        version: version + 1,
        phase: p.kind === "unknown" ? "reconciliation_required" : (p.kind as CheckoutExecutionRecord["phase"]),
        providerReference: "providerReference" in p ? p.providerReference : r.providerReference,
      };
      return structuredClone(r);
    },
    commitCaptured: async () => {
      calls.push("commit");
      r = { ...r, phase: "committed", version: r.version + 1 };
      return r;
    },
    commitCancelled: async (_id, version) => {
      calls.push("settle");
      r = { ...r, settledAt: "2026-09-08T00:00:02Z", version: version + 1 };
      return structuredClone(r);
    },
  };
  const proof = (kind: "authorized" | "captured"): ProviderExecutionResult => ({
    kind,
    providerReference: "pi_fixture",
    memberId: r.memberId,
    orderId: r.orderId,
    amountCents: r.amountCents + (badAmount ? 1 : 0),
    currency: "usd",
  });
  const payment: IdempotentCheckoutPaymentPort = {
    authority: "provider_verified_idempotent_execution_v1",
    authorize: async () => {
      calls.push("authorize");
      return unknown ? { kind: "unknown" } : proof("authorized");
    },
    capture: async () => {
      calls.push("capture");
      return proof("captured");
    },
    reconcile: async () => {
      calls.push("reconcile");
      return reconcileAnswer ?? { kind: "unknown" };
    },
    cancel: async (record) => {
      calls.push(`cancel:${record.providerReference ?? "none"}`);
      return cancelAnswer ?? { kind: "unknown" };
    },
  };
  const executor = createDurableCheckoutExecutor(store, payment);
  return { run: executor.run, cancel: executor.cancel, recover: executor.recover, calls, snapshot: () => structuredClone(r) };
}

describe("durable checkout coordinator", () => {
  it("commits only after matching capture evidence", async () => {
    const h = harness();
    expect((await h.run(base.memberId, base.requestKey)).kind).toBe("committed");
    expect(h.calls).toEqual(["claim:authorizing", "authorize", "record:authorized", "claim:capturing", "capture", "record:captured", "commit"]);
  });
  it("never advances an unknown provider outcome to capture or order commit", async () => {
    const h = harness({ unknown: true });
    expect((await h.run(base.memberId, base.requestKey)).kind).toBe("reconciliation_required");
    expect(h.calls).not.toContain("capture");
    expect(h.calls).not.toContain("commit");
  });
  it("treats a mismatched provider amount as unknown, not paid", async () => {
    const h = harness({ badAmount: true });
    expect((await h.run(base.memberId, base.requestKey)).kind).toBe("reconciliation_required");
    expect(h.calls).not.toContain("commit");
  });
  it("never calls the provider after losing the durable claim", async () => {
    const h = harness({ contended: true });
    expect((await h.run(base.memberId, base.requestKey)).kind).toBe("pending");
    expect(h.calls).not.toContain("authorize");
  });
  it("reconciles an in-flight effect rather than authorizing again", async () => {
    const h = harness({ initial: "authorizing" });
    await h.run(base.memberId, base.requestKey);
    expect(h.calls).toContain("reconcile");
    expect(h.calls).not.toContain("authorize");
  });
  it("does not let another member advance the execution", async () => {
    const h = harness();
    expect((await h.run("other-member", base.requestKey)).kind).toBe("missing");
    expect(h.calls).toHaveLength(0);
  });
  it("refuses unqualified port contracts", () => {
    expect(() =>
      createDurableCheckoutExecutor(
        { authority: "in_memory" } as unknown as CanonicalCheckoutExecutionStore,
        { authority: "fake" } as unknown as IdempotentCheckoutPaymentPort,
      ),
    ).toThrow(/authority/i);
  });
  it("binds provider evidence to exact money, order and member", () => {
    const record = { amountCents: 100, currency: "usd" as const, memberId: "m", orderId: "o", paymentMethodReference: "pm_x", quoteFingerprint: "q" };
    const proof = { kind: "captured" as const, providerReference: "pi_fixture", amountCents: 100, currency: "usd" as const, memberId: "m", orderId: "o" };
    expect(exactPaymentEvidence(record, proof)).toBe(true);
    for (const x of [{ amountCents: 101 }, { memberId: "other" }, { orderId: "other" }, { currency: "eur" as never }, { providerReference: "test_auth_1" }]) {
      expect(exactPaymentEvidence(record, { ...proof, ...x })).toBe(false);
    }
  });

  it("cancel with no provider reference asks the provider first: a definitive no-payment answer settles as cancelled", async () => {
    const h = harness({ attempted: true, reconcileAnswer: { kind: "refused", definitiveNoEffect: true } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(h.calls).toEqual(["claim:cancelling", "reconcile", "record:cancelled", "settle"]);
    expect(h.calls.some((c) => c.startsWith("cancel:"))).toBe(false);
  });
  it("cancel with no provider reference cancels the payment the provider reveals, never a guess", async () => {
    const learned: ProviderExecutionResult = { kind: "authorized", providerReference: "pi_learned", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" };
    const h = harness({ attempted: true, reconcileAnswer: learned, cancelAnswer: { kind: "cancelled", providerReference: "pi_learned", capturedAmountCents: 0 } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(h.calls).toEqual(["claim:cancelling", "reconcile", "cancel:pi_learned", "record:cancelled", "settle"]);
    expect(h.snapshot().providerReference).toBe("pi_learned");
  });
  it("cancel with no provider reference and an uncertain provider answer stays in reconciliation: neither cancelled nor charged is claimed", async () => {
    const h = harness({ attempted: true, reconcileAnswer: { kind: "unknown" } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("reconciliation_required");
    expect(h.calls).toEqual(["claim:cancelling", "reconcile", "record:unknown"]);
    // Never attempted: nothing to ask the provider about.
    const fresh = harness({ reconcileAnswer: { kind: "unknown" } });
    expect((await fresh.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(fresh.calls).toEqual(["claim:cancelling", "record:cancelled", "settle"]);
  });
  it("recover claims a parked execution back into a read-only reconciliation and commits on captured evidence", async () => {
    const h = harness({ initial: "reconciliation_required", reference: "pi_fixture", attempted: true, reconcileAnswer: { kind: "captured", providerReference: "pi_fixture", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" } });
    expect((await h.recover(base.memberId, base.requestKey)).kind).toBe("committed");
    expect(h.calls).toEqual(["claim:authorizing", "reconcile", "record:captured", "commit"]);
    expect(h.calls).not.toContain("authorize");
    // A parked execution the provider still cannot account for stays parked, after exactly one read.
    const stuck = harness({ initial: "reconciliation_required", reference: "pi_fixture", attempted: true, reconcileAnswer: { kind: "unknown" } });
    expect((await stuck.recover(base.memberId, base.requestKey)).kind).toBe("reconciliation_required");
    expect(stuck.calls).toEqual(["claim:authorizing", "reconcile", "record:unknown"]);
    // Any other phase simply runs.
    const fresh = harness();
    expect((await fresh.recover(base.memberId, base.requestKey)).kind).toBe("committed");
  });
  it("cancel of a payment the provider reports captured commits it instead of pretending it was released", async () => {
    // The record already knows its reference, so no reconcile precedes the cancel.
    const h = harness({ initial: "authorized", reference: "pi_fixture", cancelAnswer: { kind: "captured", providerReference: "pi_fixture", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" } });
    const outcome = await h.cancel(base.memberId, base.requestKey);
    expect(outcome.kind).toBe("committed");
    expect(h.calls).toEqual(["claim:cancelling", "cancel:pi_fixture", "record:captured", "commit"]);
  });
});
