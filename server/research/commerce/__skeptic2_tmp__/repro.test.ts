import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "./shared-316a67c";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore, type IdempotentCheckoutPaymentPort } from "./executor-316a67c";

// Single shared row with the same CAS semantics as the SQL / in-memory store.
const PHASE_FOR_RESULT: Record<ProviderExecutionResult["kind"], CheckoutExecutionRecord["phase"]> = {
  authorized: "authorized",
  captured: "captured",
  action_required: "action_required",
  cancelled: "cancelled",
  refused: "reconciliation_required",
  unknown: "reconciliation_required",
};

function build(afterRecordAuthorized: () => Promise<void>) {
  let r: CheckoutExecutionRecord = {
    executionId: "exe-1",
    requestKey: "req-1",
    // A worker died mid-create: claimed `authorizing`, no reference learned.
    phase: "authorizing",
    version: 2,
    providerReference: null,
    orderId: "order-1",
    memberId: "member-1",
    amountCents: 1234,
    currency: "usd",
    paymentMethodReference: "pm_1",
    quoteFingerprint: "fp",
    authorizationKey: "ak",
    captureKey: "ck",
    cancelKey: "xk",
    reservationIds: ["res-1"],
    createdAt: "2026-09-08T00:00:00Z",
    authorizationAttemptedAt: "2026-09-08T00:00:01Z",
    settledAt: null,
  };
  const money: string[] = [];
  const phases: string[] = [];
  let hookArmed = true;

  const store: CanonicalCheckoutExecutionStore = {
    authority: "canonical_checkout_transaction_v1",
    getForMember: async () => structuredClone(r),
    claim: async (_id, version, phase) => {
      if (r.version !== version) return null;
      r = { ...r, phase, version: version + 1, authorizationAttemptedAt: phase === "authorizing" ? (r.authorizationAttemptedAt ?? "2026-09-08T00:00:01Z") : r.authorizationAttemptedAt };
      phases.push(phase);
      return structuredClone(r);
    },
    recordProvider: async (_id, version, p) => {
      if (r.version !== version) return null;
      const reference = "providerReference" in p ? (p as any).providerReference ?? null : null;
      r = { ...r, version: version + 1, phase: PHASE_FOR_RESULT[p.kind], providerReference: r.providerReference ?? reference, lastProviderResult: p };
      // Real CAS returns the row AS WRITTEN, at its own version.
      const written = structuredClone(r);
      phases.push(r.phase);
      // THE WINDOW: the row is now `authorized` and the cancel has not re-claimed yet.
      if (written.phase === "authorized" && hookArmed) {
        hookArmed = false;
        await afterRecordAuthorized();
      }
      return written;
    },
    commitCaptured: async (_id, version) => {
      if (r.version !== version) return null;
      money.push("COMMIT-ORDER");
      r = { ...r, phase: "committed", version: version + 1 };
      phases.push("committed");
      return structuredClone(r);
    },
    commitCancelled: async (_id, version) => {
      if (r.version !== version) return null;
      r = { ...r, settledAt: "2026-09-08T00:00:09Z", version: version + 1 };
      return structuredClone(r);
    },
  };

  const authorizedProof = (): ProviderExecutionResult => ({
    kind: "authorized", providerReference: "pi_X", memberId: "member-1", orderId: "order-1", amountCents: 1234, currency: "usd",
  });
  const payment: IdempotentCheckoutPaymentPort = {
    authority: "provider_verified_idempotent_execution_v1",
    authorize: async () => { money.push("authorize"); return authorizedProof(); },
    capture: async () => {
      money.push("CAPTURE");
      return { kind: "captured", providerReference: "pi_X", memberId: "member-1", orderId: "order-1", amountCents: 1234, currency: "usd" };
    },
    reconcile: async () => { money.push("reconcile"); return authorizedProof(); },
    cancel: async () => { money.push("cancel"); return { kind: "cancelled", providerReference: "pi_X", capturedAmountCents: 0 }; },
  };
  return { store, payment, money, phases, row: () => r };
}

describe("316a67c cancel(): record-then-reclaim capture window", () => {
  it("lets a concurrent run() capture the payment the buyer asked to release", async () => {
    let exec!: ReturnType<typeof createDurableCheckoutExecutor>;
    let concurrent: any = null;
    const h = build(async () => { concurrent = await exec.run("member-1", "req-1"); });
    exec = createDurableCheckoutExecutor(h.store, h.payment);

    const cancelOutcome = await exec.cancel("member-1", "req-1");

    console.log("money trace :", h.money.join(", "));
    console.log("phase trace :", h.phases.join(" -> "));
    console.log("cancel says :", JSON.stringify(cancelOutcome));
    console.log("run says    :", JSON.stringify(concurrent));
    console.log("final row   :", h.row().phase, "settledAt", h.row().settledAt);

    expect(h.money).toContain("CAPTURE");
    expect(h.row().phase).toBe("committed");
    expect(cancelOutcome.kind).toBe("pending");
  });
});
