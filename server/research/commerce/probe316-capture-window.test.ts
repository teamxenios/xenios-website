import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore, type IdempotentCheckoutPaymentPort } from "./probe316-executor";
import { createInMemoryCheckoutExecutionStore, type CheckoutExecutionCreate } from "./persistence/checkout-executions-store";
import { createCheckoutContinuationService } from "./checkout-continuation";
import type { DurablePaymentProvider } from "../providers/payment";

const seed: CheckoutExecutionCreate = {
  executionId: "11111111-1111-4111-8111-111111111111",
  requestKey: "request-probe-key",
  requestBodySha256: "d".repeat(64),
  priceVersion: null,
  phase: "authorizing",
  version: 1,
  providerReference: null,
  orderId: "order-probe",
  memberId: "member-probe",
  amountCents: 4200,
  currency: "usd",
  paymentMethodReference: "pm_probe",
  quoteFingerprint: "fp",
  authorizationKey: "auth-key",
  captureKey: "capture-key",
  cancelKey: "cancel-key",
  reservationIds: [],
  createdAt: "2026-09-09T00:00:00Z",
  authorizationAttemptedAt: "2026-09-09T00:00:01Z",
  settledAt: null,
  lastProviderResult: null,
};

describe("probe: 316a67c cancel record-then-reclaim window", () => {
  it("lets a concurrent run() capture the payment the buyer is cancelling", async () => {
    const money: string[] = [];
    const inner = createInMemoryCheckoutExecutionStore();
    await inner.create({ ...seed });

    let executor: ReturnType<typeof createDurableCheckoutExecutor>;
    let raced = false;
    const phases: string[] = [];

    const store: CanonicalCheckoutExecutionStore = {
      authority: "canonical_checkout_transaction_v1",
      getForMember: (m, k) => inner.getForMember(m, k),
      claim: (id, v, p) => inner.claim(id, v, p),
      commitCaptured: (id, v) => inner.commitCaptured(id, v),
      commitCancelled: (id, v) => inner.commitCancelled(id, v),
      recordProvider: async (id, v, result) => {
        const saved = await inner.recordProvider(id, v, result);
        if (saved) phases.push(saved.phase);
        // The interleaving: a concurrent worker reads the row in the instant
        // between cancel()'s recordProvider and its re-claim.
        if (saved && saved.phase === "authorized" && !raced) {
          raced = true;
          money.push("<<concurrent run() enters here>>");
          await executor.run(seed.memberId, seed.requestKey);
        }
        return saved;
      },
    };

    const proof = (kind: "authorized" | "captured"): ProviderExecutionResult => ({
      kind,
      providerReference: "pi_X",
      memberId: seed.memberId,
      orderId: seed.orderId,
      amountCents: seed.amountCents,
      currency: "usd",
    });
    const payment: IdempotentCheckoutPaymentPort = {
      authority: "provider_verified_idempotent_execution_v1",
      authorize: async () => { money.push("authorize"); return proof("authorized"); },
      capture: async (r: CheckoutExecutionRecord) => { money.push(`CAPTURE ${r.providerReference}`); return proof("captured"); },
      reconcile: async () => { money.push("reconcile"); return proof("authorized"); },
      cancel: async () => { money.push("cancel"); return { kind: "cancelled", providerReference: "pi_X", capturedAmountCents: 0 }; },
    };

    executor = createDurableCheckoutExecutor(store, payment);
    const outcome = await executor.cancel(seed.memberId, seed.requestKey);
    const row = await inner.getForMember(seed.memberId, seed.requestKey);

    const service = createCheckoutContinuationService({
      store,
      provider: {} as DurablePaymentProvider,
      executor: { run: executor.run, cancel: async () => outcome, recover: executor.recover },
    });
    const seen = await service.cancel(seed.memberId, seed.requestKey);

    require("node:fs").writeFileSync("probe316-out.json", JSON.stringify({ money, phases, outcome, phase: row?.phase, reference: row?.providerReference, buyerSees: seen }, null, 2));
    console.log(JSON.stringify({ money, phases, outcome, phase: row?.phase, reference: row?.providerReference, buyerSees: seen }, null, 2));
    expect(true).toBe(true);
  });
});
