import { useCallback, useState } from "react";
import { Link, useParams } from "wouter";
import {
  approveOrder,
  beginOrderProcessing,
  cancelOrder,
  captureOrder,
  getAdminOrder,
  markOrderFulfilled,
  recordOrderTracking,
} from "../../adapters/adminOps";
import { ResearchDataTable, ResearchStatusBadge, ResearchSecureNotice } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { denialPresentation } from "../../lib/denials";
import { formatCents } from "../member/commerce-presentation";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { orderTone } from "./OrdersAdmin";
import type { AdminOrderAction, AdminOrderDetailDto } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// /admin/research/orders/:id — one NATIVE order, and the moves allowed on it.
//
// This screen used to decode a hand-written snake_case shape that no endpoint
// served, so the commerce queue linked held orders into a page that could not
// load. It now reads the same research_orders record the durable checkout
// writes and the customer sees.
//
// Two rules shape it. Only actions the server reported as available are
// offered, so a control can never exist for a move the transition table would
// refuse. And there is no "mark delivered": delivery is the carrier's fact,
// admitted only from the system or a signed provider event.
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<AdminOrderAction, string> = {
  approve: "Approve",
  capture: "Capture payment",
  cancel: "Cancel order",
  begin_processing: "Start processing",
  mark_fulfilled: "Mark shipped",
  record_tracking: "Record tracking",
};

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  checkout_pending: "Checkout in progress",
  payment_authorized: "Payment authorized",
  manual_review: "Held for review",
  approved: "Approved, awaiting capture",
  payment_captured: "Paid",
  processing: "Being prepared",
  partially_fulfilled: "Partly shipped",
  fulfilled: "Shipped",
  delivered: "Delivered",
  exception: "Needs attention",
  cancelled: "Cancelled",
  refunded: "Refunded",
  replaced: "Replaced",
};

function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

export default function OrderAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Order"
      lead="One order: what was bought, what was paid, where it is, and what may be done next."
      actions={
        <Link href={ADMIN_ROUTES.orders} className="btn btn-secondary">
          Back to orders
        </Link>
      }
    >
      {(token) => <OrderDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function OrderDetailBody({ token, id }: { token: string; id: string }) {
  const loadOrder = useCallback((t: string) => getAdminOrder(t, id), [id]);
  const resource = useAdminResource(token, loadOrder);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8">
      {notice && (
        <p className="body-s text-ink-2" role="status" aria-live="polite" data-testid="order-action-notice">
          {notice}
        </p>
      )}
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="Order records publish with the commerce backend."
        unavailableBody="This order file renders live when the commerce backend connects."
      >
        {(() => {
          const order = resource.data?.order;
          if (!order) return null;
          return (
            <OrderView
              order={order}
              token={token}
              onChanged={(text) => {
                setNotice(text);
                resource.reload();
              }}
            />
          );
        })()}
      </AdminBoundary>

      <ResearchSecureNotice>
        This file carries the order, its money facts and its shipments. It carries no card reference, no provider
        secret and no member contact detail.
      </ResearchSecureNotice>
    </div>
  );
}

