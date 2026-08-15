import { useMemo } from "react";
import type { AssistedOrderReceipt } from "../../../../shared/research/assisted-order/contract";
import { money } from "./wizard-state";
import "./assisted-order.css";

function readReceipt(reference: string): AssistedOrderReceipt | null {
  try {
    const raw = sessionStorage.getItem(`xenios.assisted-order.${reference}.receipt`);
    return raw ? (JSON.parse(raw) as AssistedOrderReceipt) : null;
  } catch {
    return null;
  }
}

export function AssistedOrderConfirmationPage() {
  const reference = useMemo(
    () => new URLSearchParams(window.location.search).get("reference") ?? "",
    [],
  );
  const receipt = useMemo(() => readReceipt(reference), [reference]);
  const statusHref = `/research/early-access/order-request/${encodeURIComponent(reference)}`;

  return (
    <main className="xenios-order-page">
      <section className="xenios-order-panel">
        <p className="xenios-order-eyebrow">Request received</p>
        <h1>Your Early Access request is in review</h1>
        <p>
          Xenios will review your products, availability, pricing, and any required
          documentation. You will receive follow-up instructions from Xenios.
        </p>
        <dl className="xenios-order-facts">
          <div><dt>Request</dt><dd>{reference || "Unavailable"}</dd></div>
          <div><dt>Status</dt><dd>Submitted</dd></div>
          {receipt ? <div><dt>Lines</dt><dd>{receipt.lines.length}</dd></div> : null}
          {receipt ? <div><dt>Estimated priced total</dt><dd>{money(receipt.estimatedTotalCents)}</dd></div> : null}
        </dl>
        <div className="xenios-order-notice">
          <strong>Identity documents are not required automatically.</strong> If Xenios
          requests identity verification, use the secure upload option on your request
          status page. Do not email identity-document images.
        </div>
        <div className="xenios-order-actions">
          <a href="/research/early-access">Return to Early Access</a>
          {reference ? <a className="xenios-order-button" href={statusHref}>View request status</a> : null}
        </div>
        <p className="xenios-order-small">Questions: research@xeniostechnology.com</p>
      </section>
    </main>
  );
}
