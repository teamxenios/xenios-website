import { describe, expect, it } from "vitest";

import { SupabaseEarlyAccessReservationStore } from "./reservation-store";
import { EarlyAccessPersistenceError, type EarlyAccessPersistenceCall } from "./executor";
import type {
  EarlyAccessReservation,
  EarlyAccessReservationExpiryException,
} from "../commerce/reservation";

const reservation = {
  reservationId: "res-1",
  customerId: "cust-1",
  orderDraftId: "draft-1",
  productId: "prod-1",
  variantId: "var-1",
  quantity: 2,
  supplierConfirmationId: "conf-1",
  createdAt: "2026-08-04T00:00:00.000Z",
  expiresAt: "2026-08-04T12:00:00.000Z",
  status: "active",
  createdByActorId: "samuel.abc123def456",
  createdByActorRole: "founder_admin",
  auditEventId: "audit-1",
} as unknown as EarlyAccessReservation;

const exception = {
  exceptionId: "exc-1",
  reservationId: "res-1",
  orderDraftId: "draft-1",
  customerId: "cust-1",
  productId: "prod-1",
  variantId: "var-1",
  quantity: 2,
  supplierConfirmationId: "conf-1",
  reservationExpiredAt: "2026-08-04T12:00:00.000Z",
  paymentProofRef: "eaproof." + "3".repeat(40),
  payableTotalCents: 20000,
  currency: "USD",
  raisedAt: "2026-08-04T13:00:00.000Z",
  requiresHumanDecision: true,
  notifyAdmin: true,
  notifyCustomer: true,
} as unknown as EarlyAccessReservationExpiryException;

type Script = Record<string, (call: EarlyAccessPersistenceCall) => unknown>;

function storeWith(script: Script, calls?: EarlyAccessPersistenceCall[]) {
  return new SupabaseEarlyAccessReservationStore(async (call) => {
    calls?.push(call);
    const handler = script[call.fn];
    if (!handler) throw new Error(`unscripted call: ${call.fn}`);
    return handler(call);
  });
}

describe("SupabaseEarlyAccessReservationStore", () => {
  it("insert answers true once and false on replay, never throwing for idempotence", async () => {
    let first = true;
    const store = storeWith({
      research_early_access_reservation_insert: () => {
        const answer = first;
        first = false;
        return answer;
      },
    });
    expect(await store.insert(reservation)).toBe(true);
    expect(await store.insert(reservation)).toBe(false);
  });

  it("anything but true from the insert RPC reads as not-inserted", async () => {
    const store = storeWith({ research_early_access_reservation_insert: () => "true" });
    expect(await store.insert(reservation)).toBe(false);
  });

  it("byId and byOrderDraft answer the record verbatim or null", async () => {
    const store = storeWith({
      research_early_access_reservation_by_id: (call) =>
        call.args.p_reservation_id === "res-1" ? reservation : null,
      research_early_access_reservation_by_draft: (call) =>
        call.args.p_order_draft_id === "draft-1" ? reservation : null,
    });
    expect(await store.byId("res-1")).toEqual(reservation);
    expect(await store.byId("res-2")).toBeNull();
    expect(await store.byOrderDraft("draft-1")).toEqual(reservation);
    expect(await store.byOrderDraft("draft-2")).toBeNull();
  });

  it("update passes the whole transitioned record and maps the existence boolean", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = storeWith(
      { research_early_access_reservation_update: () => true },
      calls,
    );
    const consumed = { ...reservation, status: "consumed" } as EarlyAccessReservation;
    expect(await store.update(consumed)).toBe(true);
    expect(calls[0]?.args.p_record).toEqual(consumed);

    const missing = storeWith({ research_early_access_reservation_update: () => false });
    expect(await missing.update(consumed)).toBe(false);
  });

  it("activeForUnit maps the stored-active array and freezes it", async () => {
    const store = storeWith({
      research_early_access_reservations_active_for_unit: (call) => {
        expect(call.args.p_product_id).toBe("prod-1");
        expect(call.args.p_variant_id).toBe("var-1");
        return [reservation];
      },
    });
    const active = await store.activeForUnit("prod-1", "var-1");
    expect(active).toHaveLength(1);
    expect(Object.isFrozen(active)).toBe(true);
    expect(Object.isFrozen(active[0])).toBe(true);
  });

  it("expiry exceptions append once, replay false, and read back oldest first", async () => {
    let recorded = false;
    const store = storeWith({
      research_early_access_reservation_record_expiry_exception: () => {
        const answer = !recorded;
        recorded = true;
        return answer;
      },
      research_early_access_reservation_expiry_exceptions: () => [exception],
    });
    expect(await store.recordExpiryException(exception)).toBe(true);
    expect(await store.recordExpiryException(exception)).toBe(false);
    const all = await store.expiryExceptions();
    expect(all).toHaveLength(1);
    expect(all[0]?.exceptionId).toBe("exc-1");
  });

  it("a driver rejection is the opaque persistence error naming only the function", async () => {
    const store = new SupabaseEarlyAccessReservationStore(async () => {
      throw new Error("postgres://user:secret@host/db exploded");
    });
    const failure = await store.byId("res-1").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EarlyAccessPersistenceError);
    expect(String(failure)).not.toContain("secret");
  });
});
