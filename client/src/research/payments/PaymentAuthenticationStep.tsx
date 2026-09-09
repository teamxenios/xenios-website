// The customer's step when the payment provider requires authentication (3DS).
//
// Flow: read the continuation for THIS buyer's checkout; if the provider needs
// the customer, run the provider's own client flow with the secret it gave the
// server; then ask the server to continue. The server re-reads the provider's
// truth through the coordinator, so nothing the browser reports is treated as
// payment proof. While the outcome is unknown the step says so plainly and
// offers no second payment.
//
// The provider client is injected (`authenticate`), defaulting to Stripe.js
// loaded from the provider's own domain. Tests inject a double. The secret is
// held in component memory only: not logged, not in the URL, not in the DOM.
//
// Principal fence: every response is checked against the token that requested
// it, and unmount or a token change invalidates pending work, so a late answer
// can never render under a different account.
//
// NOT MOUNTED YET. The checkout page mounts this once durable checkout returns
// an execution request key; the mount seam belongs to the integration owner.
import { useCallback, useEffect, useRef, useState } from "react";
import { continueCheckout, loadCheckoutContinuation, type CheckoutContinuationView } from "../adapters/checkoutContinuation";
import { ResearchErrorState, ResearchLoadingState, ResearchStatusBadge } from "../ui/kit";
import { formatPaymentCents } from "./payment-presentation";

export type PaymentAuthenticationOutcome = "authenticated" | "cancelled" | "failed";

/** Run the provider's client flow for a payment that needs the customer. */
export type PaymentAuthenticator = (input: { clientSecret: string }) => Promise<PaymentAuthenticationOutcome>;

interface StripeNextActionClient {
  handleNextAction(input: { clientSecret: string }): Promise<{ paymentIntent?: { status?: string }; error?: { type?: string; code?: string } }>;
}
type StripeFactory = (publishableKey: string) => StripeNextActionClient;

let stripeLoading: Promise<StripeFactory> | null = null;
function loadStripeFactory(): Promise<StripeFactory> {
  const existing = (window as unknown as { Stripe?: StripeFactory }).Stripe;
  if (existing) return Promise.resolve(existing);
  if (stripeLoading) return stripeLoading;
  stripeLoading = new Promise<StripeFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      stripeLoading = null;
      reject(new Error("Payment library unavailable"));
    }, 15_000);
    script.onload = () => {
      clearTimeout(timer);
      const factory = (window as unknown as { Stripe?: StripeFactory }).Stripe;
      if (factory) resolve(factory);
      else {
        stripeLoading = null;
        reject(new Error("Payment library unavailable"));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      stripeLoading = null;
      reject(new Error("Payment library unavailable"));
    };
    document.head.append(script);
  });
  return stripeLoading;
}

/** Stripe's documented client flow for a confirmed intent that needs the customer. */
export function stripeAuthenticator(publishableKey: string): PaymentAuthenticator {
  return async ({ clientSecret }) => {
    const factory = await loadStripeFactory();
    const stripe = factory(publishableKey);
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

export function PaymentAuthenticationStep({ memberToken, requestKey, authenticate, onCompleted }: PaymentAuthenticationStepProps) {
  const [state, setState] = useState<StepState>({ kind: "loading" });
  const principal = useRef<string>(memberToken);
  const completed = useRef(false);
  principal.current = memberToken;
  const stillCurrent = useCallback((token: string) => principal.current === token, []);

  const apply = useCallback(
    (token: string, result: Awaited<ReturnType<typeof loadCheckoutContinuation>>, note: string | null) => {
      if (!stillCurrent(token)) return;
      if (result.kind === "ok") {
        const view = result.data.continuation;
        setState({ kind: "view", view, busy: false, note });
        if (view.state === "completed" && !completed.current) {
          completed.current = true;
          onCompleted?.(view.orderId);
        }
        return;
      }
      if (result.kind === "unauthorized") setState({ kind: "unauthorized" });
      else if (result.kind === "denied" && result.code === "not_found") setState({ kind: "error", message: "We could not find a payment in progress for this order." });
      else if (result.kind === "unavailable" || result.kind === "forbidden") setState({ kind: "error", message: "Payment confirmation is not available right now. Your payment has not been charged twice; please check back shortly." });
      else setState({ kind: "error", message: result.kind === "error" ? result.message : "Something went wrong. Please try again." });
    },
    [onCompleted, stillCurrent],
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

  if (state.kind === "loading") return <ResearchLoadingState label="Checking your payment" />;
  if (state.kind === "unauthorized") return <ResearchErrorState message="Please sign in again to finish this payment." />;
  if (state.kind === "error") return <ResearchErrorState message={state.message} />;

  const { view, busy, note } = state;
  const presentation = STATE_LABELS[view.state];
  const needsCustomer = view.state === "authentication_required" && !!view.authentication;
  const uncertain = view.state === "reconciliation_required" || view.state === "processing" || view.state === "pending";
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
      {needsCustomer || uncertain ? (
        <button type="button" onClick={() => void run()} disabled={busy} data-testid="payment-continue" className="rounded border px-3 py-2 text-sm">
          {busy ? "Working…" : needsCustomer ? "Confirm with my bank" : "Check payment status"}
        </button>
      ) : null}
    </section>
  );
}
