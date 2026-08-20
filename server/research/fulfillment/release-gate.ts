/**
 * Paid-order release boundary for supplier assignment.
 *
 * Rule: an unpaid order can never release to a supplier. The production
 * database enforces this with the `xenios.paid_order_boundary` trigger inside
 * reviewed RPCs; this port enforces the same rule at the service seam so no
 * composition root can assign work without paid evidence. The default gate is
 * fail-closed: without a wired evidence source every release is refused.
 */

export interface PaidOrderReleaseDecision {
  releasable: boolean;
  reason:
    | "PAID_ORDER_VERIFIED"
    | "ORDER_NOT_PAID"
    | "PAID_ORDER_EVIDENCE_UNAVAILABLE";
}

export interface PaidOrderReleaseGate {
  check(fulfillmentOrderId: string): Promise<PaidOrderReleaseDecision>;
}

/** Default gate: no evidence source means no release. */
export function createFailClosedPaidOrderReleaseGate(): PaidOrderReleaseGate {
  return {
    async check(): Promise<PaidOrderReleaseDecision> {
      return { releasable: false, reason: "PAID_ORDER_EVIDENCE_UNAVAILABLE" };
    },
  };
}

/**
 * Adapter over a caller-supplied paid-evidence lookup. The lookup must answer
 * from the canonical order/payment authority; a thrown error or a missing
 * record is treated as unpaid, never as paid.
 */
export function createPaidOrderReleaseGate(
  isPaid: (fulfillmentOrderId: string) => Promise<boolean>,
): PaidOrderReleaseGate {
  return {
    async check(fulfillmentOrderId: string): Promise<PaidOrderReleaseDecision> {
      try {
        const paid = await isPaid(fulfillmentOrderId);
        return paid
          ? { releasable: true, reason: "PAID_ORDER_VERIFIED" }
          : { releasable: false, reason: "ORDER_NOT_PAID" };
      } catch {
        return { releasable: false, reason: "PAID_ORDER_EVIDENCE_UNAVAILABLE" };
      }
    },
  };
}
