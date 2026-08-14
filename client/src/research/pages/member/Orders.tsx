import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type { OrderSummaryDto } from "@shared/research/commerce-api";
import type { EarlyAccessMemberOrderView } from "@shared/research/early-access-member-history";
import { useResearch } from "../../core";
import { listOrders } from "../../adapters/commerce";
import { listEarlyAccessMemberOrders } from "../../adapters/early-access-member-history";
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
  type BadgeTone,
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
  | { phase: "ok"; orders: MemberOrderRow[] }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

function orderHref(orderId: string): string {
  return MEMBER_ROUTES.order.replace(":id", encodeURIComponent(orderId));
}

interface MemberOrderRow {
  source: "canonical" | "early_access";
  orderId: string;
  placedAt: string;
  total: string;
  status: { label: string; tone: BadgeTone };
  fulfillment: string;
  largeOrderReview: boolean;
}

function canonicalShipmentsSummary(order: OrderSummaryDto): string {
  if (order.shipments.length === 0) return "No shipments yet";
  return order.shipments
    .map((s) => {
      const owner = SHIPMENT_OWNER_LABELS[s.owner];
      const tracking = s.trackingNumber ? `, tracking ${s.trackingNumber}` : "";
      return `${owner}: ${s.status}${tracking}`;
    })
    .join(" · ");
}

function legacyStatus(order: EarlyAccessMemberOrderView): { label: string; tone: BadgeTone } {
  if (order.paymentState === "payment_rejected") return { label: "Payment needs attention", tone: "warning" };
  if (order.paymentState !== "payment_verified" && order.fulfillmentState !== "not_released") {
    return { label: "Order status needs attention", tone: "warning" };
  }
  if (order.paymentState === "awaiting_payment") return { label: "Awaiting payment", tone: "pending" };
  if (order.paymentState === "under_review") return { label: "Payment proof under review", tone: "info" };
  switch (order.fulfillmentState) {
    case "fulfilled":
      return { label: "Shipped", tone: "success" };
    case "packing":
      return { label: "Packing", tone: "info" };
    case "supplier_released":
      return { label: "Preparing fulfillment", tone: "info" };
    case "not_released":
      return { label: "Payment confirmed", tone: "info" };
  }
}

function legacyFulfillment(order: EarlyAccessMemberOrderView): string {
  const latest = order.tracking.at(-1);
  if (latest) return `${latest.carrier}, tracking ${latest.trackingNumber}`;
  switch (order.fulfillmentState) {
    case "fulfilled":
      return "Shipped; tracking pending";
    case "packing":
      return "Packing";
    case "supplier_released":
      return "Preparing fulfillment";
    case "not_released":
      return "No shipment yet";
  }
}

function formatLegacyMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function mergeOrderHistory(
  canonical: readonly OrderSummaryDto[],
  legacy: readonly EarlyAccessMemberOrderView[],
): MemberOrderRow[] {
  const rows: MemberOrderRow[] = canonical.map((order) => ({
    source: "canonical",
    orderId: order.orderId,
    placedAt: order.placedAt,
    total: formatCents(order.totalCents),
    status: orderStateMeta(order.state),
    fulfillment: canonicalShipmentsSummary(order),
    largeOrderReview: order.state === "manual_review",
  }));
  for (const order of legacy) {
    if (rows.some((row) => row.orderId === order.orderNumber)) continue;
    rows.push({
      source: "early_access",
      orderId: order.orderNumber,
      placedAt: order.placedAt,
      total: formatLegacyMoney(order.totalCents, order.currency),
      status: legacyStatus(order),
      fulfillment: legacyFulfillment(order),
      // Legacy payment-proof review is not the canonical quantity/value review.
      largeOrderReview: false,
    });
  }
  return rows.sort((left, right) => {
    const byTime = Date.parse(right.placedAt) - Date.parse(left.placedAt);
    return byTime || right.orderId.localeCompare(left.orderId);
  });
}

export default function Orders() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const [canonicalResult, legacyResult] = await Promise.all([
      listOrders(memberToken),
      listEarlyAccessMemberOrders(memberToken),
    ]);
    if (canonicalResult.kind === "ok" && legacyResult.kind === "ok") {
      setState({
        phase: "ok",
        orders: mergeOrderHistory(canonicalResult.data.orders, legacyResult.data.orders),
      });
      return;
    }
    // A partial history is misleading. If either authoritative source fails,
    // fail the whole read instead of silently hiding durable orders.
    const result = canonicalResult.kind !== "ok" ? canonicalResult : legacyResult;
    switch (result.kind) {
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
      case "ok":
        return;
    }
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Capability statuses are fetched once per page; an absent registry degrades
  // to honest pending defaults (nothing is enabled by assumption).
  useEffect(() => {
    let cancelled = false;
    void fetchCapabilities(memberToken).then((map) => {
      if (!cancelled) setCapabilities(map);
    });
    return () => {
      cancelled = true;
    };
  }, [memberToken]);

  const commerceStatus = capabilityStatusOrPending(capabilities, "product_commerce");

  const orders = state.phase === "ok" ? state.orders : [];
  const hasPendingReview = useMemo(() => orders.some((order) => order.largeOrderReview), [orders]);
  const reviewCopy = denialPresentation("large_order_review_required");

  const columns = [
    {
      key: "order",
      header: "Order",
      render: (order: MemberOrderRow) => (
        <Link href={orderHref(order.orderId)} className="body-s font-700" aria-label={`View order ${order.orderId}`}>
          {order.orderId}
        </Link>
      ),
    },
    {
      key: "placed",
      header: "Placed",
      render: (order: MemberOrderRow) => <span className="tabular">{formatDate(order.placedAt) ?? order.placedAt}</span>,
    },
    {
      key: "state",
      header: "Status",
      render: (order: MemberOrderRow) => {
        return <ResearchStatusBadge label={order.status.label} tone={order.status.tone} />;
      },
    },
    {
      key: "shipments",
      header: "Shipments",
      render: (order: MemberOrderRow) => <span className="text-ink-2">{order.fulfillment}</span>,
    },
    {
      key: "total",
      header: "Total",
      render: (order: MemberOrderRow) => <span className="tabular">{order.total}</span>,
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
          // While product_commerce is not enabled the member cannot place an
          // order, so "when you place your first order" would promise an
          // action they cannot take. The capability boundary renders the
          // honest not-open state instead; orders that already exist (for
          // example placed before commerce was switched off) still render in
          // the table below regardless of the capability.
          <ResearchCapabilityBoundary status={commerceStatus}>
            <ResearchEmptyState
              title="No orders yet."
              body="When you place your first order it will appear here with its full status history."
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
                your order before it processes, not that anything went wrong.
              </ResearchSecureNotice>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
