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
  quoteHash,
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
const MAX_CART_MONEY_CENTS = 100_000_000;

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
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_CART_MONEY_CENTS
  );
}

function oneUnit(
  units: readonly CartCatalogUnit[],
  productId: string,
  variantId: string,
): CartCatalogUnit | null {
  const matches = units.filter(
    (unit) => unit.productId === productId && unit.variantId === variantId,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function lineRefusal(
  item: Readonly<{ productId: string; variantId: string }>,
  code: EarlyAccessCartLineRefusal["code"],
  detail: Partial<Pick<EarlyAccessCartLineRefusal, "currentUnitPriceCents" | "currency">> = {},
): EarlyAccessCartLineRefusal {
  return Object.freeze({ productId: item.productId, variantId: item.variantId, code, ...detail });
}

export async function quoteEarlyAccessCart(
  deps: EarlyAccessCartQuoteDeps,
  customer: CartCustomer,
  request: EarlyAccessCartQuoteRequest,
): Promise<EarlyAccessCartQuoteResult> {
  if (!SAFE_ID.test(customer.customerRef)) {
    return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  }
  const items = normalizeCartItems(request.items);
  const contact = normalizeCartContact(request.contact);
  const shipTo = normalizeCartShipping(request.shipTo);
  if (items === null || contact === null || shipTo === null) {
    return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  }
  if (!(await deps.agreements.accepted(customer.customerRef))) {
    return Object.freeze({ ok: false as const, code: "AGREEMENT_REQUIRED" as const });
  }

  const nowMs = deps.now();
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    return Object.freeze({ ok: false as const, code: "UNAVAILABLE" as const });
  }

  const units = await deps.catalog.units(nowMs, customer);
  const refusals: EarlyAccessCartLineRefusal[] = [];
  const lines: EarlyAccessCartLineQuote[] = [];

  for (const item of items) {
    const unit = oneUnit(units, item.productId, item.variantId);
    if (unit === null) {
      refusals.push(lineRefusal(item, "PRODUCT_NOT_FOUND"));
      continue;
    }
    if (!unit.purchasable || unit.availability === "TEMPORARILY_HELD") {
      refusals.push(lineRefusal(item, "PRODUCT_HELD"));
      continue;
    }
    if (unit.quantityLimit !== null && item.quantity > unit.quantityLimit) {
      refusals.push(lineRefusal(item, "QUANTITY_INVALID"));
      continue;
    }

    const release = await deps.releases.decide({ unit, quantity: item.quantity, nowMs, customer });
    if (!release.released) {
      refusals.push(lineRefusal(item, release.code));
      continue;
    }
    if (
      release.priceCents !== item.expectedUnitPriceCents ||
      release.currency !== item.expectedCurrency
    ) {
      refusals.push(
        lineRefusal(item, "PRICE_CHANGED", {
          currentUnitPriceCents: release.priceCents,
          currency: release.currency,
        }),
      );
      continue;
    }
    if (!unit.supplierReady) {
      refusals.push(lineRefusal(item, "SUPPLIER_UNAVAILABLE"));
      continue;
    }
    const supplier = await deps.suppliers.forUnit(item.productId, item.variantId);
    if (
      supplier === null ||
      !SAFE_ID.test(supplier.supplierId) ||
      !SAFE_ID.test(supplier.supplierSku)
    ) {
      refusals.push(lineRefusal(item, "SUPPLIER_UNAVAILABLE"));
      continue;
    }

    const subtotalCents = release.priceCents * item.quantity;
    if (
      !exactMoney(subtotalCents) ||
      !exactMoney(release.promotion.discountCents) ||
      release.promotion.discountCents >= subtotalCents
    ) {
      refusals.push(
        lineRefusal(item, "PRICE_CHANGED", {
          currentUnitPriceCents: release.priceCents,
          currency: release.currency,
        }),
      );
      continue;
    }
    const payableCents = subtotalCents - release.promotion.discountCents;
    if (!exactMoney(payableCents) || payableCents <= 0) {
      refusals.push(lineRefusal(item, "PRICE_CHANGED"));
      continue;
    }

    lines.push(
      Object.freeze({
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
      }),
    );
  }

  if (refusals.length > 0) {
    return Object.freeze({
      ok: false as const,
      code: "LINE_REFUSED" as const,
      lines: Object.freeze(refusals),
    });
  }

  if (!(await deps.shipping.serves(shipTo))) {
    return Object.freeze({
      ok: false as const,
      code: "LINE_REFUSED" as const,
      lines: Object.freeze(
        items.map((item) => lineRefusal(item, "SHIPPING_UNAVAILABLE")),
      ),
    });
  }
  const shipping = await deps.shipping.quote(shipTo);
  if (shipping.currency !== "USD" || !exactMoney(shipping.shippingCents)) {
    return Object.freeze({ ok: false as const, code: "UNAVAILABLE" as const });
  }

  let subtotalCents = 0;
  let discountCents = 0;
  for (const line of lines) {
    subtotalCents += line.subtotalCents;
    discountCents += line.discountCents;
    if (!exactMoney(subtotalCents) || !exactMoney(discountCents)) {
      return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
    }
  }
  const taxCents = 0; // Still a server-owned future provider decision.
  const payableTotalCents = subtotalCents - discountCents + shipping.shippingCents + taxCents;
  if (!exactMoney(payableTotalCents) || payableTotalCents <= 0) {
    return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  }

  const quotedAt = new Date(nowMs).toISOString();
  const ttl = deps.quoteTtlMs ?? 10 * 60_000;
  const expiresAt = new Date(nowMs + ttl).toISOString();
  const intentHash = earlyAccessCartIntentHash({
    customerRef: customer.customerRef,
    items,
    contact,
    shipTo,
  });
  const quote: EarlyAccessCartQuote = Object.freeze({
    quoteId: (deps.quoteId ?? newCartQuoteId)(),
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
  await deps.quotes.put(
    Object.freeze({
      publicQuote: quote,
      customerRef: customer.customerRef,
      quoteHash: quoteHash(quote),
      contact,
      shipTo,
      items,
    }),
  );
  return Object.freeze({ ok: true as const, quote });
}
