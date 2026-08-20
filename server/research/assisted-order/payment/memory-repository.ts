// In-memory AssistedOrderPaymentRepository, same role as the quote lane's
// memory-repository.ts: service tests and a future production-isolated demo.
// Never a production fallback — the composition root must refuse instead.
//
// Two refusals here are load-bearing rather than defensive, because they are
// the in-memory stand-ins for constraints the SQL implementation must carry:
//
// - `create` refuses a second payment for the same request, standing in for a
//   unique index on request_id. That is what makes "open" idempotent under a
//   double click rather than merely usually-idempotent.
// - `update` refuses when the stored revision is not the expected one, standing
//   in for an optimistic-concurrency WHERE clause. Two admins reviewing the same
//   payment collide instead of both winning.

import type {
  AssistedOrderPaymentRecord,
  AssistedOrderPaymentRepository,
} from "./ports";

export class InMemoryAssistedOrderPaymentRepository
  implements AssistedOrderPaymentRepository
{
  private readonly records = new Map<string, AssistedOrderPaymentRecord>();
  private readonly byRequestId = new Map<string, string>();

  public async create(record: AssistedOrderPaymentRecord): Promise<void> {
    if (this.records.has(record.paymentId)) {
      throw new Error(`Duplicate payment id: ${record.paymentId}`);
    }
    if (this.byRequestId.has(record.requestId)) {
      throw new Error(
        `Request ${record.requestId} already has an open payment.`,
      );
    }
    this.records.set(record.paymentId, record);
    this.byRequestId.set(record.requestId, record.paymentId);
  }

  public async byId(
    paymentId: string,
  ): Promise<AssistedOrderPaymentRecord | null> {
    return this.records.get(paymentId) ?? null;
  }

  public async byRequest(
    requestId: string,
  ): Promise<AssistedOrderPaymentRecord | null> {
    const paymentId = this.byRequestId.get(requestId);
    return paymentId ? (this.records.get(paymentId) ?? null) : null;
  }

  public async update(
    record: AssistedOrderPaymentRecord,
    expectedRevision: number,
  ): Promise<void> {
    const existing = this.records.get(record.paymentId);
    if (!existing) {
      throw new Error(`Unknown payment id: ${record.paymentId}`);
    }
    if (existing.revision !== expectedRevision) {
      throw new Error(`Lost update on payment ${record.paymentId}`);
    }
    this.records.set(record.paymentId, record);
  }
}
