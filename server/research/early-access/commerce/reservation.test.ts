import { describe, expect, it } from "vitest";

import {
  createEarlyAccessReservation,
  mayDisplayPaymentInstructions,
  reservationHoldsAt,
  resolveExpiredReservation,
  type EarlyAccessReservation,
} from "./reservation";

const CREATED_AT = "2026-08-04T12:00:00.000Z";
const EXPIRES_AT = "2026-08-04T12:30:00.000Z";
const INSIDE_WINDOW = "2026-08-04T12:29:59.000Z";
const AFTER_WINDOW = "2026-08-04T12:30:01.000Z";

function reservationInput(overrides: Record<string, unknown> = {}) {
  return {
    reservationId: "res-0001",
    customerId: "cust-alpha",
    orderDraftId: "draft-0001",
    productId: "prod-clean",
    variantId: "var-10mg",
    quantity: 3,
    supplierConfirmationId: "supconf-0001",
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    createdByActorId: "ops-samuel",
    createdByActorRole: "operations",
    auditEventId: "audit-0001",
    ...overrides,
  } as Parameters<typeof createEarlyAccessReservation>[0];
}

function heldReservation(): EarlyAccessReservation {
  const created = createEarlyAccessReservation(reservationInput());
  if (!created.ok) throw new Error(`fixture refused: ${created.code}`);
  return created.value;
}

