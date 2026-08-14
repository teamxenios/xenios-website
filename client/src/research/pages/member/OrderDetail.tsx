import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import type { ClaimDto, ClaimReason, OrderDetailDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { getOrder, listClaims, submitClaim } from "../../adapters/commerce";
import { denialPresentation } from "../../lib/denials";
import { ACCESS_ROUTES, MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import {
  CLAIM_REASON_LABELS,
  CLAIM_RESOLUTION_LABELS,
  CLAIM_STATE_META,
  SHIPMENT_OWNER_LABELS,
  claimNote,
  formatCents,
  formatDate,
  orderStateMeta,
} from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member Order Detail (/research/member/orders/:id), driven by the frozen
// GET /api/research/orders/:orderId (OrderDetailDto).
//
// Rules baked in from the frozen contract:
// - shippingCents is ONE figure for the whole order, even when the order
//   splits into several shipment groups. It is never summed per group.
// - reviewReason present renders the canonical large-order pending-review
//   banner: a calm notice (the order exists and is held), never an error.
// - "Report an issue" submits a claim (POST /api/research/claims) with a
//   reason from the frozen ClaimReason vocabulary, routing on the machine
//   code; the order's existing claims render with their state and resolution.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; order: OrderDetailDto }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

type ClaimSubmitState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "sent" }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

const CLAIM_REASONS = Object.keys(CLAIM_REASON_LABELS) as ClaimReason[];

// ---------------------------------------------------------------------------
// Claims: report an issue with this order, and see what was already reported.
// ---------------------------------------------------------------------------
function ClaimsSection({
  order,
  token,
  claims,
  claimsKnown,
  onSubmitted,
}: {
  order: OrderDetailDto;
  token: string | null;
  claims: ClaimDto[];
  claimsKnown: boolean;
  onSubmitted: () => void;
}) {
  const [sku, setSku] = useState(order.lines[0]?.sku ?? "");
  const [reason, setReason] = useState<ClaimReason>("damaged");
  const [detail, setDetail] = useState("");
  const [submit, setSubmit] = useState<ClaimSubmitState>({ phase: "idle" });

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = detail.trim();
    if (!sku) {
      setSubmit({ phase: "error", message: "Choose the item the issue is about." });
      return;
    }
    if (!trimmed) {
      setSubmit({ phase: "error", message: "Please describe what happened." });
      return;
    }
    setSubmit({ phase: "busy" });
    const result = await submitClaim(token, {
      orderId: order.orderId,
      sku,
      reason,
      detail: trimmed,
      evidenceRefs: [],
    });
    switch (result.kind) {
      case "ok":
        setSubmit({ phase: "sent" });
        setDetail("");
        onSubmitted();
        return;
      case "denied":
        setSubmit({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setSubmit({ phase: "error", message: "Your session has ended. Sign in again to report this issue." });
        return;
      case "forbidden":
      case "unavailable":
        setSubmit({ phase: "unavailable" });
        return;
      case "error":
        setSubmit({ phase: "error", message: result.message });
        return;
    }
  };

  return (
    <section aria-labelledby="order-claims" className="grid gap-4">
      <h2 id="order-claims" className="body-m font-700">
        Report an issue
      </h2>

      {claims.length > 0 && (
        <div className="grid gap-3" data-testid="ra-order-claims">
          {claims.map((claim) => {
            const meta = CLAIM_STATE_META[claim.state];
            const note = claimNote(claim);
            return (
              <div key={claim.claimId} className="card" data-testid={`ra-claim-${claim.claimId}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="mono-label text-ink-mute">
                      {CLAIM_REASON_LABELS[claim.reason]} · {claim.sku}
                    </p>
                    <p className="body-s text-ink-2 mt-1">Submitted {formatDate(claim.submittedAt) ?? claim.submittedAt}.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResearchStatusBadge label={meta.label} tone={meta.tone} />
                    {claim.resolution && (
                      <ResearchStatusBadge label={CLAIM_RESOLUTION_LABELS[claim.resolution]} tone="neutral" />
                    )}
                  </div>
                </div>
                {/* What this state means for the member: the refund-request
                    lifecycle in plain words, straight from the wire state. */}
                {note && (
                  <p className="body-s text-ink-mute mt-2 max-w-[60ch]" data-testid={`ra-claim-note-${claim.claimId}`}>
                    {note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {claims.length === 0 && claimsKnown && (
        <p className="body-s text-ink-mute">No issues have been reported on this order.</p>
      )}

      <form className="card" onSubmit={(e) => void send(e)} aria-label="Report an issue with this order">
        <div className="grid gap-4" style={{ maxWidth: 560 }}>
          <div>
            <label className="form-label" htmlFor="ra-claim-sku">
              Item
            </label>
            <select
              id="ra-claim-sku"
              className="input-field"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              data-testid="ra-claim-sku"
            >
              {order.lines.map((line) => (
                <option key={line.sku} value={line.sku}>
                  {line.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="ra-claim-reason">
              What happened
            </label>
            <select
              id="ra-claim-reason"
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value as ClaimReason)}
              data-testid="ra-claim-reason"
            >
              {CLAIM_REASONS.map((r) => (
                <option key={r} value={r}>
                  {CLAIM_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="ra-claim-detail">
              Tell us more
            </label>
            <textarea
              id="ra-claim-detail"
              className="input-field"
              rows={4}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={2000}
              required
              data-testid="ra-claim-detail"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-secondary" disabled={submit.phase === "busy"} data-testid="ra-claim-submit">
              {submit.phase === "busy" ? "Sending..." : "Send report"}
            </button>
          </div>
          <div aria-live="polite">
            {submit.phase === "sent" && (
              <p className="body-s text-ink-2" role="status" data-testid="ra-claim-sent">
                Thank you. Your report is in and a person will review it. You can see its status above.
              </p>
            )}
            {submit.phase === "denied" && <ResearchDenialNotice code={submit.code} message={submit.message} />}
            {submit.phase === "unavailable" && (
              <p className="body-s text-ink-2" role="status">
                Issue reports are not being collected automatically yet, so your report was not sent. Email{" "}
                <a href="mailto:research@xeniostechnology.com">research@xeniostechnology.com</a> with your order id
                and a person will handle it.
              </p>
            )}
            {submit.phase === "error" && (
              <p className="body-s font-700" role="alert">
                {submit.message}
              </p>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ? decodeURIComponent(params.id) : "";
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [claims, setClaims] = useState<ClaimDto[]>([]);
  const [claimsKnown, setClaimsKnown] = useState(false);

  const loadClaims = useCallback(async () => {
    const result = await listClaims(memberToken);
    if (result.kind === "ok") {
      setClaims(result.data.claims.filter((c) => c.orderId === orderId));
      setClaimsKnown(true);
    } else {
      // Claims are supplementary: a missing claims surface never blocks the
      // order page, it just means no history can be shown.
      setClaims([]);
      setClaimsKnown(false);
    }
  }, [memberToken, orderId]);

  const load = useCallback(async () => {
    if (!orderId) {
      setState({ phase: "denied", code: "order_not_found" });
      return;
    }
    setState({ phase: "loading" });
    const result = await getOrder(memberToken, orderId);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", order: result.data.order });
        void loadClaims();
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
  }, [orderId, memberToken, loadClaims]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = state.phase === "ok" ? state.order : null;
  const stateMeta = order ? orderStateMeta(order.state) : null;
  const reviewCopy = denialPresentation("large_order_review_required");

  const lineColumns = [
    {
      key: "item",
      header: "Item",
      render: (line: OrderDetailDto["lines"][number]) => <span className="font-700">{line.displayName}</span>,
    },
    {
      key: "quantity",
      header: "Qty",
      render: (line: OrderDetailDto["lines"][number]) => <span className="tabular">{line.quantity}</span>,
    },
    {
      key: "line",
      header: "Line total",
      render: (line: OrderDetailDto["lines"][number]) => <span className="tabular">{formatCents(line.lineTotalCents)}</span>,
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
      eyebrow="Member · Orders"
      title={order ? `Order ${order.orderId}` : "Order"}
      lead={order ? `Placed ${formatDate(order.placedAt) ?? order.placedAt}.` : undefined}
      actions={
        <Link href={MEMBER_ROUTES.orders} className="btn btn-ghost">
          All orders
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="This order is not available."
        unavailableBody="Either ordering has not opened yet, or this order id is not part of your account. Check the address, or open your orders list."
      >
        {state.phase === "denied" ? (
          <div className="grid gap-4" data-testid="ra-order-denied">
            <ResearchDenialNotice code={state.code} message={state.message} />
            <div>
              <Link href={MEMBER_ROUTES.orders} className="btn btn-primary">
                Open your orders
              </Link>
            </div>
          </div>
        ) : (
          order && (
            <div className="grid gap-6">
              {stateMeta && (
                <div className="flex items-center gap-3">
                  <span className="mono-label text-ink-mute">Order status</span>
                  <ResearchStatusBadge label={stateMeta.label} tone={stateMeta.tone} />
                </div>
              )}

              {/* The large-order review banner: canonical calm copy, a
                  notice (role status), never an error. */}
              {order.reviewReason !== null && (
                <section role="status" aria-live="polite" className="card" data-testid="ra-review-banner">
                  <div className="flex items-center gap-3">
                    <ResearchStatusBadge label="Pending review" tone="info" />
                    <p className="body-s font-700">{reviewCopy.title}</p>
                  </div>
                  <p className="body-s text-ink-2 mt-2 max-w-[60ch]">{reviewCopy.body}</p>
                </section>
              )}

              <section aria-label="Items in this order">
                <h2 className="body-m font-700">Items</h2>
                <div className="mt-3">
                  {order.lines.length > 0 ? (
                    <ResearchDataTable
                      caption={`Items in order ${order.orderId}`}
                      columns={lineColumns}
                      rows={order.lines}
                      rowKey={(line) => line.sku}
                    />
                  ) : (
                    <ResearchEmptyState title="Item details pending." />
                  )}
                </div>
              </section>

              <section aria-label="Shipments for this order">
                <h2 className="body-m font-700">Shipments</h2>
                <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
                  An order can ship in more than one package. Each shipment carries its own status and tracking;
                  they all belong to this one order, and shipping is charged once for the whole order.
                </p>
                <div className="grid gap-4 mt-3">
                  {order.shipments.length > 0 ? (
                    order.shipments.map((shipment, i) => (
                      <section key={i} className="card" aria-label={`Shipment ${i + 1} of ${order.shipments.length}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="mono-label text-ink-mute">
                              Shipment {i + 1} of {order.shipments.length} · Fulfilled by {SHIPMENT_OWNER_LABELS[shipment.owner]}
                            </p>
                            <p className="body-s text-ink-2 mt-2">
                              {shipment.trackingNumber ? (
                                <>
                                  <span className="mono-label text-ink-mute">Tracking</span>{" "}
                                  <span className="tabular">
                                    {shipment.carrier ? `${shipment.carrier} · ` : ""}
                                    {shipment.trackingNumber}
                                  </span>
                                </>
                              ) : (
                                "Tracking appears here once the package is on its way."
                              )}
                            </p>
                          </div>
                          <ResearchStatusBadge label={orderStateMeta(shipment.status).label} tone={orderStateMeta(shipment.status).tone} />
                        </div>
                      </section>
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
                  <dl>
                    {/* ONE shipping figure per order, by rule, even across a
                        split shipment. */}
                    <div className="flex items-center justify-between gap-4 mt-1">
                      <dt className="body-s text-ink-2">Shipping (once per order)</dt>
                      <dd className="body-s tabular" data-testid="ra-shipping-total">
                        {formatCents(order.shippingCents)}
                      </dd>
                    </div>
                    {order.storeCreditAppliedCents > 0 && (
                      <div className="flex items-center justify-between gap-4 mt-1">
                        <dt className="body-s text-ink-2">Store credit applied</dt>
                        <dd className="body-s tabular" data-testid="ra-store-credit-applied">
                          -{formatCents(order.storeCreditAppliedCents)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 mt-1">
                      <dt className="body-s text-ink-2">Total</dt>
                      <dd className="body-s tabular font-700">{formatCents(order.totalCents)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <ClaimsSection
                order={order}
                token={memberToken}
                claims={claims}
                claimsKnown={claimsKnown}
                onSubmitted={() => void loadClaims()}
              />

              <section aria-label="Support for this order" className="card">
                <h2 className="body-m font-700">Need help with this order?</h2>
                <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                  A person answers. Include your order id and we will pick it up from there.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    className="btn btn-secondary"
                    href={`mailto:research@xeniostechnology.com?subject=${encodeURIComponent(`Order ${order.orderId}`)}`}
                  >
                    Email support
                  </a>
                  <Link href={ACCESS_ROUTES.support} className="btn btn-ghost">
                    Support options
                  </Link>
                </div>
              </section>

              <ResearchSecureNotice>
                Every fact on this page comes from the order record. Totals are computed by the server; shipping is
                one charge per order even when it ships in several packages.
              </ResearchSecureNotice>
            </div>
          )
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
