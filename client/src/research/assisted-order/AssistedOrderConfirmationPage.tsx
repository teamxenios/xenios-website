import { useMemo } from "react";
import { money } from "./wizard-state";
import { readStoredAssistedOrderReceipt } from "./storage";
import "./assisted-order.css";

// The wizard navigates here as .../confirmation/<publicReference>, matching
// the registered route. The querystring form is still read as a fallback so
// an older stored or shared link keeps resolving.
function referenceFromLocation(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const last = decodeURIComponent(parts[parts.length - 1] ?? "");
  if (last && last !== "confirmation") {
    return last;
  }
  return new URLSearchParams(window.location.search).get("reference") ?? "";
}

export function AssistedOrderConfirmationPage() {
  const reference = useMemo(referenceFromLocation, []);
  const receipt = useMemo(
    () => (reference ? readStoredAssistedOrderReceipt(reference) : null),
    [reference],
  );
  const statusHref = `/research/early-access/order-request/${encodeURIComponent(reference)}`;

  return (
    // MinimalChrome supplies the page's main landmark; nesting a second main
    // inside it is invalid (P2-4), so this page renders a section.
    <section className="xenios-order-page">
      <section className="xenios-order-panel">
        <p className="xenios-order-eyebrow">Request received</p>
        <h1 data-testid="order-confirmation-reference">Reference: {reference || "Unavailable"}</h1>
        <p>
          We will confirm availability and payment details before fulfillment.
          Keep this reference for your records.
        </p>
        <dl className="xenios-order-facts">
          <div><dt>Status</dt><dd>Submitted</dd></div>
          {receipt ? <div><dt>Lines</dt><dd>{receipt.lines.length}</dd></div> : null}
          {receipt ? <div><dt>Estimated priced total</dt><dd>{money(receipt.estimatedTotalCents)}</dd></div> : null}
        </dl>
        {receipt && receipt.nextSteps.length > 0 ? (
          <ul className="xenios-order-timeline">
            {receipt.nextSteps.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ul>
        ) : null}
        <div className="xenios-order-notice">
          If Xenios requests identity verification, use the secure upload on
          your request status page. Do not email identity documents.
        </div>
        <div className="xenios-order-actions">
          <a href="/research/early-access">Return to Early Access</a>
          {reference ? <a className="xenios-order-button" href={statusHref}>View request status</a> : null}
        </div>
        <p className="xenios-order-small">Questions: research@xeniostechnology.com</p>
      </section>
    </section>
  );
}
