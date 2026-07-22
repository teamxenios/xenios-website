import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type { OrderSummaryDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { listOrders } from "../../adapters/commerce";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { SHIPMENT_OWNER_LABELS, formatCents, formatDate, orderStateMeta } from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member Orders (/research/member/orders), driven by the frozen
// GET /api/research/orders (OrderSummaryDto). The state vocabulary is the
// OrderState machine from shared/research/commerce.ts.
//
// manual_review is presented as "Pending review", a calm informational state:
// the order exists, a person is looking at it, and typical turnaround is
// about two hours. It is never styled as an error.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; orders: OrderSummaryDto[] }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

function orderHref(orderId: string): string {
  return MEMBER_ROUTES.order.replace(":id", encodeURIComponent(orderId));
}

function shipmentsSummary(order: OrderSummaryDto): string {
  if (order.shipments.length === 0) return "No shipments yet";
  return order.shipments
    .map((s) => {
      const owner = SHIPMENT_OWNER_LABELS[s.owner];
      const tracking = s.trackingNumber ? `, tracking ${s.trackingNumber}` : "";
      return `${owner}: ${s.status}${tracking}`;
    })
    .join(" · ");
}

export default function Orders() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await listOrders(memberToken);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", orders: result.data.orders });
        return;
      case "denied":
        setState({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "unavailable" });
        return;
      case "error":
        setState({ phase: "error", message: result.message });
        return;
    }
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const orders = state.phase === "ok" ? state.orders : [];
  const hasPendingReview = useMemo(() => orders.some((o) => o.state === "manual_review"), [orders]);
  const reviewCopy = denialPresentation("large_order_review_required");

  const columns = [
    {
      key: "order",
      header: "Order",
      render: (order: OrderSummaryDto) => (
        <Link href={orderHref(order.orderId)} className="body-s font-700" aria-label={`View order ${order.orderId}`}>
          {order.orderId}
        </Link>
      ),
    },
    {
      key: "placed",
      header: "Placed",
      render: (order: OrderSummaryDto) => <span className="tabular">{formatDate(order.placedAt) ?? order.placedAt}</span>,
    },
    {
      key: "state",
      header: "Status",
      render: (order: OrderSummaryDto) => {
        const meta = orderStateMeta(order.state);
        return <ResearchStatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "shipments",
      header: "Shipments",
      render: (order: OrderSummaryDto) => <span className="text-ink-2">{shipmentsSummary(order)}</span>,
    },
    {
      key: "total",
      header: "Total",
      render: (order: OrderSummaryDto) => <span className="tabular">{formatCents(order.totalCents)}</span>,
    },
  ];

  const boundaryState: "loading" | "unauthorized" | "ok" | "error" | "unavailable" =
    state.phase === "loading"
      ? "loading"
      : state.phase === "unauthorized"
        ? "unauthorized"
        : state.phase === "error"
          ? "error"
          : state.phase === "unavailable"
            ? "unavailable"
            : "ok";

  return (
    <ResearchMemberShell
      title="Orders"
      lead="Every order you place, with its exact status from checkout through delivery. Split shipments stay grouped under one order."
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="Ordering has not opened yet."
        unavailableBody="Your orders will appear here the moment ordering opens for your membership. Nothing is wrong with your account."
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} message={state.message} />
        ) : orders.length === 0 ? (
          <ResearchEmptyState
            title="No orders yet."
            body="When you place your first order it will appear here with its full status history."
          />
        ) : (
          <>
            {/* The calm pending-review note: informational, never an error. */}
            {hasPendingReview && (
              <section role="status" aria-live="polite" className="card mb-4" data-testid="ra-orders-review-note">
                <div className="flex items-center gap-3">
                  <ResearchStatusBadge label="Pending review" tone="info" />
                  <p className="body-s font-700">{reviewCopy.title}</p>
                </div>
                <p className="body-s text-ink-2 mt-2 max-w-[60ch]">{reviewCopy.body}</p>
              </section>
            )}
            <ResearchDataTable
              caption="Your orders: id, date placed, status, shipments, and total"
              columns={columns}
              rows={orders}
              rowKey={(order) => order.orderId}
              empty="No orders yet."
            />
            <div className="mt-8">
              <ResearchSecureNotice>
                Order statuses come directly from the order record. A pending review means a person is checking
                your order before it processes, not that anything went wrong.
              </ResearchSecureNotice>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
