import { useMemo } from "react";
import { REQUEST_INTENT_SCOPE_NOTICE } from "../../../../shared/research/assisted-order/request-intent";
import { referenceConfirmedInThisTab, requestIntentSupportMailto } from "./request-intent-continuation";
import "./assisted-order.css";

function browserStorage(): Storage | null { try { return window.sessionStorage; } catch { return null; } }

/**
 * The confirmation and status routes for a review request (XRI reference).
 * No fetch, no credential and no status claim: the only fact this page may add
 * is that this browser tab confirmed the same reference earlier.
 */
export function RequestIntentReferenceNotice({ reference, variant }: Readonly<{ reference: string; variant: "confirmation" | "status" }>) {
  const confirmedAt = useMemo(() => referenceConfirmedInThisTab(browserStorage(), reference), [reference]);
  const confirmed = confirmedAt !== null;
  return <section className="xenios-order-page" data-testid={"request-intent-reference-" + variant}>
    <section className="xenios-order-panel">
      <p className="xenios-order-eyebrow">Quick Order</p>
      <h1>{variant === "status" ? "Request status" : confirmed ? "Request saved for review" : "Request reference"}</h1>
      <p role="status">Reference: <strong>{reference}</strong></p>
      {variant === "status" && <p>Online status is not available for review requests. This page shows no request details and has checked nothing.</p>}
      {confirmed
        ? <p>This reference was confirmed in this browser tab on {new Date(confirmedAt).toLocaleString()}. Nothing was sent again.</p>
        : <p>This page alone does not confirm that a request was saved. If this reference came from your saved-request screen, keep it for support.</p>}
      <p>{REQUEST_INTENT_SCOPE_NOTICE}</p>
      <p>A reference identifies a review request only. It is not an order, approval or payment, and no delivery date is implied.</p>
      <div className="xenios-order-actions">
        <a className="xenios-order-return-link" href="/research/early-access/order-request">Return to Quick Order</a>
        <a href={requestIntentSupportMailto(reference)}>Email support about this request</a>
        <a href="/research/support">Contact support</a>
      </div>
    </section>
  </section>;
}
