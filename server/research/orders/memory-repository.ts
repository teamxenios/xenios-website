// An in-memory canonical order repository.
//
// This exists for tests and for a composition root that has no durable store
// wired yet. It enforces the SAME two invariants the durable implementation
// must enforce, because a repository that is laxer than production would let
// a test pass on a guarantee production does not make:
//
//   1. insert is once-only on the conversion key AND on the order number, and
//      a conflict returns the incumbent rather than throwing;
//   2. update refuses a lost update by comparing the stored revision.
//
// Records are deep-copied on the way in and on the way out, so a caller that
// mutates what it received cannot reach into stored state.

import type {
  CanonicalOrderInsert,
  CanonicalOrderRecord,
  CanonicalOrderRepository,
} from "./canonical-order";

function copy(record: CanonicalOrderRecord): CanonicalOrderRecord {
  return structuredClone(record);
}

export function createInMemoryCanonicalOrderRepository(): CanonicalOrderRepository & {
  /** Test affordance: every stored order, newest conversion last. */
  all(): CanonicalOrderRecord[];
} {
  const byNumber = new Map<string, CanonicalOrderRecord>();
  const byKey = new Map<string, string>();

  return {
    async insert(record: CanonicalOrderRecord): Promise<CanonicalOrderInsert> {
      const existingNumber = byKey.get(record.conversionKey);
      if (existingNumber !== undefined) {
        return { inserted: false, incumbent: copy(byNumber.get(existingNumber) as CanonicalOrderRecord) };
      }
      const collision = byNumber.get(record.orderNumber);
      if (collision !== undefined) {
        return { inserted: false, incumbent: copy(collision) };
      }
      byNumber.set(record.orderNumber, copy(record));
      byKey.set(record.conversionKey, record.orderNumber);
      return { inserted: true, order: copy(record) };
    },

    async byNumber(orderNumber: string): Promise<CanonicalOrderRecord | null> {
      const found = byNumber.get(orderNumber);
      return found === undefined ? null : copy(found);
    },

    async byConversionKey(conversionKey: string): Promise<CanonicalOrderRecord | null> {
      const number = byKey.get(conversionKey);
      if (number === undefined) return null;
      const found = byNumber.get(number);
      return found === undefined ? null : copy(found);
    },

    async listByCustomerRefs(customerRefs: readonly string[]): Promise<readonly CanonicalOrderRecord[]> {
      const wanted = new Set(customerRefs);
      return Array.from(byNumber.values())
        .filter((record) => wanted.has(record.customer.customerRef))
        .map(copy);
    },

    async update(record: CanonicalOrderRecord, expectedRevision: number) {
      const stored = byNumber.get(record.orderNumber);
      if (stored === undefined) return { ok: false as const, code: "NOT_FOUND" as const };
      if (stored.revision !== expectedRevision) {
        return { ok: false as const, code: "REVISION_STALE" as const };
      }
      byNumber.set(record.orderNumber, copy(record));
      return { ok: true as const };
    },

    all(): CanonicalOrderRecord[] {
      return Array.from(byNumber.values()).map(copy);
    },
  };
}
