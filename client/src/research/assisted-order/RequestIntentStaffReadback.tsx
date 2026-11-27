import { REQUEST_GOALS } from "../../../../shared/research/assisted-order/optional-intake";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestIntentDetail, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentHttpError, type RequestIntentApi } from "./request-intent-api";
import type { AssistedOrderAddressInput } from "../../../../shared/research/assisted-order/contract";
import "./assisted-order.css";
import "./staff-desk-v2.css";
import { PrivateQuoteDesk } from "./PrivateQuoteDesk";
import { StaffRequestWorkflowPanel } from "./RequestWorkflowStatus";
import type { StaffReviewCommandJournal } from "./StaffStartReviewControl";

export type RequestIntentStaffReviewSession = Readonly<{ sessionInstance: object; journal: StaffReviewCommandJournal }>;

type QueueLoad = Readonly<{ api: RequestIntentApi; page: number; attempt: number }> & (
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: RequestIntentQueuePage }>
  | Readonly<{ status: "error"; reason: "session" | "denied" | "unavailable" }>
);

/**
 * A staff notice links here with ?reference=XRI-... . After the authenticated
 * staff shell mounts, the server-authorized read opens that exact request.
 */
export function linkedRequestReference(search: string): string {
  const values = new URLSearchParams(search).getAll("reference");
  const value = values.length === 1 ? values[0].trim() : "";
  return /^XRI-[0-9A-F]{32}$/i.test(value) ? value.toUpperCase() : "";
}

