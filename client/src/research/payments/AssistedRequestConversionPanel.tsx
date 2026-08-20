// The operator's conversion panel for one assisted research request: review the
// payment, present instructions, review the customer's claim, mark it verified
// paid when authorized, and convert it into the canonical order.
//
// THE ONE IDEA WORTH READING. Every action button's availability is derived
// from the SAME two tables the server enforces — `isLegalPaymentTransition` for
// the shape and `mayActorReachPaymentState` for the authority — rather than
// from a switch this file maintains separately. An operator is therefore never
// offered a button whose call the server would refuse, and the day someone adds
// an edge to the table the UI grows the affordance without being edited.
//
// The verification grant is a SEPARATE prop from `canManage`, mirroring the
// server's separate port. An admin who can see this panel still cannot press
// "Mark verified paid" unless they hold the grant, and the disabled control
// says why instead of failing at the door.
//
// The browser grants no authority: disabling a button is a courtesy to the
// operator, never the security boundary. Every one of these callbacks lands on
// a server that re-checks all of it.
//
// Presentation only — no fetch, no auth, no state machine of its own. NOT
// MOUNTED YET; the route and adapter are the next slice, behind their own lease
// on the mount seams.

import { useState } from "react";
import {
  isLegalPaymentTransition,
  isSettledPaymentState,
  mayActorReachPaymentState,
  type AssistedOrderPaymentAdminView,
} from "@shared/research/assisted-order/payment-contract";
import { ResearchStatusBadge } from "../ui/kit";
import {
  PAYMENT_ADMIN_STATE_LABELS,
  PAYMENT_STATE_TONES,
  formatPaymentCents,
} from "./payment-presentation";

export type AssistedRequestConversionPanelProps = {
  payment: AssistedOrderPaymentAdminView;
  /** Holds `assisted_orders:manage`. */
  canManage: boolean;
  /**
   * Holds the SEPARATE named verification grant. Being an admin is not being
   * allowed to say a wire landed.
   */
  canVerifyPayment: boolean;
  /**
   * Whether an order already exists for this request. Conversion is idempotent
   * server-side; showing it as done keeps an operator from wondering.
   */
  convertedOrderNumber: string | null;
  onPresentInstructions?: (methodCode: string) => void;
  onBeginReview?: () => void;
  onMarkPaid?: () => void;
  onReject?: () => void;
  onRaiseException?: () => void;
  onRefund?: () => void;
  onConvert?: () => void;
};

/**
 * An action is offered when the transition table has the edge AND the actor
 * table lets an admin arrive there. `extra` carries the rule that is specific
 * to this button rather than to the state machine.
 */
function offered(
  from: AssistedOrderPaymentAdminView["state"],
  to: AssistedOrderPaymentAdminView["state"],
  canManage: boolean,
  extra = true,
): boolean {
  return (
    canManage &&
    extra &&
    isLegalPaymentTransition(from, to) &&
    mayActorReachPaymentState("admin", to)
  );
}

