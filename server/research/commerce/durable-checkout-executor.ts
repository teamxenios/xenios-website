// Recovery-aware checkout coordinator.
//
// Origin: XENIOS_IMPLEMENTATION_20260908 package, server/research/commerce/durable-checkout-executor.ts,
// reformatted for the repository with no semantic change. It is NOT mounted by any
// route or composition root. The canonical persistence implementation must execute
// the store claims as transactions; no production adapter is fabricated here, and
// wiring an in-memory store in production is prohibited.
import type {
  CheckoutExecutionPhase,
  CheckoutExecutionRecord,
  ProviderExecutionResult,
} from "@shared/research/durable-checkout-execution";
import { exactPaymentEvidence } from "@shared/research/durable-checkout-execution";

export interface CanonicalCheckoutExecutionStore {
  readonly authority: "canonical_checkout_transaction_v1";
  getForMember(memberId: string, requestKey: string): Promise<CheckoutExecutionRecord | null>;
  /** Compare-and-swap ownership of the next effect; null when another worker moved first. */
  claim(executionId: string, expectedVersion: number, phase: CheckoutExecutionPhase): Promise<CheckoutExecutionRecord | null>;
  recordProvider(executionId: string, expectedVersion: number, result: ProviderExecutionResult): Promise<CheckoutExecutionRecord | null>;
  /** Atomically: canonical order/payment evidence, reservation finalize, credit debit, and outbox. */
  commitCaptured(executionId: string, expectedVersion: number): Promise<CheckoutExecutionRecord | null>;
  /** Release reservations/credit only after independently verified cancellation with no capture. */
  commitCancelled(executionId: string, expectedVersion: number): Promise<CheckoutExecutionRecord | null>;
}

export interface IdempotentCheckoutPaymentPort {
  readonly authority: "provider_verified_idempotent_execution_v1";
  authorize(record: CheckoutExecutionRecord): Promise<ProviderExecutionResult>;
  capture(record: CheckoutExecutionRecord): Promise<ProviderExecutionResult>;
  /** Must retrieve existing intent, not create a replacement with another key. */
  reconcile(record: CheckoutExecutionRecord): Promise<ProviderExecutionResult>;
  cancel(record: CheckoutExecutionRecord): Promise<ProviderExecutionResult>;
}

export type DurableExecutionOutcome = {
  kind: "committed" | "pending" | "action_required" | "reconciliation_required" | "cancelled" | "missing";
  orderId?: string;
  executionId?: string;
};

/** Executable recovery-aware coordinator. Never claim that this alone completes checkout composition. */
export function createDurableCheckoutExecutor(
  store: CanonicalCheckoutExecutionStore,
  payment: IdempotentCheckoutPaymentPort,
) {
  if (
    store.authority !== "canonical_checkout_transaction_v1" ||
    payment.authority !== "provider_verified_idempotent_execution_v1"
  ) {
    throw new Error("Qualified execution authority is required");
  }

  async function run(memberId: string, requestKey: string): Promise<DurableExecutionOutcome> {
    let r = await store.getForMember(memberId, requestKey);
    if (!r || r.memberId !== memberId) return { kind: "missing" };
    // Bounded state progression; future continuation is explicit, never an unbounded background money loop.
    for (let step = 0; step < 6; step++) {
      if (r.phase === "committed") return { kind: "committed", orderId: r.orderId, executionId: r.executionId };
      if (r.phase === "cancelled") return { kind: "cancelled", orderId: r.orderId, executionId: r.executionId };
      if (r.phase === "action_required") return { kind: "action_required", orderId: r.orderId, executionId: r.executionId };
      if (r.phase === "reconciliation_required") {
        return { kind: "reconciliation_required", orderId: r.orderId, executionId: r.executionId };
      }
      if (r.phase === "captured") {
        const saved = await store.commitCaptured(r.executionId, r.version);
        if (!saved) return { kind: "pending", orderId: r.orderId };
        r = saved;
        continue;
      }
      let proof: ProviderExecutionResult;
      let owned: CheckoutExecutionRecord | null;
      try {
        if (r.phase === "reserved") {
          owned = await store.claim(r.executionId, r.version, "authorizing");
          if (!owned) return { kind: "pending", orderId: r.orderId };
          r = owned;
          proof = await payment.authorize(r);
        } else if (r.phase === "authorized") {
          owned = await store.claim(r.executionId, r.version, "capturing");
          if (!owned) return { kind: "pending", orderId: r.orderId };
          r = owned;
          proof = await payment.capture(r);
        } else if (r.phase === "authorizing" || r.phase === "capturing") {
          // Another worker could still own an effect. Reconciliation reads existing provider truth only.
          proof = await payment.reconcile(r);
        } else {
          return { kind: "pending", orderId: r.orderId };
        }
      } catch {
        proof = { kind: "unknown" };
      }
      if (
        (proof.kind === "authorized" || proof.kind === "captured") &&
        (!exactPaymentEvidence(r, proof) || (r.providerReference !== null && proof.providerReference !== r.providerReference))
      ) {
        proof = { kind: "unknown" };
      }
      const saved = await store.recordProvider(r.executionId, r.version, proof);
      if (!saved) return { kind: "pending", orderId: r.orderId };
      r = saved;
      if (proof.kind === "unknown" || proof.kind === "refused") {
        return { kind: "reconciliation_required", orderId: r.orderId, executionId: r.executionId };
      }
    }
    return { kind: "pending", orderId: r.orderId, executionId: r.executionId };
  }

  return { run };
}
