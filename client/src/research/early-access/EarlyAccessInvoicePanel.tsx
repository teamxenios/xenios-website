import type { EarlyAccessInvoiceView } from "../adapters/earlyAccessOrder";

/**
 * The invoice and payment instructions.
 *
 * EVERY AMOUNT HERE WAS CALCULATED BY THE SERVER. This component performs no
 * arithmetic on money: it formats whole cent values for display and nothing
 * else. It does not derive the discount from the subtotal, does not derive the
 * total from the parts, and does not check that they agree. If they ever
 * disagree the server is wrong and must be fixed there, because a browser that
 * "corrects" a total is a second pricing runtime and the customer would be shown
 * a figure they will not be charged.
 *
 * The payment reference is treated as the most important thing on the screen. It
 * is how a human matches a bank transfer to this order, and a transfer sent
 * without it is money that arrives attached to nobody.
 */

export interface EarlyAccessInvoicePanelProps {
  invoice: EarlyAccessInvoiceView;
  /** Required, no default. One client constant until the shared export lands. */
  fulfillmentTargetCopy: string;
  testId?: string;
}

/** Formats one already-final amount. Not arithmetic on money. */
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

/** The server may send instructions as a string or as a list of steps. */
function instructionLines(instructions: unknown): string[] {
  if (typeof instructions === "string" && instructions.trim().length > 0) return [instructions];
  if (Array.isArray(instructions)) {
    return instructions.filter((line): line is string => typeof line === "string" && line.length > 0);
  }
  return [];
}

export function EarlyAccessInvoicePanel({
  invoice,
  fulfillmentTargetCopy,
  testId = "early-access-invoice",
}: EarlyAccessInvoicePanelProps) {
  const steps = instructionLines(invoice.instructions);

  return (
    <section data-testid={testId} className="grid min-w-0 gap-4">
      <header className="grid gap-1">
        <p data-testid={`${testId}-number`}>Invoice {invoice.invoiceNumber}</p>
        <p data-testid={`${testId}-order`}>Order {invoice.orderNumber}</p>
      </header>

      <dl className="grid gap-2">
        <div>
          <dt>Subtotal</dt>
          <dd data-testid={`${testId}-subtotal`}>
            {money(invoice.subtotalCents, invoice.currency)}
          </dd>
        </div>

        {/*
          The discount is shown only when the server applied one. A zero
          discount line implies an offer that did not apply, which reads as a
          system that lost it.
        */}
        {invoice.discountCents > 0 ? (
          <div>
            <dt data-testid={`${testId}-discount-label`}>
              {invoice.discountLabel ?? "Discount"}
            </dt>
            <dd data-testid={`${testId}-discount`}>
              -{money(invoice.discountCents, invoice.currency)}
            </dd>
          </div>
        ) : null}

        <div>
          <dt>Amount due</dt>
          <dd data-testid={`${testId}-total`}>
            {money(invoice.payableTotalCents, invoice.currency)}
          </dd>
        </div>
      </dl>

      {/*
        The payment reference. Given its own region and stated as required,
        because a transfer that arrives without it cannot be matched to this
        order and a human reviewing the bank feed is left guessing.
      */}
      <section data-testid={`${testId}-reference-block`} aria-labelledby={`${testId}-reference-h`}>
        <h3 id={`${testId}-reference-h`}>Payment reference</h3>
        <p data-testid={`${testId}-reference`}>{invoice.paymentReference}</p>
        <p data-testid={`${testId}-reference-note`}>
          Include this reference with your transfer. Without it we cannot match your payment to
          this order.
        </p>
      </section>

      {steps.length > 0 ? (
        <section data-testid={`${testId}-instructions`} aria-labelledby={`${testId}-instructions-h`}>
          <h3 id={`${testId}-instructions-h`}>How to pay</h3>
          <ol>
            {steps.map((line, index) => (
              <li key={index} data-testid={`${testId}-instruction-${index}`}>
                {line}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/*
        Stated plainly on the payment screen itself: sending money does not make
        the order paid. A customer who believes it does will expect a shipment
        that is not coming yet.
      */}
      <p data-testid={`${testId}-review-note`}>
        Your order is not paid until a member of our team confirms the transfer arrived. You will
        be told when that happens.
      </p>

      <p data-testid={`${testId}-fulfillment`}>{fulfillmentTargetCopy}</p>
    </section>
  );
}