export function AssistedRequestConversionPanel({
  payment,
  canManage,
  canVerifyPayment,
  convertedOrderNumber,
  onPresentInstructions,
  onBeginReview,
  onMarkPaid,
  onReject,
  onRaiseException,
  onRefund,
  onConvert,
}: AssistedRequestConversionPanelProps) {
  const [methodCode, setMethodCode] = useState("wire");
  const state = payment.state;
  const settled = isSettledPaymentState(state);

  const canPresent = offered(state, "instructions_presented", canManage);
  const canReview = offered(state, "under_review", canManage);
  // Marking paid needs the edge, the actor rule AND the separate grant.
  const canMarkPaid = offered(state, "paid", canManage, canVerifyPayment);
  const canReject = offered(state, "rejected", canManage);
  const canException = offered(state, "exception", canManage);
  const canRefund = offered(state, "refunded", canManage, canVerifyPayment);
  // Conversion is gated on real money, never on the operator's confidence.
  const canConvert = canManage && settled && convertedOrderNumber === null;

  return (
    <section
      aria-labelledby="assisted-conversion-heading"
      data-testid="assisted-conversion-panel"
      data-state={state}
    >
      <header>
        <h2 id="assisted-conversion-heading">
          {payment.requestPublicReference}
        </h2>
        <ResearchStatusBadge
          label={PAYMENT_ADMIN_STATE_LABELS[state]}
          tone={PAYMENT_STATE_TONES[state]}
        />
      </header>

      <dl>
        <div>
          <dt>Amount due</dt>
          <dd data-testid="conversion-amount-due">
            {formatPaymentCents(payment.amountDueCents)}
          </dd>
        </div>
        <div>
          <dt>Quote</dt>
          <dd>
            {payment.quoteId} (version {payment.quoteVersion})
          </dd>
        </div>
        <div>
          <dt>Verified amount</dt>
          {/* Absent until money is real. An operator must never read a claim
              here as though it were a settlement. */}
          <dd data-testid="conversion-verified-amount">
            {payment.settlement
              ? formatPaymentCents(payment.settlement.verifiedAmountCents)
              : "Not verified"}
          </dd>
        </div>
        <div>
          <dt>Verified by</dt>
          <dd data-testid="conversion-verified-by">
            {payment.settlement
              ? `${payment.settlement.verifiedByLabel} (${payment.settlement.verifiedByKind})`
              : "—"}
          </dd>
        </div>
      </dl>

      {payment.exceptionReason ? (
        <p role="alert" data-testid="conversion-exception-reason">
          {payment.exceptionReason}
        </p>
      ) : null}

      <section aria-label="Customer claims">
        <h3>Customer claims</h3>
        {payment.proofs.length === 0 ? (
          <p data-testid="conversion-no-proofs">No claim filed.</p>
        ) : (
          <ul data-testid="conversion-proofs">
            {payment.proofs.map((proof) => (
              <li key={proof.proofId}>
                <span>{proof.customerReference}</span>
                {proof.note ? <span> — {proof.note}</span> : null}
                <ResearchStatusBadge
                  label={
                    proof.reviewOutcome === "pending"
                      ? "Unverified claim"
                      : proof.reviewOutcome === "accepted"
                        ? "Accepted"
                        : "Rejected"
                  }
                  tone={
                    proof.reviewOutcome === "pending"
                      ? "pending"
                      : proof.reviewOutcome === "accepted"
                        ? "success"
                        : "warning"
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Actions">
        <label>
          Payment method
          <input
            value={methodCode}
            onChange={(event) => setMethodCode(event.target.value)}
            disabled={!canPresent}
          />
        </label>
        <button
          type="button"
          data-testid="action-present-instructions"
          disabled={!canPresent}
          onClick={() => onPresentInstructions?.(methodCode)}
        >
          Send payment instructions
        </button>
        <button
          type="button"
          data-testid="action-begin-review"
          disabled={!canReview}
          onClick={() => onBeginReview?.()}
        >
          Take into review
        </button>
        <button
          type="button"
          data-testid="action-mark-paid"
          disabled={!canMarkPaid}
          title={
            canManage && !canVerifyPayment
              ? "Marking a payment verified requires the payment verification grant."
              : undefined
          }
          onClick={() => onMarkPaid?.()}
        >
          Mark verified paid
        </button>
        <button
          type="button"
          data-testid="action-reject"
          disabled={!canReject}
          onClick={() => onReject?.()}
        >
          Reject payment
        </button>
        <button
          type="button"
          data-testid="action-raise-exception"
          disabled={!canException}
          onClick={() => onRaiseException?.()}
        >
          Raise exception
        </button>
        <button
          type="button"
          data-testid="action-refund"
          disabled={!canRefund}
          onClick={() => onRefund?.()}
        >
          Record refund
        </button>
      </section>

      <section aria-label="Canonical order">
        <h3>Canonical order</h3>
        {convertedOrderNumber ? (
          <p data-testid="conversion-order-number">{convertedOrderNumber}</p>
        ) : (
          <p data-testid="conversion-not-converted">
            {settled
              ? "Ready to convert."
              : "This request cannot become a fulfillable order until its payment is verified."}
          </p>
        )}
        <button
          type="button"
          data-testid="action-convert"
          disabled={!canConvert}
          onClick={() => onConvert?.()}
        >
          Convert to canonical order
        </button>
      </section>
    </section>
  );
}
