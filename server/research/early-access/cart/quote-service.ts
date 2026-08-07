import type {
  EarlyAccessCartLineQuote,
  EarlyAccessCartLineRefusal,
  EarlyAccessCartQuote,
  EarlyAccessCartQuoteRequest,
  EarlyAccessCartQuoteResult,
} from "@shared/research/early-access-cart";
import {
  earlyAccessCartIntentHash,
  newCartQuoteId,
  normalizeCartContact,
  normalizeCartItems,
  normalizeCartShipping,
} from "./model";
import type {
  CartCatalogUnit,
  CartCustomer,
  EarlyAccessCartAgreementPort,
  EarlyAccessCartCatalogPort,
  EarlyAccessCartQuoteStore,
  EarlyAccessCartReleasePort,
  EarlyAccessCartShippingPort,
  EarlyAccessCartSupplierPort,
} from "./ports";

const SAFE_ID = /^[A-Za-z0-9:_./-]{2,200}$/;

export type EarlyAccessCartQuoteDeps = Readonly<{
  catalog: EarlyAccessCartCatalogPort;
  releases: EarlyAccessCartReleasePort;
  suppliers: EarlyAccessCartSupplierPort;
  shipping: EarlyAccessCartShippingPort;
  agreements: EarlyAccessCartAgreementPort;
  quotes: EarlyAccessCartQuoteStore;
  now: () => number;
  quoteId?: () => string;
  quoteTtlMs?: number;
}>;

function exactMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function oneUnit(
  units: readonly CartCatalogUnit[],
  productId: string,
  variantId: string,
): CartCatalogUnit | null {
  const matches = units.filter((unit) => unit.productId === productId && unit.variantId === variantId);
  return matches.length === 1 ? matches[0]! : null;
}

export async function quoteEarlyAccessCart(
  deps: EarlyAccessCartQuoteDeps,
  customer: CartCustomer,
  request: EarlyAccessCartQuoteRequest,
): Promise<EarlyAccessCartQuoteResult> {
  if (!SAFE_ID.test(customer.customerRef)) return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  const items = normalizeCartItems(request.items);
  const contact = normalizeCartContact(request.contact);
  const shipTo = normalizeCartShipping(request.shipTo);
  if (items === null || contact === null || shipTo === null) return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  if (!(await deps.agreements.accepted(customer.customerRef))) return Object.freeze({ ok: false as const, code: "AGREEMENT_REQUIRED" as const });

  const nowMs = deps.now();
  if (!Number.isFinite(nowMs) || nowMs <= 0) return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  const units = await deps.catalog.units(nowMs, customer);
  const refusals: EarlyAccessCartLineRefusal[] = [];
  const lines: EarlyAccessCartLineQuote[] = [];

  for (const item of items) {
    const unit = oneUnit(units, item.productId, item.variantId);
    if (unit === null) {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: "PRODUCT_NOT_FOUND" });
      continue;
    }
    if (!unit.purchasable || unit.availability === "TEMPORARILY_HELD") {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: "PRODUCT_HELD" });
      continue;
    }
    if (unit.quantityLimit !== null && item.quantity > unit.quantityLimit) {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: "QUANTITY_INVALID" });
      continue;
    }
    const release = await deps.releases.decide({ unit, quantity: item.quantity, nowMs });
    if (!release.released) {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: release.code });
      continue;
    }
    if (release.priceCents !== item.expectedUnitPriceCents || release.currency !== item.expectedCurrency) {
      refusals.push({
        productId: item.productId,
        variantId: item.variantId,
        code: "PRICE_CHANGED",
        currentUnitPriceCents: release.priceCents,
        currency: release.currency,
      });
      continue;
    }
    if (!unit.supplierReady) {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: "SUPPLIER_UNAVAILABLE" });
      continue;
    }
    const supplier = await deps.suppliers.forUnit(item.productId, item.variantId);
    if (supplier === null || !SAFE_ID.test(supplier.supplierId) || !SAFE_ID.test(supplier.supplierSku)) {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: "SUPPLIER_UNAVAILABLE" });
      continue;
    }
    const subtotalCents = release.priceCents * item.quantity;
    if (!exactMoney(subtotalCents) || !exactMoney(release.promotion.discountCents) || release.promotion.discountCents >= subtotalCents) {
      refusals.push({ productId: item.productId, variantId: item.variantId, code: "PRICE_CHANGED", currentUnitPriceCents: release.priceCents, currency: release.currency });
      continue;
    }
    const payableCents = subtotalCents - release.promotion.discountCents;
    lines.push(Object.freeze({
      productId: item.productId,
      variantId: item.variantId,
      displayName: unit.displayName,
      strength: unit.strength,
      sku: unit.sku,
      quantity: item.quantity,
      supplierId: supplier.supplierId,
      supplierSku: supplier.supplierSku,
      currency: release.currency,
      unitPriceCents: release.priceCents,
      subtotalCents,
      discountCents: release.promotion.discountCents,
      payableCents,
      promotionId: release.promotion.promotionId,
      promotionVersion: release.promotion.version,
      promotionLabel: release.promotion.label,
    }));
  }

  if (refusals.length > 0) return Object.freeze({ ok: false as const, code: "LINE_REFUSED" as const, lines: Object.freeze(refusals) });
  if (!(await deps.shipping.serves(shipTo))) {
    return Object.freeze({
      ok: false as const,
      code: "LINE_REFUSED" as const,
      lines: Object.freeze(items.map((item) => ({ productId: item.productId, variantId: item.variantId, code: "SHIPPING_UNAVAILABLE" as const }))),
    });
  }
  const shipping = await deps.shipping.quote(shipTo);
  if (shipping.currency !== "USD" || !exactMoney(shipping.shippingCents)) return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });

  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const discountCents = lines.reduce((sum, line) => sum + line.discountCents, 0);
  const taxCents = 0; // Tax remains a future server-owned provider decision.
  const payableTotalCents = subtotalCents - discountCents + shipping.shippingCents + taxCents;
  if (![subtotalCents, discountCents, payableTotalCents].every(exactMoney) || payableTotalCents <= 0) {
    return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  }

  const quotedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + (deps.quoteTtlMs ?? 10 * 60_000)).toISOString();
  const intentHash = earlyAccessCartIntentHash({ customerRef: customer.customerRef, items, contact, shipTo });
  const quote: EarlyAccessCartQuote = Object.freeze({
    quoteId: (deps.quoteId ?? newCartQuoteId)(),
    customerRef: customer.customerRef,
    currency: "USD",
    lines: Object.freeze(lines),
    subtotalCents,
    discountCents,
    shippingCents: shipping.shippingCents,
    taxCents,
    payableTotalCents,
    intentHash,
    quotedAt,
    expiresAt,
  });
  await deps.quotes.put(Object.freeze({ publicQuote: quote, contact, shipTo, items }));
  return Object.freeze({ ok: true as const, quote });
}
