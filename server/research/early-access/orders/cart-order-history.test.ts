/**
 * Cart checkouts on the member order-history page, tested as an ownership
 * boundary — the same posture as member-order-history.test.ts. The interesting
 * cases are the silent-wrong ones: another customer's checkout, a weakly or
 * un-provenanced binding, a superseded duplicate, and money that would render
 * as $0.
 */

import { describe, expect, it } from "vitest";

import {
  SupabaseEarlyAccessCartOrderHistory,
  cartOrderDetail,
  cartOrderSummary,
  readCartHistoryEntry,
} from "./cart-order-history";
import {
  withEarlyAccessOrderHistory,
  type EarlyAccessOrderHistoryDependencies,
  type MemberOrdersService,
} from "./member-order-history";
import type { EarlyAccessPersistenceCall } from "../persistence/executor";

const KRIS = "9f1b1d2c-8a4e-4c31-9b77-1c2d3e4f5a6b";
const KRIS_REF = "eac_" + "a".repeat(32);
const STRANGER_REF = "eac_" + "c".repeat(32);

function cartRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    checkoutNumber: "XEC-0123456789ABCDEF",
    customerRef: KRIS_REF,
    paymentState: "payment_verified",
    placedAt: "2026-08-18T00:00:00.000Z",
    disposition: null,
    bindingProvenance: "verified_link",
    record: {
      invoice: {
        currency: "USD",
        subtotalCents: 59_700,
        discountCents: 11_940,
        shippingCents: 1_500,
        taxCents: 0,
        payableTotalCents: 49_260,
      },
      children: [
        {
          sku: "SKU-1",
          quantity: 3,
          payableCents: 47_760,
          // Supplier identity is present in the durable record, exactly as in
          // production. The projection must never carry it forward.
          supplierId: "supplier-secret",
          supplierSku: "SECRET-SKU",
        },
      ],
    },
    ...over,
  };
}

const emptyBase: MemberOrdersService = {
  async listForMember() {
    return [];
  },
  async getForMember() {
    return null;
  },
};

function historyDeps(rows: readonly unknown[]) {
  const asked: string[][] = [];
  const deps = {
    bindings: {
      async customerRefsFor(memberId: string) {
        return memberId === KRIS ? [KRIS_REF] : [];
      },
    },
    store: {
      async placementsForCustomers() {
        return [];
      },
    },
    cartOrders: {
      async checkoutsForCustomers(refs: readonly string[]) {
        asked.push([...refs]);
        return rows;
      },
    },
  } as unknown as EarlyAccessOrderHistoryDependencies;
  return { deps, asked };
}

describe("readCartHistoryEntry", () => {
  it("projects a valid row, reading no supplier and no attribution field", () => {
    const entry = readCartHistoryEntry(cartRow());
    expect(entry).toEqual({
      cartCheckoutNumber: "XEC-0123456789ABCDEF",
      customerRef: KRIS_REF,
      state: "payment_captured",
      placedAt: "2026-08-18T00:00:00.000Z",
      totalCents: 49_260,
      shippingCents: 1_500,
      lines: [{ sku: "SKU-1", displayName: "SKU-1", quantity: 3, lineTotalCents: 47_760 }],
    });
    // The projection carries no supplier identity anywhere in its shape.
    expect(JSON.stringify(entry)).not.toContain("supplier");
    expect(JSON.stringify(entry)).not.toContain("SECRET");
  });

  it("maps every payment state through the shared vocabulary", () => {
    expect(readCartHistoryEntry(cartRow({ paymentState: "awaiting_payment" }))?.state).toBe(
      "checkout_pending",
    );
    expect(readCartHistoryEntry(cartRow({ paymentState: "under_review" }))?.state).toBe(
      "manual_review",
    );
    expect(readCartHistoryEntry(cartRow({ paymentState: "payment_rejected" }))?.state).toBe(
      "exception",
    );
    expect(readCartHistoryEntry(cartRow({ paymentState: "something_new" }))).toBeNull();
  });

  it("excludes a weakly bound row, and treats ABSENT provenance as the weak one", () => {
    expect(readCartHistoryEntry(cartRow({ bindingProvenance: "email_entry" }))).toBeNull();
    expect(readCartHistoryEntry(cartRow({ bindingProvenance: null }))).toBeNull();
    const { bindingProvenance: _dropped, ...withoutProvenance } = cartRow();
    expect(readCartHistoryEntry(withoutProvenance)).toBeNull();
  });

  it("admits the founder checkout's named-admin attestation", () => {
    expect(readCartHistoryEntry(cartRow({ bindingProvenance: "admin_attested" }))).not.toBeNull();
  });

  it("excludes a superseded checkout: a duplicate must not read as a second charge", () => {
    expect(readCartHistoryEntry(cartRow({ disposition: "duplicate_superseded" }))).toBeNull();
  });

  it("NEVER renders $0: unprovable money drops the row, it does not default", () => {
    const noTotal = cartRow();
    delete (noTotal.record as Record<string, unknown> & { invoice: Record<string, unknown> })
      .invoice.payableTotalCents;
    expect(readCartHistoryEntry(noTotal)).toBeNull();

    const zeroTotal = cartRow();
    (zeroTotal.record as { invoice: Record<string, unknown> }).invoice.payableTotalCents = 0;
    expect(readCartHistoryEntry(zeroTotal)).toBeNull();

    const zeroLine = cartRow();
    (zeroLine.record as { children: Array<Record<string, unknown>> }).children[0].payableCents = 0;
    expect(readCartHistoryEntry(zeroLine)).toBeNull();
  });

  it("fails closed on shapes that are not the deployed row", () => {
    expect(readCartHistoryEntry(null)).toBeNull();
    expect(readCartHistoryEntry("row")).toBeNull();
    expect(readCartHistoryEntry(cartRow({ checkoutNumber: "not-a-checkout" }))).toBeNull();
    expect(readCartHistoryEntry(cartRow({ customerRef: "not-a-handle" }))).toBeNull();
    expect(readCartHistoryEntry(cartRow({ record: null }))).toBeNull();
    expect(readCartHistoryEntry(cartRow({ record: { children: [] } }))).toBeNull();
  });
});

