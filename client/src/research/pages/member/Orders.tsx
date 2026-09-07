import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import type { OrderSummaryDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { listOrders } from "../../adapters/commerce";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  capabilityStatusOrPending,
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { memberShipmentSummary, readMemberOrders } from "../../member-orders/read";
import { formatCents, formatDate, orderStateMeta } from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member Orders (/research/member/orders), driven by the frozen
// GET /api/research/orders (OrderSummaryDto). The state vocabulary is the
// OrderState machine from shared/research/commerce.ts.
//
// manual_review is presented as "Pending review", a calm informational state:
// the order exists and awaits review. It is never styled as an error.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; orders: OrderSummaryDto[] }
  | { phase: "denied"; code: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error" };

function orderHref(orderId: string): string {
  return MEMBER_ROUTES.order.replace(":id", encodeURIComponent(orderId));
}

export default function Orders() {
  const { memberToken, memberChecking } = useResearch();
  return <ResearchMemberShell title="Orders"
    lead="Order records returned for this signed-in account. Payment and shipment details reflect the available source records, not a delivery promise.">
    {memberChecking || !memberToken
      ? <ResearchRouteBoundary state={memberChecking ? "loading" : "unauthorized"}>{null}</ResearchRouteBoundary>
      : <OwnedOrders key={memberToken} token={memberToken} />}
  </ResearchMemberShell>;
}

function OwnedOrders({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const alive = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!alive.current) return;
    const request = ++generation.current;
    setState({ phase: "loading" });
    try {
      const result = await listOrders(token);
      if (!alive.current || generation.current !== request) return;
      switch (result.kind) {
      case "ok": {
        const orders = readMemberOrders(result.data);
        setState(orders === null ? { phase: "error" } : { phase: "ok", orders });
        return;
      }
      case "denied":
        setState({ phase: "denied", code: result.code });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "unavailable" });
        return;
      case "error":
        setState({ phase: "error" });
        return;
      }
    } catch {
      if (alive.current && generation.current === request) setState({ phase: "error" });
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; ++generation.current; };
  }, [load]);

  // Capability statuses are fetched once per page; an absent registry degrades
  // to honest pending defaults (nothing is enabled by assumption).
  useEffect(() => {
    let cancelled = false;
    void fetchCapabilities(token).then((map) => {
      if (!cancelled) setCapabilities(map);
    }).catch(() => { if (!cancelled) setCapabilities(null); });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const commerceStatus = capabilityStatusOrPending(capabilities, "product_commerce");

  const orders = state.phase === "ok" ? state.orders : [];
  const hasPendingReview = orders.some((order) => order.state === "manual_review");
  const reviewCopy = denialPresentation("large_order_review_required");

  const columns = [
    {
      key: "order",
      header: "Record",
      render: (order: OrderSummaryDto) => (
        <div>
          <Link href={orderHref(order.orderId)} className="body-s font-700" aria-label={`View ${order.recordKind ?? "record"} ${order.orderId}`}>
            {order.orderId}
          </Link>
          <span className="body-xs text-ink-2 block">{order.recordKind === "request" ? "Request record"
            : order.recordKind === "order" ? "Order record" : "Record type unavailable"}</span>
        </div>
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
      render: (order: OrderSummaryDto) => <span className="text-ink-2">{memberShipmentSummary(order)}</span>,
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
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>Refresh order history</button>
      </div>
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage="Order history could not be verified. Please try again."
        onRetry={() => void load()}
        unavailableTitle="Order history is unavailable."
        unavailableBody="Your order history could not be loaded. Account and product eligibility are checked separately; this does not establish whether an order exists."
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} />
        ) : orders.length === 0 ? (
          // While product_commerce is not enabled the member cannot place an
          // order, so "when you place your first order" would promise an
          // action they cannot take. The capability boundary renders the
          // honest not-open state instead; orders that already exist (for
          // example placed before commerce was switched off) still render in
          // the table below regardless of the capability.
          <ResearchCapabilityBoundary status={commerceStatus}>
            <ResearchEmptyState
              title="No orders yet."
              body="No order records were returned by this source. This is not a confirmation of a complete history, payment, shipment, or purchasing eligibility."
            />
          </ResearchCapabilityBoundary>
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
                your order before it processes, not that anything went wrong. This source does not establish a complete
                history; missing shipment details do not mean no shipment exists.
              </ResearchSecureNotice>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </>
  );
}
