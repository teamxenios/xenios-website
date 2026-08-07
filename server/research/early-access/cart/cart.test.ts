import { describe, expect, it } from "vitest";
import type { EarlyAccessCartQuoteRequest } from "@shared/research/early-access-cart";
import { checkoutEarlyAccessCart } from "./checkout-service";
import { quoteEarlyAccessCart } from "./quote-service";
import { InMemoryEarlyAccessCartStore } from "./store";
import { purchasableSupplierIssues } from "./supplier-consistency";
import type { CartCatalogUnit } from "./ports";

const customer = { customerRef: "eac_0123456789abcdef0123456789abcdef" };
const units: CartCatalogUnit[] = [
  { productId: "PEX-001", variantId: "VAR-BPC5", displayName: "BPC-157 Research Material", strength: "5 mg", sku: "R360-BPC157-5MG-VIAL", purchasable: true, availability: "AVAILABLE", priceCents: 3350, currency: "USD", quantityLimit: 3, supplierReady: true },
  { productId: "PEX-010", variantId: "VAR-NAD1000", displayName: "NAD+ Research Material", strength: "1000 mg", sku: "R360-NAD-1000MG-VIAL", purchasable: true, availability: "AVAILABLE", priceCents: 10075, currency: "USD", quantityLimit: 3, supplierReady: true },
  { productId: "PEX-099", variantId: "VAR-HELD", displayName: "Held", strength: "10 mg", sku: "HELD", purchasable: false, availability: "TEMPORARILY_HELD", priceCents: null, currency: "USD", quantityLimit: 3, supplierReady: false },
];

function request(): EarlyAccessCartQuoteRequest {
  return {
    items: [
      { productId: "PEX-001", variantId: "VAR-BPC5", quantity: 3, expectedUnitPriceCents: 3350, expectedCurrency: "USD" },
      { productId: "PEX-010", variantId: "VAR-NAD1000", quantity: 1, expectedUnitPriceCents: 10075, expectedCurrency: "USD" },
    ],
    contact: { email: "buyer@example.com", phone: "+1 512 555 0100" },
    shipTo: { recipientName: "Samuel Boadu", line1: "1 Main", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" },
  };
}

function deps() {
  const store = new InMemoryEarlyAccessCartStore();
  return {
    store,
    quote: {
      catalog: { units: async () => units },
      releases: {
        decide: async ({ unit, quantity }: { unit: CartCatalogUnit; quantity: number }) => ({
          released: true as const,
          priceCents: unit.priceCents!,
          currency: "USD" as const,
          promotion: { promotionId: quantity === 3 ? "bundle" : null, version: quantity === 3 ? "v1" : null, label: quantity === 3 ? "Research Bundle" : null, discountCents: quantity === 3 ? Math.floor(unit.priceCents! * quantity * 0.2) : 0 },
        }),
      },
      suppliers: { forUnit: async (productId: string) => ({ supplierId: "supplier-renew360", supplierSku: `sku-${productId}` }) },
      shipping: { serves: async () => true, quote: async () => ({ currency: "USD" as const, shippingCents: 0 }) },
      agreements: { accepted: async () => true },
      quotes: store,
      now: () => Date.parse("2026-08-07T18:00:00.000Z"),
      quoteId: () => "xeaq_12345678901234567890",
    },
    checkout: {
      quotes: store,
      checkouts: store,
      audit: { record: async () => {} },
      now: () => Date.parse("2026-08-07T18:01:00.000Z"),
      checkoutNumber: () => "XEC-0123456789ABCDEF",
      childOrderNumber: (index: number) => `XEA-CART-01234567-${String(index + 1).padStart(2, "0")}`,
    },
  };
}

describe("Early Access cart", () => {
  it("quotes multiple products with server-authoritative aggregate money", async () => {
    const { quote } = deps();
    const result = await quoteEarlyAccessCart(quote, customer, request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines).toHaveLength(2);
    expect(result.quote.lines[0]?.discountCents).toBeGreaterThan(0);
    expect(result.quote.payableTotalCents).toBe(
      result.quote.subtotalCents - result.quote.discountCents + result.quote.shippingCents + result.quote.taxCents,
    );
  });

  it("refuses one held line and writes no quote", async () => {
    const { quote, store } = deps();
    const result = await quoteEarlyAccessCart(quote, customer, {
      ...request(),
      items: [{ productId: "PEX-099", variantId: "VAR-HELD", quantity: 1, expectedUnitPriceCents: 1, expectedCurrency: "USD" }],
    });
    expect(result).toMatchObject({ ok: false, code: "LINE_REFUSED" });
    expect(await store.get("xeaq_12345678901234567890")).toBeNull();
  });

  it("commits all child orders atomically and replays one cart checkout", async () => {
    const { quote, checkout } = deps();
    const quoted = await quoteEarlyAccessCart(quote, customer, request());
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const input = { quoteId: quoted.quote.quoteId, idempotencyKey: "xeac_12345678901234567890", expectedIntentHash: quoted.quote.intentHash };
    const placed = await checkoutEarlyAccessCart(checkout, customer, input);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.checkout.children).toHaveLength(2);
    expect(placed.checkout.invoice.lines).toHaveLength(2);
    const replay = await checkoutEarlyAccessCart(checkout, customer, input);
    expect(replay).toMatchObject({ ok: true, replayed: true });
  });

  it("rejects the same key with a different cart intent", async () => {
    const { quote, checkout } = deps();
    const first = await quoteEarlyAccessCart(quote, customer, request());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const input = { quoteId: first.quote.quoteId, idempotencyKey: "xeac_12345678901234567890", expectedIntentHash: first.quote.intentHash };
    await checkoutEarlyAccessCart(checkout, customer, input);
    const conflict = await checkoutEarlyAccessCart(checkout, customer, { ...input, expectedIntentHash: "f".repeat(64) });
    expect(conflict).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("finds a missing supplier route for a purchasable row", async () => {
    const issues = await purchasableSupplierIssues(units, { forUnit: async (_p, variant) => variant === "VAR-BPC5" ? null : { supplierId: "supplier", supplierSku: "sku" } });
    expect(issues).toContainEqual({ productId: "PEX-001", variantId: "VAR-BPC5", code: "SUPPLIER_ROUTE_MISSING" });
  });
});
