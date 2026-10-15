import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RequestIntentDetail, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestIntentApi } from "./request-intent-api";
import "./assisted-order.css";

/** Mount only inside the existing private staff shell. The server still enforces Care authorization. */
export function RequestIntentStaffReadback({ api }: Readonly<{ api: RequestIntentApi }>) {
  const [reference, setReference] = useState("");
  const [detail, setDetail] = useState<RequestIntentDetail | null>(null);
  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState<RequestIntentQueuePage | null>(null);
  const [page, setPage] = useState(1);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; }, []);
  useEffect(() => {
    let current = true;
    void api.staffQueue(page).then((result) => { if (current) setQueue(result); })
      .catch(() => { if (current) setMessage("Private queue access could not be confirmed."); });
    return () => { current = false; };
  }, [api, page]);
  async function read(event: FormEvent) {
    event.preventDefault(); const run = ++sequence.current; setDetail(null); setMessage("");
    const match = /^XRI-([0-9A-F]{32})$/i.exec(reference.trim());
    if (!match) { setMessage("Enter the saved request reference."); return; }
    const raw = match[1].toLowerCase();
    const id = [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join("-");
    try {
      const saved = await api.staff(id);
      if (sequence.current === run) setDetail(saved);
    } catch { if (sequence.current === run) setMessage("Private request access could not be confirmed. No authorization was bypassed."); }
  }
  return <section className="xenios-order-page"><h1>Private request readback</h1>
    <p>All items below are unapproved requests. This view cannot approve treatment, issue payment instructions, mark paid or release fulfillment.</p>
    {queue && <section aria-label="Pending private requests"><h2>Pending requests ({queue.total})</h2>
      <ul>{queue.items.map((entry) => <li key={entry.requestId}><button type="button" onClick={() => {
        sequence.current += 1; setDetail(null); setReference(entry.publicReference);
      }}>{entry.publicReference}</button> | {entry.lineCount} requested lines | {entry.createdAt}</li>)}</ul>
      <nav aria-label="Private request pages"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous requests</button>
        <button disabled={page * queue.pageSize >= queue.total} onClick={() => setPage((value) => value + 1)}>Next requests</button></nav>
    </section>}
    <form onSubmit={(event) => void read(event)}><label>Saved request reference<input value={reference} required onChange={(event) => {
      sequence.current += 1; setDetail(null); setReference(event.target.value);
    }} /></label><button className="xenios-order-button" type="submit">Retrieve private request</button></form>
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
