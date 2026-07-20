import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchSearch,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/inventory: stock levels per SKU. Publishes with the
// commerce backend and the fulfillment integration; renders live counts the
// moment the inventory API responds. Until then, an honest pending state.
// ---------------------------------------------------------------------------

type InventoryRow = {
  id: string;
  sku: string;
  product_name: string;
  on_hand: number;
  reserved: number;
  reorder_point: number | null;
  updated_at: string | null;
};

export default function Inventory() {
  return (
    <AdminScreen
      title="Inventory"
      lead="Stock on hand, reservations, and reorder points per SKU."
    >
      {(token) => <InventoryBody token={token} />}
    </AdminScreen>
  );
}

function InventoryBody({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const resource = useAdminResource<{ ok: boolean; inventory: InventoryRow[] }>(token, "/api/admin/research/inventory");

  const filtered = useMemo(() => {
    const list = resource.data?.inventory ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.sku.toLowerCase().includes(q) || r.product_name.toLowerCase().includes(q));
  }, [resource.data, debounced]);

  return (
    <div className="grid gap-6">
      <ResearchFilterBar>
        <ResearchSearch value={search} onChange={setSearch} label="Search inventory" placeholder="SKU or product" />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        onRetry={resource.reload}
        unavailableTitle="Inventory publishes with the commerce backend."
        unavailableBody="Live stock counts render here when the commerce backend and fulfillment integration connect. Nothing is estimated in the meantime."
      >
        <ResearchDataTable<InventoryRow>
          caption="Inventory by SKU"
          columns={[
            { key: "sku", header: "SKU", render: (r) => <span className="mono-label">{r.sku}</span> },
            { key: "product", header: "Product", render: (r) => r.product_name },
            { key: "onhand", header: "On hand", render: (r) => <span className="tabular">{r.on_hand}</span> },
            { key: "reserved", header: "Reserved", render: (r) => <span className="tabular">{r.reserved}</span> },
            {
              key: "level",
              header: "Level",
              render: (r) => {
                const available = r.on_hand - r.reserved;
                const low = r.reorder_point != null && available <= r.reorder_point;
                return (
                  <ResearchStatusBadge
                    label={low ? `Low, ${available} available` : `${available} available`}
                    tone={low ? "warning" : "success"}
                  />
                );
              },
            },
            { key: "updated", header: "Updated", render: (r) => fmtDate(r.updated_at) },
          ]}
          rows={filtered}
          rowKey={(r) => r.id}
          empty="No inventory rows yet."
        />
      </AdminBoundary>

      <div className="card">
        <p className="mono-label text-ink-mute">Related</p>
        <div className="flex gap-4 mt-2 flex-wrap">
          <Link href={ADMIN_ROUTES.products} className="body-s underline text-ink-mute">
            Products
          </Link>
          <Link href={ADMIN_ROUTES.fulfillment} className="body-s underline text-ink-mute">
            Fulfillment
          </Link>
          <Link href={ADMIN_ROUTES.capabilities} className="body-s underline text-ink-mute">
            Capability status
          </Link>
        </div>
      </div>
    </div>
  );
}
