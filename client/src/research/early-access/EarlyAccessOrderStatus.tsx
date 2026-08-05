/**
 * Order status and tracking timeline.
 *
 * THE ORDER IS UNPAID UNTIL A HUMAN SAYS OTHERWISE. Every state below is read
 * from the server; this component derives none of them and never infers "paid"
 * from the existence of a proof. A customer reading this screen must be able to
 * tell, without interpretation, whether money has been confirmed.
 *
 * Timeline steps are shown for every order, including the ones not reached yet,
 * so a customer can see what is coming rather than wondering whether something
 * was skipped.
 */

export type EarlyAccessOrderState =
  | "awaiting_payment"
  | "proof_submitted"
  | "under_review"
  | "payment_verified"
  | "supplier_released"
  | "shipped";

export type EarlyAccessTrackingEvent = Readonly<{
  occurredAt: string;
  label: string;
  carrier?: string | null;
  trackingNumber?: string | null;
}>;

export interface EarlyAccessOrderStatusProps {
  orderNumber: string;
  /** Server-stated. Never derived from the presence of a proof. */
  state: EarlyAccessOrderState;
  proofSubmittedAt?: string | null;
  tracking?: readonly EarlyAccessTrackingEvent[];
  /** Required, no default. */
  fulfillmentTargetCopy: string;
  testId?: string;
}

const STEPS: ReadonlyArray<{ state: EarlyAccessOrderState; label: string }> = [
  { state: "awaiting_payment", label: "Payment instructions sent" },
  { state: "proof_submitted", label: "Proof of payment received" },
  { state: "under_review", label: "Payment under review" },
  { state: "payment_verified", label: "Payment confirmed" },
  { state: "supplier_released", label: "Order released to fulfillment" },
  { state: "shipped", label: "Shipped" },
];

/** True once the order has reached or passed a step. */
function reached(current: EarlyAccessOrderState, step: EarlyAccessOrderState): boolean {
  const order = STEPS.map((s) => s.state);
  return order.indexOf(current) >= order.indexOf(step);
}

const PAID_STATES: ReadonlySet<EarlyAccessOrderState> = new Set<EarlyAccessOrderState>([
  "payment_verified",
  "supplier_released",
  "shipped",
]);

export function EarlyAccessOrderStatus({
  orderNumber,
  state,
  proofSubmittedAt = null,
  tracking = [],
  fulfillmentTargetCopy,
  testId = "early-access-order-status",
}: EarlyAccessOrderStatusProps) {
  const paid = PAID_STATES.has(state);

  return (
    <section data-testid={testId} data-state={state} className="grid min-w-0 gap-4">
      <header className="grid gap-1">
        <h3>Order {orderNumber}</h3>
        {/*
          The one sentence a customer most needs. Stated from the server's own
          state, never inferred from a submitted proof.
        */}
        <p data-testid={`${testId}-payment-line`}>
          {paid
            ? "Payment confirmed by our team."
            : "Not yet paid. Your order moves forward once we confirm your transfer arrived."}
        </p>
      </header>

      <ol data-testid={`${testId}-timeline`}>
        {STEPS.map((step) => {
          const done = reached(state, step.state);
          return (
            <li
              key={step.state}
              data-testid={`${testId}-step-${step.state}`}
              data-reached={done ? "true" : "false"}
            >
              {step.label}
            </li>
          );
        })}
      </ol>

      {proofSubmittedAt !== null && !paid ? (
        <p data-testid={`${testId}-proof-note`}>
          We received your proof of payment. It does not settle the order on its own; a member of
          our team confirms the transfer.
        </p>
      ) : null}

      {tracking.length > 0 ? (
        <section data-testid={`${testId}-tracking`}>
          <h4>Tracking</h4>
          <ul>
            {tracking.map((event, index) => (
              <li key={index} data-testid={`${testId}-tracking-${index}`}>
                {event.label}
                {event.carrier ? ` — ${event.carrier}` : ""}
                {event.trackingNumber ? ` — ${event.trackingNumber}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p data-testid={`${testId}-tracking-empty`}>
          Tracking will be provided when the shipment is released.
        </p>
      )}

      <p data-testid={`${testId}-fulfillment`}>{fulfillmentTargetCopy}</p>
    </section>
  );
}
