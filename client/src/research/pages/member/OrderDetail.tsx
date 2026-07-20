import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useResearch } from "../../core";
import { apiGet } from "../../lib/api";
import { devFixture } from "../../lib/fixtures";
import { ACCESS_ROUTES, MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTimeline,
} from "../../ui/kit";
import { formatDate, formatMoney, orderStatusMeta } from "./Orders";

// ---------------------------------------------------------------------------
// Member Order Detail (/research/member/orders/:id). One order, fully
// grounded in GET /api/research/member/orders/:id: its items, its shipments
// (split shipments stay grouped under this one order, each shipment carrying
// its OWN status and tracking only when the server supplies it), its totals,
// and its history. A missing field renders as pending, never as an invented
// value; a tracking link is only ever a server-provided URL.
// ---------------------------------------------------------------------------

interface OrderItem {
  id?: string | null;
  name: string;
  quantity?: number | null;
  unitCents?: number | null;
  unitDisplay?: string | null;
  lineCents?: number | null;
  lineDisplay?: string | null;
}

interface ShipmentItem {
  name: string;
  quantity?: number | null;
}

interface OrderShipment {
  id: string;
  label?: string | null;
  status?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  items?: ShipmentItem[] | null;
}

interface OrderHistoryEvent {
  at: string;
  title: string;
  detail?: string;
}

interface MemberOrderDetail {
  id: string;
  number?: string | null;
  placedAt?: string | null;
  status?: string | null;
  items?: OrderItem[] | null;
  shipments?: OrderShipment[] | null;
  subtotalCents?: number | null;
  subtotalDisplay?: string | null;
  shippingCents?: number | null;
  shippingDisplay?: string | null;
  taxCents?: number | null;
  taxDisplay?: string | null;
  totalCents?: number | null;
  totalDisplay?: string | null;
  history?: OrderHistoryEvent[] | null;
}

type OrderPayload = { order?: MemberOrderDetail } | MemberOrderDetail;

function normalizeOrder(payload: OrderPayload): MemberOrderDetail | null {
  const order = "order" in payload && payload.order ? payload.order : (payload as MemberOrderDetail);
  return order && order.id ? order : null;
}

// Dev-only synthetic order demonstrating a split shipment. devFixture returns
// null in production. No tracking URL is fabricated: the fixture shows the
// carrier and number text path, and the tracking-pending path.
function fixtureOrder(id: string): MemberOrderDetail {
  return {
    id,
    number: "XR-1042",
    placedAt: "2026-07-12",
    status: "partially_shipped",
    items: [
      { id: "i1", name: "Recovery Stack, 30 day supply", quantity: 1, unitCents: 8900, lineCents: 8900 },
      { id: "i2", name: "Baseline Panel Kit", quantity: 1, unitCents: 9600, lineCents: 9600 },
      { id: "i3", name: "Shaker Bottle", quantity: 2, unitCents: 1200, lineCents: 2400 },
    ],
    shipments: [
      {
        id: "s1",
        label: "Shipment 1 of 2",
        status: "shipped",
        carrier: "USPS",
        trackingNumber: "9400 1000 0000 0000 0000 01",
        trackingUrl: null,
        shippedAt: "2026-07-14",
        items: [
          { name: "Recovery Stack, 30 day supply", quantity: 1 },
          { name: "Shaker Bottle", quantity: 2 },
        ],
      },
      {
        id: "s2",
        label: "Shipment 2 of 2",
        status: "processing",
        carrier: null,
        trackingNumber: null,
        trackingUrl: null,
        items: [{ name: "Baseline Panel Kit", quantity: 1 }],
      },
    ],
    subtotalCents: 20900,
    shippingCents: 500,
    totalCents: 21400,
    history: [
      { at: "2026-07-14", title: "Shipment 1 of 2 shipped", detail: "USPS. Recovery Stack and Shaker Bottles." },
      { at: "2026-07-13", title: "Samuel review complete", detail: "Order approved for fulfillment." },
      { at: "2026-07-12", title: "Payment authorized" },
      { at: "2026-07-12", title: "Order placed" },
    ],
  };
}

