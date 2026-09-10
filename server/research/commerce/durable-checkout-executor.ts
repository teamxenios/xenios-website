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
      if (r.phase === "cancelled") {
        // "Provider cancelled" is not "locally settled": the order must be
        // cancelled and the holds released exactly once, and a crash between
        // the two is resumed here on the next run.
        if (r.settledAt === null) {
          const settled = await store.commitCancelled(r.executionId, r.version);
          if (!settled) return { kind: "pending", orderId: r.orderId };
          r = settled;
          if (r.settledAt === null) return { kind: "pending", orderId: r.orderId, executionId: r.executionId };
        }
        return { kind: "cancelled", orderId: r.orderId, executionId: r.executionId };
      }
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

  /**
   * The buyer or an operator asks to cancel before capture. A payment that
   * the provider already captured cannot be cancelled here: the provider's
   * answer is recorded as truth and the execution proceeds to commit. An
   * execution that never reached the provider is cancelled without a
   * provider call. Local settlement (order cancelled, holds released) happens
   * in run() and is resumable after a crash.
   */
  async function cancel(memberId: string, requestKey: string): Promise<DurableExecutionOutcome> {
    const r = await store.getForMember(memberId, requestKey);
    if (!r || r.memberId !== memberId) return { kind: "missing" };
    // Every phase a cancellation can legitimately act from, including the two
    // in-flight ones. A worker can die after claiming `authorizing` or
    // `capturing` and before its request ever leaves, and both of those rows
    // are shown to the buyer as an unfinished payment with a Cancel button.
    // Falling through to run() from either would RECONCILE and then CAPTURE the
    // payment the buyer just asked to release: "the capture was already
    // decided" is false when nothing was ever sent. Each claim is a version
    // compare-and-swap, so a still-live worker simply loses its write and
    // answers pending; and if the capture really did land, the provider's
    // refusal to cancel resolves to a read-back that commits, so a captured
    // payment is still never reported as cancelled.
    //
    // `cancelling` is included so a cancellation whose own worker died is
    // RESUMABLE: claiming it again takes it over. Without that, run(), cancel()
    // and recover() all answered "pending" forever and the order, the holds and
    // any provider authorization were stranded.
    const cancellable: CheckoutExecutionPhase[] = ["reserved", "authorizing", "capturing", "authorized", "action_required", "reconciliation_required", "cancelling"];
    if (!cancellable.includes(r.phase)) return run(memberId, requestKey);
    let owned = await store.claim(r.executionId, r.version, "cancelling");
    if (!owned) return { kind: "pending", orderId: r.orderId };
    let proof: ProviderExecutionResult;
    let reference = owned.providerReference;
    if (reference === null && owned.authorizationAttemptedAt === null) {
      // No authorization was ever attempted, so no payment can exist. Cancelled
      // without a provider call.
      proof = { kind: "cancelled", providerReference: null, capturedAmountCents: 0 };
    } else if (reference === null) {
      // An attempt was made but no reference was learned: the creation response
      // may have been lost. Inside the provider's retention the port retrieves
      // the original payment by its key.
      let learned: ProviderExecutionResult;
      try {
        learned = await payment.reconcile(owned);
      } catch {
        learned = { kind: "unknown" };
      }
      if (learned.kind === "captured") {
        // The money is already taken. Record it and let run() commit; a
        // cancellation cannot undo an external capture.
        const recorded = await store.recordProvider(owned.executionId, owned.version, learned);
        if (!recorded) return { kind: "pending", orderId: r.orderId };
        return run(memberId, requestKey);
      }
      if (learned.kind === "authorized" || learned.kind === "action_required") {
        // Learn the reference but do NOT write an intermediate phase: recording
        // `authorized` here would leave the execution capturable for as long as
        // it took to re-claim, and a concurrent run() would capture the very
        // payment this call is releasing. The record stays in `cancelling`,
        // which run() will not advance, and the reference is carried on the
        // final proof instead (including an uncertain one).
        reference = learned.providerReference;
      } else if (learned.kind === "cancelled") {
        proof = { kind: "cancelled", providerReference: learned.providerReference, capturedAmountCents: 0 };
      } else {
        // A REFUSED replay says the replay call had no effect; it says NOTHING
        // about the original attempt whose response was lost. Declaring
        // "cancelled" here would release the holds and cancel the order while an
        // authorization may still stand at the provider. Stay uncertain.
        proof = { kind: "unknown" };
      }
    }
    if (reference !== null) {
      const bound = { ...owned, providerReference: reference };
      try {
        proof = await payment.cancel(bound);
      } catch {
        proof = { kind: "unknown" };
      }
      if (
        (proof.kind === "authorized" || proof.kind === "captured") &&
        (!exactPaymentEvidence(bound, proof) || proof.providerReference !== reference)
      ) {
        proof = { kind: "unknown" };
      }
      if (proof.kind === "cancelled" && proof.providerReference !== reference) proof = { kind: "unknown" };
      if (proof.kind === "action_required" && proof.providerReference !== reference) proof = { kind: "unknown" };
    }
    // A claimed cancellation may end in exactly two truths: the provider
    // released the payment, or it had already taken the money. ANY other answer
    // (still authorized, still awaiting the customer, uncertain, refused) leaves
    // the execution in `cancelling`, and nothing advances that phase to a
    // capture: not run(), which stops there, and not recover(), which resumes it
    // as a cancellation. So a buyer who asked to cancel can never be charged by
    // a later retry, status check or sweep. The next cancel() tries again.
    //
    // The cost is that a reference learned in THIS call is not persisted when
    // the cancel did not conclude. That is the right trade: recording it would
    // publish a phase an automatic path captures from. The next attempt
    // re-learns it by replay inside the provider's retention, or reads it back
    // when the row already carried it.
    if (proof!.kind !== "cancelled" && proof!.kind !== "captured") {
      return { kind: "pending", orderId: r.orderId, executionId: owned.executionId };
    }
    if (proof!.kind === "cancelled" && proof!.reason === undefined) proof = { ...proof!, reason: "customer" };
    const saved = await store.recordProvider(owned.executionId, owned.version, proof!);
    if (!saved) return { kind: "pending", orderId: r.orderId };
    return run(memberId, requestKey);
  }

  /**
   * One bounded reconciliation attempt for an execution parked in
   * reconciliation_required (a lost response, a refused read, a failed local
   * commit after capture). The record is claimed back into `authorizing`, the
   * phase whose only provider action is a read-back or a creation replay
   * inside the retention window, and run again: never a new authorization,
   * one provider read per call. Any other phase simply runs.
   */
  async function recover(memberId: string, requestKey: string): Promise<DurableExecutionOutcome> {
    const r = await store.getForMember(memberId, requestKey);
    if (!r || r.memberId !== memberId) return { kind: "missing" };
    // A cancellation whose worker died is resumed as a cancellation, not as a
    // payment: run() would leave it pending forever.
    if (r.phase === "cancelling") return cancel(memberId, requestKey);
    if (r.phase !== "reconciliation_required") return run(memberId, requestKey);
    const owned = await store.claim(r.executionId, r.version, "authorizing");
    if (!owned) return { kind: "pending", orderId: r.orderId };
    return run(memberId, requestKey);
  }

  return { run, cancel, recover };
}
