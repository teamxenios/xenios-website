import { useCallback } from "react";
import { Link, useParams } from "wouter";
import { getOrder } from "../../adapters/adminOps";
import { ResearchDataTable, ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { orderTone } from "./OrdersAdmin";

// ---------------------------------------------------------------------------
// /admin/research/orders/:id, one order: items, payment state, shipping, and
// the event history. Publishes with the commerce backend.
// ---------------------------------------------------------------------------

type AdminOrderDetail = {
  id: string;
  reference: string;
  member_email: string;
  status: string;
  total_cents: number;
  placed_at: string;
  payment_reference: string | null;
  shipping_summary: string | null;
  items: Array<{ id: string; name: string; sku: string | null; quantity: number; price_cents: number }>;
  events: Array<{ at: string; title: string; detail?: string }>;
};

export default function OrderAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Order"
      lead="One order: items, payment, shipping, and history."
      actions={
        <Link href={ADMIN_ROUTES.orders} className="btn btn-secondary">
          Back to orders
        </Link>
      }
    >
      {(token) => <OrderDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function OrderDetailBody({ token, id }: { token: string; id: string }) {
  const loadOrder = useCallback((t: string) => getOrder<{ ok: boolean; order: AdminOrderDetail }>(t, id), [id]);
  const resource = useAdminResource(token, loadOrder);
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Order records publish with the commerce backend."
      unavailableBody="This order file renders live when the commerce backend connects. Ordering is not open to members yet."
    >
      {(() => {
        const o = resource.data?.order;
        if (!o) return null;
        return (
          <div className="grid gap-6">
            <section className="card" aria-label="Order summary">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div style={{ minWidth: 0 }}>
                  <p className="body-l font-700">{o.reference}</p>
                  <p className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
                    {o.member_email}
                  </p>
                </div>
                <ResearchStatusBadge label={o.status} tone={orderTone(o.status)} />
              </div>
              <div className="grid gap-x-8 gap-y-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div>
                  <p className="mono-label text-ink-mute">Placed</p>
                  <p className="body-s mt-1">{fmtDate(o.placed_at)}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Total</p>
                  <p className="body-s mt-1">${(o.total_cents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Payment reference</p>
                  <p className="body-s mt-1" style={{ overflowWrap: "anywhere" }}>
                    {o.payment_reference ?? "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Shipping</p>
                  <p className="body-s mt-1">{o.shipping_summary ?? "Not recorded"}</p>
                </div>
              </div>
            </section>

            <section aria-label="Order items">
              <h2 className="body-l font-700 mb-4">Items</h2>
              <ResearchDataTable<AdminOrderDetail["items"][number]>
                caption="Order items"
                columns={[
                  { key: "name", header: "Item", render: (i) => i.name },
                  { key: "sku", header: "SKU", render: (i) => i.sku ?? "" },
                  { key: "qty", header: "Qty", render: (i) => <span className="tabular">{i.quantity}</span> },
                  { key: "price", header: "Price", render: (i) => `$${(i.price_cents / 100).toFixed(2)}` },
                ]}
                rows={o.items ?? []}
                rowKey={(i) => i.id}
                empty="No items recorded."
              />
            </section>

            <section aria-label="Order history">
              <h2 className="body-l font-700 mb-4">History</h2>
              <ResearchTimeline items={o.events ?? []} />
            </section>
          </div>
        );
      })()}
    </AdminBoundary>
  );
}
