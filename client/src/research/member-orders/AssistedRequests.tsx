import { Link } from "wouter";
import { money } from "../assisted-order/wizard-state";
import { ResearchStatusBadge } from "../ui/kit";
import type { AssistedRequestHistory } from "./request-read";

/** Request status and estimates stay separate from the paid-order ledger. */
export function AssistedRequests({ history }: { history: AssistedRequestHistory | null }) {
  const requests = history?.requests ?? [];
  const connected = history?.source.connected === true;
  const complete = connected && history?.source.complete === true;
  return (
    <section className="card min-w-0 mt-6" aria-labelledby="assisted-request-history-heading" data-testid="assisted-request-history">
      <h2 id="assisted-request-history-heading" className="h2">Assisted order requests (XRR)</h2>
      <p className="body-s text-ink-2 mt-3 max-w-[68ch]">Requests are separate from order records. A request status or estimate does not establish captured payment, a carrier, or a shipment.</p>
      {!complete ? <div role="note" className="mt-4">
        <p className="body-s font-700">{connected ? "Assisted request history is partial." : "Assisted request history is unavailable."}</p>
        <p className="body-s text-ink-2 mt-1">{connected
          ? "Only the returned requests are shown; the complete request count is unavailable."
          : "This is not confirmation that no requests exist."}</p>
      </div> : null}
      {requests.length ? <div className="grid min-w-0 grid-cols-1 gap-4 mt-6">
        {requests.map((request) => <article key={request.requestId} className="card min-w-0" data-testid="assisted-request-record">
          <p className="mono-label text-ink-mute">Assisted request</p>
          <h3 className="body-m font-700 break-words mt-2">{request.publicReference}</h3>
          <div className="flex flex-wrap gap-3 mt-3">
            <ResearchStatusBadge label={`Request status: ${request.status.replaceAll("_", " ")}`} tone="neutral" />
            <span className="body-s tabular" data-testid="assisted-request-estimate">Estimate: {money(request.estimatedTotalCents)}</span>
          </div>
          <p className="body-s text-ink-2 mt-3">Submitted <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString("en-US")}</time></p>
          {request.lines.length ? <ul className="grid min-w-0 gap-3 mt-4">
            {request.lines.map((line, index) => <li key={index} className="body-s break-words">
              <strong>{line.productName}</strong>{line.specification ? ` · ${line.specification}` : ""}
              <span className="block text-ink-2">Quantity {line.quantity} · Line estimate: {money(line.lineEstimateCents)}</span>
            </li>)}
          </ul> : <p className="body-s text-ink-2 mt-4">Request line details unavailable.</p>}
          {request.trackingReference ? <p className="body-s mt-4" style={{ overflowWrap: "anywhere" }} data-testid="assisted-request-tracking">Recorded tracking reference: {request.trackingReference}</p> : null}
          <Link className="btn btn-secondary min-h-11 min-w-11 mt-4" href={`/research/early-access/order-request/${encodeURIComponent(request.publicReference)}`}>Open request status</Link>
        </article>)}
      </div> : complete ? <p className="body-s text-ink-2 mt-4">No assisted order requests were returned for this account.</p> : null}
    </section>
  );
}
