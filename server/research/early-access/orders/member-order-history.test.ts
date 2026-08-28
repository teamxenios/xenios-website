/**
 * The member order-history bridge, tested as an ownership boundary.
 *
 * The interesting cases here are not "does it list orders". They are the ones
 * where listing the WRONG orders would be silent: another member's order, an
 * order placed by someone who typed an email, an order that survives only in a
 * browser's sessionStorage, and a failed read that renders as "you have no
 * orders" to somebody who has just paid.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_CUSTOMER_REFS,
  earlyAccessOrderDetail,
  earlyAccessHistoryPaymentEvidence,
  earlyAccessOrderSummary,
  withEarlyAccessOrderHistory,
  type MemberOrdersService,
} from "./member-order-history";
import { readEarlyAccessRefundHistory } from "../commerce/refund";
import type { EarlyAccessPlacement } from "../routes/store";

const KRIS = "9f1b1d2c-8a4e-4c31-9b77-1c2d3e4f5a6b";
const STRANGER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const KRIS_REF = "eac_" + "a".repeat(32);
const KRIS_ALIAS = "eac_" + "b".repeat(32);
const STRANGER_REF = "eac_" + "c".repeat(32);

function refundRow(
  overrides: Partial<{
    orderId: string;
    sequence: number;
    amountCents: number;
    verifiedPaidCents: number;
    priorRefundedCents: number;
  }> = {},
): Record<string, unknown> {
  const orderId = overrides.orderId ?? "XEA-0000000000000001";
  const sequence = overrides.sequence ?? 1;
  return {
    refundId: `early-access-refund:${orderId}:${sequence}`,
    orderId,
    amountCents: overrides.amountCents ?? 1_000,
    currency: "USD",
    verifiedPaidCents: overrides.verifiedPaidCents ?? 9_000,
    priorRefundedCents: overrides.priorRefundedCents ?? 0,
    reason: "Synthetic test refund",
    actorId: "test-operator",
    actorRole: "founder_admin",
    refundedAt: `2026-08-${String(sequence + 1).padStart(2, "0")}T00:00:00.000Z`,
    sequence,
  };
}

function placement(over: Partial<EarlyAccessPlacement> = {}): EarlyAccessPlacement {
  return {
    orderNumber: "XEC-0000000000000000000000AA",
    customerRef: KRIS_REF,
    idempotencyKey: "idem-1",
    order: {
      idempotencyKey: "idem-1",
      order: {
        orderId: "XEC-0000000000000000000000AA",
        customerRef: KRIS_REF,
        status: "placed",
        currency: "USD",
        line: {
          productId: "p-1",
          variantId: "v-1",
          sku: "SKU-1",
          quantity: 2,
          unitPriceCents: 5000,
          lineTotalCents: 10000,
          currency: "USD",
          pricedAt: "2026-08-01T00:00:00.000Z",
        },
        orderTotalCents: 10000,
        priceVersion: "pv-1",
        placedAt: "2026-08-01T00:00:00.000Z",
      },
      releaseId: "rel-1",
      productVersion: "pv-1",
      promotion: { ruleId: "none", label: null, basisPoints: 0, version: "1" },
      money: {
        currency: "USD",
        subtotalCents: 10000,
        discountCents: 1000,
        payableTotalCents: 9000,
      },
    },
    invoice: {
      invoiceNumber: "INV-1",
      paymentReference: "PAY-1",
      issuedAt: "2026-08-01T00:00:00.000Z",
    },
    shipTo: {
      name: "Kristopher Lopez",
      line1: "1 Example St",
      city: "Houston",
      region: "TX",
      postalCode: "77002",
      country: "US",
    },
    supplier: { supplierId: "supplier-secret", supplierName: "SECRET SUPPLIER CO" },
    attribution: null,
    paymentState: "payment_verified",
    placedAt: "2026-08-01T00:00:00.000Z",
    bindingProvenance: "verified_link",
    ...over,
  } as unknown as EarlyAccessPlacement;
}

/** A base service that owns no orders, so every row seen came from Early Access. */
const emptyBase: MemberOrdersService = {
  async listForMember() {
    return [];
  },
  async getForMember() {
    return null;
  },
};

function deps(
  refsByMember: Record<string, readonly string[]>,
  placements: readonly EarlyAccessPlacement[],
) {
  const asked: string[][] = [];
  return {
    asked,
    deps: {
      bindings: {
        async customerRefsFor(memberId: string) {
          return refsByMember[memberId] ?? [];
        },
      },
      store: {
        async placementsForCustomers(refs: readonly string[]) {
          asked.push([...refs]);
          const wanted = new Set(refs);
          return placements.filter((p) => wanted.has(p.customerRef));
        },
      },
    },
  };
}

