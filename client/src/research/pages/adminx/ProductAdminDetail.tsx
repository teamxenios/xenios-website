import { useCallback } from "react";
import { Link, useParams } from "wouter";
import { getProduct } from "../../adapters/adminOps";
import { ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/products/:id, one product from the operations side.
// Publishes with the commerce backend. When live it renders the record,
// inventory linkage, and the change history; until then, an honest pending
// state.
// ---------------------------------------------------------------------------

type AdminProductDetail = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  category: string | null;
  status: string;
  price_cents: number | null;
  description: string | null;
  inventory_on_hand: number | null;
  updated_at: string | null;
  history: Array<{ at: string; title: string; detail?: string }>;
};

export default function ProductAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Product"
      lead="One catalog record: publish state, pricing, inventory linkage, and history."
      actions={
        <Link href={ADMIN_ROUTES.products} className="btn btn-secondary">
          Back to products
        </Link>
      }
    >
      {(token) => <ProductDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function ProductDetailBody({ token, id }: { token: string; id: string }) {
  const loadProduct = useCallback(
    (t: string) => getProduct<{ ok: boolean; product: AdminProductDetail }>(t, id),
    [id],
  );
  const resource = useAdminResource(token, loadProduct);
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      onRetry={resource.reload}
      unavailableTitle="Product administration publishes with the commerce backend."
      unavailableBody="This record renders live when the commerce backend connects. The member-facing catalog remains read-only in the meantime."
    >
      {(() => {
        const p = resource.data?.product;
        if (!p) return null;
        return (
          <div className="grid gap-6">
            <section className="card" aria-label="Product record">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div style={{ minWidth: 0 }}>
                  <p className="body-l font-700">{p.name}</p>
                  <p className="mono-label text-ink-mute mt-1">{p.sku ? `SKU ${p.sku}` : p.slug}</p>
                </div>
                <ResearchStatusBadge label={p.status} tone={p.status === "published" ? "success" : "neutral"} />
              </div>
              {p.description && <p className="body-s text-ink-2 mt-4 max-w-[64ch]">{p.description}</p>}
              <div className="grid gap-x-8 gap-y-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div>
                  <p className="mono-label text-ink-mute">Price</p>
                  <p className="body-s mt-1">{p.price_cents == null ? "Not set" : `$${(p.price_cents / 100).toFixed(2)}`}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Category</p>
                  <p className="body-s mt-1">{p.category ?? "Not set"}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">On hand</p>
                  <p className="body-s mt-1">{p.inventory_on_hand == null ? "Not reported" : p.inventory_on_hand}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Updated</p>
                  <p className="body-s mt-1">{fmtDate(p.updated_at) || "Not recorded"}</p>
                </div>
              </div>
              <div className="mt-4">
                <Link href={ADMIN_ROUTES.inventory} className="body-s underline text-ink-mute">
                  Open inventory
                </Link>
              </div>
            </section>
            <section aria-label="Product history">
              <h2 className="body-l font-700 mb-4">History</h2>
              <ResearchTimeline items={p.history ?? []} />
            </section>
          </div>
        );
      })()}
    </AdminBoundary>
  );
}
