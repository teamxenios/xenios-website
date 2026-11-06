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
 * The journey reads standing from the server after normal changes. An explicit
 * recovery already reads standing in the section and matches it to the served
 * policy, so the journey can use that observation directly.
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
  /** Refresh standing, or consume the result of the section's explicit check. */
  onRecheck(accepted: boolean, recoveryStanding?: EarlyAccessAgreementStanding): void;
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
        <EarlyAccessAgreementSection onAccepted={onRecheck} />
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