describe("a member sees their own Early Access orders", () => {
  it("carries exact constructed-source completeness with the decorated service", () => {
    const base: MemberOrdersService = {
      ...emptyBase,
      historySources: {
        commerce: { connected: true, complete: true },
        xea: { connected: false, complete: false },
        xec: { connected: false, complete: false },
        xrr: { connected: false, complete: false },
      },
    };
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, []);
    const service = withEarlyAccessOrderHistory(base, d);
    expect(service.historySources).toEqual({
      commerce: { connected: true, complete: true },
      xea: { connected: true, complete: true },
      xec: { connected: false, complete: false },
      xrr: { connected: false, complete: false },
    });
  });

  it("resolves one handle to that handle's orders", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [placement()]);
    const orders = await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS);
    expect(orders.map((o) => o.orderId)).toEqual(["XEC-0000000000000000000000AA"]);
  });

  it("unions a member's several handles without duplicating an order", async () => {
    // A member accumulates a handle per customer record, not per human, so an
    // order placed under an alias is still theirs.
    const second = placement({
      orderNumber: "XEC-0000000000000000000000BB",
      customerRef: KRIS_ALIAS,
      placedAt: "2026-08-02T00:00:00.000Z",
    });
    const { deps: d } = deps({ [KRIS]: [KRIS_REF, KRIS_ALIAS] }, [placement(), second]);
    const orders = await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS);
    expect(orders).toHaveLength(2);
    // Newest first, which is what a history page shows.
    expect(orders[0].orderId).toBe("XEC-0000000000000000000000BB");
  });

  it("recovers the same orders with no browser state involved", async () => {
    // The logout/login case. Nothing in this call path reads sessionStorage,
    // an order number, or any client-held value: the only input is the member
    // id the server derived from a verified token.
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [placement()]);
    const service = withEarlyAccessOrderHistory(emptyBase, d);
    const first = await service.listForMember(KRIS);
    const afterFreshLogin = await service.listForMember(KRIS);
    expect(afterFreshLogin).toEqual(first);
    expect(afterFreshLogin).toHaveLength(1);
  });

  it("keeps the base service's own orders alongside", async () => {
    const base: MemberOrdersService = {
      async listForMember() {
        return [
          {
            orderId: "ord-member-1",
            state: "fulfilled",
            placedAt: "2026-08-03T00:00:00.000Z",
            totalCents: 100,
            shipments: [],
          },
        ];
      },
      async getForMember() {
        return null;
      },
    };
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [placement()]);
    const orders = await withEarlyAccessOrderHistory(base, d).listForMember(KRIS);
    expect(orders.map((o) => o.orderId)).toEqual([
      "ord-member-1",
      "XEC-0000000000000000000000AA",
    ]);
  });
});

describe("nobody sees anybody else's orders", () => {
  it("refuses another member", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [placement()]);
    const orders = await withEarlyAccessOrderHistory(emptyBase, d).listForMember(STRANGER);
    expect(orders).toEqual([]);
  });

  it("refuses an anonymous caller", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [placement()]);
    const service = withEarlyAccessOrderHistory(emptyBase, d);
    expect(await service.listForMember("")).toEqual([]);
    expect(await service.listForMember("   ")).toEqual([]);
  });

  it("drops a placement the store returned that this member does not own", async () => {
    // The store is asked only for this member's handles. This proves the
    // SECOND check: a store that answers with more than it was asked for, by
    // defect or by tampering, still cannot widen what a member sees.
    const overreaching = {
      bindings: {
        async customerRefsFor() {
          return [KRIS_REF];
        },
      },
      store: {
        async placementsForCustomers() {
          return [placement(), placement({ customerRef: STRANGER_REF, orderNumber: "XEC-X" })];
        },
      },
    };
    const orders = await withEarlyAccessOrderHistory(emptyBase, overreaching).listForMember(KRIS);
    expect(orders.map((o) => o.orderId)).toEqual(["XEC-0000000000000000000000AA"]);
  });

  it("never lets a caller-supplied order id widen ownership", async () => {
    // The order id in the detail route is caller-controlled. It is matched
    // against orders already resolved from the member's own handles, so a
    // foreign id finds nothing rather than being looked up and then judged.
    const { deps: d, asked } = deps({ [KRIS]: [KRIS_REF] }, [
      placement(),
      placement({ customerRef: STRANGER_REF, orderNumber: "XEC-STRANGER" }),
    ]);
    const service = withEarlyAccessOrderHistory(emptyBase, d);
    expect(await service.getForMember(KRIS, "XEC-STRANGER")).toBeNull();
    // The store was asked about this member's handles only. It was never asked
    // about the order number the caller supplied.
    expect(asked).toEqual([[KRIS_REF]]);
  });

  it("answers a foreign order and a missing order identically", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [
      placement({ customerRef: STRANGER_REF, orderNumber: "XEC-STRANGER" }),
    ]);
    const service = withEarlyAccessOrderHistory(emptyBase, d);
    expect(await service.getForMember(KRIS, "XEC-STRANGER")).toBeNull();
    expect(await service.getForMember(KRIS, "XEC-DOES-NOT-EXIST")).toBeNull();
  });
});

