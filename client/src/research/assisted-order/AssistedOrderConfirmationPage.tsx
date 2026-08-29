import { useMemo } from "react";
import { Link } from "wouter";
import { money } from "./wizard-state";
import { readStoredAssistedOrderReceipt } from "./storage";
import "./assisted-order.css";

// The wizard navigates here as .../confirmation/<publicReference>, matching
// the registered route. The querystring form is still read as a fallback so
// an older stored or shared link keeps resolving.
function referenceFromLocation(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  let last = "";
  try {
    last = decodeURIComponent(parts[parts.length - 1] ?? "");
  } catch {
    return "";
  }
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

  if (receipt === null) {
    return (
      <section className="xenios-order-page" data-testid="order-confirmation-unavailable">
        <section className="xenios-order-panel">
          <p className="xenios-order-eyebrow">Order request</p>
          <h1>Confirmation unavailable</h1>
          <p>
            This link alone does not confirm that a request was submitted. Return
            to the browser where you submitted, or contact Xenios Research with
            your reference for help.
          </p>
          <div className="xenios-order-actions">
            <Link className="xenios-order-return-link" href="/research/early-access">
              Return to Early Access
            </Link>
            {reference ? (
              <a className="xenios-order-button" href={statusHref}>
                Check request status
              </a>
            ) : null}
          </div>
        </section>
      </section>
    );
  }

  return (
    // MinimalChrome supplies the page's main landmark; nesting a second main
    // inside it is invalid (P2-4), so this page renders a section.
    <section className="xenios-order-page">
      <section className="xenios-order-panel">
        <p className="xenios-order-eyebrow">Request received</p>
        <h1 data-testid="order-confirmation-reference">Reference: {receipt.publicReference}</h1>
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
          <a className="xenios-order-return-link" href="/research/early-access">
            Return to Early Access
          </a>
          {reference ? <a className="xenios-order-button" href={statusHref}>View request status</a> : null}
        </div>
        <p className="xenios-order-small">Questions: research@xeniostechnology.com</p>
      </section>
    </section>
  );
}
