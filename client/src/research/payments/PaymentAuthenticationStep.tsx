// The customer's step while a durable checkout is not yet settled.
//
// Flow: read the continuation for THIS buyer's checkout; if the provider needs
// the customer (3DS), run the provider's own client flow with the secret it
// gave the server; then ask the server to continue. The server re-reads the
// provider's truth through the coordinator, so nothing the browser reports is
// treated as payment proof. While the outcome is unknown the step says so
// plainly and offers no second payment; "check payment status" asks the
// server for one bounded reconciliation.
//
// Abandonment is explicit: the buyer can cancel an unpaid checkout through the
// owner-checked cancel door. A payment the provider already captured cannot
// be cancelled and the answer says so (the order completes).
//
// The provider client is injected (`authenticate`), defaulting to Stripe.js
// over the shared loader. Tests inject a double. The secret is held in
// component memory only: not logged, not in the URL, not in the DOM.
//
// Principal fence: every response is checked against the token that requested
// it, and unmount or a token change invalidates pending work, so a late answer
// can never render under a different account.
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelCheckout, continueCheckout, loadCheckoutContinuation, type CheckoutContinuationView } from "../adapters/checkoutContinuation";
import { ResearchErrorState, ResearchLoadingState, ResearchStatusBadge } from "../ui/kit";
import { formatPaymentCents } from "./payment-presentation";
import { stripeClient } from "./stripe-client";

export type PaymentAuthenticationOutcome = "authenticated" | "cancelled" | "failed";

/** Run the provider's client flow for a payment that needs the customer. */
export type PaymentAuthenticator = (input: { clientSecret: string }) => Promise<PaymentAuthenticationOutcome>;

/** Stripe's documented client flow for a confirmed intent that needs the customer. */
export function stripeAuthenticator(publishableKey: string): PaymentAuthenticator {
  return async ({ clientSecret }) => {
    const stripe = await stripeClient(publishableKey);
    const result = await stripe.handleNextAction({ clientSecret });
    if (result.error) return result.error.code === "payment_intent_authentication_failure" ? "failed" : "cancelled";
    return result.paymentIntent?.status === "requires_capture" || result.paymentIntent?.status === "succeeded" ? "authenticated" : "cancelled";
  };
}

export interface PaymentAuthenticationStepProps {
  memberToken: string;
  requestKey: string;
  authenticate: PaymentAuthenticator;
  /** Called once when the server reports the order completed. */
  onCompleted?: (orderId: string) => void;
  /** Called once when the server reports the checkout cancelled (nothing charged). */
  onCancelled?: (orderId: string) => void;
  /** Called with every view the server answers, so a page can mirror the truthful state. */
  onView?: (view: CheckoutContinuationView) => void;
  /** Offer the buyer the cancel door while the checkout is unpaid. Default true. */
  allowCancel?: boolean;
  /** Called once when the server answers not_found: the reference is not this account's to resume. */
  onMissing?: () => void;
}

type StepState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string }
  | { kind: "view"; view: CheckoutContinuationView; busy: boolean; note: string | null };

const STATE_LABELS: Record<CheckoutContinuationView["state"], { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Payment in progress", tone: "info" },
  authentication_required: { label: "Your bank needs to confirm this payment", tone: "warning" },
  processing: { label: "Confirming with the payment provider", tone: "info" },
  completed: { label: "Order placed", tone: "success" },
  cancelled: { label: "Payment cancelled", tone: "neutral" },
  reconciliation_required: { label: "Payment result being verified", tone: "warning" },
};

