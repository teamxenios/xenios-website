import { useEffect, useState } from "react";
import type {
  AssistedOrderAdminListItem,
  AssistedOrderStatus,
} from "../../../../shared/research/assisted-order/contract";
import { loadAssistedOrderAdminList } from "./api";
import { useAdminSession } from "../pages/adminx/auth";
import { money } from "./wizard-state";
import "./assisted-order.css";

export function AdminAssistedOrderQueue() {
  // The canonical admin session (pages/adminx/auth): a Supabase browser session
  // yields the access token every /api/admin/* call carries, and the SERVER
  // decides authority per request. The browser never grants it.
  const { state: sessionState, token } = useAdminSession();
  const [items, setItems] = useState<readonly AssistedOrderAdminListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | AssistedOrderStatus>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No token, no call. The queue stays empty and the surface renders an
    // honest session state rather than a request that cannot be authorized.
    if (!token) {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      loadAssistedOrderAdminList(token, {
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      })
        .then((result) => {
          setItems(result.items);
          setTotal(result.total);
        })
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : "The queue could not be loaded."),
        )
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, status, page, token]);

  if (sessionState !== "ready") {
    return (
      <main className="xenios-order-page">
        <header className="xenios-order-hero">
          <p className="xenios-order-eyebrow">Research operations</p>
          <h1>Assisted order requests</h1>
        </header>
        <div className="xenios-order-error" role="alert">
          {sessionState === "loading"
            ? "Checking your admin session…"
            : sessionState === "unconfigured"
              ? "Admin sign-in is not configured for this deployment."
              : "Sign in with your Xenios admin account to review assisted order requests."}
        </div>
      </main>
    );
  }

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
