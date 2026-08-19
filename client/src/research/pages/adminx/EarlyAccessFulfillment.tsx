import { useCallback, useState, type FormEvent } from "react";
import {
  getEarlyAccessSupplierOrder,
  listEarlyAccessFulfillmentQueue,
  listEarlyAccessPaymentQueue,
  markEarlyAccessShipped,
  postEarlyAccessTracking,
  type EarlyAccessAdminPaymentOrderDto,
  type EarlyAccessSettledAwaitingFulfillmentDto,
  type EarlyAccessSupplierOrderReadDto,
} from "../../adapters/earlyAccessAdminOrders";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchStatusBadge,
} from "../../ui/kit";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/early-access/fulfillment: the operator lane over the LIVE
// legacy Early Access dispatch endpoints. Three panels:
//
//   1. The payment review queue (GET /api/admin/research/payments) - every
//      order a customer has submitted proof for, waiting on a named human.
//   2. The settled-awaiting-fulfillment queue - orders whose money a human
//      confirmed and nobody has shipped. FAIL-CLOSED: the server answers a
//      named 503 until its founder-gated RPC exists, and this page renders
//      that as an explicit unavailable state, never as an empty queue.
//   3. The per-order dispatch card - the supplier packet (the one response
//      that carries the shipping address, because a supplier needs it and
//      nobody else does), the dispatch trail, tracking entry, and
//      mark-shipped. The server refuses mark-shipped with 409
//      TRACKING_REQUIRED until a tracking row exists; this screen surfaces
//      that code as the next action, not as an error.
//
// Presentation only. The browser never grants authority and never computes
// money: every figure below is the server's integer cents, formatted.
// ---------------------------------------------------------------------------

