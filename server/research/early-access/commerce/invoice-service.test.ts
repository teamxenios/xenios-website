import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "../release/founder-release";
import { EARLY_ACCESS_INVOICE_INSTRUCTIONS } from "./early-access-invoice";
import {
  EARLY_ACCESS_LINE_DESCRIPTION,
  InMemoryEarlyAccessInvoiceRepository,
  createEarlyAccessInvoice,
  earlyAccessPaymentReferenceFor,
  type EarlyAccessInvoiceServiceResult,
  type EarlyAccessReleaseInvoice,
} from "./invoice-service";
import {
  InMemoryEarlyAccessOrderRepository,
  createEarlyAccessOrder,
  type EarlyAccessReleaseOrder,
} from "./order-service";

const PRODUCT_ID = "prd_bpc157";
const VARIANT_ID = "var_5mg";
const NOW = "2026-08-04T12:00:00.000Z";
const LATER = "2026-08-06T09:30:00.000Z";
const RELEASE_PRICE_CENTS = 19_900;

/** The format `early-access-invoice.ts` enforces on a reference it will accept. */
const PAYMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;

const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(): EarlyAccessCatalogRow {
  return {
    productId: PRODUCT_ID,
    slug: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    variantId: VARIANT_ID,
    sku: "XEA-BPC-5MG",
    strength: "5 mg",
    presentation: "vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "unavailable",
    offerState: null,
    description: "Product information for this item is still being confirmed.",
    imageState: "none",
    quantityLimit: null,
    supplierReady: false,
    disputeStatus: { identity: "cleared", strength: "cleared" },
    purchasable: false,
    blockers: [...HELD_BLOCKERS],
  };
}

function release(): EarlyAccessRelease {
  const result = validateEarlyAccessRelease({
    releaseId: "rel_ea_0001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    productVersion: earlyAccessReleaseVersion(row()),
    status: "approved",
    approvedPriceCents: RELEASE_PRICE_CENTS,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder approved this exact unit for the private early access portal.",
    recordedAt: "2026-08-01T00:00:00.000Z",
  });
  if (!result.ok) throw new Error(`fixture release refused: ${result.code}`);
  return result.release;
}

