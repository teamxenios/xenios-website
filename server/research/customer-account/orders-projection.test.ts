import { describe, expect, it } from "vitest";

import type {
  OrderDetailDto as CommerceOrderDetailDto,
  OrderSummaryDto as CommerceOrderSummaryDto,
} from "@shared/research/commerce-api";
import { createCommerceOrdersPort, type CommerceOrdersSource } from "./orders-projection";

function summary(overrides: Partial<CommerceOrderSummaryDto>): CommerceOrderSummaryDto {
  return {
    orderId: "XEA-0123456789ABCDEF",
    state: "payment_captured",
    placedAt: "2026-08-20T10:00:00.000Z",
    totalCents: 9900,
    shipments: [],
    ...overrides,
  };
}

function detail(overrides: Partial<CommerceOrderDetailDto>): CommerceOrderDetailDto {
  return {
    ...summary({}),
    lines: [{ sku: "sku-1", displayName: "NAD+ 1,000 mg", quantity: 2, lineTotalCents: 9900 }],
    shippingCents: 0,
    storeCreditAppliedCents: 0,
    reviewReason: null,
    ...overrides,
  };
}

function sourceOf(
  summaries: CommerceOrderSummaryDto[],
  details: Record<string, CommerceOrderDetailDto | null>,
): CommerceOrdersSource {
  return {
    listForMember: async () => summaries,
    getForMember: async (_memberId, orderId) => details[orderId] ?? null,
  };
}

describe("commerce orders projection", () => {
  it("labels a single-line order from its real detail line", async () => {
    const port = createCommerceOrdersPort(
      sourceOf([summary({})], { "XEA-0123456789ABCDEF": detail({}) }),
    );
    const orders = await port.ordersFor("member-1");
    expect(orders.research).toHaveLength(1);
    expect(orders.research[0].reference).toBe("XEA-0123456789ABCDEF");
    expect(orders.research[0].itemLabel).toBe("NAD+ 1,000 mg");
    expect(orders.research[0].quantity).toBe(2);
    expect(orders.research[0].paymentState).toBe("paid");
    expect(orders.research[0].fulfillmentState).toBe("unfulfilled");
    expect(orders.research[0].lotCoaAvailable).toBe(false);
    expect(orders.carePharmacy).toEqual([]);
  });

  it("summarizes a multi-line order without inventing a single product name", async () => {
    const port = createCommerceOrdersPort(
      sourceOf([summary({})], {
        "XEA-0123456789ABCDEF": detail({
          lines: [
            { sku: "a", displayName: "DSIP 10 mg", quantity: 1, lineTotalCents: 7000 },
            { sku: "b", displayName: "NAD+ 1,000 mg", quantity: 3, lineTotalCents: 30225 },
          ],
        }),
      }),
    );
    const orders = await port.ordersFor("member-1");
    expect(orders.research[0].itemLabel).toBe("2 items");
    expect(orders.research[0].quantity).toBe(4);
  });

  it("maps money-adjacent states conservatively: approved is NOT paid", async () => {
    const cases: Array<[CommerceOrderSummaryDto["state"], string, string]> = [
      ["checkout_pending", "awaiting_payment", "unfulfilled"],
      ["manual_review", "awaiting_payment", "unfulfilled"],
      ["approved", "awaiting_payment", "unfulfilled"],
      ["payment_captured", "paid", "unfulfilled"],
      ["processing", "paid", "processing"],
      ["fulfilled", "paid", "shipped"],
      ["delivered", "paid", "delivered"],
      ["cancelled", "awaiting_payment", "cancelled"],
      ["refunded", "paid", "cancelled"],
      ["exception", "awaiting_payment", "exception"],
    ];
    for (const [state, payment, fulfillment] of cases) {
      const id = `XO-${state}`;
      const port = createCommerceOrdersPort(
        sourceOf([summary({ orderId: id, state })], { [id]: detail({ orderId: id, state }) }),
      );
      const orders = await port.ordersFor("member-1");
      expect(orders.research[0].paymentState, state).toBe(payment);
      expect(orders.research[0].fulfillmentState, state).toBe(fulfillment);
    }
  });

  it("links tracking only for carriers with a known public URL shape", async () => {
    const id = "XO-tracked";
    const port = createCommerceOrdersPort(
      sourceOf(
        [
          summary({
            orderId: id,
            state: "fulfilled",
            shipments: [
              { owner: "xenios", status: "shipped", trackingNumber: "9400 1000", carrier: "USPS" },
            ],
          }),
        ],
        { [id]: detail({ orderId: id }) },
      ),
    );
    const orders = await port.ordersFor("member-1");
    expect(orders.research[0].trackingUrl).toContain("tools.usps.com");

    const unknown = "XO-unknown-carrier";
    const port2 = createCommerceOrdersPort(
      sourceOf(
        [
          summary({
            orderId: unknown,
            state: "fulfilled",
            shipments: [
              { owner: "mitch", status: "shipped", trackingNumber: "123", carrier: "pigeon-express" },
            ],
          }),
        ],
        { [unknown]: detail({ orderId: unknown }) },
      ),
    );
    expect((await port2.ordersFor("member-1")).research[0].trackingUrl).toBeNull();
  });

  it("fails the WHOLE read when a listed order's detail cannot be read", async () => {
    const port = createCommerceOrdersPort(sourceOf([summary({})], {}));
    await expect(port.ordersFor("member-1")).rejects.toThrow("order_detail_unavailable");
  });

  it("propagates a failed list read", async () => {
    const port = createCommerceOrdersPort({
      listForMember: async () => {
        throw new Error("orders_read_failed");
      },
      getForMember: async () => null,
    });
    await expect(port.ordersFor("member-1")).rejects.toThrow("orders_read_failed");
  });

  it("refuses an unrecognized row shape instead of rendering a guessed order", async () => {
    const port = createCommerceOrdersPort({
      listForMember: async () => [{ orderId: "XO-1", state: "not_a_state", placedAt: "x" }],
      getForMember: async () => null,
    });
    await expect(port.ordersFor("member-1")).rejects.toThrow("order_shape_unrecognized");
  });
});
