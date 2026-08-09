import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartPaymentState,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import { EarlyAccessPaymentInstructions } from "../EarlyAccessPaymentInstructions";
import {
  PAYMENT_REJECTED_DETAIL,
  projectEarlyAccessOrder,
  type EarlyAccessOrderInputs,
} from "./orderStage";
import { formatInstantUtc } from "./instant";

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
 *
 * THE HEADING SAYS RESERVED, NOT PLACED. A checkout exists and an invoice is
 * issued, but nobody has been asked to look for a payment yet. That happens on
 * the next step, and calling this one "order created" was how a customer came
 * away believing the work had started when it had not.
 */
/**
 * Customer words for the server's payment states.
 *
 * Every one of them says the same thing in a different tense: Xenios has not
 * confirmed your money yet, unless it says outright that it has. None of them
 * can be reached by anything other than the server's own field.
 */
const PAYMENT_STATE_COPY: Readonly<Record<EarlyAccessCartPaymentState, string>> = Object.freeze({
  awaiting_payment: "Awaiting your payment. Not confirmed by Xenios yet.",
  under_review: "Submitted for review. Not confirmed by Xenios yet.",
  payment_verified: "Confirmed by a named Xenios operator.",
  payment_rejected: "Not verified. Contact Xenios support before sending anything further.",
});

export function EarlyAccessCartPayment({
  checkout,
  copied,
  onCopy,
  onSubmitOrder,
  onStatus,
  paymentInstructions,
}: Readonly<{
  checkout: EarlyAccessCartCheckout;
  copied: boolean;
  onCopy(): void;
  /** Forward to the step where the customer submits the order for review. */
  onSubmitOrder(): void;
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
    <section className="grid min-w-0 gap-5" aria-labelledby="cart-payment-heading">
      <div>
        <p className="mono-cap text-pulse">Checkout reserved</p>
        <h2 id="cart-payment-heading" className="display-xs mt-2">Complete manual payment</h2>
        <p className="body-s text-ink-mute mt-2 max-w-[62ch]" data-testid="early-access-payment-reserved">
          Your checkout is reserved and your invoice is issued. You have not been charged, and this
          order has not been submitted for payment review yet. Send your payment, then submit it on
          the next step so a named Xenios operator can check that it arrived.
        </p>
      </div>

      <section className="card p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 body-s">
          <dt>Cart checkout</dt><dd className="font-700">{checkout.cartCheckoutNumber}</dd>
          <dt>Invoice</dt><dd className="font-700">{checkout.invoice.invoiceNumber}</dd>
          <dt>Products</dt><dd>{checkout.children.length}</dd>
          {/*
            THE SERVER'S PAYMENT STATE, IN WORDS AND IN MACHINE FORM.
            The customer reads the sentence; the exact server enum stays on the
            element as a data attribute so a test can still pin the precise
            value without a customer being shown vocabulary written for a
            database. Both come from the same field, so they cannot disagree.
          */}
          <dt>Payment</dt>
          <dd data-testid="early-access-payment-state" data-payment-state={checkout.paymentState}>
            {PAYMENT_STATE_COPY[checkout.paymentState] ?? "Not confirmed by Xenios yet"}
          </dd>
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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmitOrder}
          data-testid="early-access-payment-continue-submit"
        >
          I have sent the payment
        </button>
        <button type="button" className="btn btn-secondary" onClick={onStatus}>
          View order status
        </button>
      </div>
    </section>
  );
}

/**
 * THE ORDER STATUS, DRAWN ENTIRELY FROM THE SERVER'S PROJECTION.
 *
 * Every word about where this order stands comes from `projectEarlyAccessOrder`,
 * which reads the server's status and nothing else. This component chooses no
 * stage of its own, and there is no prop by which a caller could tell it the
 * order is further along than the server says.
 *
 * The reserved / submitted line is the one a customer most needs, so it is the
 * heading rather than a detail buried in a definition list.
 */
