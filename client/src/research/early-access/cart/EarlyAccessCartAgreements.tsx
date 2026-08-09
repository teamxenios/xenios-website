import { EarlyAccessAgreementSection } from "../EarlyAccessAgreementSection";
import {
  earlyAccessAgreementGate,
  type EarlyAccessAgreementStanding,
} from "./agreementGate";

/**
 * REQUIRED AGREEMENTS, as its own step.
 *
 * The step owns none of the agreement logic. It renders the existing agreement
 * section, which reads the customer's standing from the server on every mount
 * and writes nothing to browser storage.
 *
 * THE STANDING SHOWN HERE IS NOT THE SECTION'S OPINION. The section reports
 * when something changed; the journey answers by ASKING THE SERVER AGAIN, and
 * passes the server's answer back down as `standing`. So the sentence a
 * customer reads and the condition the checkout enforces are the same fact from
 * the same source, rather than two components that agreed at some point earlier
 * in the session.
 *
 * The continue control is not merely disabled until that answer says satisfied.
 * It is absent. A greyed-out button invites a customer to keep clicking a thing
 * that will never work, and the reason it will never work is written out
 * immediately above it.
 */
export function EarlyAccessCartAgreements({
  standing,
  onRecheck,
  onBack,
  onContinue,
  busy = false,
}: Readonly<{
  standing: EarlyAccessAgreementStanding;
  /** Ask the server for this customer's standing again. */
  onRecheck(): void;
  onBack(): void;
  onContinue(): void;
  busy?: boolean;
}>) {
  const gate = earlyAccessAgreementGate(standing);

  return (
    <section className="grid min-w-0 gap-5" aria-labelledby="cart-agreements-heading">
      <div>
        <p className="mono-cap text-pulse">Required before ordering</p>
        <h2 id="cart-agreements-heading" className="display-xs mt-2">
          Required agreements
        </h2>
        <p
          className="body-s text-ink-mute mt-2 max-w-[62ch]"
          data-testid="early-access-agreements-standing"
          data-standing={standing}
          data-satisfied={gate.satisfied ? "true" : "false"}
          role="status"
        >
          {gate.detail}
        </p>
      </div>

      <div data-testid="early-access-cart-agreement-step-mount">
        {/*
          Both callbacks do the same thing on purpose: they say "something about
          this customer's standing may have changed", and the journey re-reads
          it. Neither is treated as the answer. `onAccepted(true)` in particular
          is a claim by a component that a write succeeded, and a write
          succeeding is not the same fact as the server reporting the customer
          as agreed when asked fresh.
        */}
        <EarlyAccessAgreementSection onAccepted={onRecheck} onBlocked={onRecheck} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
          Back to contact and shipping
        </button>
        {gate.satisfied ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onContinue}
            disabled={busy}
            data-testid="early-access-agreements-continue"
          >
            {busy ? "Pricing your cart" : "Continue to review"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
