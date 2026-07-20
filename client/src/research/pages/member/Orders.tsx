import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { apiGet } from "../../lib/api";
import { devFixture } from "../../lib/fixtures";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  capabilityStatusOrPending,
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchEmptyState,
  ResearchFilterBar,
  ResearchPagination,
  ResearchRouteBoundary,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
  useDebounced,
  type BadgeTone,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Member Orders (/research/member/orders). Every order fact on this page
// comes from GET /api/research/member/orders. While ordering has not opened
// (the endpoint is unpublished or product_commerce is not enabled) the page
// says so honestly and shows the capability panel; dev builds may render
// typed fixtures via devFixture, production never does. Nothing here invents
// a status, a total, or a date the server did not supply.
// ---------------------------------------------------------------------------

// The full order status vocabulary. The label IS the state (never color
// alone); unknown server statuses render prettified with a neutral tone
// rather than being hidden.
const ORDER_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  checkout_pending: { label: "Checkout pending", tone: "pending" },
  payment_authorized: { label: "Payment authorized", tone: "info" },
  samuel_review: { label: "Samuel review", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  partially_shipped: { label: "Partially shipped", tone: "info" },
  shipped: { label: "Shipped", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  exception: { label: "Exception", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
  replaced: { label: "Replaced", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function normalizeStatusKey(status?: string | null): string {
  return (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function orderStatusMeta(status?: string | null): { label: string; tone: BadgeTone } {
  const key = normalizeStatusKey(status);
  if (ORDER_STATUS_META[key]) return ORDER_STATUS_META[key];
  if (!key) return { label: "Status pending", tone: "pending" };
  // Unknown vocabulary from the server: show it plainly, never hide it.
  const label = key.replace(/_/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), tone: "neutral" };
}

// Money helpers: prefer a server-formatted display string; fall back to
// formatting integer cents. Never invent an amount when neither exists.
export function formatMoney(cents?: number | null, display?: string | null): string | null {
  if (display) return display;
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }
  return null;
}

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export interface MemberOrderSummary {
  id: string;
  number?: string | null;
  placedAt?: string | null;
  itemCount?: number | null;
  itemSummary?: string | null;
  status?: string | null;
  totalCents?: number | null;
  totalDisplay?: string | null;
}

type OrdersPayload = { orders?: MemberOrderSummary[] } | MemberOrderSummary[];

function normalizeOrders(payload: OrdersPayload): MemberOrderSummary[] {
  const list = Array.isArray(payload) ? payload : payload?.orders ?? [];
  return list.filter((o) => o && o.id);
}

// Dev-only synthetic orders exercising the status vocabulary. devFixture
// returns null in production, so a live member can never see these.
function fixtureOrders(): MemberOrderSummary[] {
  return [
    {
      id: "fix-1042",
      number: "XR-1042",
      placedAt: "2026-07-12",
      itemCount: 3,
      itemSummary: "3 items",
      status: "partially_shipped",
      totalCents: 21400,
    },
    {
      id: "fix-1041",
      number: "XR-1041",
      placedAt: "2026-07-02",
      itemCount: 1,
      status: "delivered",
      totalCents: 6900,
    },
    {
      id: "fix-1040",
      number: "XR-1040",
      placedAt: "2026-06-24",
      itemCount: 2,
      status: "samuel_review",
      totalCents: 15800,
    },
    {
      id: "fix-1039",
      number: "XR-1039",
      placedAt: "2026-06-10",
      itemCount: 1,
      status: "exception",
      totalCents: 8400,
    },
    {
      id: "fix-1038",
      number: "XR-1038",
      placedAt: "2026-05-28",
      itemCount: 2,
      status: "refunded",
      totalCents: 12600,
    },
  ];
}

// Status filter groups (the tab label carries the meaning; the badge in the
// row still shows the exact status).
const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "shipping", label: "Shipping" },
  { key: "delivered", label: "Delivered" },
  { key: "attention", label: "Needs attention" },
  { key: "closed", label: "Closed" },
];

const FILTER_GROUPS: Record<string, string[]> = {
  in_progress: ["checkout_pending", "payment_authorized", "samuel_review", "processing"],
  shipping: ["partially_shipped", "shipped"],
  delivered: ["delivered"],
  attention: ["exception"],
  closed: ["refunded", "replaced", "cancelled"],
};

const PAGE_SIZE = 10;

type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

const COMMERCE_CAPABILITY: ResearchCapability = "product_commerce";

export default function Orders() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [orders, setOrders] = useState<MemberOrderSummary[]>([]);
  const [source, setSource] = useState<"server" | "fixture">("server");
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounced(query);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    const result = await apiGet<OrdersPayload>("/api/research/member/orders", memberToken);
    if (result.kind === "ok") {
      setOrders(normalizeOrders(result.data));
      setSource("server");
      setState("ok");
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      const fixture = devFixture(fixtureOrders);
      if (fixture) {
        setOrders(fixture);
        setSource("fixture");
        setState("ok");
      } else {
        setState("unavailable");
      }
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Capability statuses are fetched once per page; the map degrades to
  // honest pending defaults when the registry endpoint is absent.
  useEffect(() => {
    let cancelled = false;
    void fetchCapabilities(memberToken).then((map) => {
      if (!cancelled) setCapabilities(map);
    });
    return () => {
      cancelled = true;
    };
  }, [memberToken]);

  const commerceStatus = capabilityStatusOrPending(capabilities, COMMERCE_CAPABILITY);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== "all") {
        const group = FILTER_GROUPS[filter] ?? [];
        if (!group.includes(normalizeStatusKey(order.status))) return false;
      }
      if (!q) return true;
      const haystack = [order.number ?? "", order.id, order.itemSummary ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, filter, debouncedQuery]);

  // Reset to the first page whenever the filter or search narrows the list.
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns = [
    {
      key: "order",
      header: "Order",
      render: (order: MemberOrderSummary) => (
        <Link
          href={MEMBER_ROUTES.order.replace(":id", encodeURIComponent(order.id))}
          className="body-s font-700"
          aria-label={`View order ${order.number ?? order.id}`}
        >
          {order.number ?? order.id}
        </Link>
      ),
    },
    {
      key: "placed",
      header: "Placed",
      render: (order: MemberOrderSummary) => <span className="tabular">{formatDate(order.placedAt) ?? "Pending"}</span>,
    },
    {
      key: "items",
      header: "Items",
      render: (order: MemberOrderSummary) => {
        if (order.itemSummary) return <span>{order.itemSummary}</span>;
        if (typeof order.itemCount === "number") {
          return <span className="tabular">{order.itemCount === 1 ? "1 item" : `${order.itemCount} items`}</span>;
        }
        return <span className="text-ink-mute">Pending</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (order: MemberOrderSummary) => {
        const meta = orderStatusMeta(order.status);
        return <ResearchStatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "total",
      header: "Total",
      render: (order: MemberOrderSummary) => {
        const money = formatMoney(order.totalCents, order.totalDisplay);
        return money ? <span className="tabular">{money}</span> : <span className="text-ink-mute">Pending</span>;
      },
    },
  ];

  return (
    <ResearchMemberShell
      title="Orders"
      lead="Every order you place, with its exact status from checkout through delivery. Split shipments stay grouped under one order."
    >
      <ResearchRouteBoundary
        state={state === "unavailable" ? "ok" : state}
        errorMessage={errorMessage}
        onRetry={() => void load()}
      >
        {state === "unavailable" ? (
          <div className="grid gap-6">
            <ResearchEmptyState
              title="Ordering has not opened yet."
              body="Your orders will appear here the moment ordering opens for your membership. Nothing is wrong with your account."
            />
            <ResearchCapabilityBoundary status={commerceStatus}>
              <p className="body-s text-ink-2" role="status">
                Ordering is enabled. Orders you place will appear here.
              </p>
            </ResearchCapabilityBoundary>
          </div>
        ) : (
          <>
            {source === "fixture" && (
              <p className="mono-label text-ink-mute mb-4" role="note">
                Development preview data. Production shows only orders recorded by the server.
              </p>
            )}
            {orders.length === 0 ? (
              <ResearchEmptyState
                title="No orders yet."
                body="When you place your first order it will appear here with its full status history."
              />
            ) : (
              <>
                <ResearchFilterBar>
                  <ResearchTabs tabs={FILTER_TABS} active={filter} onSelect={setFilter} label="Filter orders by status" />
                  <ResearchSearch
                    value={query}
                    onChange={setQuery}
                    label="Search orders"
                    placeholder="Search by order number"
                  />
                </ResearchFilterBar>
                <div className="mt-4">
                  <ResearchDataTable
                    caption="Your orders: number, date placed, item count, status, and total"
                    columns={columns}
                    rows={pageRows}
                    rowKey={(order) => order.id}
                    empty="No orders match this filter."
                  />
                </div>
                <ResearchPagination page={currentPage} pageCount={pageCount} onPage={setPage} />
              </>
            )}
            <div className="mt-8">
              <ResearchSecureNotice>
                Order statuses come directly from the fulfillment record. Every order is reviewed before it ships;
                the Samuel review step is a person checking your order, not an automated gate.
              </ResearchSecureNotice>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
