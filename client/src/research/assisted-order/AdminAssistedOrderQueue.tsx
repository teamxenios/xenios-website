import { useEffect, useState } from "react";
import type {
  AssistedOrderAdminListItem,
  AssistedOrderStatus,
} from "../../../../shared/research/assisted-order/contract";
import { AssistedOrderApiError, loadAssistedOrderAdminList } from "./api";
import { AdminAssistedOrderSession, type AssistedOrderAdminScope } from "./AdminAssistedOrderSession";
import { money } from "./wizard-state";
import "./assisted-order.css";

export function AdminAssistedOrderQueue() {
  return <AdminAssistedOrderSession title="Assisted order requests">
    {(scope) => <AdminAssistedOrderQueueBody {...scope} />}
  </AdminAssistedOrderSession>;
}

function AdminAssistedOrderQueueBody({ token, isCurrent, deny }: AssistedOrderAdminScope) {
  const [result, setResult] = useState<Readonly<{ queryKey: string; items: readonly AssistedOrderAdminListItem[]; total: number }> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | AssistedOrderStatus>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryKey = JSON.stringify([search, status, page]);
  const items = result?.queryKey === queryKey ? result.items : [];
  const total = result?.queryKey === queryKey ? result.total : 0;

  useEffect(() => {
    let alive = true;
    setResult(null);
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      if (!alive || !isCurrent()) return;
      loadAssistedOrderAdminList(token, {
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      })
        .then((result) => {
          if (alive && isCurrent()) setResult({ queryKey, items: result.items, total: result.total });
        })
        .catch((reason) => {
          if (!alive || !isCurrent()) return;
          if (reason instanceof AssistedOrderApiError && [401, 403].includes(reason.status)) deny();
          else setError(reason instanceof Error ? reason.message : "The queue could not be loaded.");
        })
        .finally(() => { if (alive && isCurrent()) setLoading(false); });
    }, 200);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search, status, page, token, isCurrent, deny, queryKey]);

  return (
    <main className="xenios-order-page">
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Research operations</p>
        <h1>Assisted order requests</h1>
        <p>Review Early Access requests, documentation state, payment state, and fulfillment progress.</p>
      </header>
      <section className="xenios-order-panel xenios-order-filters">
        <label>Search<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Reference, name, email, organization" /></label>
        <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value as "" | AssistedOrderStatus); setPage(1); }}><option value="">All statuses</option><option value="submitted">Submitted</option><option value="reviewing">Reviewing</option><option value="waiting_on_customer">Waiting on customer</option><option value="identity_requested">Identity requested</option><option value="agreements_pending">Agreements pending</option><option value="payment_pending">Payment pending</option><option value="payment_review">Payment review</option><option value="paid">Paid</option><option value="supplier_processing">Supplier processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
      </section>
      {loading ? <p className="xenios-order-loading">Loading requests…</p> : null}
      {error ? <div className="xenios-order-error" role="alert">{error}</div> : null}
      <section className="xenios-order-admin-table" aria-label="Assisted order request queue">
        <div className="xenios-order-admin-row xenios-order-admin-row--head"><span>Request</span><span>Customer</span><span>Items</span><span>Value</span><span>Status</span><span>Created</span></div>
        {items.map((item) => (
          <a className="xenios-order-admin-row" href={`/admin/research/assisted-orders/${item.requestId}`} key={item.requestId}>
            <span><strong>{item.publicReference}</strong><small>{item.organizationName}</small></span>
            <span><strong>{item.fullLegalName}</strong><small>{item.email}</small></span>
            <span>{item.lineCount} lines · {item.totalQuantity} units</span>
            <span>{money(item.estimatedTotalCents)}</span>
            <span>{item.status.replaceAll("_", " ")}</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </a>
        ))}
        {!loading && items.length === 0 ? <p className="xenios-order-empty">No requests match these filters.</p> : null}
      </section>
      <div className="xenios-order-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page} · {total} requests</span><button type="button" disabled={page * 25 >= total} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </main>
  );
}
