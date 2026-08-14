import { describe, expect, it } from "vitest";
import { createEarlyAccessShippingAlertSink } from "./shipping-sla-alerts";
import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";
import {
  EARLY_ACCESS_EMAIL_EVENTS,
  renderEarlyAccessOutboxEmail,
  safeEarlyAccessPayload,
} from "../notifications/communications";

const INPUT = Object.freeze({
  eventKey: "ea_cart_shipping_overdue:abc",
  cartCheckoutNumber: "XEC-0123456789ABCDEF",
  shipByAt: "2026-08-10T12:00:00.000Z",
  overdueAt: "2026-08-10T13:00:00.000Z",
});

describe("the overdue alert sink", () => {
  it("reports TRUE only when this call created the row", async () => {
    const sink = createEarlyAccessShippingAlertSink(async () => "inserted");
    expect(await sink.enqueue(INPUT)).toBe(true);
  });

  it("reports FALSE when the deterministic event already exists", async () => {
    // The port's contract, and the whole reason `enqueueNotificationOnce`
    // exists: `enqueueNotification` returns true for a duplicate, which would
    // make every repeated sweep claim a fresh alert it did not create.
    const sink = createEarlyAccessShippingAlertSink(async () => "already_queued");
    expect(await sink.enqueue(INPUT)).toBe(false);
  });

  it("THROWS when the queue is unavailable, so an outage is a failure and not a skip", async () => {
    const sink = createEarlyAccessShippingAlertSink(async () => "unavailable");
    await expect(sink.enqueue(INPUT)).rejects.toThrowError(/could not be queued/);
  });

  it("uses the caller's deterministic event key verbatim", async () => {
    const seen: string[] = [];
    const sink = createEarlyAccessShippingAlertSink(async (input) => {
      seen.push(input.eventKey);
      return "inserted";
    });
    await sink.enqueue(INPUT);
    expect(seen).toEqual([INPUT.eventKey]);
  });

  it("addresses the ONE fixed internal recipient, never a customer", async () => {
    const seen: string[] = [];
    const sink = createEarlyAccessShippingAlertSink(async (input) => {
      seen.push(input.recipient);
      return "inserted";
    });
    await sink.enqueue(INPUT);
    expect(seen).toEqual([EARLY_ACCESS_INTERNAL_RECIPIENT]);
    expect(EARLY_ACCESS_INTERNAL_RECIPIENT).toBe("research@xeniostechnology.com");
  });

  it("carries exactly three fields, whatever else a future caller passes", async () => {
    const payloads: unknown[] = [];
    const sink = createEarlyAccessShippingAlertSink(async (input) => {
      payloads.push(input.payload);
      return "inserted";
    });
    await sink.enqueue({
      ...INPUT,
      // Not part of the port, and deliberately impossible to smuggle through.
      customerEmail: "buyer@example.com",
      supplierId: "raw-peptides",
    } as never);
    expect(payloads[0]).toEqual({
      cartCheckoutNumber: INPUT.cartCheckoutNumber,
      shipByAt: INPUT.shipByAt,
      overdueAt: INPUT.overdueAt,
    });
  });
});

describe("the internal overdue template", () => {
  it("is registered, and registered LAST so no customer event's position moved", () => {
    expect(EARLY_ACCESS_EMAIL_EVENTS).toContain("ea_shipping_overdue_internal");
    expect(EARLY_ACCESS_EMAIL_EVENTS[EARLY_ACCESS_EMAIL_EVENTS.length - 1]).toBe(
      "ea_shipping_overdue_internal",
    );
    // The customer events keep their relative order and identity. The list is
    // consumed by name only (type source + membership check), so an insertion
    // is safe; ea_payment_rejected joined beside ea_payment_verified when the
    // review gained its second verb, and the original five kept their order.
    expect(EARLY_ACCESS_EMAIL_EVENTS.slice(0, 6)).toEqual([
      "ea_checkout_created",
      "ea_submitted_for_review",
      "ea_payment_verified",
      "ea_payment_rejected",
      "ea_order_released",
      "ea_tracking_posted",
    ]);
  });

  it("renders the order, both instants, and says plainly that it changed nothing", () => {
    const rendered = renderEarlyAccessOutboxEmail("ea_shipping_overdue_internal", {
      cartCheckoutNumber: INPUT.cartCheckoutNumber,
      shipByAt: INPUT.shipByAt,
      overdueAt: INPUT.overdueAt,
    });
    expect(rendered).not.toBeNull();
    expect(rendered?.subject).toContain("OVERDUE");
    expect(rendered?.subject).toContain(INPUT.cartCheckoutNumber);
    expect(rendered?.text).toContain(INPUT.shipByAt);
    expect(rendered?.text).toContain(INPUT.overdueAt);
    expect(rendered?.text).toContain(
      "Nothing has been settled, refunded, shipped or sent to the customer by it",
    );
  });

  it("greets nobody and links no customer order page", () => {
    const rendered = renderEarlyAccessOutboxEmail("ea_shipping_overdue_internal", {
      cartCheckoutNumber: INPUT.cartCheckoutNumber,
      shipByAt: INPUT.shipByAt,
      overdueAt: INPUT.overdueAt,
    });
    expect(rendered?.text).not.toMatch(/^Hello /m);
    expect(rendered?.text).not.toContain("/research/early-access");
  });

  it("its allowlist drops a customer name, an amount and a status link", () => {
    expect(
      safeEarlyAccessPayload("ea_shipping_overdue_internal", {
        cartCheckoutNumber: INPUT.cartCheckoutNumber,
        shipByAt: INPUT.shipByAt,
        overdueAt: INPUT.overdueAt,
        customerName: "A Buyer",
        amountDueDisplay: "$12.00",
        statusUrl: "https://xeniostechnology.com/research/early-access",
      }),
    ).toEqual({
      cartCheckoutNumber: INPUT.cartCheckoutNumber,
      shipByAt: INPUT.shipByAt,
      overdueAt: INPUT.overdueAt,
    });
  });
});
