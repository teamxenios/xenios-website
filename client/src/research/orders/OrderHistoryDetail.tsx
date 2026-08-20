import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import type { CanonicalOrderView } from "@shared/research/orders/canonical-order";
import { useResearch } from "../core";
import { MEMBER_ROUTES } from "../lib/routes";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../ui/kit";
import { getCanonicalOrder } from "./adapter";
import { ORDER_HISTORY_ROUTE } from "./OrderHistory";
import {
  FULFILLMENT_STATE_META,
  PAYMENT_STATE_META,
  SOURCE_KIND_LABELS,
  formatCents,
  formatOrderDate,
  supportReference,
} from "./presentation";

// ---------------------------------------------------------------------------
// One canonical order, in full: what was bought, at what authorized price,
// where its money stands, where its box stands, and how to get help.
//
// The support block is part of the page rather than a link somewhere else,
// because the moment a customer needs support is the moment they are looking
// at the order that worries them, and they should not have to go and find the
// order number again to ask about it.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; order: CanonicalOrderView }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "not_found" }
  | { phase: "error"; message?: string };

export default function OrderHistoryDetail() {
  const { memberToken } = useResearch();
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params.orderNumber ?? "";
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await getCanonicalOrder(memberToken, orderNumber);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", order: result.data.order });
        return;
      case "denied":
        // An order that is not this customer's answers not-found, so a denial
        // here is a real policy denial worth rendering as one.
        setState({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "not_found" });
        return;
      case "error":
        setState({ phase: "error", message: result.message });
        return;
    }
  }, [memberToken, orderNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = state.phase === "ok" ? state.order : null;

  const boundaryState: "loading" | "unauthorized" | "ok" | "error" =
    state.phase === "loading"
      ? "loading"
      : state.phase === "unauthorized"
        ? "unauthorized"
        : state.phase === "error"
          ? "error"
          : "ok";

  return (
    <ResearchMemberShell
      title={order ? `Order ${order.orderNumber}` : "Order"}
      lead={
        order
          ? `${SOURCE_KIND_LABELS[order.source.kind]} placed ${formatOrderDate(order.placedAt)}.`
          : "Your order."
      }
    >
      <div className="mb-6">
        <Link href={ORDER_HISTORY_ROUTE} className="body-s">
          ← All orders
        </Link>
      </div>

      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} message={state.message} />
        ) : state.phase === "not_found" ? (
          <section className="card" data-testid="ra-order-not-found">
            <p className="body-m font-700">We could not find that order.</p>
            <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
              It may belong to a different account. If you believe this order is yours, contact support and
              we will look it up for you.
            </p>
            <p className="mt-4">
              <Link href={MEMBER_ROUTES.supportCenter} className="body-s font-700">
                Contact support
              </Link>
            </p>
          </section>
        ) : order === null ? null : (
          <>
            <section className="grid gap-4 md:grid-cols-2" data-testid="ra-order-status">
              <div className="card">
                <p className="mono-label text-ink-mute">Payment</p>
                <div className="mt-2">
                  <ResearchStatusBadge
                    label={PAYMENT_STATE_META[order.paymentState].label}
                    tone={PAYMENT_STATE_META[order.paymentState].tone}
                  />
                </div>
                <p className="body-s text-ink-2 mt-3 max-w-[50ch]">
                  {PAYMENT_STATE_META[order.paymentState].note}
                </p>
              </div>
              <div className="card">
                <p className="mono-label text-ink-mute">Fulfillment</p>
                <div className="mt-2">
                  <ResearchStatusBadge
                    label={FULFILLMENT_STATE_META[order.fulfillmentState].label}
                    tone={FULFILLMENT_STATE_META[order.fulfillmentState].tone}
                  />
                </div>
                <p className="body-s text-ink-2 mt-3 max-w-[50ch]">
                  {FULFILLMENT_STATE_META[order.fulfillmentState].note}
                </p>
                {order.tracking !== null && (
                  <p className="body-s mt-3 tabular" data-testid="ra-order-tracking">
                    Tracking {order.tracking.trackingNumber}
                    {order.tracking.carrier ? ` · ${order.tracking.carrier}` : ""}
                  </p>
                )}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="body-m font-700 mb-3">Products</h2>
              <ResearchDataTable
                caption="Products on this order with quantity, unit price and line total"
                columns={[
                  {
                    key: "product",
                    header: "Product",
                    render: (line: CanonicalOrderView["lines"][number]) => (
                      <span className="body-s font-700">{line.displayName}</span>
                    ),
                  },
                  {
                    key: "sku",
                    header: "SKU",
                    render: (line: CanonicalOrderView["lines"][number]) => (
                      <span className="mono-label text-ink-mute">{line.sku}</span>
                    ),
                  },
                  {
                    key: "quantity",
                    header: "Qty",
                    render: (line: CanonicalOrderView["lines"][number]) => (
                      <span className="tabular">{line.quantity}</span>
                    ),
                  },
                  {
                    key: "unit",
                    header: "Unit price",
                    render: (line: CanonicalOrderView["lines"][number]) => (
                      <span className="tabular">{formatCents(line.unitPriceCents)}</span>
                    ),
                  },
                  {
                    key: "total",
                    header: "Line total",
                    render: (line: CanonicalOrderView["lines"][number]) => (
                      <span className="tabular">{formatCents(line.lineTotalCents)}</span>
                    ),
                  },
                ]}
                rows={order.lines}
                rowKey={(line) => line.sku}
              />

              <dl className="card mt-4" data-testid="ra-order-totals">
                <div className="flex justify-between body-s">
                  <dt>Subtotal</dt>
                  <dd className="tabular">{formatCents(order.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between body-s mt-2">
                  <dt>Shipping</dt>
                  <dd className="tabular">{formatCents(order.shippingCents)}</dd>
                </div>
                <div className="flex justify-between body-m font-700 mt-3">
                  <dt>Total</dt>
                  <dd className="tabular">{formatCents(order.totalCents)}</dd>
                </div>
              </dl>
            </section>

            <section className="card mt-8" data-testid="ra-order-support">
              <h2 className="body-m font-700">Need help with this order?</h2>
              <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
                Quote order number <span className="tabular font-700">{supportReference(order)}</span> and we
                can find everything about it straight away.
              </p>
              <p className="mt-4">
                <Link href={MEMBER_ROUTES.supportCenter} className="body-s font-700">
                  Contact support
                </Link>
              </p>
            </section>

            <div className="mt-8">
              <ResearchSecureNotice>
                Prices shown are the authorized prices recorded on your order at the time it was placed. They
                do not change afterwards.
              </ResearchSecureNotice>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
