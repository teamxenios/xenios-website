import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchPagination,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { listProducts } from "../../adapters/adminOps";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/products: catalog administration. The member-facing catalog
// is already served read-only to active members; ADMIN write surfaces (create,
// edit, publish) publish with the commerce backend, so this page renders the
// admin product list when its API responds and an honest pending state until
// then. No editing controls are shown before the backend that would honor
// them exists.
// ---------------------------------------------------------------------------

type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  category: string | null;
  status: string;
  price_cents: number | null;
  updated_at: string | null;
};

const PAGE_SIZE = 20;

export default function ProductsAdmin() {
  return (
    <AdminScreen
      title="Products"
      lead="The catalog from the operations side: status, pricing, and publish state for every product."
    >
      {(token) => <ProductsBody token={token} />}
    </AdminScreen>
  );
}

function ProductsBody({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const resource = useAdminResource<{ ok: boolean; products: AdminProductRow[] }>(token, listProducts);

  const filtered = useMemo(() => {
    const list = resource.data?.products ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q),
    );
  }, [resource.data, debounced]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);

  return (
    <div className="grid gap-6">
      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search products"
          placeholder="Name, SKU, or category"
        />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="Product administration publishes with the commerce backend."
        unavailableBody="Members already see the read-only catalog. Admin creation, editing, and publishing land here when the commerce backend connects; no editing controls are shown before the backend that honors them exists."
      >
        <ResearchDataTable<AdminProductRow>
          caption="Products"
          columns={[
            {
              key: "name",
              header: "Product",
              render: (p) => (
                <Link href={`${ADMIN_ROUTES.products}/${p.id}`} className="font-700 underline">
                  {p.name}
                </Link>
              ),
            },
            { key: "sku", header: "SKU", render: (p) => p.sku ?? "" },
            { key: "category", header: "Category", render: (p) => p.category ?? "" },
            {
              key: "status",
              header: "Status",
              render: (p) => (
                <ResearchStatusBadge label={p.status} tone={p.status === "published" ? "success" : "neutral"} />
              ),
            },
            {
              key: "price",
              header: "Price",
              render: (p) => (p.price_cents == null ? "" : `$${(p.price_cents / 100).toFixed(2)}`),
            },
            { key: "updated", header: "Updated", render: (p) => fmtDate(p.updated_at) },
          ]}
          rows={filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)}
          rowKey={(p) => p.id}
          empty="No products in the admin catalog yet."
        />
        <ResearchPagination page={clamped} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <ResearchSecureNotice>
        Catalog copy is descriptive only and carries no health claims. Anything a member can read stays inside that
        discipline; this list is the place to catch drift.
      </ResearchSecureNotice>
    </div>
  );
}
