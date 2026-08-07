import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartCheckoutRequest,
  EarlyAccessCartCheckoutResult,
  EarlyAccessCartChildOrder,
  EarlyAccessCartInvoice,
} from "@shared/research/early-access-cart";
import {
  cartInvoiceNumber,
  cartPaymentReference,
  isCartIdempotencyKey,
  isCartQuoteId,
  newCartCheckoutNumber,
  newCartChildOrderNumber,
} from "./model";
import type {
  CartCustomer,
  EarlyAccessCartAuditPort,
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartQuoteStore,
} from "./ports";

const PAYMENT_INSTRUCTIONS =
  "Use the payment reference exactly as shown. Payment is reviewed by a named Xenios operator before any supplier release.";

export type EarlyAccessCartCheckoutDeps = Readonly<{
  quotes: EarlyAccessCartQuoteStore;
  checkouts: EarlyAccessCartCheckoutStore;
  audit: EarlyAccessCartAuditPort;
  now: () => number;
  checkoutNumber?: () => string;
  childOrderNumber?: (index: number) => string;
}>;

function replayMatches(prior: EarlyAccessCartCheckout, customer: CartCustomer, request: EarlyAccessCartCheckoutRequest): boolean {
  const refs = [customer.customerRef, ...(customer.aliases ?? [])];
  return refs.includes(prior.customerRef) && prior.quoteId === request.quoteId && prior.intentHash === request.expectedIntentHash;
}

export async function checkoutEarlyAccessCart(
  deps: EarlyAccessCartCheckoutDeps,
  customer: CartCustomer,
  request: EarlyAccessCartCheckoutRequest,
): Promise<EarlyAccessCartCheckoutResult> {
  if (!isCartQuoteId(request.quoteId) || !isCartIdempotencyKey(request.idempotencyKey) || !/^[a-f0-9]{64}$/.test(request.expectedIntentHash)) {
    return Object.freeze({ ok: false as const, code: "CART_INVALID" as const });
  }
  const prior = await deps.checkouts.byIdempotencyKey(request.idempotencyKey);
  if (prior !== null) {
    if (!replayMatches(prior, customer, request)) return Object.freeze({ ok: false as const, code: "IDEMPOTENCY_CONFLICT" as const });
    return Object.freeze({ ok: true as const, replayed: true, checkout: prior });
  }

  const quoteRecord = await deps.quotes.get(request.quoteId);
  if (quoteRecord === null) return Object.freeze({ ok: false as const, code: "QUOTE_NOT_FOUND" as const });
  const quote = quoteRecord.publicQuote;
  const nowMs = deps.now();
  if (!Number.isFinite(nowMs) || nowMs <= 0) return Object.freeze({ ok: false as const, code: "UNAVAILABLE" as const });
  if (Date.parse(quote.expiresAt) < nowMs) return Object.freeze({ ok: false as const, code: "QUOTE_EXPIRED" as const });
  if (quote.customerRef !== customer.customerRef && !(customer.aliases ?? []).includes(quote.customerRef)) {
    return Object.freeze({ ok: false as const, code: "QUOTE_NOT_FOUND" as const });
  }
  if (quote.intentHash !== request.expectedIntentHash) return Object.freeze({ ok: false as const, code: "QUOTE_CHANGED" as const });

  const checkoutNumber = (deps.checkoutNumber ?? newCartCheckoutNumber)();
  const children: EarlyAccessCartChildOrder[] = quote.lines.map((line, index) => Object.freeze({
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
  }));
  const placedAt = new Date(nowMs).toISOString();
  const invoice: EarlyAccessCartInvoice = Object.freeze({
    invoiceNumber: cartInvoiceNumber(checkoutNumber),
    cartCheckoutNumber: checkoutNumber,
    paymentReference: cartPaymentReference(checkoutNumber),
    currency: quote.currency,
    lines: Object.freeze(children.map((child) => Object.freeze({
      orderNumber: child.orderNumber,
      sku: child.sku,
      quantity: child.quantity,
      unitPriceCents: child.unitPriceCents,
      subtotalCents: child.subtotalCents,
      discountCents: child.discountCents,
      payableCents: child.payableCents,
    }))),
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    shippingCents: quote.shippingCents,
    taxCents: quote.taxCents,
    payableTotalCents: quote.payableTotalCents,
    instructions: PAYMENT_INSTRUCTIONS,
    issuedAt: placedAt,
    status: "awaiting_payment",
  });
  const checkout: EarlyAccessCartCheckout = Object.freeze({
    cartCheckoutNumber: checkoutNumber,
    customerRef: quote.customerRef,
    // Contact and shipping are recovered from the private server quote record. The
    // confirm request therefore cannot swap the address or purchaser under the same
    // quote/idempotency key, and PII never needs to enter browser history state.
    contact: quoteRecord.contact,
    shipTo: quoteRecord.shipTo,
    idempotencyKey: request.idempotencyKey,
    intentHash: quote.intentHash,
    quoteId: quote.quoteId,
    children: Object.freeze(children),
    invoice,
    paymentState: "awaiting_payment",
    placedAt,
  });

  const committed = await deps.checkouts.commit(checkout);
  if (!committed.committed) {
    if (committed.checkout !== null && replayMatches(committed.checkout, customer, request)) {
      return Object.freeze({ ok: true as const, replayed: true, checkout: committed.checkout });
    }
    return Object.freeze({ ok: false as const, code: committed.reason === "idempotency_key_taken" ? "IDEMPOTENCY_CONFLICT" as const : "UNAVAILABLE" as const });
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
      },
    });
  } catch {
    // Durable checkout already exists. Audit failure is observed elsewhere and must not
    // create a second checkout on retry.
  }
  return Object.freeze({ ok: true as const, replayed: false, checkout });
}
