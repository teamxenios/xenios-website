import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AssistedOrderAdminDetail,
  AssistedOrderStatus,
} from "../../../../shared/research/assisted-order/contract";
import {
  createAssistedOrderDocumentDownload,
  loadAssistedOrderAdminDetail,
  updateAssistedOrderStatus,
} from "./api";
import { useAdminSession } from "../pages/adminx/auth";
import { money } from "./wizard-state";
import "./assisted-order.css";

function requestIdFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

export function AdminAssistedOrderDetailPage() {
  // The canonical admin session (pages/adminx/auth): a Supabase browser session
  // yields the access token every /api/admin/* call carries, and the SERVER
  // decides authority per request. The browser never grants it.
  const { state: sessionState, token } = useAdminSession();
  const requestId = useMemo(requestIdFromPath, []);
  const [detail, setDetail] = useState<AssistedOrderAdminDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<AssistedOrderStatus>("reviewing");
  const [customerMessage, setCustomerMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    // No token, no call: an unauthorized read is never attempted.
    if (!token) return;
    setError(null);
    loadAssistedOrderAdminDetail(token, requestId).then(setDetail).catch((reason) => setError(reason instanceof Error ? reason.message : "The request could not be loaded."));
  };
  useEffect(refresh, [requestId, token]);

  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError("Your admin session has expired. Sign in again before changing a status.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const evidence = nextStatus === "paid"
        ? { paymentVerificationId: evidenceId }
        : nextStatus === "agreements_complete"
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
      setDetail(result);
      setCustomerMessage("");
      setInternalNote("");
      setEvidenceId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The status could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (documentId: string) => {
    if (!token) {
      setError("Your admin session has expired. Sign in again to open an identity document.");
      return;
    }
    const ticket = await createAssistedOrderDocumentDownload(token, requestId, documentId);
    window.open(ticket.url, "_blank", "noopener,noreferrer");
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
            <div className="xenios-order-review-lines">{detail.lines.map((line) => <article key={line.lineId}><div><strong>{line.productName}</strong><span>{line.specification}</span><span>{line.workflowMode.replaceAll("_", " ")}</span></div><div><span>Qty {line.quantity}</span><strong>{money(line.lineEstimateCents)}</strong></div></article>)}</div>
            {detail.generalNotes ? <div><h3>Customer notes</h3><p>{detail.generalNotes}</p></div> : null}
            <h3>Documents</h3>
            {detail.documents.length === 0 ? <p>No documents received.</p> : <ul>{detail.documents.map((document) => <li key={document.documentId}>{document.fileName} · {document.status.replaceAll("_", " ")} <button type="button" onClick={() => download(document.documentId)}>Open securely</button></li>)}</ul>}
            <h3>Timeline</h3>
            <ol className="xenios-order-timeline">{detail.timeline.map((event, index) => <li key={`${event.occurredAt}-${index}`}><strong>{event.status.replaceAll("_", " ")}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>{event.customerMessage ? <p>{event.customerMessage}</p> : null}</li>)}</ol>
          </section>
          <form className="xenios-order-panel xenios-order-admin-action" onSubmit={update}>
            <h2>Update request</h2>
            <label>New status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as AssistedOrderStatus)}><option value="reviewing">Reviewing</option><option value="waiting_on_customer">Waiting on customer</option><option value="identity_requested">Identity requested</option><option value="identity_received">Identity received</option><option value="agreements_pending">Agreements pending</option><option value="agreements_complete">Agreements complete</option><option value="payment_pending">Payment pending</option><option value="payment_review">Payment review</option><option value="paid">Paid</option><option value="supplier_processing">Supplier processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
            <label>Customer message<textarea rows={3} value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} /></label>
            <label>Internal note<textarea rows={3} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></label>
            {(["agreements_complete", "paid", "supplier_processing", "shipped", "cancelled"] as AssistedOrderStatus[]).includes(nextStatus) ? <label>Required canonical evidence or reason<input value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} required /></label> : null}
            <button className="xenios-order-button" type="submit" disabled={busy}>{busy ? "Updating…" : "Update status"}</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
