import { describe, expect, it } from "vitest";
import { cartCustomerPayloadIsClean } from "@shared/research/early-access-hardening";
import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import {
  EARLY_ACCESS_SHIPPING_EXPECTATION,
  customerCheckoutView,
  projectEarlyAccessCustomerCartStatus,
} from "./customer-status";

const checkout: EarlyAccessCartCheckoutRecord = {
  cartCheckoutNumber: "XEC-1234567890ABCDEF",
  customerRef: "eac_private",
  contact: { email: "customer@example.com", phone: null },
  shipTo: {
    recipientName: "Founder",
    line1: "1 Main St",
    line2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
  },
  idempotencyKey: "12345678-1234-4234-8234-123456789012",
  intentHash: "a".repeat(64),
  quoteId: "xeaq_123456789012345678901234",
  children: [
    {
      orderNumber: "XEA-CART-1234567890ABCDEF-01",
      productId: "product-1",
      variantId: "variant-1",
      sku: "EA-1",
      quantity: 1,
      supplierId: "supplier-secret",
      supplierSku: "wholesale-secret",
      unitPriceCents: 1200,
      subtotalCents: 1200,
      discountCents: 0,
      payableCents: 1200,
    },
  ],
  invoice: {
    invoiceNumber: "XEI-1234567890ABCDEF",
    cartCheckoutNumber: "XEC-1234567890ABCDEF",
    paymentReference: "XEACART-1234567890ABCDEF",
    currency: "USD",
    lines: [
      {
        orderNumber: "XEA-CART-1234567890ABCDEF-01",
        sku: "EA-1",
        quantity: 1,
        unitPriceCents: 1200,
        subtotalCents: 1200,
        discountCents: 0,
        payableCents: 1200,
      },
    ],
    subtotalCents: 1200,
    discountCents: 0,
    shippingCents: 0,
    taxCents: 0,
    payableTotalCents: 1200,
    instructions: "Use the exact reference.",
    issuedAt: "2026-08-09T00:00:00.000Z",
    status: "awaiting_payment",
  },
  paymentState: "payment_verified",
  placedAt: "2026-08-09T00:00:00.000Z",
  disposition: null,
  supersededBy: null,
  attribution: null,
};

function status(extra: Record<string, unknown> = {}): EarlyAccessCartStatus {
  return {
    checkout: checkout as unknown as EarlyAccessCartStatus["checkout"],
    payment: {
      state: "payment_verified",
      paid: true,
      externalProofCount: 1,
      paymentVerifiedAt: "2026-08-09T01:00:00.000Z",
    } as EarlyAccessCartStatus["payment"],
    receipt: null,
    fulfilment: {
      released: true,
      childOrders: [
        {
          releaseId: "xea-cart-release:XEA-CART-1234567890ABCDEF-01",
          cartCheckoutNumber: checkout.cartCheckoutNumber,
          orderNumber: checkout.children[0].orderNumber,
          supplierId: "supplier-secret",
          supplierSku: "wholesale-secret",
          quantity: 1,
          releasedAt: "2026-08-09T01:00:00.000Z",
          shippedAt: null,
          tracking: [],
        },
      ],
      paymentVerifiedAt: "2026-08-09T01:00:00.000Z",
      shipByAt: "2026-08-12T01:00:00.000Z",
      ...extra,
    } as EarlyAccessCartStatus["fulfilment"],
  };
}

describe("Early Access customer cart projections", () => {
  it("removes supplier and ownership metadata from the checkout", () => {
    const view = customerCheckoutView(checkout);
    expect(cartCustomerPayloadIsClean(view)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("supplier-secret");
    expect(JSON.stringify(view)).not.toContain("eac_private");
  });

  it("projects processing, exact DB timestamps, and the shipping-only promise", () => {
    const view = projectEarlyAccessCustomerCartStatus(
      status(),
      "2026-08-12T01:00:00.001Z",
    );
    expect(view.fulfilment.stage).toBe("processing");
    expect(view.fulfilment.paymentVerifiedAt).toBe("2026-08-09T01:00:00.000Z");
    expect(view.fulfilment.shipByAt).toBe("2026-08-12T01:00:00.000Z");
    expect(view.fulfilment.overdue).toBe(true);
    expect(view.shippingExpectation).toBe(EARLY_ACCESS_SHIPPING_EXPECTATION);
    expect(view.shippingExpectation.toLowerCase()).toContain(
      "expected to ship within 72 hours after payment verification",
    );
    expect(view.shippingExpectation.toLowerCase()).not.toContain("deliver");
    expect(cartCustomerPayloadIsClean(view)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("supplier-secret");
  });

  it("derives partial and complete shipment states and never leaves shipped overdue", () => {
    const shippedStatus = status();
    (shippedStatus.fulfilment.childOrders[0] as { shippedAt: string | null }).shippedAt =
      "2026-08-10T00:00:00.000Z";
    const shipped = projectEarlyAccessCustomerCartStatus(
      shippedStatus,
      "2026-08-13T00:00:00.000Z",
    );
    expect(shipped.fulfilment.stage).toBe("shipped");
    expect(shipped.fulfilment.overdue).toBe(false);
  });
});
