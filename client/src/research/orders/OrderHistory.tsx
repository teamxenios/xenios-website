import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import type { CanonicalOrderView } from "@shared/research/orders/canonical-order";
import { useResearch } from "../core";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../ui/kit";
import { listCanonicalOrders } from "./adapter";
import {
  FULFILLMENT_STATE_META,
  PAYMENT_STATE_META,
  formatCents,
  formatOrderDate,
  productSummary,
} from "./presentation";

// ---------------------------------------------------------------------------
// Canonical order history: every Xenios order a customer has, whichever way
// it was placed, in one list.
//
// Payment and fulfillment get their own columns. A customer whose money has
// been verified but whose box has not shipped can see both facts at once,
// which is the pair of questions they actually came here to answer.
//
// A failed read renders as an error, never as "no orders". For someone who
// has just paid, an empty history is the most expensive wrong answer this
// page can give.
// ---------------------------------------------------------------------------

export const ORDER_HISTORY_ROUTE = "/research/member/order-history";
export const ORDER_HISTORY_DETAIL_ROUTE = "/research/member/order-history/:orderNumber";

export function orderHistoryDetailHref(orderNumber: string): string {
  return `${ORDER_HISTORY_ROUTE}/${encodeURIComponent(orderNumber)}`;
}

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; orders: CanonicalOrderView[] }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

export default function OrderHistory() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await listCanonicalOrders(memberToken);
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

  const columns = [
    {
      key: "order",
      header: "Order",
      render: (order: CanonicalOrderView) => (
        <Link
          href={orderHistoryDetailHref(order.orderNumber)}
          className="body-s font-700"
          aria-label={`View order ${order.orderNumber}`}
        >
          {order.orderNumber}
        </Link>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (order: CanonicalOrderView) => (
        <span className="tabular">{formatOrderDate(order.placedAt)}</span>
      ),
    },
    {
      key: "products",
      header: "Products",
      render: (order: CanonicalOrderView) => (
        <span className="text-ink-2">{productSummary(order)}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (order: CanonicalOrderView) => (
        <span className="tabular">{formatCents(order.totalCents)}</span>
      ),
    },
    {
      key: "payment",
      header: "Payment",
      render: (order: CanonicalOrderView) => {
        const meta = PAYMENT_STATE_META[order.paymentState];
        return <ResearchStatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "fulfillment",
      header: "Fulfillment",
      render: (order: CanonicalOrderView) => {
        const meta = FULFILLMENT_STATE_META[order.fulfillmentState];
        return <ResearchStatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    {
      key: "tracking",
      header: "Tracking",
      render: (order: CanonicalOrderView) =>
        order.tracking === null ? (
          // Not a failure and not a promise: there is simply no tracking yet.
          <span className="text-ink-mute">—</span>
        ) : (
          <span className="tabular">
            {order.tracking.trackingNumber}
            {order.tracking.carrier ? ` · ${order.tracking.carrier}` : ""}
          </span>
        ),
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
      title="Order history"
      lead="Every order you have placed with Xenios, however you placed it, with its payment and fulfillment status."
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="Order history is not available yet."
        unavailableBody="Your orders will appear here as soon as this is switched on. Nothing is wrong with your account, and no order has been lost."
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} message={state.message} />
        ) : orders.length === 0 ? (
          <ResearchEmptyState
            title="No orders yet."
            body="When you place an order it appears here with its payment status, fulfillment status and tracking."
          />
        ) : (
          <>
            <ResearchDataTable
              caption="Your orders: number, date, products, amount, payment status, fulfillment status and tracking"
              columns={columns}
              rows={orders}
              rowKey={(order) => order.orderNumber}
              empty="No orders yet."
            />
            <div className="mt-8">
              <ResearchSecureNotice>
                Payment and fulfillment are shown separately because they are separate. Payment status changes
                only when our team verifies your payment, and fulfillment status changes only when your order
                actually moves.
              </ResearchSecureNotice>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
