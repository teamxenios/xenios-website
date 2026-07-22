import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { listOrders } from "../../adapters/adminOps";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchPagination,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
  useDebounced,
  type BadgeTone,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/orders: the order queue. Publishes with the commerce
// backend; the queue chips, search, and pagination are ready and run
// client-side over whatever the API returns. Rows show order metadata only.
// ---------------------------------------------------------------------------

export type AdminOrderRow = {
  id: string;
  reference: string;
  member_email: string;
  status: string;
  total_cents: number;
  item_count: number;
  placed_at: string;
};

const ORDER_QUEUES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "fulfilling", label: "Fulfilling" },
  { key: "shipped", label: "Shipped" },
  { key: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 20;

export function orderTone(status: string): BadgeTone {
  if (status === "shipped" || status === "delivered") return "success";
  if (status === "cancelled" || status === "failed") return "danger";
  if (status === "pending") return "warning";
  if (status === "paid" || status === "fulfilling") return "info";
  return "neutral";
}

export default function OrdersAdmin() {
  return (
    <AdminScreen title="Orders" lead="Every order, by status. Open a row for items, payment state, and fulfillment.">
      {(token) => <OrdersBody token={token} />}
    </AdminScreen>
  );
}

function OrdersBody({ token }: { token: string }) {
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const loadOrdersQueue = useCallback(
    (t: string) => listOrders<{ ok: boolean; orders: AdminOrderRow[] }>(t, queue === "all" ? "" : queue),
    [queue],
  );
  const resource = useAdminResource(token, loadOrdersQueue);

  const filtered = useMemo(() => {
    const list = resource.data?.orders ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) => o.reference.toLowerCase().includes(q) || o.member_email.toLowerCase().includes(q));
  }, [resource.data, debounced]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);

  return (
    <div className="grid gap-6">
      <ResearchTabs
        tabs={ORDER_QUEUES}
        active={queue}
        onSelect={(key) => {
          setQueue(key);
          setPage(1);
        }}
        label="Order status queues"
      />
      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search orders"
          placeholder="Order reference or member email"
        />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The order queue publishes with the commerce backend."
        unavailableBody="Ordering is not open to members yet, so there are no orders to show. This queue renders live the moment the commerce backend connects."
      >
        <ResearchDataTable<AdminOrderRow>
          caption="Orders"
          columns={[
            {
              key: "reference",
              header: "Order",
              render: (o) => (
                <Link href={`${ADMIN_ROUTES.orders}/${o.id}`} className="font-700 underline">
                  {o.reference}
                </Link>
              ),
            },
            { key: "member", header: "Member", render: (o) => <span style={{ overflowWrap: "anywhere" }}>{o.member_email}</span> },
            { key: "items", header: "Items", render: (o) => <span className="tabular">{o.item_count}</span> },
            { key: "total", header: "Total", render: (o) => `$${(o.total_cents / 100).toFixed(2)}` },
            {
              key: "status",
              header: "Status",
              render: (o) => <ResearchStatusBadge label={o.status} tone={orderTone(o.status)} />,
            },
            { key: "placed", header: "Placed", render: (o) => fmtDate(o.placed_at) },
          ]}
          rows={filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)}
          rowKey={(o) => o.id}
          empty="No orders in this queue."
        />
        <ResearchPagination page={clamped} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <ResearchSecureNotice>
        Order rows show commerce metadata only: reference, member email, totals, and status. Nothing here reads from a
        member's health record.
      </ResearchSecureNotice>
    </div>
  );
}