function OrderView({
  order,
  token,
  onChanged,
}: {
  order: AdminOrderDetailDto;
  token: string;
  onChanged: (text: string) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-8">
      <section className="min-w-0" aria-label="Order summary" data-testid="order-summary">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
          <h2 className="body-l font-700" style={{ overflowWrap: "anywhere" }} data-testid="order-id">
            {order.orderId}
          </h2>
          <span data-testid="order-state">
            <ResearchStatusBadge tone={orderTone(order.state)} label={stateLabel(order.state)} />
          </span>
        </div>
        <dl className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          <Fact label="Placed" value={fmtDateTime(order.placedAt)} />
          <Fact label="Last change" value={fmtDateTime(order.updatedAt)} />
          <Fact label="Order total" value={formatCents(order.totalCents)} testId="order-total" />
          <Fact
            label="Captured"
            // Null is unavailable, not zero. A capture that has not happened
            // and a capture we cannot see are different facts.
            value={
              order.capturedAmountCents === null ? "Not recorded" : formatCents(order.capturedAmountCents)
            }
            testId="order-captured"
          />
          <Fact label="Shipping" value={formatCents(order.shippingCents)} />
          <Fact label="Store credit applied" value={formatCents(order.storeCreditAppliedCents)} />
        </dl>
        {order.reviewTriggers.length > 0 && (
          <div className="mt-4" data-testid="order-review-triggers">
            <p className="body-s font-700">Held because:</p>
            <ul className="body-s text-ink-2" style={{ margin: 0, paddingLeft: "1.1em" }}>
              {order.reviewTriggers.map((trigger) => (
                <li key={trigger}>{trigger.replace(/_/gu, " ")}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="min-w-0" aria-label="Items">
        <h2 className="body-l font-700 mb-3">Items</h2>
        <ResearchDataTable<AdminOrderDetailDto["lines"][number]>
          caption="Order items"
          keyboardScroll
          columns={[
            { key: "name", header: "Item", render: (line) => line.displayName },
            { key: "sku", header: "SKU", render: (line) => <span className="mono-label">{line.sku}</span> },
            { key: "qty", header: "Qty", render: (line) => <span className="tabular">{line.quantity}</span> },
            {
              key: "total",
              header: "Line total",
              render: (line) => <span className="tabular">{formatCents(line.lineTotalCents)}</span>,
            },
          ]}
          rows={order.lines}
          rowKey={(line) => line.sku}
        />
      </section>

      <section className="min-w-0" aria-label="Shipments" data-testid="order-shipments">
        <h2 className="body-l font-700 mb-3">Shipments</h2>
        {order.shipmentsSource === "unavailable" ? (
          <p className="body-s text-ink-2" role="status">
            Shipment facts are unavailable for this order. That is not the same as nothing having shipped.
          </p>
        ) : order.shipments.length === 0 ? (
          <p className="body-s text-ink-2">No shipment group exists on this order.</p>
        ) : (
          <ResearchDataTable<AdminOrderDetailDto["shipments"][number]>
            caption="Shipments"
            keyboardScroll
            columns={[
              { key: "owner", header: "Fulfilled by", render: (s) => s.owner },
              { key: "status", header: "Status", render: (s) => stateLabel(s.status) },
              {
                key: "carrier",
                header: "Carrier",
                render: (s) => s.carrier ?? <span className="text-ink-mute">Not recorded</span>,
              },
              {
                key: "tracking",
                header: "Tracking",
                render: (s) =>
                  s.trackingNumber ?? <span className="text-ink-mute">Not recorded</span>,
              },
            ]}
            rows={order.shipments}
            rowKey={(s) => s.owner}
          />
        )}
      </section>

      <OrderActions order={order} token={token} onChanged={onChanged} />
    </div>
  );
}

function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="body-m tabular m-0" style={{ overflowWrap: "anywhere" }} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

type ActionOutcome =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "error"; message: string };

function OrderActions({
  order,
  token,
  onChanged,
}: {
  order: AdminOrderDetailDto;
  token: string;
  onChanged: (text: string) => void;
}) {
  const [outcome, setOutcome] = useState<ActionOutcome>({ phase: "idle" });
  const [reason, setReason] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const busy = outcome.phase === "busy";
  const can = (action: AdminOrderAction) => order.availableActions.includes(action);

  async function run(action: AdminOrderAction, call: () => Promise<{ kind: string; code?: string; message?: string }>) {
    setOutcome({ phase: "busy" });
    try {
      const result = await call();
      if (result.kind === "ok") {
        onChanged(`${order.orderId}: ${ACTION_LABELS[action].toLowerCase()} done.`);
        setOutcome({ phase: "idle" });
        return;
      }
      if (result.kind === "denied" && result.code) {
        setOutcome({ phase: "denied", code: result.code, message: result.message });
        return;
      }
      setOutcome({ phase: "error", message: "That action did not complete. Nothing about the order changed." });
    } catch {
      setOutcome({ phase: "error", message: "That action did not complete. Nothing about the order changed." });
    }
  }

  return (
    <section className="min-w-0" aria-label="What can be done next" data-testid="order-actions">
      <h2 className="body-l font-700 mb-3">What can be done next</h2>
      {order.availableActions.length === 0 ? (
        <p className="body-s text-ink-2" data-testid="order-no-actions">
          Nothing can be done to this order from here. It has reached a state this screen does not move it out of.
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="flex gap-3 flex-wrap">
            {can("approve") && (
              <button
                type="button"
                className="btn btn-primary min-h-11"
                disabled={busy}
                data-testid="order-approve"
                onClick={() => void run("approve", () => approveOrder(token, order.orderId))}
              >
                {ACTION_LABELS.approve}
              </button>
            )}
            {can("capture") && (
              <button
                type="button"
                className="btn btn-primary min-h-11"
                disabled={busy}
                data-testid="order-capture"
                onClick={() => void run("capture", () => captureOrder(token, order.orderId))}
              >
                {ACTION_LABELS.capture}
              </button>
            )}
            {can("begin_processing") && (
              <button
                type="button"
                className="btn btn-primary min-h-11"
                disabled={busy}
                data-testid="order-processing"
                onClick={() => void run("begin_processing", () => beginOrderProcessing(token, order.orderId))}
              >
                {ACTION_LABELS.begin_processing}
              </button>
            )}
            {can("mark_fulfilled") && (
              <button
                type="button"
                className="btn btn-primary min-h-11"
                disabled={busy}
                data-testid="order-fulfilled"
                onClick={() => void run("mark_fulfilled", () => markOrderFulfilled(token, order.orderId))}
              >
                {ACTION_LABELS.mark_fulfilled}
              </button>
            )}
          </div>

          {can("record_tracking") && (
            <div className="grid gap-2" data-testid="order-tracking-form">
              <p className="body-s text-ink-2">
                Recording a carrier and tracking number does not move the order. Mark it shipped separately, once it
                has actually gone.
              </p>
              <div className="flex gap-3 flex-wrap items-end">
                <label className="grid min-w-0 max-w-full gap-1">
                  <span className="mono-label text-ink-mute">Carrier</span>
                  <input
                    className="input-field min-w-0"
                    value={carrier}
                    onChange={(event) => setCarrier(event.target.value)}
                    data-testid="order-tracking-carrier"
                  />
                </label>
                <label className="grid min-w-0 max-w-full gap-1">
                  <span className="mono-label text-ink-mute">Tracking number</span>
                  <input
                    className="input-field min-w-0"
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                    data-testid="order-tracking-number"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary min-h-11"
                  disabled={busy}
                  data-testid="order-tracking-submit"
                  onClick={() =>
                    void run("record_tracking", () =>
                      recordOrderTracking(token, order.orderId, {
                        owner: order.shipments[0]?.owner ?? "xenios",
                        carrier,
                        trackingNumber,
                      }),
                    )
                  }
                >
                  {ACTION_LABELS.record_tracking}
                </button>
              </div>
            </div>
          )}

          {can("cancel") && (
            <div className="flex gap-3 flex-wrap items-end" data-testid="order-cancel-form">
              <label className="grid min-w-0 max-w-full gap-1">
                <span className="mono-label text-ink-mute">Reason for cancelling</span>
                <input
                  className="input-field min-w-0"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  data-testid="order-cancel-reason"
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary min-h-11"
                disabled={busy || reason.trim().length === 0}
                data-testid="order-cancel"
                onClick={() => void run("cancel", () => cancelOrder(token, order.orderId, reason.trim()))}
              >
                {ACTION_LABELS.cancel}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delivery is stated, not offered. */}
      <p className="body-s text-ink-mute mt-4" data-testid="order-delivery-note">
        Delivered is not an action here. It is recorded from the carrier, through a signed fulfillment event.
      </p>

      <div aria-live="polite" className="mt-3">
        {outcome.phase === "denied" &&
          (() => {
            const presentation = denialPresentation(outcome.code, outcome.message);
            return (
              <p className="body-s text-ink-2" role="status" data-testid="order-denied">
                {presentation.title} {presentation.body}
              </p>
            );
          })()}
        {outcome.phase === "error" && (
          <p className="body-s font-700" role="alert" data-testid="order-error">
            {outcome.message}
          </p>
        )}
      </div>
    </section>
  );
}