describe("reservation before payment instructions", () => {
  it("holds supply, and says so, only inside its own window", () => {
    const reservation = heldReservation();
    expect(reservation.status).toBe("active");
    expect(reservationHoldsAt(reservation, INSIDE_WINDOW)).toBe(true);
    expect(reservationHoldsAt(reservation, AFTER_WINDOW)).toBe(false);
  });

  it("refuses to show payment instructions once the hold has lapsed", () => {
    // The whole point of the module. A customer may only be told how to pay
    // while supply is actually held for them.
    const reservation = heldReservation();
    expect(mayDisplayPaymentInstructions(reservation, INSIDE_WINDOW)).toBe(true);
    expect(mayDisplayPaymentInstructions(reservation, AFTER_WINDOW)).toBe(false);
  });

  it("derives expiry from the clock rather than trusting the stored status", () => {
    // A reservation that lapsed while no process was running is still lapsed the
    // instant anyone asks. A stored "expired" flag is only as true as the last
    // job that ran to set it, and the moment this matters is the moment nothing
    // has run.
    const stale = { ...heldReservation(), status: "active" as const };
    expect(stale.status).toBe("active");
    expect(reservationHoldsAt(stale, AFTER_WINDOW)).toBe(false);
  });

  it("requires a supplier confirmation, because a hold without one promises nothing", () => {
    const refused = createEarlyAccessReservation(reservationInput({ supplierConfirmationId: "" }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("supplier_confirmation_missing");
  });

  it("refuses a window that has already closed", () => {
    // Otherwise a caller can manufacture an already-expired hold and walk past it.
    const refused = createEarlyAccessReservation(
      reservationInput({ createdAt: EXPIRES_AT, expiresAt: CREATED_AT }),
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("window_invalid");
  });

  it("refuses a non-positive or fractional quantity", () => {
    for (const quantity of [0, -1, 2.5]) {
      const refused = createEarlyAccessReservation(reservationInput({ quantity }));
      expect(refused.ok, `quantity ${quantity} was accepted`).toBe(false);
    }
  });
});

describe("expiry rule 4: money received, reservation expired", () => {
  /**
   * THE CASE THAT MATTERS.
   *
   * A real person's money is in hand, supply is no longer confirmed, and there
   * is no safe automated action. Fulfilling could ship what cannot be supplied.
   * Refunding reverses a decision the customer made that nobody reviewed. So the
   * only correct behaviour is to stop, tell both parties, and wait for a named
   * human.
   *
   * This test exists to make either automated shortcut impossible to add
   * quietly.
   */
  it("raises an admin exception and takes no automated action", () => {
    const outcome = resolveExpiredReservation({
      reservation: heldReservation(),
      now: AFTER_WINDOW,
      paymentProofRef: "proof-0001",
      payableTotalCents: 13_440,
      currency: "USD",
      exceptionId: "exc-0001",
    });

    expect(outcome.outcome).toBe("admin_exception_required");

    // Neither shortcut was taken, asserted explicitly rather than inferred from
    // the absence of a side effect.
    expect(outcome.autoFulfilled).toBe(false);
    expect(outcome.autoCancelled).toBe(false);

    // The hold is gone. It is NOT quietly still active.
    expect(outcome.reservation.status).toBe("expired");

    const exception = outcome.exception;
    expect(exception).not.toBeNull();
    if (exception === null) return;

    // It carries the facts a human needs, and no decision.
    expect(exception.requiresHumanDecision).toBe(true);
    expect(exception.notifyAdmin).toBe(true);
    expect(exception.notifyCustomer).toBe(true);
    expect(exception.paymentProofRef).toBe("proof-0001");
    expect(exception.payableTotalCents).toBe(13_440);
    expect(exception.currency).toBe("USD");
    expect(exception.reservationId).toBe("res-0001");
    expect(exception.orderDraftId).toBe("draft-0001");
    expect(exception.supplierConfirmationId).toBe("supconf-0001");
    expect(exception.quantity).toBe(3);

    // There is deliberately no field that could resolve this automatically. If
    // one is ever added, this fails and the person adding it has to argue for it.
    const keys = Object.keys(exception).sort();
    expect(keys).not.toContain("resolution");
    expect(keys).not.toContain("refundIssued");
    expect(keys).not.toContain("fulfilled");
    expect(keys).not.toContain("autoResolve");
  });

  it("does not raise an exception when no money was ever sent", () => {
    // Nothing is at risk, so this is a re-confirmation and a retry, not an
    // incident. Raising an exception here would bury the real ones.
    const outcome = resolveExpiredReservation({
      reservation: heldReservation(),
      now: AFTER_WINDOW,
      paymentProofRef: null,
      payableTotalCents: 13_440,
      currency: "USD",
      exceptionId: "exc-0002",
    });

    expect(outcome.outcome).toBe("confirmation_required");
    expect(outcome.exception).toBeNull();
    expect(outcome.reservation.status).toBe("expired");
    // Still no cancellation: the customer's draft is untouched and they may
    // start again once supply is confirmed.
    expect(outcome.autoCancelled).toBe(false);
  });

  it("never fulfils and never cancels, under any combination of inputs", () => {
    // The two rules that must hold regardless of what else is true.
    for (const paymentProofRef of [null, "", "proof-0001"]) {
      const outcome = resolveExpiredReservation({
        reservation: heldReservation(),
        now: AFTER_WINDOW,
        paymentProofRef,
        payableTotalCents: 13_440,
        currency: "USD",
        exceptionId: "exc-0003",
      });
      expect(outcome.autoFulfilled, `fulfilled for proof "${paymentProofRef}"`).toBe(false);
      expect(outcome.autoCancelled, `cancelled for proof "${paymentProofRef}"`).toBe(false);
    }
  });

  it("treats an empty proof reference as no money, not as money", () => {
    // An empty string is the shape a missing value arrives in from a form. If it
    // were treated as proof, an exception would be raised for a customer who
    // never paid; if a real ref were treated as empty, money in hand would be
    // silently ignored. The second is far worse, so this pins the boundary.
    const outcome = resolveExpiredReservation({
      reservation: heldReservation(),
      now: AFTER_WINDOW,
      paymentProofRef: "",
      payableTotalCents: 13_440,
      currency: "USD",
      exceptionId: "exc-0004",
    });
    expect(outcome.outcome).toBe("confirmation_required");
    expect(outcome.exception).toBeNull();
  });
});
