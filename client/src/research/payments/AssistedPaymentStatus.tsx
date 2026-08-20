// The customer's answer to "what do I owe and what do I do next", for one
// assisted research request.
//
// Presentation only, and pure: props in, one optional callback out. It holds no
// fetch, no auth and no state machine of its own, which is what makes it safe
// to mount from any composition the lead chooses.
//
// The browser computes nothing. The amount is the server's integer cents,
// formatted. The next action is the server's derived `nextAction`, not a switch
// this component re-derives from the state name — if the two ever disagreed the
// customer would be reading a different story from the one the domain enforces.
//
// NOT MOUNTED YET. The route and the data adapter are the next slice, behind
// their own lease on the mount seams.

import type { AssistedOrderPaymentView } from "@shared/research/assisted-order/payment-contract";
import { ResearchEmptyState, ResearchStatusBadge } from "../ui/kit";
import {
  PAYMENT_NEXT_ACTION_COPY,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONES,
  formatPaymentCents,
} from "./payment-presentation";

export type AssistedPaymentStatusProps = {
  /** Null when the request has no payment yet: an honest empty state. */
  payment: AssistedOrderPaymentView | null;
  /**
   * Offered only when the customer can actually act on it — the domain's
   * `follow_instructions` and `retry_payment`. Absent for every other state, so
   * there is no button that files a claim against a payment nobody asked for.
   */
  onSubmitProof?: () => void;
};

export function AssistedPaymentStatus({
  payment,
  onSubmitProof,
}: AssistedPaymentStatusProps) {
  if (!payment) {
    return (
      <ResearchEmptyState
        title="No payment yet"
        body="Once your quote is accepted we will prepare your payment details here."
      />
    );
  }

  const canClaim =
    payment.nextAction === "follow_instructions" ||
    payment.nextAction === "retry_payment";

  return (
    <section
      aria-labelledby="assisted-payment-heading"
      data-testid="assisted-payment-status"
      data-state={payment.state}
    >
      <header>
        <h2 id="assisted-payment-heading">Payment</h2>
        <ResearchStatusBadge
          label={PAYMENT_STATE_LABELS[payment.state]}
          tone={PAYMENT_STATE_TONES[payment.state]}
        />
      </header>

      <dl>
        <div>
          <dt>Reference</dt>
          <dd>{payment.requestPublicReference}</dd>
        </div>
        <div>
          <dt>Amount due</dt>
          {/* The server's cents, formatted. Never recomputed in the browser. */}
          <dd data-testid="assisted-payment-amount">
            {formatPaymentCents(payment.amountDueCents)}
          </dd>
        </div>
        <div>
          <dt>Quote</dt>
          <dd>Version {payment.quoteVersion}</dd>
        </div>
      </dl>

      <p data-testid="assisted-payment-next-action">
        {PAYMENT_NEXT_ACTION_COPY[payment.nextAction]}
      </p>

      {payment.instructions ? (
        <section
          aria-label="Payment instructions"
          data-testid="assisted-payment-instructions"
        >
          <h3>{payment.instructions.methodLabel}</h3>
          <p>{payment.instructions.body}</p>
          <p>
            Quote this reference: <strong>{payment.instructions.paymentReference}</strong>
          </p>
        </section>
      ) : null}

      {canClaim && onSubmitProof ? (
        <button type="button" onClick={onSubmitProof}>
          I have sent this payment
        </button>
      ) : null}
    </section>
  );
}
