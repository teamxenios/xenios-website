import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type {
  AssistedOrderAdminDetail,
  AssistedOrderStatus,
} from "../../../../shared/research/assisted-order/contract";
import {
  createAssistedOrderDocumentDownload,
  loadAssistedOrderAdminDetail,
  updateAssistedOrderStatus,
  AssistedOrderApiError,
} from "./api";
import { AdminAssistedOrderSession, type AssistedOrderAdminScope } from "./AdminAssistedOrderSession";
import { money } from "./wizard-state";
import { OperatorDeclarations } from "../quick-order/OperatorDeclarations";
import "./assisted-order.css";

function requestIdFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  try { return decodeURIComponent(parts[parts.length - 1] ?? "") || null; }
  catch { return null; }
}

export function AdminAssistedOrderDetailPage() {
  const [location] = useLocation();
  const requestId = useMemo(() => requestIdFromPath(location), [location]);
  return <AdminAssistedOrderSession title="Assisted order request">
    {(scope) => requestId
      ? <AdminAssistedOrderDetail key={requestId} {...scope} requestId={requestId} />
      : <main className="xenios-order-page"><p role="alert">A valid request is required.</p></main>}
  </AdminAssistedOrderSession>;
}

function AdminAssistedOrderDetail({ token, isCurrent, deny, requestId }: AssistedOrderAdminScope & { requestId: string }) {
  const [detail, setDetail] = useState<AssistedOrderAdminDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<AssistedOrderStatus>("reviewing");
  const [customerMessage, setCustomerMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const updating = useRef(false);
  const readEpoch = useRef(0);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const current = () => mounted.current && isCurrent();
  const failed = (reason: unknown, fallback: string) => {
    if (!current()) return;
    if (reason instanceof AssistedOrderApiError && [401, 403].includes(reason.status)) {
      deny();
      return;
    }
    setError(reason instanceof Error ? reason.message : fallback);
  };

  useEffect(() => {
    let alive = true;
    const epoch = ++readEpoch.current;
    setError(null);
    setDetail(null);
    if (isCurrent()) void loadAssistedOrderAdminDetail(token, requestId).then((result) => {
      if (!alive || !current() || readEpoch.current !== epoch) return;
      if (result.requestId !== requestId) throw new Error("The request could not be loaded.");
      setDetail(result);
    }).catch((reason) => {
      if (alive && current() && readEpoch.current === epoch) failed(reason, "The request could not be loaded.");
    });
    return () => { alive = false; };
  }, [requestId, token, isCurrent]);

  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!current() || !detail || updating.current || detail.quickOrder?.observation.state === "stale") return;
    updating.current = true;
    ++readEpoch.current;
    setBusy(true);
    setError(null);
    try {
      const evidence = nextStatus === "agreements_complete"
          ? { agreementAttestationId: evidenceId }
          : nextStatus === "supplier_processing"
            ? { supplierAssignmentId: evidenceId }
            : nextStatus === "shipped"
              ? { trackingId: evidenceId }
              : nextStatus === "cancelled"
                ? { cancellationReason: evidenceId }
                : {};
      const result = await updateAssistedOrderStatus(token, requestId, {
        status: nextStatus,
        customerMessage: customerMessage || undefined,
        internalNote: internalNote || undefined,
        evidence,
      });
      if (!current()) return;
      if (result.requestId !== requestId) {
        setDetail(null);
        throw new Error("The updated request could not be verified.");
      }
      setDetail(result);
      setCustomerMessage("");
      setInternalNote("");
      setEvidenceId("");
      if (result.quickOrder) {
        const epoch = ++readEpoch.current;
        try {
          const refreshed = await loadAssistedOrderAdminDetail(token, requestId);
          if (!current() || readEpoch.current !== epoch) return;
          if (refreshed.requestId !== requestId || !refreshed.quickOrder ||
              refreshed.quickOrder.observation.state !== "observed") {
            throw new Error("Request readback unavailable.");
          }
          setDetail(refreshed);
        } catch (reason) {
          if (!current() || readEpoch.current !== epoch) return;
          if (reason instanceof AssistedOrderApiError && [401, 403].includes(reason.status)) {
            deny();
            return;
          }
          setError("Status saved. Reload this page to refresh notification state before making another update.");
        }
      }
    } catch (reason) {
      failed(reason, "The status could not be updated.");
    } finally {
      updating.current = false;
      if (current()) setBusy(false);
    }
  };

  const download = async (documentId: string) => {
    if (!current() || !detail) return;
    try {
      const ticket = await createAssistedOrderDocumentDownload(token, requestId, documentId);
      if (!current()) return;
      window.open(ticket.url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      failed(reason, "The identity document could not be opened.");
    }
  };

  return (
    <main className="xenios-order-page">
      <header className="xenios-order-hero"><p className="xenios-order-eyebrow">Assisted order request</p><h1>{detail?.publicReference ?? requestId}</h1><p>Minimum necessary operational access. Identity files open only through short-lived signed links.</p></header>
      {error ? <div className="xenios-order-error" role="alert">{error}</div> : null}
      {detail ? (
        <div className="xenios-order-admin-detail">
          <section className="xenios-order-panel">
            <div className="xenios-order-card__header"><div><p className="xenios-order-eyebrow">Current status</p><h2>{detail.status.replaceAll("_", " ")}</h2></div><strong>{money(detail.estimatedTotalCents)}</strong></div>
            <div className="xenios-order-review-contact"><div><strong>{detail.fullLegalName}</strong><span>{detail.email}</span><span>{detail.mobilePhone}</span><span>{detail.organizationName}</span></div><div><strong>Ship to</strong><span>{detail.shippingAddress.line1}</span><span>{detail.shippingAddress.city}, {detail.shippingAddress.region} {detail.shippingAddress.postalCode}</span><span>{detail.shippingAddress.countryCode}</span></div></div>
            <div className="xenios-order-review-lines">{detail.lines.map((line) => <article key={line.lineId}><div><strong>{line.productName}</strong><span>{line.specification}</span>{detail.quickOrder ? <span>Variant: {line.variantId}</span> : null}<span>{line.workflowMode.replaceAll("_", " ")}</span></div><div><span>Qty {line.quantity}</span><strong>{money(line.lineEstimateCents)}</strong></div></article>)}</div>
            {detail.generalNotes ? <div><h3>Customer notes</h3><p>{detail.generalNotes}</p></div> : null}
            {detail.quickOrder ? <section aria-label="Quick Order intake">
              <p>The declaration review state below was recorded at submission. Later code matching is shown under Current affiliate status.</p>
              <OperatorDeclarations declaration={{
                ...detail.quickOrder.intake,
                trustedAttribution: detail.affiliateAttributionRef
                  ? { state: "verified", reference: detail.affiliateAttributionRef }
                  : { state: "absent" },
                nextAction: "Review the request. Payment and clinical approval are separate.",
              }} />
              <p>Known-price subtotal: {money(detail.quickOrder.intake.estimate.knownSubtotalCents)}{detail.quickOrder.intake.estimate.estimateComplete ? "" : " · Some prices are pending."}</p>
              <section aria-label="Quick Order notification">
                <h3>Operator notification</h3>
                {detail.quickOrder.observation.state === "observed" ? <>
                  <p>Recorded state: {detail.quickOrder.observation.notification.status.replaceAll("_", " ")}; attempts: {detail.quickOrder.observation.notification.attemptCount}.</p>
                  <p>Observed at <time dateTime={detail.quickOrder.observation.observedAt}>{detail.quickOrder.observation.observedAt}</time>.</p>
                </> : <p role="status">Notification state needs refresh.</p>}
                <p>Sent means accepted by the notification service. It does not confirm delivery or operator review.</p>
              </section>
            </section> : null}
            {/* Affiliate. The typed code and the verified attribution are shown
                as SEPARATE lines, and the typed one always carries its match
                state, so an operator never reads a claim as a proven
                relationship. */}
            <div data-testid="admin-affiliate">
              <h3>{detail.quickOrder ? "Current affiliate status" : "Affiliate"}</h3>
              <dl className="xenios-order-facts">
                <div>
                  <dt>{detail.quickOrder ? "Recorded affiliate code" : "Affiliate code"}</dt>
                  <dd data-testid="admin-affiliate-code">
                    {detail.declaredAffiliateCode ?? "None provided"}
                  </dd>
                </div>
                <div>
                  <dt>Match status</dt>
                  <dd data-testid="admin-affiliate-state">
                    {detail.declaredAffiliateCodeState === "matched_manual"
                      ? "Matched"
                      : detail.declaredAffiliateCodeState === "captured_unmatched"
                        ? "Unmatched"
                        : detail.declaredAffiliateCodeState === "invalid_ignored"
                          ? "Ignored (not a usable code)"
                          : "None provided"}
                  </dd>
                </div>
                <div>
                  <dt>Verified referral</dt>
                  <dd data-testid="admin-verified-attribution">
                    {detail.affiliateAttributionRef ?? "None"}
                  </dd>
                </div>
              </dl>
            </div>
            <h3>Documents</h3>
            {detail.documents.length === 0 ? <p>No documents received.</p> : <ul>{detail.documents.map((document) => <li key={document.documentId}>{document.fileName} · {document.status.replaceAll("_", " ")} <button type="button" onClick={() => download(document.documentId)}>Open securely</button></li>)}</ul>}
            <h3>Timeline</h3>
            <ol className="xenios-order-timeline">{detail.timeline.map((event, index) => <li key={`${event.occurredAt}-${index}`}><strong>{event.status.replaceAll("_", " ")}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>{event.customerMessage ? <p>{event.customerMessage}</p> : null}</li>)}</ol>
          </section>
          <form className="xenios-order-panel xenios-order-admin-action" onSubmit={update}>
            <h2>Update request</h2>
            <label>New status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as AssistedOrderStatus)}><option value="reviewing">Reviewing</option><option value="waiting_on_customer">Waiting on customer</option><option value="identity_requested">Identity requested</option><option value="identity_received">Identity received</option><option value="agreements_pending">Agreements pending</option><option value="agreements_complete">Agreements complete</option><option value="payment_pending">Payment pending</option><option value="payment_review">Payment review</option><option value="supplier_processing">Supplier processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
            <p>Payment verification is not available here until the accepted quote and matched payment record are in place. Do not use a reference typed into this form as proof of payment.</p>
            <label>Customer message<textarea rows={3} value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} /></label>
            <label>Internal note<textarea rows={3} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></label>
            {(["agreements_complete", "supplier_processing", "shipped", "cancelled"] as AssistedOrderStatus[]).includes(nextStatus) ? <label>Required canonical evidence or reason<input value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} required /></label> : null}
            <button className="xenios-order-button" type="submit" disabled={busy || detail.quickOrder?.observation.state === "stale"}>{busy ? "Updating…" : "Update status"}</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
