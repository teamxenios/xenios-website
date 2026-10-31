import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RequestIntentDetail, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestIntentApi } from "./request-intent-api";
import "./assisted-order.css";

type QueueLoad = Readonly<{ api: RequestIntentApi; page: number; attempt: number }> & (
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: RequestIntentQueuePage }>
  | Readonly<{ status: "error" }>
);

/** Mount only inside the existing private staff shell. The server still enforces Care authorization. */
export function RequestIntentStaffReadback({ api }: Readonly<{ api: RequestIntentApi }>) {
  const [reference, setReference] = useState("");
  const [detail, setDetail] = useState<RequestIntentDetail | null>(null);
  const [detailPending, setDetailPending] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [queueAttempt, setQueueAttempt] = useState(0);
  const [queueLoad, setQueueLoad] = useState<QueueLoad | null>(null);
  const sequence = useRef(0);
  const pendingRead = useRef<number | null>(null);
  useEffect(() => () => { sequence.current += 1; }, []);
  useEffect(() => {
    let current = true;
    const scope = { api, page, attempt: queueAttempt };
    setQueueLoad({ ...scope, status: "loading" });
    void api.staffQueue(page).then((result) => {
      if (current) setQueueLoad({ ...scope, status: "ready", data: result });
    }).catch(() => { if (current) setQueueLoad({ ...scope, status: "error" }); });
    return () => { current = false; };
  }, [api, page, queueAttempt]);
  // A page/retry change hides old rows in the same render, before its effect.
  // The existing epoch-keyed staff shell still owns session isolation.
  const currentQueue = queueLoad?.api === api && queueLoad.page === page
    && queueLoad.attempt === queueAttempt ? queueLoad : null;
  const queue = currentQueue?.status === "ready" ? currentQueue.data : null;
  const queueLoading = !currentQueue || currentQueue.status === "loading";
  async function read(event: FormEvent) {
    event.preventDefault();
    // A synchronous guard also covers repeated submits before React renders.
    if (pendingRead.current !== null) return;
    const run = ++sequence.current; setDetail(null); setMessage("");
    const match = /^XRI-([0-9A-F]{32})$/i.exec(reference.trim());
    if (!match) { setMessage("Enter the saved request reference."); return; }
    const raw = match[1].toLowerCase();
    const id = [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join("-");
    pendingRead.current = run; setDetailPending(true);
    try {
      const saved = await api.staff(id);
      if (sequence.current === run) setDetail(saved);
    } catch { if (sequence.current === run) setMessage("Private request access could not be confirmed. No authorization was bypassed."); }
    finally {
      // An obsolete response must not unlock a newer pending retrieval.
      if (sequence.current === run) { pendingRead.current = null; setDetailPending(false); }
    }
  }
  return <section className="xenios-order-page"><h1>Private request readback</h1>
    <p>All items below are unapproved requests. This view cannot approve treatment, issue payment instructions, mark paid or release fulfillment.</p>
    <section aria-label="Pending private requests"><h2>Pending requests{queue && ` (${queue.total})`}</h2>
      {queueLoading && <p role="status">Loading pending requests...</p>}
      {currentQueue?.status === "error" && <>
        <p role="alert">Private queue access could not be confirmed.</p>
        <button type="button" onClick={() => setQueueAttempt((value) => value + 1)}>Retry this page</button>
      </>}
      {queue && queue.items.length === 0 && <p>No pending requests were returned for this page.</p>}
      {queue && <ul>{queue.items.map((entry) => <li key={entry.requestId}><button type="button" onClick={() => {
        sequence.current += 1; pendingRead.current = null; setDetailPending(false); setDetail(null); setReference(entry.publicReference);
      }}>{entry.publicReference}</button> | {entry.lineCount} requested lines | {entry.createdAt}</li>)}</ul>}
      <nav aria-label="Private request pages"><button disabled={queueLoading || page <= 1}
        onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous requests</button>
        <button disabled={queueLoading || !queue || page * queue.pageSize >= queue.total}
          onClick={() => setPage((value) => value + 1)}>Next requests</button></nav>
    </section>
    <form aria-busy={detailPending} onSubmit={(event) => void read(event)}><label>Saved request reference<input value={reference} required onChange={(event) => {
      sequence.current += 1; pendingRead.current = null; setDetailPending(false); setDetail(null); setReference(event.target.value);
    }} /></label><button className="xenios-order-button" type="submit" disabled={detailPending}>Retrieve private request</button></form>
    {detailPending && <p role="status">Retrieving private request...</p>}
    {message && <p role="alert">{message}</p>}
    {detail && <section><h2>{detail.publicReference}</h2>
      <p>{detail.contact.fullLegalName} | {detail.contact.email} | {detail.contact.mobilePhone}</p>
      <ul>{detail.lines.map((line) => <li key={JSON.stringify([line.productId, line.variantId])}>
        <strong>{line.productName}</strong> | {line.specification || "Form not stated"} | {line.variantId} | Requested quantity: {line.quantity} |
        Pending {line.clinicalReviewRequired ? "clinical" : "internal"} review
        {line.researchUseOnly && " | Research Use Only"}
        {line.sourceRefusal && " | Source restriction: " + line.sourceRefusal}
      </li>)}</ul></section>}
  </section>;
}
