import { useState } from "react";
import type {
  EarlyAccessPaymentOptionCode,
  EarlyAccessPaymentOptionsPresentation,
} from "@shared/research/early-access-payment-options";
import type { EarlyAccessPaymentInstructionsPresentation } from "@shared/research/early-access-payment-instructions";
import { PaymentMethodSelector } from "../PaymentMethodSelector";
import { rejectProof, type ProofRejection } from "../EarlyAccessProofUpload";
import type {
  EarlyAccessProofSubmitOutcome,
  EarlyAccessProofSubmitter,
} from "./proofSubmissionPort";

/**
 * UPLOAD PAYMENT PROOF / SUBMIT ORDER.
 *
 * The step between "an invoice exists" and "a named human is looking for my
 * money". It is deliberately not part of the payment screen: the customer has
 * to go and make a transfer in another application in between, and a screen
 * that offers "pay" and "I have paid" side by side gets one of them clicked by
 * mistake.
 *
 * WHAT THIS SCREEN REFUSES TO SAY
 *
 * That the order is paid. That the order is verified. That a screenshot proves
 * anything. Sending proof asks a named operator to go and look, and the copy
 * says so before the upload, in the button, and after it succeeds.
 *
 * THE SUBMITTED STATE IS NOT KEPT HERE. When the server accepts the bytes this
 * component tells its caller and stops. The caller re-reads the order's status
 * from the server and the STATUS decides what the customer is shown. If this
 * component held an "I submitted it" flag, a refresh would lose it while the
 * server disagreed, or worse, keep it while the server had no record at all.
 */

/**
 * The methods this ORDER may be paid with, taken from the order's own server
 * payment instructions.
 *
 * There is no default and no fallback list. If the server has not resolved the
 * instructions, the selector is told `unresolved` and renders no choices at
 * all. A hardcoded set of methods is a way to show a customer a destination
 * that was turned off, and a default selection is a way to record a method the
 * customer never picked.
 */
export function paymentOptionsFromInstructions(
  presentation: EarlyAccessPaymentInstructionsPresentation,
): EarlyAccessPaymentOptionsPresentation {
  if (presentation.state !== "resolved") return { state: "unresolved" };
  return { state: "resolved", codes: presentation.methods.map((method) => method.code) };
}

const REJECTION_COPY: Readonly<Record<Exclude<ProofRejection, null>, string>> = Object.freeze({
  type: "That file type is not accepted. Send a JPG, PNG, WEBP or PDF.",
  size: "That file is larger than 10 MB. Send a smaller screenshot or PDF.",
  empty: "That file appears to be empty. Choose the receipt or screenshot again.",
});

/**
 * Customer-safe words for every outcome the port can return.
 *
 * The outcome type carries no server text, so there is nothing to pass through
 * here. Each line is written for the person reading it, and none of them
 * mention a provider, a key, a recipient or an internal identifier.
 */
const OUTCOME_COPY: Readonly<Record<EarlyAccessProofSubmitOutcome["kind"], string>> = Object.freeze({
  recorded:
    "Your proof reached us. It does not mean your payment has been confirmed. A named Xenios operator now checks that the transfer arrived, and your order status updates when they do.",
  rejected: "That file was not accepted. Choose a different screenshot or PDF and send it again.",
  unavailable:
    "Proof cannot be submitted on the website for this order. Follow the concierge instructions on your invoice, and nothing about your checkout is lost.",
  locked:
    "Your private session ended before your proof was sent, so nothing was recorded. Unlock again and send it once more. Nothing has been ordered or charged twice.",
  failed:
    "Your proof was not sent. Nothing about your order changed and nothing was charged. Choose the file again and retry.",
});

export type EarlyAccessCartSubmitProps = Readonly<{
  cartCheckoutNumber: string;
  paymentInstructions: EarlyAccessPaymentInstructionsPresentation;
  /**
   * Absent means this deployment has no customer-facing submission door. The
   * screen then explains the concierge route rather than rendering an uploader
   * that would discard the file.
   */
  submitProof?: EarlyAccessProofSubmitter;
  /**
   * Raised after the server accepted the bytes, so the caller can re-read the
   * order status. The caller, not this screen, decides what that means.
   */
  onRecorded(): void;
  onBack(): void;
  onStatus(): void;
}>;

