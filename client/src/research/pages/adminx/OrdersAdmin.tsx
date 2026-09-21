import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { OrderState } from "@shared/research/commerce";
import type { AdminOrderSummaryDto } from "@shared/research/commerce-api";
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
import { formatCents, orderStateMeta } from "../member/commerce-presentation";

// ---------------------------------------------------------------------------
// /admin/research/orders: the order queue. Publishes with the commerce
// backend; the queue chips, search, and pagination are ready and run
// client-side over whatever the API returns. Rows show order metadata only.
// ---------------------------------------------------------------------------

const ORDER_QUEUES = [
  { key: "all", label: "All", states: [] },
  { key: "pending", label: "Awaiting payment", states: ["draft", "checkout_pending", "payment_authorized", "approved"] },
  { key: "review", label: "Needs review", states: ["manual_review", "exception"] },
  { key: "paid", label: "Paid", states: ["payment_captured"] },
  { key: "fulfilling", label: "Fulfilling", states: ["processing", "partially_fulfilled"] },
  { key: "shipped", label: "Shipped", states: ["fulfilled", "delivered"] },
  { key: "closed", label: "Closed", states: ["cancelled", "refunded", "replaced"] },
] satisfies Array<{ key: string; label: string; states: OrderState[] }>;

const PAGE_SIZE = 20;

export function orderTone(status: string): BadgeTone {
  return orderStateMeta(status).tone;
}

export default function OrdersAdmin() {
  return (
    <AdminScreen title="Orders" lead="Native commerce orders, by status. Open a row for items, payment state, and fulfillment.">
      {(token) => <OrdersBody token={token} />}
    </AdminScreen>
  );
}

function OrdersBody({ token }: { token: string }) {
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const resource = useAdminResource(token, listOrders);

  const filtered = useMemo(() => {
    const states = ORDER_QUEUES.find((entry) => entry.key === queue)?.states as OrderState[] | undefined;
    const list = (resource.data?.orders ?? []).filter((order) => queue === "all" || states?.includes(order.state));
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) => o.orderId.toLowerCase().includes(q) || o.memberId.toLowerCase().includes(q));
  }, [resource.data, debounced, queue]);

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
          placeholder="Order reference or member ID"
        />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The order queue is unavailable."
        unavailableBody="The order records could not be read. This does not mean there are no orders; retry to check their current state."
      >
        <ResearchDataTable<AdminOrderSummaryDto>
          caption="Orders"
          columns={[
            {
              key: "reference",
              header: "Order",
              render: (o) => (
                <Link href={`${ADMIN_ROUTES.orders}/${encodeURIComponent(o.orderId)}`} className="font-700 underline" style={{ overflowWrap: "anywhere" }}>
                  {o.orderId}
                </Link>
              ),
            },
            { key: "member", header: "Member ID", render: (o) => <span style={{ overflowWrap: "anywhere" }}>{o.memberId}</span> },
            { key: "total", header: "Total", render: (o) => formatCents(o.totalCents) },
            { key: "captured", header: "Captured", render: (o) => o.capturedAmountCents === null ? "Not recorded" : formatCents(o.capturedAmountCents) },
            {
              key: "status",
              header: "Status",
              render: (o) => <ResearchStatusBadge label={orderStateMeta(o.state).label} tone={orderTone(o.state)} />,
            },
            { key: "placed", header: "Placed", render: (o) => fmtDate(o.placedAt) },
          ]}
          rows={filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)}
          rowKey={(o) => o.orderId}
          empty="No orders in this queue."
        />
        <ResearchPagination page={clamped} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <ResearchSecureNotice>
        Order rows show native commerce metadata only: reference, member ID, recorded amounts, and status. Other
        ordering lanes have their own queues. Nothing here reads from a member's health record.
      </ResearchSecureNotice>
    </div>
  );
}