/** "$477.60 USD" from server integer cents; never invents a price. */
function fmtCents(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "";
  const dollars = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${dollars} USD` : `${dollars} ${currency}`;
}

const PAYMENT_STATE_LABEL: Record<EarlyAccessAdminPaymentOrderDto["paymentState"], string> = {
  awaiting_payment: "Awaiting payment",
  under_review: "Under review",
  payment_verified: "Payment verified",
  payment_rejected: "Needs new proof",
};

// Loose client-side shape check only; the server is the authority. Uppercase
// Crockford base32 body, 16 characters.
const ORDER_NUMBER = /^XEA-[0-9A-Z]{16}$/;

export default function EarlyAccessFulfillment() {
  return (
    <AdminScreen
      title="Early Access fulfillment"
      lead="The live single-order Early Access lane: payments waiting on a named human, settled orders still owed a shipment, and the dispatch trail for one order at a time. Nothing ships before a person confirms the money, and marking shipped requires a recorded tracking number."
    >
      {(token) => <FulfillmentOperationsBody token={token} />}
    </AdminScreen>
  );
}

// Module-level loaders so the resource identity is stable across renders.
const loadPaymentQueue = (t: string) => listEarlyAccessPaymentQueue(t);
const loadFulfillmentQueue = (t: string) => listEarlyAccessFulfillmentQueue(t);

export function FulfillmentOperationsBody({ token }: { token: string }) {
  return (
    <div className="grid gap-8">
      <PaymentReviewQueuePanel token={token} />
      <SettledAwaitingFulfillmentPanel token={token} />
      <DispatchCard token={token} />
    </div>
  );
}

function PaymentReviewQueuePanel({ token }: { token: string }) {
  const resource = useAdminResource(token, loadPaymentQueue);
  return (
    <section aria-label="Payment review queue">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h2 className="body-l font-700">Payment review queue</h2>
        {resource.state === "ok" && (
          <button type="button" className="btn btn-ghost" onClick={resource.reload}>
            Refresh
          </button>
        )}
      </div>
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The payment review queue is not reachable."
        unavailableBody="The Early Access payments API is not responding in this environment."
      >
        <ResearchDataTable
          caption="Orders under payment review, oldest first"
          empty="Nobody is waiting on payment review."
          rows={[...(resource.data?.items ?? [])]}
          rowKey={(row) => row.orderNumber}
          columns={[
            { key: "order", header: "Order", render: (row) => <span className="tabular">{row.orderNumber}</span> },
            { key: "placed", header: "Placed", render: (row) => fmtDateTime(row.placedAt) },
            {
              key: "amount",
              header: "Amount owed",
              render: (row) => <span className="tabular">{fmtCents(row.payableTotalCents, row.currency)}</span>,
            },
            { key: "line", header: "Line", render: (row) => `${row.quantity} x ${row.sku}` },
            {
              key: "proof",
              header: "Current proof",
              render: (row) =>
                row.currentProof
                  ? `${row.currentProof.method} - ${row.currentProof.filename}`
                  : "None submitted",
            },
            {
              key: "contact",
              header: "Contact",
              render: (row) => row.contact?.email ?? "Concierge channel",
            },
            {
              key: "state",
              header: "State",
              render: (row) => (
                <ResearchStatusBadge
                  label={PAYMENT_STATE_LABEL[row.paymentState] ?? row.paymentState}
                  tone={row.paymentState === "under_review" ? "warning" : "neutral"}
                />
              ),
            },
          ]}
        />
      </AdminBoundary>
    </section>
  );
}

function SettledAwaitingFulfillmentPanel({ token }: { token: string }) {
  const resource = useAdminResource(token, loadFulfillmentQueue);
  return (
    <section aria-label="Settled orders awaiting fulfillment">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h2 className="body-l font-700">Settled, awaiting fulfillment</h2>
        {resource.state === "ok" && (
          <button type="button" className="btn btn-ghost" onClick={resource.reload}>
            Refresh
          </button>
        )}
      </div>
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The settled-awaiting-fulfillment queue is not available yet."
        unavailableBody="Its read-only database function is a founder-gated candidate migration and the server refuses to invent this list without it. Until it deploys, work from the per-order dispatch card below - it reads live data today."
      >
        <ResearchDataTable
          caption="Orders with verified payment and no recorded shipment, oldest settlement first"
          empty="Every settled order has a recorded shipment."
          rows={[...((resource.data?.items ?? []) as EarlyAccessSettledAwaitingFulfillmentDto[])]}
          rowKey={(row) => row.orderNumber}
          columns={[
            { key: "order", header: "Order", render: (row) => <span className="tabular">{row.orderNumber}</span> },
            { key: "settled", header: "Payment verified", render: (row) => fmtDateTime(row.settledAt) },
            { key: "line", header: "Line", render: (row) => `${row.quantity} x ${row.sku}` },
            {
              key: "amount",
              header: "Paid",
              render: (row) => <span className="tabular">{fmtCents(row.payableTotalCents, row.currency)}</span>,
            },
            {
              key: "dispatch",
              header: "Dispatch",
              render: (row) => (
                <ResearchStatusBadge
                  label={
                    row.trackingCount > 0
                      ? "Tracking recorded"
                      : row.dispatchEventCount > 0
                        ? "Dispatch started"
                        : "Not started"
                  }
                  tone={row.trackingCount > 0 ? "info" : "warning"}
                />
              ),
            },
          ]}
        />
      </AdminBoundary>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The per-order dispatch card.
// ---------------------------------------------------------------------------

type DispatchGuidance = Readonly<{ tone: "info" | "warning" | "success"; text: string }>;

/** Machine codes become operator guidance here; messages never route. */
function guidanceFor(code: string): DispatchGuidance {
  if (code === "TRACKING_REQUIRED") {
    return {
      tone: "warning",
      text: "The server refused mark-shipped because no tracking number is recorded. Record the carrier and tracking number first, then mark shipped.",
    };
  }
  if (code === "PAYMENT_NOT_VERIFIED") {
    return {
      tone: "warning",
      text: "This order's payment has not been confirmed by a named human, so no supplier order exists yet. Confirm the payment first.",
    };
  }
  if (code === "DISPATCH_TRAIL_MOVED") {
    return {
      tone: "info",
      text: "Another operator changed this order's dispatch trail first. Reload the order to see the current state before acting again.",
    };
  }
  return { tone: "warning", text: `The server refused the action: ${code}.` };
}

export function DispatchCard({ token }: { token: string }) {
  const [orderNumberInput, setOrderNumberInput] = useState("");
  const [loadedOrderNumber, setLoadedOrderNumber] = useState<string | null>(null);
  const [view, setView] = useState<EarlyAccessSupplierOrderReadDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<DispatchGuidance | null>(null);
  const [busy, setBusy] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  // The bare re-read, used after an action so the operator sees the state
  // the server reports. It deliberately does NOT clear guidance: the refusal
  // code from the action just taken is the thing the operator must act on.
  const refresh = useCallback(
    async (orderNumber: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await getEarlyAccessSupplierOrder(token, orderNumber);
        if (result.kind === "ok") {
          setView(result.data);
          setLoadedOrderNumber(orderNumber);
        } else if (result.kind === "denied") {
          setView(null);
          setLoadedOrderNumber(null);
          setGuidance(guidanceFor(result.code));
        } else {
          setView(null);
          setLoadedOrderNumber(null);
          // 404 and an unpublished surface arrive identically, deliberately:
          // the message must be true for both.
          setError(
            result.kind === "unavailable"
              ? "No supplier order is readable at that order number."
              : "The supplier order could not be loaded right now.",
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  // A fresh lookup starts a fresh conversation: stale guidance goes first.
  const load = useCallback(
    async (orderNumber: string) => {
      setGuidance(null);
      await refresh(orderNumber);
    },
    [refresh],
  );

  function submitLookup(event: FormEvent) {
    event.preventDefault();
    const number = orderNumberInput.trim().toUpperCase();
    if (!ORDER_NUMBER.test(number)) {
      setView(null);
      setError("That is not an Early Access order number.");
      return;
    }
    void load(number);
  }

  const recordTracking = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (loadedOrderNumber === null) return;
      const carrierValue = carrier.trim();
      const trackingValue = trackingNumber.trim();
      if (carrierValue.length === 0 || trackingValue.length === 0) {
        setGuidance({ tone: "warning", text: "A carrier and a tracking number are both required." });
        return;
      }
      setBusy(true);
      setGuidance(null);
      try {
        const result = await postEarlyAccessTracking(token, loadedOrderNumber, {
          carrier: carrierValue,
          trackingNumber: trackingValue,
        });
        if (result.kind === "ok") {
          setCarrier("");
          setTrackingNumber("");
          setGuidance({ tone: "success", text: "Tracking recorded. The customer notification is queued automatically." });
        } else if (result.kind === "denied") {
          setGuidance(guidanceFor(result.code));
        } else if (result.kind === "error") {
          setGuidance({ tone: "warning", text: result.message });
        } else {
          setGuidance({ tone: "warning", text: "Tracking could not be recorded right now." });
        }
      } finally {
        setBusy(false);
        // Always re-read: the operator should see the state the server
        // reports, not the state the browser hoped for. The refusal
        // guidance survives the re-read on purpose.
        await refresh(loadedOrderNumber);
      }
    },
    [token, loadedOrderNumber, carrier, trackingNumber, refresh],
  );

  const markShipped = useCallback(async () => {
    if (loadedOrderNumber === null) return;
    setBusy(true);
    setGuidance(null);
    try {
      const result = await markEarlyAccessShipped(token, loadedOrderNumber);
      if (result.kind === "ok") {
        setGuidance(
          result.data.shipped
            ? { tone: "success", text: "Marked shipped against the recorded tracking number." }
            : { tone: "info", text: "This order was already marked shipped; the original record stands." },
        );
      } else if (result.kind === "denied") {
        setGuidance(guidanceFor(result.code));
      } else if (result.kind === "error") {
        setGuidance({ tone: "warning", text: result.message });
      } else {
        setGuidance({ tone: "warning", text: "Mark-shipped could not be recorded right now." });
      }
    } finally {
      setBusy(false);
      await refresh(loadedOrderNumber);
    }
  }, [token, loadedOrderNumber, refresh]);

  return (
    <section aria-label="Order dispatch">
      <h2 className="body-l font-700 mb-4">Order dispatch</h2>
      <div className="grid gap-6">
        <form className="card p-5 grid gap-3" onSubmit={submitLookup} aria-label="Find an order to dispatch">
          <label className="grid gap-2 body-s" htmlFor="ea-dispatch-order-number">
            Early Access order number
            <input
              id="ea-dispatch-order-number"
              className="input"
              value={orderNumberInput}
              onChange={(event) => setOrderNumberInput(event.currentTarget.value)}
              placeholder="XEA-…"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "LOADING…" : "LOAD ORDER"}
          </button>
          {error ? (
            <p className="body-s" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        {guidance ? (
          <div className="card" role="status">
            <ResearchStatusBadge
              label={guidance.tone === "success" ? "Done" : guidance.tone === "info" ? "Note" : "Action needed"}
              tone={guidance.tone}
            />
            <p className="body-s text-ink-2 mt-2">{guidance.text}</p>
          </div>
        ) : null}

        {view && loadedOrderNumber ? (
          <DispatchDetail
            view={view}
            orderNumber={loadedOrderNumber}
            busy={busy}
            carrier={carrier}
            trackingNumber={trackingNumber}
            onCarrier={setCarrier}
            onTrackingNumber={setTrackingNumber}
            onRecordTracking={recordTracking}
            onMarkShipped={() => void markShipped()}
          />
        ) : null}
      </div>
    </section>
  );
}

function DispatchDetail({
  view,
  orderNumber,
  busy,
  carrier,
  trackingNumber,
  onCarrier,
  onTrackingNumber,
  onRecordTracking,
  onMarkShipped,
}: {
  view: EarlyAccessSupplierOrderReadDto;
  orderNumber: string;
  busy: boolean;
  carrier: string;
  trackingNumber: string;
  onCarrier: (value: string) => void;
  onTrackingNumber: (value: string) => void;
  onRecordTracking: (event: FormEvent) => void;
  onMarkShipped: () => void;
}) {
  const recipient = view.packet.recipient;
  const shipped = view.fulfillment !== null;
  return (
    <div className="grid gap-6">
      <div className="card" aria-label="Supplier packet">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="mono-label text-ink-mute">Supplier packet · {orderNumber}</p>
          <ResearchStatusBadge
            label={shipped ? "Shipped" : view.tracking.length > 0 ? "Tracking recorded" : "Awaiting dispatch"}
            tone={shipped ? "success" : view.tracking.length > 0 ? "info" : "warning"}
          />
        </div>
        <div className="grid gap-1 mt-3">
          <p className="body-s text-ink-2">
            Release <span className="tabular">{view.packet.releaseId}</span>
          </p>
          <p className="body-s text-ink-2">
            {view.packet.quantity} x {view.packet.supplierSku} via {view.packet.supplierId}
          </p>
          {/* The shipping address, on the one surface that needs it: an
              operator sending the packet to the supplier by hand. */}
          <p className="body-s text-ink-2 mt-2">
            {recipient.recipientName}
            <br />
            {recipient.line1}
            {recipient.line2 ? (
              <>
                <br />
                {recipient.line2}
              </>
            ) : null}
            <br />
            {recipient.city}, {recipient.region} {recipient.postalCode}, {recipient.country}
          </p>
        </div>
      </div>

      <div className="card" aria-label="Dispatch trail">
        <p className="mono-label text-ink-mute">Dispatch trail</p>
        {view.events.length === 0 ? (
          <p className="body-s text-ink-2 mt-2">No dispatch events recorded yet.</p>
        ) : (
          <ol className="grid gap-2 mt-3">
            {view.events.map((event) => (
              <li key={event.sequence} className="body-s text-ink-2">
                <span className="mono-label text-ink-mute">{fmtDateTime(event.at)}</span>{" "}
                {event.kind.replace(/_/g, " ")} - {event.outcome}
                {event.channel ? ` via ${event.channel}` : ""}
                {event.recipient ? ` (${event.recipient})` : ""}
              </li>
            ))}
          </ol>
        )}
        {view.tracking.length > 0 ? (
          <div className="mt-4">
            <p className="mono-label text-ink-mute">Tracking</p>
            <ol className="grid gap-1 mt-2">
              {view.tracking.map((entry) => (
                <li key={entry.sequence} className="body-s text-ink-2 tabular">
                  {entry.carrier} {entry.trackingNumber} ({fmtDateTime(entry.recordedAt)})
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {view.fulfillment ? (
          <p className="body-s text-ink-2 mt-3">
            Shipped {fmtDateTime(view.fulfillment.fulfilledAt)} - {view.fulfillment.carrier}{" "}
            <span className="tabular">{view.fulfillment.trackingNumber}</span>
          </p>
        ) : null}
      </div>

      {!shipped ? (
        <form className="card p-5 grid gap-3" onSubmit={onRecordTracking} aria-label="Record tracking">
          <p className="mono-label text-ink-mute">Record tracking</p>
          <label className="grid gap-2 body-s" htmlFor="ea-dispatch-carrier">
            Carrier
            <input
              id="ea-dispatch-carrier"
              className="input"
              value={carrier}
              onChange={(event) => onCarrier(event.currentTarget.value)}
              placeholder="UPS"
              autoComplete="off"
            />
          </label>
          <label className="grid gap-2 body-s" htmlFor="ea-dispatch-tracking-number">
            Tracking number
            <input
              id="ea-dispatch-tracking-number"
              className="input"
              value={trackingNumber}
              onChange={(event) => onTrackingNumber(event.currentTarget.value)}
              placeholder="1Z…"
              autoComplete="off"
            />
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" className="btn" disabled={busy} data-testid="button-ea-record-tracking">
              {busy ? "WORKING…" : "RECORD TRACKING"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={onMarkShipped}
              data-testid="button-ea-mark-shipped"
            >
              MARK SHIPPED
            </button>
          </div>
          <p className="body-s text-ink-mute">
            Marking shipped is refused by the server until a tracking number is recorded. Corrections append a new
            tracking entry; nothing is overwritten.
          </p>
        </form>
      ) : (
        <ResearchEmptyState
          title="This order is shipped."
          body="The fulfillment record above is final. A second mark-shipped returns the original and writes nothing."
        />
      )}
    </div>
  );
}