export function EarlyAccessCartStatusView({
  status,
  loading,
  projectionInputs,
  onRefresh,
  onSubmitOrder,
  onContinueShopping,
}: Readonly<{
  status: EarlyAccessCartStatus | null;
  loading: boolean;
  /**
   * The server facts the cart status projection does not carry yet: whether
   * payment instructions were published, the proof lane's submission view, and
   * the database's ship-by commitment. Omitted means the server has not said,
   * and the projection stays at the earlier, truer stage rather than guessing.
   */
  projectionInputs?: EarlyAccessOrderInputs;
  onRefresh(): void;
  /** Offered only while the server still says nothing has been submitted. */
  onSubmitOrder(): void;
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

  const order = projectEarlyAccessOrder(status, projectionInputs);
  const shipBy = formatInstantUtc(order.shipByAt);

  return (
    <section className="grid min-w-0 gap-5" aria-labelledby="cart-status-heading">
      <div>
        <p className="mono-cap text-pulse">Cart status</p>
        <h2
          id="cart-status-heading"
          className="display-xs mt-2"
          data-testid="early-access-status-stage"
          data-stage={order.stage}
          data-submitted={order.submittedForReview ? "true" : "false"}
          data-payment-confirmed={order.paymentConfirmed ? "true" : "false"}
        >
          {order.label}
        </h2>
        <p className="body-s text-ink-mute mt-2 max-w-[62ch]" data-testid="early-access-status-detail">
          {order.detail}
        </p>
        {order.customerAction !== null ? (
          <p className="body-s mt-2 max-w-[62ch]" data-testid="early-access-status-action">
            {order.customerAction}
          </p>
        ) : null}
        {/*
          A refused payment is not a stage, so it is not hidden inside one. It
          sits on top of whatever the stage says, because an order can be
          refused while still reading as reserved.
        */}
        {order.paymentRejected ? (
          <p
            role="alert"
            className="body-s text-pulse mt-2 max-w-[62ch]"
            data-testid="early-access-status-rejected"
          >
            {PAYMENT_REJECTED_DETAIL}
          </p>
        ) : null}
      </div>

      <section className="card p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 body-s">
          <dt>Cart checkout</dt>
          <dd className="font-700">{status.checkout.cartCheckoutNumber}</dd>
          <dt>Submitted for payment review</dt>
          <dd>{order.submittedForReview ? "Yes" : "Not yet"}</dd>
          {/*
            The server's own word for whether the money arrived. Not inferred
            from a stage, an upload, or a screenshot the customer sent us.
          */}
          <dt>Payment confirmed by Xenios</dt>
          <dd>{order.paymentConfirmed ? "Yes" : "Not yet"}</dd>
          <dt>Products shipped</dt>
          <dd>{order.shippedCount} of {order.childCount}</dd>
          {/*
            Shown only once the SERVER has committed to one. The zone is written
            out, so a customer in another timezone reads the same date an
            operator does rather than one that appears to move by a day.
          */}
          {shipBy !== null ? (
            <>
              <dt>Ship by</dt>
              <dd data-testid="early-access-status-ship-by">
                {shipBy}
                {order.overdue ? " · overdue" : ""}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <div className="grid gap-3">
        {status.checkout.children.map((child) => {
          const release = status.fulfilment.childOrders.find(
            (entry) => entry.orderNumber === child.orderNumber,
          );
          const shippedAt = formatInstantUtc(release?.shippedAt);
          return (
            <article key={child.orderNumber} className="card p-4" data-testid="early-access-status-child">
              <h3 className="body-m font-700">{child.sku}</h3>
              <p className="body-s mt-1">Qty {child.quantity}</p>
              <p className="body-s">
                {shippedAt !== null
                  ? `Shipped ${shippedAt}`
                  : release
                    ? "Released to the supplier, not shipped yet"
                    : "Not released yet"}
              </p>
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
        {/*
          Only while the SERVER still says nothing has been submitted. Once it
          says otherwise this control disappears, so a customer cannot be
          invited to submit an order that is already with an operator.
        */}
        {order.submittedForReview ? null : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitOrder}
            data-testid="early-access-status-submit"
          >
            Submit payment proof
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onContinueShopping}>
          Continue shopping
        </button>
      </div>
    </section>
  );
}
