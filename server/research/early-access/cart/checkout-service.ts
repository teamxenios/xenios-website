import {
  NO_CART_NOTIFICATIONS,
  notifyQuietly,
  type EarlyAccessCartNotifier,
} from "./notifications-port";
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
  CartCatalogUnit,
  EarlyAccessCartCatalogPort,
  EarlyAccessCartReleasePort,
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
  /**
   * The catalogue and release authority, re-read at COMMIT.
   *
   * Required, not optional. A quote is a price held open for a while, and
   * between issuing one and committing it a founder can revoke a release,
   * Product Control can hold a unit, an approved price can move and a quantity
   * ceiling can narrow. Before this these ports were absent entirely, so the
   * checkout could not have re-read any of it even in principle.
   *
   * Optional would have been the worse choice: a deployment that forgot to
   * pass them would silently commit at stale terms and look completely healthy,
   * which is the same "default reached by omission" failure the cart store
   * comment in register.ts warns about.
   */
  catalog: EarlyAccessCartCatalogPort;
  releases: EarlyAccessCartReleasePort;
  quotes: EarlyAccessCartQuoteStore;
  checkouts: EarlyAccessCartCheckoutStore;
  audit: EarlyAccessCartAuditPort;
  attribution?: EarlyAccessCartAttributionPort;
  now: () => number;
  checkoutNumber?: () => string;
  childOrderNumber?: (index: number) => string;
  /**
   * Customer email. Fired AFTER the commit transaction has returned, and
   * wrapped so it can never fail the order. Absent means this deployment sends
   * no mail, which is the default and is why every existing test is unchanged.
   */
  notify?: EarlyAccessCartNotifier;
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

  // RE-READ THE WORLD. Expiry alone only proves the quote is young, not that
  // its terms still hold. Every line is resolved again against the live
  // catalogue and release authority, and any disagreement refuses rather than
  // repricing: silently charging a different number than the one the customer
  // agreed to would be worse than asking them to re-quote. QUOTE_CHANGED is
  // reused deliberately because the client already knows how to recover from
  // it, and the recovery is exactly right here.
  const liveUnits = await deps.catalog.units(nowMs, customer);
  for (const line of quote.lines) {
    const unit = liveUnits.find(
      (candidate: CartCatalogUnit) =>
        candidate.productId === line.productId && candidate.variantId === line.variantId,
    );
    if (
      unit === undefined ||
      !unit.purchasable ||
      unit.availability === "TEMPORARILY_HELD" ||
      (unit.quantityLimit !== null && line.quantity > unit.quantityLimit)
    ) {
      return Object.freeze({ ok: false as const, code: "QUOTE_CHANGED" as const });
    }
    const release = await deps.releases.decide({
      unit,
      quantity: line.quantity,
      nowMs,
      customer,
    });
    if (
      !release.released ||
      release.priceCents !== line.unitPriceCents ||
      release.currency !== line.currency
    ) {
      return Object.freeze({ ok: false as const, code: "QUOTE_CHANGED" as const });
    }
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
    // A second quote for one intent replays the order the customer already
    // has. `replayMatches` deliberately requires the same quoteId, which is
    // right for every other reason and wrong for this one: here the quote
    // differs by construction. Ownership and intent are still both proven
    // before anything is returned, so this cannot hand over another
    // customer's order.
    const intentReplay =
      committed.reason === "intent_has_active_checkout" &&
      committed.checkout !== null &&
      ownsRef(customer, committed.checkout.customerRef) &&
      committed.checkout.intentHash === request.expectedIntentHash;
    if (
      committed.checkout !== null &&
      (replayMatches(committed.checkout, customer, request) || intentReplay)
    ) {
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
          : // The quote is already spent by an active checkout that this caller
            // cannot replay. Reaching here means ownership was already proven
            // above, so the only remaining disagreement is the intent, and
            // QUOTE_CHANGED is what the client already knows how to recover
            // from: it re-quotes rather than retrying a placement that can
            // never succeed. Never UNAVAILABLE, which invites a retry loop.
            committed.reason === "quote_has_active_checkout"
            ? ("QUOTE_CHANGED" as const)
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

  // ORDER-CREATED MAIL, OUTSIDE THE TRANSACTION AND AFTER IT SUCCEEDED.
  //
  // Only on a genuine creation. The replay paths above return before reaching
  // here, so the six-simultaneous-confirm case enqueues ONE notification for
  // the one order that was actually created, not six. The outbox is keyed by
  // the durable checkout number as a second guard, never by the browser's
  // idempotency key, which is per-attempt and would have produced one email per
  // attempt: exactly the duplicate this release exists to end.
  await notifyQuietly(() =>
    (deps.notify ?? NO_CART_NOTIFICATIONS).checkoutCreated({
      checkout,
      replayed: false,
    }),
  );

  return Object.freeze({
    ok: true as const,
    replayed: false,
    checkout: checkoutView(checkout),
  });
}
