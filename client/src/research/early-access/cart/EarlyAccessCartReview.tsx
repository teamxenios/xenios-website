import type {
  EarlyAccessCartContact,
  EarlyAccessCartQuote,
  EarlyAccessCartShipping,
} from "@shared/research/early-access-cart";

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function EarlyAccessCartReview({
  quote,
  contact,
  shipTo,
  busy,
  onBack,
  onConfirm,
}: Readonly<{
  quote: EarlyAccessCartQuote;
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
  busy: boolean;
  onBack(): void;
  onConfirm(): void;
}>) {
  return (
    <section className="grid gap-6" aria-labelledby="cart-review-heading">
      <div>
        <p className="mono-cap text-pulse">Nothing is created until you confirm</p>
        <h2 id="cart-review-heading" className="display-xs mt-2">Review your cart</h2>
        <p className="body-s text-ink-mute mt-2">
          The server confirmed every price, discount, supplier route and total shown below.
        </p>
      </div>

      <div className="grid gap-3">
        {quote.lines.map((line) => (
          <article
            key={`${line.productId}:${line.variantId}`}
            className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <h3 className="body-m font-700">{line.displayName}</h3>
              <p className="mono-label text-ink-mute">{line.strength} · Qty {line.quantity}</p>
              {line.promotionLabel ? (
                <p className="body-xs text-ink-mute mt-2">{line.promotionLabel}</p>
              ) : null}
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 body-s sm:min-w-[280px]">
              <dt>Unit price</dt><dd>{money(line.unitPriceCents, line.currency)}</dd>
              <dt>Line subtotal</dt><dd>{money(line.subtotalCents, line.currency)}</dd>
              <dt>Discount</dt><dd>−{money(line.discountCents, line.currency)}</dd>
              <dt className="font-700">Line payable</dt><dd className="font-700">{money(line.payableCents, line.currency)}</dd>
            </dl>
          </article>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h3 className="body-m font-700">Contact</h3>
          <p className="body-s mt-2">{contact.email}</p>
          <p className="body-s">{contact.phone}</p>
        </section>
        <section className="card p-4">
          <h3 className="body-m font-700">Shipping</h3>
          <address className="body-s not-italic mt-2">
            {shipTo.recipientName}<br />
            {shipTo.line1}<br />
            {shipTo.line2 ? <>{shipTo.line2}<br /></> : null}
            {shipTo.city}, {shipTo.region} {shipTo.postalCode}<br />
            {shipTo.country}
          </address>
        </section>
      </div>

      <section className="card p-5" aria-label="Server confirmed cart total">
        <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 body-s">
          <dt>Subtotal</dt><dd>{money(quote.subtotalCents, quote.currency)}</dd>
          <dt>Discounts</dt><dd>−{money(quote.discountCents, quote.currency)}</dd>
          <dt>Shipping</dt><dd>{money(quote.shippingCents, quote.currency)}</dd>
          <dt>Tax</dt><dd>{money(quote.taxCents, quote.currency)}</dd>
          <dt className="font-700">Amount due</dt><dd className="font-700">{money(quote.payableTotalCents, quote.currency)}</dd>
        </dl>
        <p className="body-xs text-ink-mute mt-3">
          Every amount above came from the server quote. The browser performs no cart-total arithmetic.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onBack}>
          Edit details
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Creating cart order…" : "Confirm and create cart order"}
        </button>
      </div>
    </section>
  );
}