export function EarlyAccessCartSubmit({
  cartCheckoutNumber,
  paymentInstructions,
  submitProof,
  onRecorded,
  onBack,
  onStatus,
}: EarlyAccessCartSubmitProps) {
  const [method, setMethod] = useState<EarlyAccessPaymentOptionCode | null>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [rejection, setRejection] = useState<ProofRejection>(null);
  const [outcome, setOutcome] = useState<EarlyAccessProofSubmitOutcome | null>(null);
  const [sending, setSending] = useState(false);

  const options = paymentOptionsFromInstructions(paymentInstructions);
  const canSend = submitProof !== undefined && method !== null && chosen !== null && !sending;

  const send = async () => {
    if (submitProof === undefined || method === null || chosen === null || sending) return;
    setSending(true);
    setOutcome(null);
    let result: EarlyAccessProofSubmitOutcome;
    try {
      result = await submitProof({ cartCheckoutNumber, methodCode: method, file: chosen });
    } catch {
      // A thrown error can carry a stack, a URL or a provider payload. It is
      // caught here and collapsed to the one outcome that says nothing.
      result = { kind: "failed" };
    }
    setSending(false);
    setOutcome(result);
    if (result.kind === "recorded") {
      // The bytes are spent. Clearing the file stops a second click sending the
      // same screenshot again, and the customer is now waiting on us, not on a
      // form. The order's real state comes back from the server.
      setChosen(null);
      onRecorded();
    }
  };

  return (
    <section className="grid min-w-0 gap-5" aria-labelledby="cart-submit-heading">
      <div>
        <p className="mono-cap text-pulse">Checkout reserved</p>
        <h2 id="cart-submit-heading" className="display-xs mt-2">
          Submit your order for payment review
        </h2>
        <p className="body-s text-ink-mute mt-2 max-w-[62ch]" data-testid="early-access-submit-not-payment">
          Your checkout is reserved and your invoice is issued. Sending proof does not pay this
          order and does not confirm your payment. It asks a named Xenios operator to check that
          your transfer arrived.
        </p>
      </div>

      <section className="card p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 body-s">
          <dt>Cart checkout</dt>
          <dd className="font-700">{cartCheckoutNumber}</dd>
          {paymentInstructions.state === "resolved" ? (
            <>
              <dt>Amount due</dt>
              <dd className="font-700">{paymentInstructions.amountDueDisplay}</dd>
              <dt>{paymentInstructions.referenceLabel}</dt>
              <dd className="font-700 break-all">{paymentInstructions.paymentReference}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {submitProof === undefined ? (
        /*
          NO DOOR, SO NO FORM. This deployment records proof through a named
          operator rather than a website upload. Rendering a file picker here
          would take a screenshot the customer believes was sent and drop it.
        */
        <section className="card p-5" data-testid="early-access-submit-concierge">
          <h3 className="body-m font-700">How to submit this order</h3>
          <p className="body-s mt-2 max-w-[62ch]">
            Send your payment using the reference above, then follow the concierge instructions on
            your invoice to send your receipt. A named Xenios operator records it against this
            checkout. Your order status below updates once they have.
          </p>
        </section>
      ) : (
        <>
          <section className="card p-5">
            <PaymentMethodSelector
              presentation={options}
              selectedCode={method}
              onSelect={setMethod}
              disabled={sending}
            />
          </section>

          <section className="card p-5 grid min-w-0 gap-3">
            <h3 className="body-m font-700">Upload payment proof</h3>
            <p className="body-s max-w-[62ch]">
              Send the receipt or screenshot from your bank or payment app. JPG, PNG, WEBP or PDF,
              up to 10 MB.
            </p>
            {/*
              THE HONEST ANSWER ABOUT REFRESH. The file's bytes live only in this
              tab and are deliberately never written to browser storage, so a
              refresh loses the selection. Saying so up front is better than a
              customer refreshing mid-upload and assuming the file went anyway.
              Nothing about the checkout, the invoice or the reference is lost.
            */}
            <p className="body-s text-ink-mute max-w-[62ch]" data-testid="early-access-submit-refresh-note">
              If you refresh or come back later you will need to choose the file again. Your
              checkout, invoice and payment reference are kept.
            </p>

            <input
              type="file"
              data-testid="early-access-submit-file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={sending}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                const why = rejectProof(file);
                setRejection(why);
                setChosen(why === null ? file : null);
                setOutcome(null);
              }}
            />

            {rejection !== null ? (
              <p role="alert" className="body-s text-pulse" data-testid="early-access-submit-rejection">
                {REJECTION_COPY[rejection]}
              </p>
            ) : null}

            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSend}
                onClick={() => void send()}
                data-testid="early-access-submit-send"
              >
                {sending ? "Sending proof" : "Send proof for review"}
              </button>
            </div>

            {method === null ? (
              <p className="body-s text-ink-mute" data-testid="early-access-submit-needs-method">
                Choose the payment method you used before sending your proof.
              </p>
            ) : null}
          </section>
        </>
      )}

      {outcome !== null ? (
        <p
          role="status"
          aria-live="polite"
          className="card body-s p-4"
          data-testid="early-access-submit-outcome"
          data-outcome={outcome.kind}
        >
          {OUTCOME_COPY[outcome.kind]}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back to payment details
        </button>
        <button type="button" className="btn btn-primary" onClick={onStatus}>
          View order status
        </button>
      </div>
    </section>
  );
}
