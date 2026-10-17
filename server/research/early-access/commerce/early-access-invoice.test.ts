import { describe, expect, it } from "vitest";
import { createEarlyAccessOrder, type EarlyAccessOrder } from "./early-access-order";
import {
  EARLY_ACCESS_INVOICE_INSTRUCTIONS,
  EARLY_ACCESS_INVOICE_KEYS,
  buildInvoice,
  earlyAccessInvoiceNumberFor,
  readEarlyAccessInvoice,
} from "./early-access-invoice";

const NOW = "2026-08-04T12:00:00.000Z";
const PAYMENT_REFERENCE = "XEA-PAY-8F3K2Q";

function order(overrides: Record<string, unknown> = {}): EarlyAccessOrder {
  const result = createEarlyAccessOrder({
    orderId: "ord_ea_0001",
    customerRef: "cus_samuel",
    productId: "prd_bpc157",
    variantId: "var_5mg",
    sku: "XEA-BPC-5MG",
    quantity: 2,
    unitPriceCents: 12_450,
    unitPriceVersion: "prdver-9f2c1a",
    currency: "USD",
    now: NOW,
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return result.value;
}

/**
 * Vocabulary that would turn an invoice into a payment destination. None of it may
 * appear in the instructions a customer reads.
 */
const RECEIVING_DETAIL_TOKENS = [
  "@",
  "$",
  "account",
  "routing",
  "iban",
  "swift",
  "sort code",
  "qr",
  "wallet",
  "handle",
  "cashtag",
  "zelle",
  "venmo",
  "cash app",
  "paypal",
  "apple cash",
  "bank",
  "http",
  "://",
  ".com",
  "scan",
];

describe("early access invoice", () => {
  it("states the amount due, the currency, and the injected payment reference", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amountDueCents).toBe(24_900);
    expect(result.value.currency).toBe("USD");
    expect(result.value.paymentReference).toBe(PAYMENT_REFERENCE);
    expect(result.value.status).toBe("awaiting_payment");
    // No clock is read: the invoice is issued as of the order it invoices.
    expect(result.value.issuedAt).toBe(NOW);
  });

  it("derives one invoice number per order", () => {
    const first = buildInvoice(order(), PAYMENT_REFERENCE);
    const second = buildInvoice(order(), "XEA-PAY-OTHER1");
    expect(first.ok && first.value.invoiceNumber).toBe(earlyAccessInvoiceNumberFor("ord_ea_0001"));
    expect(second.ok && second.value.invoiceNumber).toBe(
      first.ok ? first.value.invoiceNumber : "different",
    );
    const other = buildInvoice(order({ orderId: "ord_ea_0002" }), PAYMENT_REFERENCE);
    expect(other.ok && other.value.invoiceNumber).not.toBe(
      first.ok ? first.value.invoiceNumber : "",
    );
  });

  it("carries no receiving details anywhere in the instructions", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const instructions = result.value.instructions.toLowerCase();
    for (const token of RECEIVING_DETAIL_TOKENS) {
      expect(instructions).not.toContain(token);
    }
    // No digits at all, so no account, routing, phone, or card fragment can hide here.
    expect(/\d/.test(result.value.instructions)).toBe(false);
    expect(result.value.instructions).toBe(EARLY_ACCESS_INVOICE_INSTRUCTIONS);
  });

  it("is method agnostic: no payment method appears on the invoice", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value).toLowerCase();
    for (const method of ["zelle", "venmo", "cash_app", "paypal", "apple_cash", "ach_wire"]) {
      expect(serialized).not.toContain(method);
    }
  });

  it("exposes exactly the reviewed key set, so a destination field cannot be added by accident", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([...EARLY_ACCESS_INVOICE_KEYS].sort());
  });

  it("refuses an order that is no longer awaiting payment", () => {
    const base = order();
    for (const status of ["payment_under_review", "payment_verified", "payment_rejected"]) {
      const result = buildInvoice({ ...base, status }, PAYMENT_REFERENCE);
      expect(result).toEqual({ ok: false, code: "order_not_payable" });
    }
  });

  it("refuses an invalid order snapshot", () => {
    expect(buildInvoice(null, PAYMENT_REFERENCE)).toEqual({ ok: false, code: "order_invalid" });
    expect(buildInvoice({ ...order(), orderTotalCents: 1 }, PAYMENT_REFERENCE)).toEqual({
      ok: false,
      code: "order_invalid",
    });
    expect(buildInvoice(new Proxy({ ...order() }, {}), PAYMENT_REFERENCE)).toEqual({
      ok: false,
      code: "order_invalid",
    });
  });

  it("refuses a malformed payment reference", () => {
    for (const reference of ["", "short", "has space", "ref@example.com", 12_345_678, null]) {
      const result = buildInvoice(order(), reference);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("payment_reference_invalid");
    }
  });

  it("freezes the invoice", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(() => {
      (result.value as unknown as Record<string, unknown>).amountDueCents = 1;
    }).toThrow();
  });
});

describe("readEarlyAccessInvoice", () => {
  it("round trips an invoice this module built", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    if (!result.ok) throw new Error("fixture invoice refused");
    expect(readEarlyAccessInvoice(JSON.parse(JSON.stringify(result.value)) as unknown)).toEqual(
      result.value,
    );
  });

  it("refuses a stored invoice whose instructions were substituted with a destination", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    if (!result.ok) throw new Error("fixture invoice refused");
    const tampered = {
      ...result.value,
      instructions: "Send payment to attacker@example.com via Zelle.",
    };
    expect(readEarlyAccessInvoice(tampered)).toBeNull();
  });

  it("refuses an invoice number that does not belong to its order, and an extra key", () => {
    const result = buildInvoice(order(), PAYMENT_REFERENCE);
    if (!result.ok) throw new Error("fixture invoice refused");
    expect(readEarlyAccessInvoice({ ...result.value, invoiceNumber: "XEA-INV-other" })).toBeNull();
    expect(
      readEarlyAccessInvoice({ ...result.value, payToHandle: "attacker@example.com" }),
    ).toBeNull();
  });
});