/** Mount only inside the existing private staff shell. The server still enforces Care authorization. */
export function RequestIntentStaffReadback({ api, reviewSession, onReferenceChange }: Readonly<{
  api: RequestIntentApi; reviewSession?: RequestIntentStaffReviewSession;
  onReferenceChange?: (reference: string) => void;
}>) {
  const initialLinkedReference = useRef(
    typeof window === "undefined" ? "" : linkedRequestReference(window.location.search));
  const initialLinkConsumed = useRef(false);
  const [reference, setReference] = useState(initialLinkedReference.current);
  const [detail, setDetail] = useState<RequestIntentDetail | null>(null);
  const [detailPending, setDetailPending] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [queueAttempt, setQueueAttempt] = useState(0);
  const [queueLoad, setQueueLoad] = useState<QueueLoad | null>(null);
  const sequence = useRef(0);
  const pendingRead = useRef<number | null>(null);
  const pendingReference = useRef<string | null>(null);
  const detailPanel = useRef<HTMLElement | null>(null);
  const currentApi = useRef(api);
  currentApi.current = api;
  useEffect(() => () => {
    sequence.current += 1; pendingRead.current = null; pendingReference.current = null;
  }, []);
  useEffect(() => {
    // Same-session credentials retain inputs/drafts, but supersede pending reads.
    sequence.current += 1; pendingRead.current = null; pendingReference.current = null; setDetailPending(false);
  }, [api]);
  useEffect(() => {
    let current = true;
    const scope = { api, page, attempt: queueAttempt };
    setQueueLoad({ ...scope, status: "loading" });
    void api.staffQueue(page).then((result) => {
      if (current) setQueueLoad({ ...scope, status: "ready", data: result });
    }).catch((error: unknown) => {
      if (!current) return;
      const reason = error instanceof RequestIntentHttpError && error.status === 401 ? "session"
        : error instanceof RequestIntentHttpError && error.status === 403 ? "denied" : "unavailable";
      if (reason !== "unavailable") {
        sequence.current += 1; pendingRead.current = null; pendingReference.current = null;
        setDetail(null); setDetailPending(false);
      }
      setQueueLoad({ ...scope, status: "error", reason });
    });
    return () => { current = false; };
  }, [api, page, queueAttempt]);
  // A page/retry change hides old rows in the same render, before its effect.
  // The existing epoch-keyed staff shell still owns session isolation.
  const currentQueue = queueLoad?.api === api && queueLoad.page === page
    && queueLoad.attempt === queueAttempt ? queueLoad : null;
  const queue = currentQueue?.status === "ready" ? currentQueue.data : null;
  const queueLoading = !currentQueue || currentQueue.status === "loading";
  const readReference = useCallback(async (requestedReference: string) => {
    initialLinkConsumed.current = true;
    const normalized = requestedReference.trim().toUpperCase();
    // Repeated actions on the same pending request share one read. A different
    // selection supersedes it immediately; stale responses cannot repaint.
    if (pendingRead.current !== null && pendingReference.current === normalized) return;
    const run = ++sequence.current;
    pendingRead.current = null; pendingReference.current = null;
    setDetailPending(false); setDetail(null); setMessage(""); setReference(normalized);
    const match = /^XRI-([0-9A-F]{32})$/i.exec(normalized);
    if (!match) { setMessage("Enter the saved request reference."); return; }
    onReferenceChange?.(normalized);
    const raw = match[1].toLowerCase();
    const id = [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join("-");
    pendingRead.current = run; pendingReference.current = normalized; setDetailPending(true);
    try {
      const saved = await api.staff(id);
      if (saved.requestId?.toLowerCase() !== id || saved.publicReference?.toUpperCase() !== "XRI-" + match[1].toUpperCase()) {
        throw new Error("Private request identity mismatch");
      }
      if (sequence.current === run && currentApi.current === api) setDetail(saved);
    } catch { if (sequence.current === run && currentApi.current === api) setMessage("Private request access could not be confirmed. No authorization was bypassed."); }
    finally {
      // An obsolete response must not unlock a newer pending retrieval.
      if (sequence.current === run && currentApi.current === api) {
        pendingRead.current = null; pendingReference.current = null; setDetailPending(false);
      }
    }
  }, [api, onReferenceChange]);
  useEffect(() => {
    if (!initialLinkedReference.current || initialLinkConsumed.current) return;
    let current = true;
    // Consume the initial link once per authenticated mount. Deferring one
    // microtask lets StrictMode discard its first effect setup without either
    // issuing a duplicate read or losing the surviving setup's linked request.
    void Promise.resolve().then(() => {
      if (current && !initialLinkConsumed.current) void readReference(initialLinkedReference.current);
    });
    return () => { current = false; };
  }, [readReference]);
  useEffect(() => { if (detail) detailPanel.current?.focus(); }, [detail]);
  return <section className="xenios-order-page xenios-staff-desk"><h1>Private request readback</h1>
    <p>All items below are unapproved requests. This view cannot approve treatment, issue payment instructions, mark paid or release fulfillment.</p>
    <section aria-label="Private request inbox"><h2>Requests{queue && ` (${queue.total})`}</h2>
      <p>Saved requests in your authorized scope. Their original receipt stays pending review; current processing progress appears in the opened record.</p>
      {queueLoading && <p role="status">Loading requests...</p>}
      {currentQueue?.status === "error" && <>
        <p role="alert">{currentQueue.reason === "session" ? "Your session expired. Sign in again to read the private queue."
          : currentQueue.reason === "denied" ? "You do not have access to this private request queue."
          : "Private queue access could not be confirmed. The request list is unavailable; this does not mean there are no requests."}</p>
        <button type="button" onClick={() => setQueueAttempt((value) => value + 1)}>Retry this page</button>
      </>}
      {queue && queue.items.length === 0 && <p>{queue.total === 0
        ? "No requests were returned within your authorized scope."
        : "No requests were returned for this page. Use Previous requests to check an earlier page."}</p>}
      {queue && <ul>{queue.items.map((entry) => <li key={entry.requestId}><button type="button" onClick={() => void readReference(entry.publicReference)}>{entry.publicReference}</button> | {entry.lineCount} requested lines | {entry.createdAt}</li>)}</ul>}
      <nav aria-label="Private request pages"><button disabled={queueLoading || page <= 1}
        onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous requests</button>
        <button disabled={queueLoading || !queue || page * queue.pageSize >= queue.total}
          onClick={() => setPage((value) => value + 1)}>Next requests</button></nav>
    </section>
    <form aria-busy={detailPending} onSubmit={(event) => { event.preventDefault(); void readReference(reference); }}><label>Saved request reference<input value={reference} required onChange={(event) => {
      sequence.current += 1; pendingRead.current = null; pendingReference.current = null; setDetailPending(false); setDetail(null); initialLinkConsumed.current = true; setReference(event.target.value);
    }} /></label><button className="xenios-order-button" type="submit" disabled={detailPending}>Retrieve private request</button></form>
    {detailPending && <p role="status">Retrieving private request...</p>}
    {message && <p role="alert">{message}</p>}
    {detail && <section ref={detailPanel} tabIndex={-1} aria-label="Request details" style={{ overflowWrap: "anywhere" }}><h2>{detail.publicReference}</h2>
      <p>Received: <time dateTime={detail.createdAt}>{detail.createdAt}</time></p>
      <p>Saved receipt: Pending review. This receipt is not a treatment, order, payment or fulfillment approval.</p>
      <p>{detail.contact.fullLegalName} | {detail.contact.email} | {detail.contact.mobilePhone}</p>
      {detail.optionalIntake && <section aria-label="Optional customer information">
        {detail.optionalIntake.goal && <p>Customer goal: {REQUEST_GOALS[detail.optionalIntake.goal]}</p>}
        {detail.optionalIntake.referralCode && <p>Referral code (customer-reported; unverified): {detail.optionalIntake.referralCode}</p>}
      </section>}
      {detail.contact.organizationName && <p>Organization: {detail.contact.organizationName}</p>}
      <p>Submitted age confirmation: {detail.contact.ageConfirmed === true ? "Confirmed"
        : detail.contact.ageConfirmed === false ? "Not confirmed" : "Not returned"}</p>
      <section aria-label="Requested delivery address"><h3>Requested delivery address</h3>
        <RequestedAddress address={detail.contact.shippingAddress} />
      </section>
      <section aria-label="Requested billing address"><h3>Requested billing address</h3>
        {detail.contact.billingSameAsShipping ? <p>Same as requested delivery address.</p>
          : detail.contact.billingAddress ? <RequestedAddress address={detail.contact.billingAddress} />
          : <p>Separate billing address not provided.</p>}
      </section>
      <ul>{detail.lines.map((line) => <li key={JSON.stringify([line.productId, line.variantId])}>
        <strong>{line.productName}</strong> | {line.specification || "Form not stated"} | {line.variantId} | Requested quantity: {line.quantity} |
        Pending {line.clinicalReviewRequired ? "clinical" : "internal"} review
        {line.researchUseOnly && " | Research Use Only"}
        {line.sourceRefusal && " | Source restriction: " + line.sourceRefusal}
        <details><summary>Saved item details</summary><dl>
          <dt>Product identifier</dt><dd>{line.productId}</dd>
          <dt>Submitted variant</dt><dd>{line.variantId}</dd>
          <dt>Source variant</dt><dd>{line.sourceVariantId}</dd>
          <dt>Family</dt><dd>{line.family}</dd>
          <dt>Request pathway</dt><dd>{line.workflowMode}</dd>
          <dt>Catalog version</dt><dd>{line.catalogVersion}</dd>
          <dt>Saved product / variant display states</dt><dd>{line.sourceDisplayState} / {line.sourceVariantDisplayState}</dd>
          {line.reviewCode && <><dt>Current listing review code</dt><dd>{line.reviewCode}</dd></>}
        </dl></details>
      </li>)}</ul>
      <section aria-label="Saved request acknowledgments"><h3>Saved acknowledgments</h3>
        {detail.agreements.length === 0 ? <p>No saved acknowledgment entries were returned.</p>
          : <ul>{detail.agreements.map((entry, index) => <li key={JSON.stringify([entry.kind, entry.version, index])}>
            {entry.kind} | Version: {entry.version} | Accepted: {entry.accepted ? "Yes" : "No"} | <time dateTime={entry.acceptedAt}>{entry.acceptedAt}</time>
          </li>)}</ul>}
      </section>
      {api.staffWorkflow && <StaffRequestWorkflowPanel key={detail.requestId} requestId={detail.requestId} read={api.staffWorkflow}
        review={reviewSession && api.startReview ? { ...reviewSession, startReview: api.startReview } : undefined} />}
      <PrivateQuoteDesk key={JSON.stringify([detail.requestId,detail.contact.email])} detail={detail} />
    </section>}
  </section>;
}

function RequestedAddress({ address }: Readonly<{ address: AssistedOrderAddressInput | null | undefined }>) {
  // Partial readbacks can reach this component: the adapter checks contact
  // presence, not every address field. Missing data is never an address.
  if (!address) return <p>Address not provided.</p>;
  return <address>
    <div>{address.line1}</div>
    {address.line2 && <div>{address.line2}</div>}
    <div>{address.city}</div><div>{address.region}</div>
    <div>{address.postalCode}</div><div>{address.countryCode}</div>
  </address>;
}
