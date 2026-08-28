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
    payment: {
      amountDueCents: 9900,
      amountCapturedCents: 9900,
      amountRefundedCents: 0,
      currency: "USD",
    },
    shipmentsSource: "connected",
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

async function projectOne(s: CommerceOrderSummaryDto, d?: Partial<CommerceOrderDetailDto>) {
  const port = createCommerceOrdersPort(
    sourceOf([s], { [s.orderId]: detail({ orderId: s.orderId, state: s.state, ...d }) }),
  );
  const orders = await port.ordersFor("member-1");
  return orders.research[0];
}

describe("commerce orders projection — labels come from real lines", () => {
  it("labels a single-line order from its real detail line", async () => {
    const row = await projectOne(summary({}));
    expect(row.reference).toBe("XEA-0123456789ABCDEF");
    expect(row.detailAvailability).toBe("available");
    expect(row.itemLabel).toBe("NAD+ 1,000 mg");
    expect(row.quantity).toBe(2);
    expect(row.paymentState).toBe("paid");
    expect(row.lotCoaAvailable).toBe(false);
  });

  it("summarizes a multi-line order without inventing a single product name", async () => {
    const row = await projectOne(summary({}), {
      lines: [
        { sku: "a", displayName: "DSIP 10 mg", quantity: 1, lineTotalCents: 7000 },
        { sku: "b", displayName: "NAD+ 1,000 mg", quantity: 3, lineTotalCents: 30225 },
      ],
    });
    expect(row.itemLabel).toBe("2 items");
    expect(row.quantity).toBe(4);
  });

  // P1-B repro: missing lines were fabricated into "Research order" qty 0.
  it("NEVER fabricates an order line: empty lines are an unavailable detail", async () => {
    const row = await projectOne(summary({}), { lines: [] });
    expect(row.detailAvailability).toBe("unavailable");
    expect(row.itemLabel).toBeNull();
    expect(row.quantity).toBeNull();
    expect(JSON.stringify(row)).not.toContain("Research order");
  });

  it("a listed order whose detail cannot be read fails the whole read closed", async () => {
    const s = summary({ orderId: "XO-unreadable" });
    const port = createCommerceOrdersPort(sourceOf([s], {}));
    await expect(port.ordersFor("member-1")).rejects.toThrow("order_detail_unavailable");
  });

  it("deduplicates a double-listed reference deterministically", async () => {
    const s = summary({});
    const port = createCommerceOrdersPort(
      sourceOf([s, { ...s }], { [s.orderId]: detail({}) }),
    );
    const orders = await port.ordersFor("member-1");
    expect(orders.research).toHaveLength(1);
  });
});

// P1-A: PAYMENT TRUTH FROM MONETARY FACTS. The reviewer's canonical mapping
// and every reproduction, verbatim.
describe("payment truth from money facts", () => {
  const money = (captured: number | null, refunded: number | null, due = 10_000) => ({
    amountDueCents: due,
    amountCapturedCents: captured,
    amountRefundedCents: refunded,
    currency: "USD" as const,
  });

  it("0 captured / 0 refunded → unpaid", async () => {
    const row = await projectOne(summary({ state: "checkout_pending", payment: money(0, 0) }));
    expect(row.paymentState).toBe("unpaid");
  });

  it("10,000 / 0 → paid", async () => {
    const row = await projectOne(summary({ payment: money(10_000, 0) }));
    expect(row.paymentState).toBe("paid");
  });

  it("REPRO: 10,000 captured / 1,000 refunded → partially_refunded, never refunded", async () => {
    const row = await projectOne(summary({ state: "refunded", payment: money(10_000, 1_000) }));
    expect(row.paymentState).toBe("partially_refunded");
  });

  it("10,000 / 10,000 → refunded", async () => {
    const row = await projectOne(summary({ state: "refunded", payment: money(10_000, 10_000) }));
    expect(row.paymentState).toBe("refunded");
  });

  it("10,000 / 12,000 → refunded (over-refund is still refunded, not partial)", async () => {
    const row = await projectOne(summary({ state: "refunded", payment: money(10_000, 12_000) }));
    expect(row.paymentState).toBe("refunded");
  });

  it("REPRO: payment_captured lifecycle with NO capture evidence → unknown, never paid", async () => {
    const row = await projectOne(summary({ state: "payment_captured", payment: money(null, 0) }));
    expect(row.paymentState).toBe("unknown");
  });

  it("refunded lifecycle with NO refund evidence → unknown, never refunded and never paid", async () => {
    const row = await projectOne(summary({ state: "refunded", payment: money(10_000, null) }));
    expect(row.paymentState).toBe("unknown");
  });

  it("a null capture in a provably pre-capture lifecycle is authoritative zero → unpaid", async () => {
    for (const state of ["draft", "checkout_pending", "payment_authorized", "manual_review", "approved"] as const) {
      const row = await projectOne(summary({ state, payment: money(null, 0) }));
      expect(row.paymentState, state).toBe("unpaid");
    }
  });

  it("malformed money → unknown", async () => {
    const row = await projectOne(
      summary({ payment: { amountDueCents: 9900, amountCapturedCents: "lots" as unknown as number, amountRefundedCents: 0, currency: "USD" } }),
    );
    expect(row.paymentState).toBe("unknown");
  });

  it("negative money → unknown", async () => {
    expect((await projectOne(summary({ payment: money(-1, 0) }))).paymentState).toBe("unknown");
    expect((await projectOne(summary({ payment: money(10_000, -5) }))).paymentState).toBe("unknown");
  });

  it("lifecycle/money contradictions → unknown", async () => {
    // Money moved in a pre-capture lifecycle.
    expect(
      (await projectOne(summary({ state: "draft", payment: money(5_000, 0) }))).paymentState,
    ).toBe("unknown");
    // Refunded lifecycle while the ledger recorded no refund.
    expect(
      (await projectOne(summary({ state: "refunded", payment: money(10_000, 0) }))).paymentState,
    ).toBe("unknown");
    // Refund with no capture behind it.
    expect(
      (await projectOne(summary({ state: "refunded", payment: money(0, 1_000) }))).paymentState,
    ).toBe("unknown");
  });

  it("a legacy row with no monetary fields at all → unknown, whatever the lifecycle says", async () => {
    for (const state of ["payment_captured", "refunded", "delivered", "exception", "cancelled"] as const) {
      const row = await projectOne(summary({ state, payment: null }));
      expect(row.paymentState, state).toBe("unknown");
    }
    const rowNoField = await projectOne(
      summary({ state: "payment_captured", payment: undefined }),
    );
    expect(rowNoField.paymentState).toBe("unknown");
  });

  it("exception/cancelled do not invent financial state: the money decides", async () => {
    expect(
      (await projectOne(summary({ state: "exception", payment: money(10_000, 0) }))).paymentState,
    ).toBe("paid");
    expect(
      (await projectOne(summary({ state: "cancelled", payment: money(0, 0) }))).paymentState,
    ).toBe("unpaid");
    expect(
      (await projectOne(summary({ state: "exception", payment: money(10_000, 2_500) }))).paymentState,
    ).toBe("partially_refunded");
  });
});

