import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import { EarlyAccessPaymentInstructions } from "../EarlyAccessPaymentInstructions";

/**
 * THERE IS EXACTLY ONE AMOUNT ON THIS SCREEN, AND THE SERVER SAYS WHAT IT IS.
 *
 * This component used to compute its own "Amount due" from
 * `checkout.invoice.payableTotalCents` with a local `Intl.NumberFormat` and a
 * `/ 100`. Alongside the server's `amountDueDisplay` in the instructions panel
 * that made two amounts on one page, derived two different ways, and a customer
 * paying a manual transfer has no way to tell which one is authoritative if
 * they ever disagree. Rounding, currency and formatting are not the browser's
 * decision when the number is what someone is about to send money against.
 *
 * So the local row is gone and there is no money helper left to drift. While
 * the instructions are unresolved the panel says details are being confirmed,
 * which is the honest answer, rather than falling back to a second figure the
 * browser worked out on its own.
 */
export function EarlyAccessCartPayment({
  checkout,
  copied,
  onCopy,
  onStatus,
  paymentInstructions,
}: Readonly<{
  checkout: EarlyAccessCartCheckout;
  copied: boolean;
  onCopy(): void;
  onStatus(): void;
  /**
   * Untrusted server projection of where to send this payment, decoded by the
   * shared strict parser inside the panel. Omitted means not yet fetched, and
   * the panel then says details are being confirmed rather than guessing. This
   * prop is optional on purpose, so the screen is unchanged until the journey
   * supplies it.
   */
  paymentInstructions?: unknown;
}>) {
  return (
    <section className="grid gap-5" aria-labelledby="cart-payment-heading">
      <div>
        <p className="mono-cap text-pulse">Cart order created</p>
        <h2 id="cart-payment-heading" className="display-xs mt-2">Complete manual payment</h2>
        <p className="body-s text-ink-mute mt-2">
          Creating this cart did not charge you. A named Xenios operator reviews payment before any supplier release.
        </p>
      </div>

      <section className="card p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 body-s">
          <dt>Cart checkout</dt><dd className="font-700">{checkout.cartCheckoutNumber}</dd>
          <dt>Invoice</dt><dd className="font-700">{checkout.invoice.invoiceNumber}</dd>
          <dt>Products</dt><dd>{checkout.children.length}</dd>
          <dt>Payment state</dt><dd>{checkout.paymentState}</dd>
        </dl>
      </section>

      <section className="card p-5">
        <p className="body-s text-ink-mute">Payment reference</p>
        <p className="display-xs mt-2 break-all">{checkout.invoice.paymentReference}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={onCopy}>
          {copied ? "Copied" : "Copy payment reference"}
        </button>
        <p className="body-s mt-4">{checkout.invoice.instructions}</p>
      </section>

      <EarlyAccessPaymentInstructions presentation={paymentInstructions} />

      <section className="card p-5">
        <h3 className="body-m font-700">Payment confirmation</h3>
        <p className="body-s mt-2">
          Follow the concierge instructions provided for this Early Access round. The website does not claim a screenshot or file was uploaded when no bytes were stored.
        </p>
      </section>

      <button type="button" className="btn btn-primary" onClick={onStatus}>
        View order status
      </button>
    </section>
  );
}

export function EarlyAccessCartStatusView({
  status,
  loading,
  onRefresh,
  onContinueShopping,
}: Readonly<{
  status: EarlyAccessCartStatus | null;
  loading: boolean;
  onRefresh(): void;
  onContinueShopping(): void;
}>) {
  if (status === null) {
    return (
      <section className="card p-5" aria-busy={loading}>
        <h2 className="display-xs">Status</h2>
        <p className="body-s mt-3">{loading ? "Loading the cart status…" : "The status could not be loaded."}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={onRefresh} disabled={loading}>
          Refresh status
        </button>
      </section>
    );
  }

  return (
    <section className="grid gap-5" aria-labelledby="cart-status-heading">
      <div>
        <p className="mono-cap text-pulse">Cart status</p>
        <h2 id="cart-status-heading" className="display-xs mt-2">{status.checkout.cartCheckoutNumber}</h2>
      </div>
      <section className="card p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 body-s">
          <dt>Payment</dt><dd>{status.payment.state}</dd>
          <dt>Paid</dt><dd>{status.payment.paid ? "Yes" : "No"}</dd>
          <dt>Receipt</dt><dd>{status.receipt ? status.receipt.receiptId : "Not issued"}</dd>
          <dt>Supplier release</dt><dd>{status.fulfilment.released ? "Released" : "Not released"}</dd>
          <dt>Products</dt><dd>{status.checkout.children.length}</dd>
        </dl>
      </section>
      <div className="grid gap-3">
        {status.checkout.children.map((child) => {
          const release = status.fulfilment.childOrders.find((entry) => entry.orderNumber === child.orderNumber);
          return (
            <article key={child.orderNumber} className="card p-4">
              <h3 className="body-m font-700">{child.sku}</h3>
              <p className="body-s mt-1">Qty {child.quantity}</p>
              <p className="body-s">Supplier release: {release ? "Released" : "Not released"}</p>
              {release?.tracking.length ? (
                <p className="body-s">Tracking: {release.tracking.join(", ")}</p>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh status"}
        </button>
        <button type="button" className="btn btn-primary" onClick={onContinueShopping}>
          Continue shopping
        </button>
      </div>
    </section>
  );
}