type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

function ShipmentCard({ shipment, index, count }: { shipment: OrderShipment; index: number; count: number }) {
  const meta = orderStatusMeta(shipment.status);
  const heading = shipment.label ?? (count > 1 ? `Shipment ${index + 1} of ${count}` : "Shipment");
  return (
    <section className="card" aria-label={heading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono-label text-ink-mute">{heading}</p>
          <p className="body-s text-ink-2 mt-1">
            {shipment.deliveredAt
              ? `Delivered ${formatDate(shipment.deliveredAt)}.`
              : shipment.shippedAt
                ? `Shipped ${formatDate(shipment.shippedAt)}.`
                : "Not shipped yet."}
          </p>
        </div>
        <ResearchStatusBadge label={meta.label} tone={meta.tone} />
      </div>
      {shipment.items && shipment.items.length > 0 && (
        <ul className="body-s text-ink-2 mt-3" style={{ listStyle: "none", padding: 0 }}>
          {shipment.items.map((item, i) => (
            <li key={i} className="mt-1">
              {typeof item.quantity === "number" && item.quantity > 1 ? `${item.quantity} × ` : ""}
              {item.name}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        {shipment.trackingUrl ? (
          <a
            href={shipment.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            aria-label={`Track ${heading}${shipment.carrier ? ` with ${shipment.carrier}` : ""}`}
          >
            Track shipment
          </a>
        ) : shipment.trackingNumber ? (
          <p className="body-s text-ink-2">
            <span className="mono-label text-ink-mute">Tracking</span>{" "}
            <span className="tabular">
              {shipment.carrier ? `${shipment.carrier} · ` : ""}
              {shipment.trackingNumber}
            </span>
          </p>
        ) : (
          <ResearchStatusBadge label="Tracking pending" tone="pending" />
        )}
      </div>
    </section>
  );
}

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ? decodeURIComponent(params.id) : "";
  const { memberToken } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [order, setOrder] = useState<MemberOrderDetail | null>(null);
  const [source, setSource] = useState<"server" | "fixture">("server");

  const load = useCallback(async () => {
    if (!orderId) {
      setState("unavailable");
      return;
    }
    setState("loading");
    setErrorMessage(undefined);
    const result = await apiGet<OrderPayload>(
      `/api/research/member/orders/${encodeURIComponent(orderId)}`,
      memberToken,
    );
    if (result.kind === "ok") {
      const normalized = normalizeOrder(result.data);
      if (normalized) {
        setOrder(normalized);
        setSource("server");
        setState("ok");
      } else {
        setState("unavailable");
      }
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      const fixture = devFixture(() => fixtureOrder(orderId));
      if (fixture) {
        setOrder(fixture);
        setSource("fixture");
        setState("ok");
      } else {
        setState("unavailable");
      }
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [orderId, memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusMeta = order ? orderStatusMeta(order.status) : null;

  const totalsRows: Array<{ label: string; value: string }> = [];
  if (order) {
    const subtotal = formatMoney(order.subtotalCents, order.subtotalDisplay);
    const shipping = formatMoney(order.shippingCents, order.shippingDisplay);
    const tax = formatMoney(order.taxCents, order.taxDisplay);
    const total = formatMoney(order.totalCents, order.totalDisplay);
    if (subtotal) totalsRows.push({ label: "Subtotal", value: subtotal });
    if (shipping) totalsRows.push({ label: "Shipping", value: shipping });
    if (tax) totalsRows.push({ label: "Tax", value: tax });
    if (total) totalsRows.push({ label: "Total", value: total });
  }

  const itemColumns = [
    {
      key: "item",
      header: "Item",
      render: (item: OrderItem) => <span className="font-700">{item.name}</span>,
    },
    {
      key: "quantity",
      header: "Qty",
      render: (item: OrderItem) => (
        <span className="tabular">{typeof item.quantity === "number" ? item.quantity : "1"}</span>
      ),
    },
    {
      key: "unit",
      header: "Unit price",
      render: (item: OrderItem) => {
        const money = formatMoney(item.unitCents, item.unitDisplay);
        return money ? <span className="tabular">{money}</span> : <span className="text-ink-mute">Pending</span>;
      },
    },
    {
      key: "line",
      header: "Line total",
      render: (item: OrderItem) => {
        const money = formatMoney(item.lineCents, item.lineDisplay);
        return money ? <span className="tabular">{money}</span> : <span className="text-ink-mute">Pending</span>;
      },
    },
  ];

  const shipments = order?.shipments ?? [];
  const supportSubject = order ? `Order ${order.number ?? order.id}` : "Order question";

  return (
    <ResearchMemberShell
      eyebrow="Member · Orders"
      title={order ? `Order ${order.number ?? order.id}` : "Order"}
      lead={order && order.placedAt ? `Placed ${formatDate(order.placedAt)}.` : undefined}
      actions={
        <Link href={MEMBER_ROUTES.orders} className="btn btn-ghost">
          All orders
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void load()}
        unavailableTitle="This order is not available."
        unavailableBody="Either ordering has not opened yet, or this order id is not part of your account. Check the address, or open your orders list."
      >
        {order && (
          <div className="grid gap-6">
            {source === "fixture" && (
              <p className="mono-label text-ink-mute" role="note">
                Development preview data. Production shows only orders recorded by the server.
              </p>
            )}

            {statusMeta && (
              <div className="flex items-center gap-3">
                <span className="mono-label text-ink-mute">Order status</span>
                <ResearchStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
              </div>
            )}

            <section aria-label="Items in this order">
              <h2 className="body-m font-700">Items</h2>
              <div className="mt-3">
                {order.items && order.items.length > 0 ? (
                  <ResearchDataTable
                    caption={`Items in order ${order.number ?? order.id}`}
                    columns={itemColumns}
                    rows={order.items}
                    rowKey={(item) => item.id ?? item.name}
                  />
                ) : (
                  <ResearchEmptyState title="Item details pending." body="The server has not published item lines for this order yet." />
                )}
              </div>
            </section>

            <section aria-label="Shipments for this order">
              <h2 className="body-m font-700">Shipments</h2>
              <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
                An order can ship in more than one package. Each shipment below carries its own status and its own
                tracking; they all belong to this one order.
              </p>
              <div className="grid gap-4 mt-3">
                {shipments.length > 0 ? (
                  shipments.map((shipment, i) => (
                    <ShipmentCard key={shipment.id} shipment={shipment} index={i} count={shipments.length} />
                  ))
                ) : (
                  <ResearchEmptyState
                    title="No shipments yet."
                    body="Shipments appear here once fulfillment begins, each with its own status and tracking."
                  />
                )}
              </div>
            </section>

            <section aria-label="Order totals">
              <h2 className="body-m font-700">Totals</h2>
              <div className="card mt-3" style={{ maxWidth: 420 }}>
                {totalsRows.length > 0 ? (
                  <dl>
                    {totalsRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4 mt-1">
                        <dt className="body-s text-ink-2">{row.label}</dt>
                        <dd className={`body-s tabular ${row.label === "Total" ? "font-700" : ""}`}>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="body-s text-ink-mute">Totals pending. The server has not published amounts for this order.</p>
                )}
              </div>
            </section>

            {order.history && order.history.length > 0 && (
              <section aria-label="Order history">
                <h2 className="body-m font-700">History</h2>
                <div className="mt-3">
                  <ResearchTimeline items={order.history} />
                </div>
              </section>
            )}

            <section aria-label="Support for this order" className="card">
              <h2 className="body-m font-700">Need help with this order?</h2>
              <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                A person answers. Include your order number and we will pick it up from there.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  className="btn btn-secondary"
                  href={`mailto:research@xeniostechnology.com?subject=${encodeURIComponent(supportSubject)}`}
                >
                  Email support
                </a>
                <Link href={ACCESS_ROUTES.support} className="btn btn-ghost">
                  Support options
                </Link>
              </div>
            </section>

            <ResearchSecureNotice>
              Every fact on this page comes from the order record. Tracking links are only ever the carrier URL the
              server supplied; a shipment without one shows tracking pending.
            </ResearchSecureNotice>
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