// P1-B: fulfillment requires a CONNECTED shipment source, then evidence.
describe("fulfillment truth", () => {
  it("an UNCONNECTED shipment source is unknown for every lifecycle — never unfulfilled", async () => {
    for (const state of ["checkout_pending", "payment_captured", "processing", "fulfilled", "delivered"] as const) {
      const row = await projectOne(summary({ state, shipmentsSource: "unavailable" }));
      expect(row.fulfillmentState, state).toBe("unknown");
    }
  });

  it("a connected source without evidence still refuses shipped/delivered claims", async () => {
    expect((await projectOne(summary({ state: "fulfilled" }))).fulfillmentState).toBe("unknown");
    expect((await projectOne(summary({ state: "delivered" }))).fulfillmentState).toBe("unknown");
    expect((await projectOne(summary({ state: "checkout_pending", payment: { amountDueCents: 9900, amountCapturedCents: 0, amountRefundedCents: 0, currency: "USD" } }))).fulfillmentState).toBe("unfulfilled");
  });

  it("shipped/delivered require durable shipment evidence; tracking needs a real carrier", async () => {
    const withEvidence = summary({
      orderId: "XO-evidenced",
      state: "fulfilled",
      shipments: [{ owner: "xenios", status: "shipped", trackingNumber: "1Z999EVIDENCE", carrier: "ups" }],
    });
    const row = await projectOne(withEvidence);
    expect(row.fulfillmentState).toBe("shipped");
    expect(row.trackingUrl).toContain("ups.com");

    const delivered = summary({
      orderId: "XO-delivered",
      state: "delivered",
      shipments: [{ owner: "xenios", status: "delivered", trackingNumber: null, carrier: null }],
    });
    const deliveredRow = await projectOne(delivered);
    expect(deliveredRow.fulfillmentState).toBe("delivered");
    expect(deliveredRow.trackingUrl).toBeNull();
  });
});

describe("history availability declaration", () => {
  it("defaults to the honest static truth: partial, XRR/XEC disconnected", async () => {
    const port = createCommerceOrdersPort(sourceOf([], {}));
    const orders = await port.ordersFor("member-1");
    expect(orders.history.availability).toBe("partial");
    expect(orders.history.sources.xrr.connected).toBe(false);
    expect(orders.history.sources.commerce.connected).toBe(true);
  });

  it("passes a declared availability through verbatim", async () => {
    const declared = {
      availability: "unavailable" as const,
      sources: {
        commerce: { connected: false, complete: false },
        xea: { connected: false, complete: false },
        xec: { connected: false, complete: false },
        xrr: { connected: false, complete: false },
      },
    };
    const port = createCommerceOrdersPort(sourceOf([], {}), declared);
    const orders = await port.ordersFor("member-1");
    expect(orders.history).toEqual(declared);
  });
});