export function PaymentAuthenticationStep({ memberToken, requestKey, authenticate, onCompleted, onCancelled, onView, allowCancel = true, onMissing }: PaymentAuthenticationStepProps) {
  const [state, setState] = useState<StepState>({ kind: "loading" });
  const principal = useRef<string>(memberToken);
  const completed = useRef(false);
  const cancelledOnce = useRef(false);
  principal.current = memberToken;
  const stillCurrent = useCallback((token: string) => principal.current === token, []);
  // Callbacks live in a ref so a parent re-render (with new inline handlers)
  // never re-arms the load effect: the server is read once per token and key.
  const handlers = useRef({ onCompleted, onCancelled, onView, onMissing });
  handlers.current = { onCompleted, onCancelled, onView, onMissing };

  const apply = useCallback(
    (token: string, result: Awaited<ReturnType<typeof loadCheckoutContinuation>>, note: string | null) => {
      if (!stillCurrent(token)) return;
      const on = handlers.current;
      if (result.kind === "ok") {
        const view = result.data.continuation;
        setState({ kind: "view", view, busy: false, note });
        on.onView?.(view);
        if (view.state === "completed" && !completed.current) {
          completed.current = true;
          on.onCompleted?.(view.orderId);
        }
        if (view.state === "cancelled" && !cancelledOnce.current) {
          cancelledOnce.current = true;
          on.onCancelled?.(view.orderId);
        }
        return;
      }
      if (result.kind === "unauthorized") setState({ kind: "unauthorized" });
      else if (result.kind === "denied" && result.code === "not_found") {
        setState({ kind: "error", message: "We could not find a payment in progress for this order." });
        on.onMissing?.();
      } else if (result.kind === "unavailable" || result.kind === "forbidden") setState({ kind: "error", message: "Payment confirmation is not available right now. Your payment has not been charged twice; please check back shortly." });
      else setState({ kind: "error", message: result.kind === "error" ? result.message : "Something went wrong. Please try again." });
    },
    [stillCurrent],
  );

  useEffect(() => {
    const token = memberToken;
    setState({ kind: "loading" });
    void loadCheckoutContinuation(token, requestKey).then((result) => apply(token, result, null));
    return () => {
      // Unmount or account switch: the token this effect bound to is no longer current.
      if (principal.current === token) principal.current = "";
    };
  }, [memberToken, requestKey, apply]);

  const run = async () => {
    if (state.kind !== "view" || state.busy) return;
    const token = memberToken;
    const { view } = state;
    setState({ kind: "view", view, busy: true, note: null });
    let note: string | null = null;
    if (view.state === "authentication_required" && view.authentication) {
      let outcome: PaymentAuthenticationOutcome;
      try {
        outcome = await authenticate({ clientSecret: view.authentication.clientSecret });
      } catch {
        outcome = "failed";
      }
      if (!stillCurrent(token)) return;
      if (outcome === "cancelled") note = "The bank confirmation was not completed. Nothing has been charged. You can try again.";
      if (outcome === "failed") note = "The bank did not confirm this payment. Nothing has been charged. You can try again or use another card.";
    }
    const result = await continueCheckout(token, requestKey);
    apply(token, result, note);
  };

  const cancel = async () => {
    if (state.kind !== "view" || state.busy) return;
    const token = memberToken;
    setState({ kind: "view", view: state.view, busy: true, note: null });
    const result = await cancelCheckout(token, requestKey);
    apply(token, result, result.kind === "ok" && result.data.continuation.state !== "cancelled" ? "This payment could not be cancelled because the provider had already completed it. The order stands." : null);
  };

  if (state.kind === "loading") return <ResearchLoadingState label="Checking your payment" />;
  if (state.kind === "unauthorized") return <ResearchErrorState message="Please sign in again to finish this payment." />;
  if (state.kind === "error") return <ResearchErrorState message={state.message} />;

  const { view, busy, note } = state;
  const presentation = STATE_LABELS[view.state];
  const needsCustomer = view.state === "authentication_required" && !!view.authentication;
  const uncertain = view.state === "reconciliation_required" || view.state === "processing" || view.state === "pending";
  const cancellable = allowCancel && (view.state === "authentication_required" || view.state === "pending" || view.state === "reconciliation_required");
  return (
    <section aria-live="polite" data-testid="payment-authentication-step" className="space-y-3">
      <div className="flex items-center gap-2">
        <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />
        <span className="text-sm text-slate-600">{formatPaymentCents(view.amountCents)}</span>
      </div>
      {needsCustomer ? (
        <p className="text-sm">Your card issuer needs you to confirm this payment. Nothing is charged until the confirmation completes and we verify it with the provider.</p>
      ) : null}
      {uncertain ? (
        <p className="text-sm" data-testid="payment-uncertain">
          We are confirming the result with the payment provider. Please do not pay again; this order will update here.
        </p>
      ) : null}
      {view.state === "completed" ? <p className="text-sm">Your order has been placed.</p> : null}
      {view.state === "cancelled" ? <p className="text-sm">This payment was cancelled and nothing was charged.</p> : null}
      {note ? <p className="text-sm text-amber-700" data-testid="payment-note">{note}</p> : null}
      {needsCustomer || uncertain || cancellable ? (
        <div className="flex flex-wrap gap-3">
          {needsCustomer || uncertain ? (
            <button type="button" onClick={() => void run()} disabled={busy} data-testid="payment-continue" className="rounded border px-3 py-2 text-sm">
              {busy ? "Working…" : needsCustomer ? "Confirm with my bank" : "Check payment status"}
            </button>
          ) : null}
          {cancellable ? (
            <button type="button" onClick={() => void cancel()} disabled={busy} data-testid="payment-cancel" className="rounded border px-3 py-2 text-sm">
              Cancel this order
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