describe("a weakly bound order never appears in a durable history", () => {
  it("excludes an order placed by typing an email", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [
      placement({ bindingProvenance: "email_entry" }),
    ]);
    expect(await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS)).toEqual([]);
  });

  it("treats an absent provenance as the weak one", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [
      placement({ bindingProvenance: undefined }),
    ]);
    expect(await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS)).toEqual([]);
  });

  it("admits a session-code order, matching the single-order read", async () => {
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [
      placement({ bindingProvenance: "session_code" }),
    ]);
    expect(await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS)).toHaveLength(1);
  });
});

describe("a failed read is never rendered as an empty history", () => {
  it("propagates a directory failure instead of returning no orders", async () => {
    const broken = {
      bindings: {
        async customerRefsFor(): Promise<readonly string[]> {
          throw new Error("bindings unavailable");
        },
      },
      store: {
        async placementsForCustomers() {
          return [];
        },
      },
    };
    await expect(
      withEarlyAccessOrderHistory(emptyBase, broken).listForMember(KRIS),
    ).rejects.toThrow(/unavailable/);
  });

  it("propagates a store failure instead of returning no orders", async () => {
    const broken = {
      bindings: {
        async customerRefsFor() {
          return [KRIS_REF];
        },
      },
      store: {
        async placementsForCustomers(): Promise<readonly EarlyAccessPlacement[]> {
          throw new Error("placements unavailable");
        },
      },
    };
    await expect(
      withEarlyAccessOrderHistory(emptyBase, broken).listForMember(KRIS),
    ).rejects.toThrow(/unavailable/);
  });

  it("does not ask the store at all when the member is bound to nothing", async () => {
    const { deps: d, asked } = deps({}, [placement()]);
    expect(await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS)).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("bounds the handles it will query", async () => {
    const many = Array.from({ length: MAX_HISTORY_CUSTOMER_REFS + 25 }, (_, i) =>
      "eac_" + String(i).padStart(32, "0"),
    );
    const { deps: d, asked } = deps({ [KRIS]: many }, []);
    await withEarlyAccessOrderHistory(emptyBase, d).listForMember(KRIS);
    expect(asked[0].length).toBe(MAX_HISTORY_CUSTOMER_REFS);
  });
});

describe("the projection carries no private fact", () => {
  it("emits no supplier, cost, margin or procurement field", async () => {
    const summary = earlyAccessOrderSummary(placement());
    const detail = earlyAccessOrderDetail(placement());
    for (const view of [summary, detail]) {
      const serialized = JSON.stringify(view).toLowerCase();
      for (const forbidden of [
        "supplier",
        "secret",
        "buycost",
        "buy_cost",
        "margin",
        "grossprofit",
        "rationale",
        "attribution",
        "sourcefile",
        "internalsku",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
    expect(Object.keys(summary).sort()).toEqual([
      "orderId",
      "payment",
      "placedAt",
      "recordKind",
      "shipments",
      "shipmentsSource",
      "state",
      "totalCents",
    ]);
  });

  it("shows the amount owed, not the pre-discount subtotal", async () => {
    // orderTotalCents is 10000 and is the merchandise subtotal; the customer
    // owes 9000. Showing the larger number reads as an overcharge.
    expect(earlyAccessOrderSummary(placement()).totalCents).toBe(9000);
  });

  it("maps every payment state to a truthful order state", () => {
    const state = (paymentState: string) =>
      earlyAccessOrderSummary(placement({ paymentState } as never)).state;
    expect(state("awaiting_payment")).toBe("checkout_pending");
    expect(state("under_review")).toBe("manual_review");
    expect(state("payment_verified")).toBe("payment_captured");
    // Not "cancelled": the order still exists and still needs a human.
    expect(state("payment_rejected")).toBe("exception");
    // An unknown state is surfaced as needing attention, never as fulfilled.
    expect(state("something_new")).toBe("exception");
  });

  it("names no product it was never given", () => {
    const detail = earlyAccessOrderDetail(placement());
    expect(detail.lines).toEqual([
      { sku: "SKU-1", displayName: "SKU-1", quantity: 2, lineTotalCents: 10000 },
    ]);
  });
});

describe("payment evidence comes from durable readers", () => {
  it("requires one continuous refund chain with stable order and verified-paid authority", () => {
    const first = refundRow();
    const second = refundRow({ sequence: 2, priorRefundedCents: 1_000 });
    expect(readEarlyAccessRefundHistory([first, second])).toHaveLength(2);

    const otherOrder = "XEA-0000000000000002";
    const invalidHistories: Array<[string, readonly unknown[]]> = [
      [
        "prior-refunded discontinuity",
        [first, refundRow({ sequence: 2, priorRefundedCents: 0 })],
      ],
      [
        "verified-paid authority changed",
        [
          first,
          refundRow({ sequence: 2, priorRefundedCents: 1_000, verifiedPaidCents: 10_000 }),
        ],
      ],
      [
        "order identity changed",
        [first, refundRow({ orderId: otherOrder, sequence: 2, priorRefundedCents: 1_000 })],
      ],
      [
        "cumulative refund exceeded verified paid",
        [
          refundRow({ amountCents: 8_000 }),
          refundRow({ sequence: 2, amountCents: 2_000, priorRefundedCents: 8_000 }),
        ],
      ],
    ];
    for (const [label, history] of invalidHistories) {
      expect(readEarlyAccessRefundHistory(history), label).toBeNull();
    }
  });

  it("uses settlement and a validated refund trail, never lifecycle synthesis", async () => {
    const p = placement();
    const calls: string[] = [];
    const d = {
      bindings: {
        async customerRefsFor() {
          return [KRIS_REF];
        },
      },
      store: {
        async placementsForCustomers() {
          return [p];
        },
        async settlement(orderNumber: string) {
          calls.push(`settlement:${orderNumber}`);
          return {
            orderNumber,
            ledgerEntry: { amountCents: 9_000, currency: "USD" },
          } as never;
        },
        async refunds(orderNumber: string) {
          calls.push(`refunds:${orderNumber}`);
          return [
            {
              refundId: `early-access-refund:${orderNumber}:1`,
              orderId: orderNumber,
              amountCents: 1_000,
              currency: "USD",
              verifiedPaidCents: 9_000,
              priorRefundedCents: 0,
              reason: "Synthetic test refund",
              actorId: "test-operator",
              actorRole: "founder_admin",
              refundedAt: "2026-08-02T00:00:00.000Z",
              sequence: 1,
            },
          ];
        },
      },
    } as unknown as Parameters<typeof earlyAccessHistoryPaymentEvidence>[0];
    await expect(earlyAccessHistoryPaymentEvidence(d, p)).resolves.toEqual({
      amountCapturedCents: 9_000,
      amountRefundedCents: 1_000,
    });
    expect(calls).toEqual([
      `settlement:${p.orderNumber}`,
      `refunds:${p.orderNumber}`,
    ]);
  });

  it("rejects refund evidence whose verified-paid authority conflicts with settlement", async () => {
    const p = placement();
    const d = {
      bindings: {
        async customerRefsFor() {
          return [KRIS_REF];
        },
      },
      store: {
        async placementsForCustomers() {
          return [p];
        },
        async settlement(orderNumber: string) {
          return {
            orderNumber,
            ledgerEntry: { amountCents: 9_000, currency: "USD" },
          } as never;
        },
        async refunds(orderNumber: string) {
          return [refundRow({ orderId: orderNumber, verifiedPaidCents: 10_000 })];
        },
      },
    } as unknown as Parameters<typeof earlyAccessHistoryPaymentEvidence>[0];
    await expect(earlyAccessHistoryPaymentEvidence(d, p)).resolves.toEqual({
      amountCapturedCents: 9_000,
      amountRefundedCents: null,
    });
  });

  it("missing readers yield null facts even when lifecycle says verified", async () => {
    const p = placement({ paymentState: "payment_verified" });
    const { deps: d } = deps({ [KRIS]: [KRIS_REF] }, [p]);
    await expect(earlyAccessHistoryPaymentEvidence(d, p)).resolves.toEqual({
      amountCapturedCents: null,
      amountRefundedCents: null,
    });
    expect(earlyAccessOrderSummary(p).payment).toMatchObject({
      amountCapturedCents: null,
      amountRefundedCents: null,
    });
  });
});
