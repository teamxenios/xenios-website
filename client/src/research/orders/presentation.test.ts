import { describe, expect, it } from "vitest";
import {
  CANONICAL_ORDER_FULFILLMENT_STATES,
  CANONICAL_ORDER_PAYMENT_STATES,
  CANONICAL_ORDER_SOURCE_KINDS,
  type CanonicalOrderView,
} from "@shared/research/orders/canonical-order";
import {
  FULFILLMENT_STATE_META,
  PAYMENT_STATE_META,
  SOURCE_KIND_LABELS,
  formatCents,
  formatOrderDate,
  productSummary,
  supportReference,
} from "./presentation";

function view(overrides: Partial<CanonicalOrderView> = {}): CanonicalOrderView {
  return {
    orderNumber: "XO-ABCDEFGH12345678",
    placedAt: "2026-08-19T17:00:00.000Z",
    convertedAt: "2026-08-19T18:00:00.000Z",
    currency: "usd",
    lines: [
      { sku: "SKU-1", displayName: "Peptide A", quantity: 2, unitPriceCents: 5_000, lineTotalCents: 10_000 },
    ],
    subtotalCents: 10_000,
    shippingCents: 1_295,
    totalCents: 11_295,
    paymentState: "paid",
    fulfillmentState: "shipped",
    tracking: { trackingNumber: "1Z999", carrier: "UPS" },
    source: { kind: "early_access_placement", sourceRef: "XEA-1", requestRef: null, quoteRef: null },
    organizationRef: null,
    ...overrides,
  };
}

describe("canonical order presentation", () => {
  it("labels every state the contract can produce", () => {
    for (const state of CANONICAL_ORDER_PAYMENT_STATES) {
      expect(PAYMENT_STATE_META[state].label.length).toBeGreaterThan(0);
    }
    for (const state of CANONICAL_ORDER_FULFILLMENT_STATES) {
      expect(FULFILLMENT_STATE_META[state].label.length).toBeGreaterThan(0);
    }
    for (const kind of CANONICAL_ORDER_SOURCE_KINDS) {
      expect(SOURCE_KIND_LABELS[kind].length).toBeGreaterThan(0);
    }
  });

  it("never styles an awaiting payment as an error", () => {
    expect(PAYMENT_STATE_META.awaiting_payment.tone).not.toBe("danger");
    expect(FULFILLMENT_STATE_META.unfulfilled.tone).not.toBe("danger");
  });

  it("summarizes one product and several products differently", () => {
    expect(productSummary(view())).toBe("Peptide A ×2");
    expect(
      productSummary(
        view({
          lines: [
            { sku: "A", displayName: "Peptide A", quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
            { sku: "B", displayName: "Peptide B", quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
          ],
        }),
      ),
    ).toBe("Peptide A + 1 more");
  });

  it("formats money from integer cents", () => {
    expect(formatCents(11_295)).toBe("$112.95");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("returns an unparseable date unchanged rather than inventing one", () => {
    expect(formatOrderDate("not-a-date")).toBe("not-a-date");
  });

  it("uses the canonical order number as the support reference", () => {
    expect(supportReference(view())).toBe("XO-ABCDEFGH12345678");
  });
});
