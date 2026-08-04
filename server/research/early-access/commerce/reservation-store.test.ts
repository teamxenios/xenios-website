import { describe, expect, it } from "vitest";

import {
  createEarlyAccessReservation,
  resolveExpiredReservation,
  type EarlyAccessReservation,
} from "./reservation";
import { InMemoryEarlyAccessReservationStore } from "./reservation-store";

const NOW = "2026-08-04T12:00:00.000Z";
const LATER = "2026-08-04T13:00:00.000Z";

function reservation(overrides: Partial<Record<string, string | number>> = {}): EarlyAccessReservation {
  const created = createEarlyAccessReservation({
    reservationId: (overrides.reservationId as string) ?? "res-0001",
    customerId: "cus_store",
    orderDraftId: (overrides.orderDraftId as string) ?? "draft-0001",
    productId: (overrides.productId as string) ?? "prod-clean",
    variantId: (overrides.variantId as string) ?? "var-10mg",
    quantity: 3,
    supplierConfirmationId: "supconf-0001",
    createdAt: NOW,
    expiresAt: LATER,
    createdByActorId: "Samuel Boadu",
    createdByActorRole: "founder",
    auditEventId: "audit-0001",
  });
  if (!created.ok) throw new Error(`fixture invalid: ${created.code}`);
  return created.value;
}

describe("InMemoryEarlyAccessReservationStore", () => {
  it("inserts once and refuses the same reservation id as a replay", async () => {
    const store = new InMemoryEarlyAccessReservationStore();
    expect(await store.insert(reservation())).toBe(true);
    expect(await store.insert(reservation())).toBe(false);
    expect(await store.byId("res-0001")).not.toBeNull();
  });

  it("refuses a second reservation for the same order draft", async () => {
    const store = new InMemoryEarlyAccessReservationStore();
    expect(await store.insert(reservation())).toBe(true);
    expect(
      await store.insert(reservation({ reservationId: "res-0002", orderDraftId: "draft-0001" })),
    ).toBe(false);
    const held = await store.byOrderDraft("draft-0001");
    expect(held?.reservationId).toBe("res-0001");
  });

  it("persists a pure-module transition and refuses one for a missing id", async () => {
    const store = new InMemoryEarlyAccessReservationStore();
    await store.insert(reservation());
    const resolved = resolveExpiredReservation({
      reservation: reservation(),
      paymentProofRef: null,
      payableTotalCents: 13_440,
      currency: "USD",
      exceptionId: "exc-0001",
      now: LATER,
    });
    expect(await store.update(resolved.reservation)).toBe(true);
    expect((await store.byId("res-0001"))?.status).toBe("expired");
    expect(await store.update({ ...resolved.reservation, reservationId: "res-none" })).toBe(false);
  });

  it("lists only active reservations for the exact unit", async () => {
    const store = new InMemoryEarlyAccessReservationStore();
    await store.insert(reservation());
    await store.insert(
      reservation({ reservationId: "res-0002", orderDraftId: "draft-0002", variantId: "var-5mg" }),
    );
    const expired = resolveExpiredReservation({
      reservation: reservation({ reservationId: "res-0003", orderDraftId: "draft-0003" }),
      paymentProofRef: null,
      payableTotalCents: 13_440,
      currency: "USD",
      exceptionId: "exc-0002",
      now: LATER,
    }).reservation;
    await store.insert(reservation({ reservationId: "res-0003", orderDraftId: "draft-0003" }));
    await store.update(expired);

    const active = await store.activeForUnit("prod-clean", "var-10mg");
    expect(active.map((entry) => entry.reservationId)).toEqual(["res-0001"]);
  });

  it("appends expiry exceptions once and never loses one", async () => {
    const store = new InMemoryEarlyAccessReservationStore();
    const resolved = resolveExpiredReservation({
      reservation: reservation(),
      paymentProofRef: "eaproof.deadbeef",
      payableTotalCents: 13_440,
      currency: "USD",
      exceptionId: "exc-0001",
      now: LATER,
    });
    expect(resolved.outcome).toBe("admin_exception_required");
    if (resolved.exception === null) throw new Error("exception expected");

    expect(await store.recordExpiryException(resolved.exception)).toBe(true);
    expect(await store.recordExpiryException(resolved.exception)).toBe(false);
    const all = await store.expiryExceptions();
    expect(all).toHaveLength(1);
    expect(all[0].requiresHumanDecision).toBe(true);
  });
});
