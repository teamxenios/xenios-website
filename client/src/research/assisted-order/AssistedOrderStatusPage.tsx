import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssistedOrderStatusView } from "../../../../shared/research/assisted-order/contract";
import { loadAssistedOrderStatus } from "./api";
import { money } from "./wizard-state";
import { readAssistedOrderToken } from "./storage";
import { SecureDocumentUpload } from "./SecureDocumentUpload";
import "./assisted-order.css";

function referenceFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

export function AssistedOrderStatusPage() {
  const reference = useMemo(referenceFromPath, []);
  const token = useMemo(
    () => readAssistedOrderToken(reference) ?? undefined,
    [reference],
  );
  const [status, setStatus] = useState<AssistedOrderStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    loadAssistedOrderStatus(reference, token)
      .then(setStatus)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The request status could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  }, [reference, token]);

  useEffect(refresh, [refresh]);

  return (
    <div className="xenios-order-page">
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Early Access request</p>
        <h1>{reference}</h1>
        <p>Track your request and complete any actions Xenios requests.</p>
      </header>
      {loading ? <p className="xenios-order-loading">Loading request…</p> : null}
      {error ? <div className="xenios-order-error" role="alert">{error}</div> : null}
      {status ? (
        <>
          <section className="xenios-order-panel">
            <div className="xenios-order-card__header">
              <div><p className="xenios-order-eyebrow">Current status</p><h2>{status.status.replaceAll("_", " ")}</h2></div>
              <strong>{money(status.estimatedTotalCents)}</strong>
            </div>
            {status.actionRequired ? <div className="xenios-order-notice"><strong>Action required:</strong> {status.actionRequired}</div> : null}
            <div className="xenios-order-review-lines">
              {status.lines.map((line) => (
                <article key={line.lineId}>
                  <div><strong>{line.productName}</strong><span>{line.specification}</span><span>{line.workflowMode.replaceAll("_", " ")}</span></div>
                  <div><span>Qty {line.quantity}</span><strong>{line.lineEstimateCents === null ? "Price pending" : money(line.lineEstimateCents)}</strong></div>
                </article>
              ))}
            </div>
            <h3>Timeline</h3>
            <ol className="xenios-order-timeline">
              {status.timeline.map((event, index) => (
                <li key={`${event.occurredAt}-${index}`}>
                  <strong>{event.status.replaceAll("_", " ")}</strong>
                  <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
                  {event.customerMessage ? <p>{event.customerMessage}</p> : null}
                </li>
              ))}
            </ol>
          </section>
          {status.status === "identity_requested" ? (
            <SecureDocumentUpload
              requestId={status.requestId}
              publicReference={status.publicReference}
              statusToken={token}
              onUploaded={refresh}
            />
          ) : null}
          {status.documents.length > 0 ? (
            <section className="xenios-order-panel">
              <h2>Documents</h2>
              <ul>
                {status.documents.map((document) => (
                  <li key={document.documentId}>{document.fileName} · {document.status.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
