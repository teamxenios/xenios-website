import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartCheckoutRequest,
  EarlyAccessCartCheckoutResult,
  EarlyAccessCartChildOrder,
  EarlyAccessCartInvoice,
} from "@shared/research/early-access-cart";
import {
  cartInvoiceNumber,
  cartPaymentReference,
  checkoutView,
  isCartIdempotencyKey,
  isCartQuoteId,
  newCartCheckoutNumber,
  newCartChildOrderNumber,
} from "./model";
import type {
  CartCustomer,
  EarlyAccessCartAttributionPort,
  EarlyAccessCartAuditPort,
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartQuoteStore,
} from "./ports";

const PAYMENT_INSTRUCTIONS =
  "Use the payment reference exactly as shown. Payment is reviewed by a named Xenios operator before any supplier release.";

const NO_ATTRIBUTION: EarlyAccessCartAttributionPort = Object.freeze({
  async snapshot() {
    return null;
  },
});

export type EarlyAccessCartCheckoutDeps = Readonly<{
  quotes: EarlyAccessCartQuoteStore;
  checkouts: EarlyAccessCartCheckoutStore;
  audit: EarlyAccessCartAuditPort;
  attribution?: EarlyAccessCartAttributionPort;
  now: () => number;
  checkoutNumber?: () => string;
  childOrderNumber?: (index: number) => string;
}>;

function ownsRef(customer: CartCustomer, ref: string): boolean {
  return [customer.customerRef, ...(customer.aliases ?? [])].includes(ref);
}

function replayMatches(
  prior: EarlyAccessCartCheckoutRecord,
  customer: CartCustomer,
  request: EarlyAccessCartCheckoutRequest,
): boolean {
  return (
    ownsRef(customer, prior.customerRef) &&
    prior.quoteId === request.quoteId &&
    prior.intentHash === request.expectedIntentHash
  );
}

export async function checkoutEarlyAccessCart(
  deps: EarlyAccessCartCheckoutDeps,
  customer: CartCustomer,
  request: EarlyAccessCartCheckoutRequest,
): Promise<EarlyAccessCartCheckoutResult> {
  if (
    !isCartQuoteId(request.quoteId) ||
    !isCartIdempotencyKey(request.idempotencyKey) ||
    !/^[a-f0-9]{64}$/.test(request.expectedIntentHash)
  ) {
    return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  }

  const prior = await deps.checkouts.byIdempotencyKey(request.idempotencyKey);
  if (prior !== null) {
    if (!replayMatches(prior, customer, request)) {
      return Object.freeze({ ok: false as const, code: "IDEMPOTENCY_CONFLICT" as const });
    }
    return Object.freeze({ ok: true as const, replayed: true, checkout: checkoutView(prior) });
  }

  const quoteRecord = await deps.quotes.get(request.quoteId);
  if (quoteRecord === null) {
    return Object.freeze({ ok: false as const, code: "QUOTE_NOT_FOUND" as const });
  }
  const quote = quoteRecord.publicQuote;
  const nowMs = deps.now();
  if (!Number.isFinite(nowMs) || nowMs <= 0) {
    return Object.freeze({ ok: false as const, code: "UNAVAILABLE" as const });
  }
  if (Date.parse(quote.expiresAt) < nowMs) {
    return Object.freeze({ ok: false as const, code: "QUOTE_EXPIRED" as const });
  }
  if (!ownsRef(customer, quoteRecord.customerRef)) {
    // Missing and foreign quote are intentionally indistinguishable.
    return Object.freeze({ ok: false as const, code: "QUOTE_NOT_FOUND" as const });
  }
  if (quote.intentHash !== request.expectedIntentHash) {
    return Object.freeze({ ok: false as const, code: "QUOTE_CHANGED" as const });
  }

  const checkoutNumber = (deps.checkoutNumber ?? newCartCheckoutNumber)();
  const children: EarlyAccessCartChildOrder[] = quote.lines.map((line, index) =>
    Object.freeze({
      orderNumber: (deps.childOrderNumber ?? newCartChildOrderNumber)(index),
      productId: line.productId,
      variantId: line.variantId,
      sku: line.sku,
      quantity: line.quantity,
      supplierId: line.supplierId,
      supplierSku: line.supplierSku,
      unitPriceCents: line.unitPriceCents,
      subtotalCents: line.subtotalCents,
      discountCents: line.discountCents,
      payableCents: line.payableCents,
    }),
  );
  const placedAt = new Date(nowMs).toISOString();
  const invoice: EarlyAccessCartInvoice = Object.freeze({
    invoiceNumber: cartInvoiceNumber(checkoutNumber),
    cartCheckoutNumber: checkoutNumber,
    paymentReference: cartPaymentReference(checkoutNumber),
    currency: quote.currency,
    lines: Object.freeze(
      children.map((child) =>
        Object.freeze({
          orderNumber: child.orderNumber,
          sku: child.sku,
          quantity: child.quantity,
          unitPriceCents: child.unitPriceCents,
          subtotalCents: child.subtotalCents,
          discountCents: child.discountCents,
          payableCents: child.payableCents,
        }),
      ),
    ),
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    shippingCents: quote.shippingCents,
    taxCents: quote.taxCents,
    payableTotalCents: quote.payableTotalCents,
    instructions: PAYMENT_INSTRUCTIONS,
    issuedAt: placedAt,
    status: "awaiting_payment",
  });
  const attribution = await (deps.attribution ?? NO_ATTRIBUTION).snapshot(
    quoteRecord.customerRef,
    nowMs,
  );
  const checkout: EarlyAccessCartCheckoutRecord = Object.freeze({
    cartCheckoutNumber: checkoutNumber,
    customerRef: quoteRecord.customerRef,
    contact: quoteRecord.contact,
    shipTo: quoteRecord.shipTo,
    idempotencyKey: request.idempotencyKey,
    intentHash: quote.intentHash,
    quoteId: quote.quoteId,
    children: Object.freeze(children),
    invoice,
    paymentState: "awaiting_payment",
    placedAt,
    attribution,
  });

  const committed = await deps.checkouts.commit(checkout);
  if (!committed.committed) {
    if (committed.checkout !== null && replayMatches(committed.checkout, customer, request)) {
      return Object.freeze({
        ok: true as const,
        replayed: true,
        checkout: checkoutView(committed.checkout),
      });
    }
    return Object.freeze({
      ok: false as const,
      code:
        committed.reason === "idempotency_key_taken"
          ? ("IDEMPOTENCY_CONFLICT" as const)
          : ("UNAVAILABLE" as const),
    });
  }

  try {
    await deps.audit.record({
      event: "early_access.cart_checkout.placed",
      actor: customer.customerRef,
      at: placedAt,
      detail: {
        cartCheckoutNumber: checkout.cartCheckoutNumber,
        childCount: checkout.children.length,
        payableTotalCents: checkout.invoice.payableTotalCents,
        currency: checkout.invoice.currency,
        attributed: attribution !== null,
      },
    });
  } catch {
    // Checkout is already durable. Retry must read/replay it, not create another.
  }

  return Object.freeze({
    ok: true as const,
    replayed: false,
    checkout: checkoutView(checkout),
  });
}
