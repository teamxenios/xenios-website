// Durable refund execution authority.
//
// A refund is a three-system transition: a persisted intent, a provider side
// effect, and an atomic local claim/order/ledger commit. This port makes those
// boundaries explicit. Production may advertise refunds only when the
// database-backed implementation is selected; the in-memory implementation is
// a deterministic test reference, never production authority.

import type { PaymentRefund } from "../providers/payment";

export const REFUND_PROVIDER_IDEMPOTENCY_RETENTION_MS = 20 * 60 * 60 * 1000;

export type RefundExecutionState =
  | "prepared"
  | "calling_provider"
  | "provider_succeeded"
  | "reconciliation_required"
  | "committed";

export interface RefundExecutionIntent {
  executionId: string;
  scope: string;
  claimId: string;
  orderId: string;
  adminId: string;
  paymentReference: string;
  amountCents: number;
  currency: "usd";
  createdAt: string;
}

export interface RefundExecutionRecord extends RefundExecutionIntent {
  state: RefundExecutionState;
  version: number;
  providerRefundReference: string | null;
  firstAttemptedAt: string | null;
  updatedAt: string;
  committedAt: string | null;
}

export interface DurableRefundExecutionStore {
  readonly authority: "durable_refund_execution_v1";
  /**
   * Proves the managed schema/RPC capability is present before any new money
   * operation is exposed. Configuration alone is never readiness.
   */
  preflight(): Promise<boolean>;
  getById(executionId: string): Promise<RefundExecutionRecord | null>;
  getByScope(scope: string): Promise<RefundExecutionRecord | null>;
  prepare(intent: RefundExecutionIntent): Promise<RefundExecutionRecord>;
  claim(executionId: string, expectedVersion: number, attemptedAt: Date): Promise<RefundExecutionRecord | null>;
  recordProvider(
    executionId: string,
    expectedVersion: number,
    refund: PaymentRefund,
  ): Promise<RefundExecutionRecord | null>;
  requireReconciliation(executionId: string, expectedVersion: number): Promise<RefundExecutionRecord | null>;
  /** Atomically commits execution + refund key + order + claim + order event. */
  commit(executionId: string, expectedVersion: number): Promise<RefundExecutionRecord | null>;
}

export class RefundExecutionConflict extends Error {
  constructor() {
    super("A refund idempotency key was reused for a different operation.");
    this.name = "RefundExecutionConflict";
  }
}

type TestClaim = {
  claimId: string;
  orderId: string;
  state: string;
  resolution: null | "refund" | "partial_refund" | "replacement" | "none";
  reviewedBy: string | null;
};
type TestOrder = {
  orderId: string;
  state: string;
  capturedAmountCents: number;
  refundedCents: number;
  lastAppliedIdempotencyKey?: string;
};

/** Test-only reference. Production readiness must never be derived from it. */
export function createInMemoryRefundExecutionStore(deps: {
  claims: { get(id: string): Promise<TestClaim | null>; save(claim: TestClaim): Promise<void> };
  orders: { get(id: string): Promise<TestOrder | null>; save(order: TestOrder): Promise<void> };
}): DurableRefundExecutionStore & { snapshot(): RefundExecutionRecord[] } {
  const rows = new Map<string, RefundExecutionRecord>();
  const byScope = new Map<string, string>();
  const clone = (row: RefundExecutionRecord): RefundExecutionRecord => ({ ...row });
  const matches = (row: RefundExecutionRecord, intent: RefundExecutionIntent) =>
    row.scope === intent.scope && row.claimId === intent.claimId && row.orderId === intent.orderId &&
    row.adminId === intent.adminId && row.paymentReference === intent.paymentReference &&
    row.amountCents === intent.amountCents && row.currency === intent.currency;
  return {
    authority: "durable_refund_execution_v1",
    async preflight() {
      return true;
    },
    async getById(executionId) {
      const row = rows.get(executionId);
      return row ? clone(row) : null;
    },
    async getByScope(scope) {
      const id = byScope.get(scope);
      return id ? clone(rows.get(id)!) : null;
    },
    async prepare(intent) {
      const existingId = byScope.get(intent.scope);
      if (existingId) {
        const existing = rows.get(existingId)!;
        if (!matches(existing, intent)) throw new RefundExecutionConflict();
        return clone(existing);
      }
      const row: RefundExecutionRecord = {
        ...intent,
        state: "prepared",
        version: 1,
        providerRefundReference: null,
        firstAttemptedAt: null,
        updatedAt: intent.createdAt,
        committedAt: null,
      };
      rows.set(row.executionId, row);
      byScope.set(row.scope, row.executionId);
      return clone(row);
    },
    async claim(executionId, expectedVersion, attemptedAt) {
      const row = rows.get(executionId);
      if (!row || row.version !== expectedVersion || row.state === "committed" || row.state === "provider_succeeded") return null;
      row.state = "calling_provider";
      row.firstAttemptedAt ??= attemptedAt.toISOString();
      row.updatedAt = attemptedAt.toISOString();
      row.version += 1;
      return clone(row);
    },
    async recordProvider(executionId, expectedVersion, refund) {
      const row = rows.get(executionId);
      if (!row || row.version !== expectedVersion || row.state === "committed") return null;
      if (refund.paymentReference !== row.paymentReference || refund.refundedAmountCents !== row.amountCents || refund.currency !== row.currency) {
        throw new RefundExecutionConflict();
      }
      row.state = "provider_succeeded";
      row.providerRefundReference = refund.providerReference;
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      return clone(row);
    },
    async requireReconciliation(executionId, expectedVersion) {
      const row = rows.get(executionId);
      if (!row || row.version !== expectedVersion || row.state === "committed") return null;
      row.state = "reconciliation_required";
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      return clone(row);
    },
    async commit(executionId, expectedVersion) {
      const row = rows.get(executionId);
      if (!row || row.version !== expectedVersion) return null;
      if (row.state === "committed") return clone(row);
      if (row.state !== "provider_succeeded" || !row.providerRefundReference) return null;
      const claim = await deps.claims.get(row.claimId);
      const order = await deps.orders.get(row.orderId);
      if (!claim || !order || claim.orderId !== row.orderId || claim.state !== "approved" ||
          order.refundedCents !== 0 || row.amountCents > order.capturedAmountCents) return null;
      order.state = "refunded";
      order.refundedCents += row.amountCents;
      order.lastAppliedIdempotencyKey = row.scope;
      claim.state = "resolved";
      claim.resolution = order.refundedCents >= order.capturedAmountCents ? "refund" : "partial_refund";
      claim.reviewedBy = row.adminId;
      await deps.orders.save(order);
      await deps.claims.save(claim);
      row.state = "committed";
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      row.committedAt = row.updatedAt;
      return clone(row);
    },
    snapshot: () => [...rows.values()].map(clone),
  };
}
