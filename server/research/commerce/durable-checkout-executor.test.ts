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
  observePhase = undefined as ((phase: string) => void) | undefined,
} = {}) {
  let r: CheckoutExecutionRecord = { ...base, phase: initial, providerReference: reference, authorizationAttemptedAt: attempted ? "2026-09-08T00:00:01Z" : null };
  const calls: string[] = [];
  const store: CanonicalCheckoutExecutionStore = {
    authority: "canonical_checkout_transaction_v1",
    getForMember: async () => structuredClone(r),
    claim: async (_id, version, phase) => {
      calls.push(`claim:${phase}`);
      if (contended) return null;
      if (r.version !== version) return null;
      r = { ...r, phase, version: version + 1 };
      observePhase?.(phase);
      return structuredClone(r);
    },
    recordProvider: async (_id, version, p) => {
      calls.push(`record:${p.kind}`);
      if (r.version !== version) return null;
      const phase = p.kind === "unknown" || p.kind === "refused" ? "reconciliation_required" : (p.kind as CheckoutExecutionRecord["phase"]);
      r = {
        ...r,
        version: version + 1,
        phase,
        // The reference is learned once and never replaced, as the SQL does.
        providerReference: r.providerReference ?? ("providerReference" in p ? (p.providerReference ?? null) : null),
      };
      observePhase?.(phase);
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

  it("cancel after an attempt NEVER settles on a refused replay, and never leaves a capturable phase", async () => {
    // definitiveNoEffect means "this replay call had no effect", not "no payment
    // was ever created". Rotated credentials or a disabled provider answer this
    // way, and settling would release the holds while an authorization stands.
    for (const definitiveNoEffect of [true, false]) {
      const h = harness({ attempted: true, reconcileAnswer: { kind: "refused", definitiveNoEffect } });
      // Nothing is settled and nothing is recorded: the execution waits in
      // `cancelling`, which no automatic path advances to a capture.
      expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("pending");
      expect(h.calls).toEqual(["claim:cancelling", "reconcile"]);
      expect(h.snapshot().phase).toBe("cancelling");
      expect(h.snapshot().settledAt).toBeNull();
    }
    // Only the provider's own cancelled read-back settles it.
    const settled = harness({ attempted: true, reconcileAnswer: { kind: "cancelled", providerReference: "pi_learned", capturedAmountCents: 0 } });
    expect((await settled.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(settled.calls).toEqual(["claim:cancelling", "reconcile", "record:cancelled", "settle"]);
    expect(settled.snapshot().providerReference).toBe("pi_learned");
  });

  it("cancel on an authorizing execution releases the payment and NEVER captures it", async () => {
    // The buyer sees `authorizing` as "pending" and is offered Cancel. Falling
    // through to run() would reconcile, authorize and capture the very payment
    // the buyer asked to release.
    const learned: ProviderExecutionResult = { kind: "authorized", providerReference: "pi_inflight", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" };
    const h = harness({ initial: "authorizing", attempted: true, reconcileAnswer: learned, cancelAnswer: { kind: "cancelled", providerReference: "pi_inflight", capturedAmountCents: 0 } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(h.calls).not.toContain("capture");
    expect(h.calls).not.toContain("commit");
    expect(h.calls.some((c) => c === "cancel:pi_inflight")).toBe(true);
    expect(h.snapshot().phase).toBe("cancelled");
    // A payment the provider reports captured still commits: cancellation cannot undo an external capture.
    const captured = harness({ initial: "authorizing", attempted: true, reconcileAnswer: { kind: "captured", providerReference: "pi_taken", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" } });
    expect((await captured.cancel(base.memberId, base.requestKey)).kind).toBe("committed");
    expect(captured.calls).toContain("commit");
  });
  it("cancel with no provider reference cancels the payment the provider reveals, never a guess", async () => {
    const learned: ProviderExecutionResult = { kind: "authorized", providerReference: "pi_learned", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" };
    const h = harness({ attempted: true, reconcileAnswer: learned, cancelAnswer: { kind: "cancelled", providerReference: "pi_learned", capturedAmountCents: 0 } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    // The execution stays in `cancelling` throughout: no intermediate phase a
    // concurrent run() could capture from.
    expect(h.calls).toEqual(["claim:cancelling", "reconcile", "cancel:pi_learned", "record:cancelled", "settle"]);
    expect(h.snapshot().providerReference).toBe("pi_learned");
  });

  it("never leaves a capturable phase behind while it cancels", async () => {
    const learned: ProviderExecutionResult = { kind: "authorized", providerReference: "pi_learned", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" };
    const phases: string[] = [];
    const h = harness({
      attempted: true,
      reconcileAnswer: learned,
      cancelAnswer: { kind: "cancelled", providerReference: "pi_learned", capturedAmountCents: 0 },
      observePhase: (phase) => phases.push(phase),
    });
    await h.cancel(base.memberId, base.requestKey);
    // `authorized` is the one phase run() advances to capture; it must never
    // appear between the claim and the settlement.
    expect(phases).not.toContain("authorized");
  });

  it("a cancel the provider did not honour NEVER captures: the execution waits in cancelling and the next attempt retries", async () => {
    // The provider refuses the cancel and reports the payment still authorized.
    const stillAuthorized: ProviderExecutionResult = { kind: "authorized", providerReference: "pi_live", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" };
    const h = harness({ initial: "authorized", attempted: true, reference: "pi_live", cancelAnswer: stillAuthorized });
    const outcome = await h.cancel(base.memberId, base.requestKey);
    expect(outcome.kind).toBe("pending");
    expect(h.calls).not.toContain("capture");
    expect(h.calls).not.toContain("commit");
    expect(h.snapshot().phase).toBe("cancelling");
    // And no automatic path may capture it from there: neither a status check
    // (recover) nor an identical retry (run) turns a cancellation into a charge.
    const recovered = await h.recover(base.memberId, base.requestKey);
    expect(recovered.kind).toBe("pending");
    expect(h.calls).not.toContain("capture");
    const rerun = await h.run(base.memberId, base.requestKey);
    expect(rerun.kind).toBe("pending");
    expect(h.calls).not.toContain("capture");
    // An uncertain cancel behaves the same way.
    const uncertain = harness({ initial: "authorized", attempted: true, reference: "pi_live", cancelAnswer: { kind: "unknown" } });
    expect((await uncertain.cancel(base.memberId, base.requestKey)).kind).toBe("pending");
    expect(uncertain.snapshot().phase).toBe("cancelling");
    expect(uncertain.calls).not.toContain("capture");
  });

  it("resumes a cancellation whose worker died instead of stranding the order, the holds and the money", async () => {
    // The record was claimed into `cancelling` and the worker never came back.
    const h = harness({
      initial: "cancelling",
      attempted: true,
      reference: "pi_stranded",
      cancelAnswer: { kind: "cancelled", providerReference: "pi_stranded", capturedAmountCents: 0 },
    });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(h.snapshot().settledAt).not.toBeNull();
    // The generic recovery path resumes it as a cancellation too, not as a payment.
    const viaRecover = harness({
      initial: "cancelling",
      attempted: true,
      reference: "pi_stranded2",
      cancelAnswer: { kind: "cancelled", providerReference: "pi_stranded2", capturedAmountCents: 0 },
    });
    expect((await viaRecover.recover(base.memberId, base.requestKey)).kind).toBe("cancelled");
    expect(viaRecover.calls).not.toContain("capture");
  });

  it("a cancel that does not conclude records NOTHING, so no automatic path can capture from it", async () => {
    const learned: ProviderExecutionResult = { kind: "authorized", providerReference: "pi_learned", memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" };
    const h = harness({ attempted: true, reconcileAnswer: learned, cancelAnswer: { kind: "unknown" } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("pending");
    // Recording the learned reference would publish a capturable phase, which is
    // exactly how a cancellation used to end in a charge. The row waits in
    // `cancelling` instead, and the next attempt reconciles again.
    expect(h.snapshot().phase).toBe("cancelling");
    expect(h.snapshot().settledAt).toBeNull();
    expect(h.calls).not.toContain("capture");
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("pending");
    expect(h.calls.filter((c) => c === "reconcile").length).toBe(2);
  });
  it("cancel with no provider reference and an uncertain provider answer claims neither cancellation nor charge", async () => {
    const h = harness({ attempted: true, reconcileAnswer: { kind: "unknown" } });
    expect((await h.cancel(base.memberId, base.requestKey)).kind).toBe("pending");
    expect(h.calls).toEqual(["claim:cancelling", "reconcile"]);
    expect(h.snapshot().phase).toBe("cancelling");
    // Never attempted: nothing to ask the provider about, so it cancels outright.
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