describe("cart checkouts in the member order history", () => {
  it("lists the member's cart checkout as an ordinary order summary", async () => {
    const { deps, asked } = historyDeps([cartRow()]);
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    const orders = await service.listForMember(KRIS);
    expect(orders).toEqual([
      {
        orderId: "XEC-0123456789ABCDEF",
        state: "payment_captured",
        placedAt: "2026-08-18T00:00:00.000Z",
        totalCents: 49_260,
        payment: { amountDueCents: 49_260, amountCapturedCents: 49_260, amountRefundedCents: 0, currency: "USD" },
        shipmentsSource: "unavailable",
        shipments: [],
      },
    ]);
    // The durable read was asked for exactly this member's handles.
    expect(asked).toEqual([[KRIS_REF]]);
  });

  it("answers the detail through the same ownership path, lines and shipping included", async () => {
    const { deps } = historyDeps([cartRow()]);
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    const detail = await service.getForMember(KRIS, "XEC-0123456789ABCDEF");
    expect(detail).toEqual({
      orderId: "XEC-0123456789ABCDEF",
      state: "payment_captured",
      placedAt: "2026-08-18T00:00:00.000Z",
      totalCents: 49_260,
      payment: { amountDueCents: 49_260, amountCapturedCents: 49_260, amountRefundedCents: 0, currency: "USD" },
      shipmentsSource: "unavailable",
      shipments: [],
      lines: [{ sku: "SKU-1", displayName: "SKU-1", quantity: 3, lineTotalCents: 47_760 }],
      shippingCents: 1_500,
      storeCreditAppliedCents: 0,
      reviewReason: null,
    });
  });

  it("excludes another customer's checkout even when the RPC hands it back", async () => {
    const { deps } = historyDeps([cartRow({ customerRef: STRANGER_REF })]);
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    await expect(service.listForMember(KRIS)).resolves.toEqual([]);
    await expect(service.getForMember(KRIS, "XEC-0123456789ABCDEF")).resolves.toBeNull();
  });

  it("excludes a weakly bound checkout from the durable history", async () => {
    const { deps } = historyDeps([cartRow({ bindingProvenance: "email_entry" })]);
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    await expect(service.listForMember(KRIS)).resolves.toEqual([]);
  });

  it("drops a repeated checkout number: one order never renders as two charges", async () => {
    const { deps } = historyDeps([cartRow(), cartRow()]);
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    await expect(service.listForMember(KRIS)).resolves.toHaveLength(1);
  });

  it("without the port the cart section is structurally absent, not an empty claim", async () => {
    const deps = {
      bindings: {
        async customerRefsFor() {
          return [KRIS_REF];
        },
      },
      store: {
        async placementsForCustomers() {
          return [];
        },
      },
    } as unknown as EarlyAccessOrderHistoryDependencies;
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    await expect(service.listForMember(KRIS)).resolves.toEqual([]);
  });

  it("a WIRED port's failure propagates rather than rendering half a history", async () => {
    const deps = {
      bindings: {
        async customerRefsFor() {
          return [KRIS_REF];
        },
      },
      store: {
        async placementsForCustomers() {
          return [];
        },
      },
      cartOrders: {
        async checkoutsForCustomers() {
          throw new Error("early-access persistence call failed: research_early_access_cart_checkouts_for_customers");
        },
      },
    } as unknown as EarlyAccessOrderHistoryDependencies;
    const service = withEarlyAccessOrderHistory(emptyBase, deps);
    await expect(service.listForMember(KRIS)).rejects.toThrow(
      "research_early_access_cart_checkouts_for_customers",
    );
  });
});

describe("SupabaseEarlyAccessCartOrderHistory", () => {
  it("pins the candidate RPC name and argument shape byte for byte", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const port = new SupabaseEarlyAccessCartOrderHistory(async (call) => {
      calls.push(call);
      return [cartRow()];
    });
    await expect(port.checkoutsForCustomers([KRIS_REF])).resolves.toHaveLength(1);
    expect(calls).toEqual([
      {
        fn: "research_early_access_cart_checkouts_for_customers",
        args: { p_customer_refs: [KRIS_REF] },
      },
    ]);
  });

  it("answers an empty handle list locally: the database is never asked", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const port = new SupabaseEarlyAccessCartOrderHistory(async (call) => {
      calls.push(call);
      return [];
    });
    await expect(port.checkoutsForCustomers([])).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it("a non-array answer is a named failure, never an empty history", async () => {
    const port = new SupabaseEarlyAccessCartOrderHistory(async () => ({ rows: [] }));
    await expect(port.checkoutsForCustomers([KRIS_REF])).rejects.toThrow(
      "research_early_access_cart_checkouts_for_customers",
    );
  });
});

describe("cart projections", () => {
  it("summary and detail agree with each other and with the entry", () => {
    const entry = readCartHistoryEntry(cartRow());
    expect(entry).not.toBeNull();
    if (entry === null) return;
    const summary = cartOrderSummary(entry);
    const detail = cartOrderDetail(entry);
    expect(detail).toMatchObject(summary);
    expect(detail.lines).toEqual([...entry.lines]);
  });
});
