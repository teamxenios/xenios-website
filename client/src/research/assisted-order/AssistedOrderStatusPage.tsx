import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { AssistedOrderStatusView } from "../../../../shared/research/assisted-order/contract";
import { loadAssistedOrderStatus } from "./api";
import { money } from "./wizard-state";
import { readAssistedOrderToken } from "./storage";
import { SecureDocumentUpload } from "./SecureDocumentUpload";
import { assistedOrderStatusErrorCopy } from "./customer-safe-errors";
import { EarlyAccessStepper } from "../early-access/EarlyAccessStepper";
import { EARLY_ACCESS_CUSTOMER_STEP_LABELS } from "../early-access/customerSteps";
import { useResearch } from "../core";
import "./assisted-order.css";

function referenceFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  try {
    return decodeURIComponent(parts[parts.length - 1] ?? "");
  } catch {
    return "";
  }
}

const PUBLIC_REFERENCE = /^XRR-\d{8}-[0-9A-F]{10}$/u;

export function AssistedOrderStatusPage() {
  const [location] = useLocation();
  const { memberToken, memberChecking } = useResearch();
  const reference = useMemo(() => referenceFromPath(location), [location]);
  // Synchronously discard the previous principal/reference's rendered data.
  return <VerifiedRequestStatus key={`${reference}:${memberToken ?? "guest"}:${memberChecking}`}
    reference={reference} memberToken={memberToken} memberChecking={memberChecking} />;
}

function VerifiedRequestStatus({ reference, memberToken, memberChecking }: {
  reference: string; memberToken: string | null; memberChecking: boolean;
}) {
  const token = useMemo(
    () => memberToken ? undefined : readAssistedOrderToken(reference) ?? undefined,
    [reference, memberToken],
  );
  const [status, setStatus] = useState<AssistedOrderStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(false);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    setStatus(null);
    if (memberChecking) return;
    if (!PUBLIC_REFERENCE.test(reference)) {
      setError("This secure status link is not valid or has expired. Contact Xenios Research for help.");
      setLoading(false);
      return;
    }
    loadAssistedOrderStatus(reference, token, memberToken)
      .then((view) => {
        if (!alive.current || generation.current !== request) return;
        if (view.publicReference !== reference) {
          throw new Error("status_reference_mismatch");
        }
        setStatus(view);
      })
      .catch((reason) => {
        if (alive.current && generation.current === request) setError(assistedOrderStatusErrorCopy(reason));
      })
      .finally(() => { if (alive.current && generation.current === request) setLoading(false); });
  }, [reference, token, memberToken, memberChecking]);

  useEffect(() => {
    alive.current = true;
    refresh();
    return () => { alive.current = false; ++generation.current; };
  }, [refresh]);

  return (
    <div className="xenios-order-page min-w-0" style={{ overflowWrap: "anywhere" }}>
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Early Access request</p>
        <h1 data-testid="order-status-heading" style={{ overflowWrap: "anywhere" }}>{status ? status.publicReference : "Request status"}</h1>
        <p>
          {status
            ? "Track your request and complete any actions Xenios requests."
            : "We verify this link before showing any request details."}
        </p>
      </header>
      {status ? (
        <EarlyAccessStepper
          steps={EARLY_ACCESS_CUSTOMER_STEP_LABELS}
          activeIndex={3}
          testId="assisted-order-customer-progress"
        />
      ) : null}
      {loading ? <p className="xenios-order-loading">Checking request…</p> : null}
      {error ? <div className="xenios-order-error" role="alert">{error}</div> : null}
      {status ? (
        <>
          <section className="xenios-order-panel">
            <div className="xenios-order-card__header" style={{ flexWrap: "wrap" }}>
              <div><p className="xenios-order-eyebrow">Current status</p><h2>{status.status.replaceAll("_", " ")}</h2></div>
              <strong data-testid="assisted-request-status-estimate">Estimate: {money(status.estimatedTotalCents)}</strong>
            </div>
            {status.actionRequired ? <div className="xenios-order-notice"><strong>Action required:</strong> {status.actionRequired}</div> : null}
            {typeof status.trackingReference === "string" && status.trackingReference.length > 0
              && status.trackingReference.length <= 500 && !/[\u0000-\u001f\u007f]/.test(status.trackingReference)
              ? <p data-testid="assisted-request-status-tracking" style={{ overflowWrap: "anywhere" }}>Recorded tracking reference: {status.trackingReference}</p> : null}
            <div className="xenios-order-review-lines">
              {status.lines.map((line) => (
                <article key={line.lineId} style={{ flexWrap: "wrap", minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}><strong>{line.productName}</strong><span>{line.specification}</span><span>{line.workflowMode.replaceAll("_", " ")}</span></div>
                  <div><span>Qty {line.quantity}</span><strong>{line.lineEstimateCents === null ? "Price on request" : money(line.lineEstimateCents)}</strong></div>
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
              memberToken={memberToken}
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
      <p>
        <a className="xenios-order-return-link" href="/research/early-access">
          Return to Early Access
        </a>
      </p>
    </div>
  );
}