async function order(quantity = 1): Promise<EarlyAccessReleaseOrder> {
  const result = await createEarlyAccessOrder({
    request: {
      idempotencyKey: `idem-ea-invoice-${quantity}-0001`,
      orderId: `ord_ea_000${quantity}`,
      customerRef: "cus_samuel",
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      quantity,
      now: NOW,
    },
    rows: [row()],
    releases: [release()],
    orders: new InMemoryEarlyAccessOrderRepository(),
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return result.value.record;
}

function issue(
  record: EarlyAccessReleaseOrder,
  options: { now?: string; invoices?: InMemoryEarlyAccessInvoiceRepository } = {},
): Promise<EarlyAccessInvoiceServiceResult> {
  return createEarlyAccessInvoice({
    order: record,
    now: options.now ?? NOW,
    invoices: options.invoices ?? new InMemoryEarlyAccessInvoiceRepository(),
  });
}

async function issued(
  record: EarlyAccessReleaseOrder,
  options: { now?: string; invoices?: InMemoryEarlyAccessInvoiceRepository } = {},
): Promise<EarlyAccessReleaseInvoice> {
  const result = await issue(record, options);
  if (!result.ok) throw new Error(`fixture invoice refused: ${result.code}`);
  return result.value.invoice;
}

describe("the invoice states the whole sale", () => {
  it("carries the line, the money, and the reference a customer quotes", async () => {
    const invoice = await issued(await order(1));

    expect(invoice.invoiceNumber).toBe("XEA-INV-ord_ea_0001");
    expect(invoice.orderId).toBe("ord_ea_0001");
    expect(invoice.customerRef).toBe("cus_samuel");
    expect(invoice.lines).toEqual([
      {
        description: EARLY_ACCESS_LINE_DESCRIPTION,
        sku: "XEA-BPC-5MG",
        quantity: 1,
        unitPriceCents: RELEASE_PRICE_CENTS,
        lineTotalCents: RELEASE_PRICE_CENTS,
      },
    ]);
    expect(invoice.subtotalCents).toBe(19_900);
    expect(invoice.discountCents).toBe(0);
    expect(invoice.discountLabel).toBeNull();
    expect(invoice.totalCents).toBe(19_900);
    expect(invoice.currency).toBe("USD");
    expect(invoice.status).toBe("awaiting_payment");
    expect(invoice.issuedAt).toBe(NOW);
    expect(invoice.instructions).toBe(EARLY_ACCESS_INVOICE_INSTRUCTIONS);
    expect(invoice.paymentReference).toBe("XEAPAY-ORD-EA-0001");
    expect(PAYMENT_REFERENCE.test(invoice.paymentReference)).toBe(true);
  });

  it("bills the discounted total, not the subtotal, on a bundle", async () => {
    const invoice = await issued(await order(3));
    expect(invoice.subtotalCents).toBe(59_700);
    expect(invoice.discountCents).toBe(11_940);
    expect(invoice.totalCents).toBe(47_760);
    expect(invoice.discountLabel).toBe("3-Unit Bundle");
    expect(invoice.subtotalCents - invoice.discountCents).toBe(invoice.totalCents);
    // The line still states the undiscounted arithmetic, so a customer can see
    // where the discount came from rather than being shown a rewritten unit price.
    expect(invoice.lines[0]?.unitPriceCents).toBe(RELEASE_PRICE_CENTS);
    expect(invoice.lines[0]?.lineTotalCents).toBe(59_700);
  });

  it("names no discount when there is none", async () => {
    const invoice = await issued(await order(2));
    expect(invoice.discountCents).toBe(0);
    expect(invoice.discountLabel).toBeNull();
    expect(invoice.totalCents).toBe(39_800);
  });

  it("derives a reference that the invoice module's format accepts", () => {
    for (const orderId of ["ord_ea_0001", "abc", "ORD.EA:0001", "o".repeat(128)]) {
      const reference = earlyAccessPaymentReferenceFor(orderId);
      expect(PAYMENT_REFERENCE.test(reference)).toBe(true);
      expect(reference.startsWith("XEAPAY-")).toBe(true);
    }
  });
});

describe("the invoice is deterministic", () => {
  it("produces the same invoice from the same order and instant", async () => {
    const record = await order(1);
    expect(await issued(record)).toEqual(await issued(record));
  });

  it("returns the invoice already issued instead of reissuing at a new instant", async () => {
    const invoices = new InMemoryEarlyAccessInvoiceRepository();
    const record = await order(1);

    const first = await issue(record, { invoices });
    const second = await issue(record, { invoices, now: LATER });

    expect(first.ok && first.value.replayed).toBe(false);
    expect(second.ok && second.value.replayed).toBe(true);
    if (!first.ok || !second.ok) throw new Error("both issues must succeed");
    expect(second.value.invoice).toEqual(first.value.invoice);
    expect(second.value.invoice.issuedAt).toBe(NOW);
  });

  it("answers with the incumbent when a concurrent write issued first", async () => {
    const inner = new InMemoryEarlyAccessInvoiceRepository();
    const record = await order(1);
    const winner = await issued(record, { invoices: inner });

    const racing = {
      findByOrderId: async () => null,
      insert: (invoice: EarlyAccessReleaseInvoice) => inner.insert(invoice),
    };
    const result = await createEarlyAccessInvoice({ order: record, now: LATER, invoices: racing });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replayed).toBe(true);
    expect(result.value.invoice).toEqual(winner);
  });
});

describe("the invoice fails closed", () => {
  it("refuses an order that is not a readable snapshot", async () => {
    const record = await order(1);
    for (const broken of [null, undefined, 42, { order: null }, { ...record, order: {} }]) {
      const result = await createEarlyAccessInvoice({
        order: broken as unknown as EarlyAccessReleaseOrder,
        now: NOW,
        invoices: new InMemoryEarlyAccessInvoiceRepository(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("order_invalid");
    }
  });

  it("refuses an order that has moved past awaiting payment", async () => {
    const record = await order(1);
    const verified = {
      ...record,
      order: { ...record.order, status: "payment_verified" as const },
    };
    const result = await issue(verified);
    expect(result).toEqual({ ok: false, code: "order_not_payable" });
  });

  it("refuses an instant that is not a canonical timestamp", async () => {
    const record = await order(1);
    const result = await issue(record, { now: "2026-08-04" });
    expect(result).toEqual({ ok: false, code: "timestamp_invalid" });
  });

  it("refuses an invoice issued before the order it bills", async () => {
    const record = await order(1);
    const result = await issue(record, { now: "2026-08-03T23:59:59.999Z" });
    expect(result).toEqual({ ok: false, code: "issued_before_order" });
  });

  it("refuses a record whose stored money disagrees with its own line", async () => {
    const record = await order(3);
    // Every tamper is on the order's money snapshot, which is the only statement of
    // the money now. The service cross checks it against the order and against the line.
    const tampered = [
      { ...record, money: { ...record.money, subtotalCents: 59_600 } },
      { ...record, money: { ...record.money, payableTotalCents: 1 } },
      { ...record, money: { ...record.money, discountCents: 0 } },
      { ...record, money: { ...record.money, discountCents: 59_700, payableTotalCents: 0 } },
    ] as unknown as EarlyAccessReleaseOrder[];
    for (const broken of tampered) {
      const result = await issue(broken);
      expect(result).toEqual({ ok: false, code: "totals_disagree" });
    }
  });

  it("stores nothing when the invoice is refused", async () => {
    const invoices = new InMemoryEarlyAccessInvoiceRepository();
    const record = await order(1);
    await issue(
      { ...record, money: { ...record.money, subtotalCents: 1 } } as unknown as EarlyAccessReleaseOrder,
      { invoices },
    );
    expect(await invoices.findByOrderId(record.order.orderId)).toBeNull();
  });
});
