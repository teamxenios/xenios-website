import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore, type IdempotentCheckoutPaymentPort } from "./zz-exec-316";

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
      if (r.version !== version) return null;
      r = { ...r, phase, version: version + 1 };
      return structuredClone(r);
    },
    recordProvider: async (_id, version, p) => {
      calls.push(`record:${p.kind}`);
      if (r.version !== version) return null;
      const phase = p.kind === "unknown" || p.kind === "refused" ? "reconciliation_required" : (p.kind as CheckoutExecutionRecord["phase"]);
      r = { ...r, version: version + 1, phase, providerReference: r.providerReference ?? ("providerReference" in p ? (p.providerReference ?? null) : null) };
      return structuredClone(r);
    },
    commitCaptured: async () => {
      calls.push("commit");
      r = { ...r, phase: "committed", version: r.version + 1 };
      return structuredClone(r);
    },
    commitCancelled: async (_id, version) => {
      calls.push("settle");
      r = { ...r, settledAt: "2026-09-08T00:00:02Z", version: version + 1 };
      return structuredClone(r);
    },
  };
  const payment: IdempotentCheckoutPaymentPort = {
    authority: "provider_verified_idempotent_execution_v1",
    authorize: async () => { calls.push("authorize"); return { kind: "unknown" }; },
    capture: async () => {
      calls.push("CAPTURE");
      return { kind: "captured", providerReference: r.providerReference ?? "pi_x", memberId: r.memberId, orderId: r.orderId, amountCents: r.amountCents, currency: "usd" };
    },
    reconcile: async () => { calls.push("reconcile"); return reconcileAnswer ?? { kind: "unknown" }; },
    cancel: async (record) => { calls.push(`cancel:${record.providerReference ?? "none"}`); return cancelAnswer ?? { kind: "unknown" }; },
  };
  const executor = createDurableCheckoutExecutor(store, payment);
  return { ...executor, calls, snapshot: () => structuredClone(r) };
}

const authorizedProof = (ref: string): ProviderExecutionResult => ({ kind: "authorized", providerReference: ref, memberId: base.memberId, orderId: base.orderId, amountCents: base.amountCents, currency: "usd" });

describe("PROBE: cancel with an authorized read-back", () => {
  it("A: authorizing phase, reconcile learns pi_X, cancel refused -> readback authorized", async () => {
    const h = harness({ initial: "authorizing", attempted: true, reconcileAnswer: authorizedProof("pi_X"), cancelAnswer: authorizedProof("pi_X") });
    const outcome = await h.cancel(base.memberId, base.requestKey);
    console.log("A calls:", JSON.stringify(h.calls), "outcome:", JSON.stringify(outcome), "phase:", h.snapshot().phase);
  });
  it("B: authorized phase with a known reference, cancel refused -> readback authorized", async () => {
    const h = harness({ initial: "authorized", attempted: true, reference: "pi_Y", cancelAnswer: authorizedProof("pi_Y") });
    const outcome = await h.cancel(base.memberId, base.requestKey);
    console.log("B calls:", JSON.stringify(h.calls), "outcome:", JSON.stringify(outcome), "phase:", h.snapshot().phase);
  });
  it("C: action_required readback from cancel", async () => {
    const h = harness({ initial: "authorized", attempted: true, reference: "pi_Z", cancelAnswer: { kind: "action_required", providerReference: "pi_Z" } });
    const outcome = await h.cancel(base.memberId, base.requestKey);
    console.log("C calls:", JSON.stringify(h.calls), "outcome:", JSON.stringify(outcome), "phase:", h.snapshot().phase);
  });
});
