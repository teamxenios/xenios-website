import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import type { ClaimDto, ClaimReason, OrderDetailDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { getOrder, listClaims, submitClaim } from "../../adapters/commerce";
import { denialPresentation } from "../../lib/denials";
import { ACCESS_ROUTES, MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import { decodeMemberOrderId, readMemberClaims, readMemberOrderDetail, readSubmittedMemberClaim } from "../../member-orders/detail";
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
  | { phase: "denied"; code: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error" };

type ClaimSubmitState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "sent"; claim: ClaimDto }
  | { phase: "denied"; code: string }
  | { phase: "uncertain" }
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
  onHoldChange,
}: {
  order: OrderDetailDto;
  token: string;
  claims: ClaimDto[];
  claimsKnown: boolean;
  onSubmitted: () => void;
  onHoldChange: (held: boolean) => void;
}) {
  const [sku, setSku] = useState(order.lines[0]?.sku ?? "");
  const [reason, setReason] = useState<ClaimReason>("damaged");
  const [detail, setDetail] = useState("");
  const [submit, setSubmit] = useState<ClaimSubmitState>({ phase: "idle" });
  const alive = useRef(false);
  const held = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const fieldsLocked = submit.phase === "busy" || submit.phase === "uncertain";

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!alive.current || held.current) return;
    const trimmed = detail.trim();
    if (!order.lines.some((line) => line.sku === sku)) {
      setSubmit({ phase: "error", message: "Choose the item the issue is about." });
      return;
    }
    if (!trimmed || trimmed.length > 2000 || !CLAIM_REASONS.includes(reason)) {
      setSubmit({ phase: "error", message: "Please describe what happened." });
      return;
    }
    held.current = true;
    onHoldChange(true);
    setSubmit({ phase: "busy" });
    const request = {
      orderId: order.orderId,
      sku,
      reason,
      detail: trimmed,
      evidenceRefs: [],
    };
    try {
      const result = await submitClaim(token, request);
      if (!alive.current) return;
      if (result.kind === "ok") {
        const claim = readSubmittedMemberClaim(result.data, request);
        if (!claim) { setSubmit({ phase: "uncertain" }); return; }
        held.current = false; onHoldChange(false);
        setSubmit({ phase: "sent", claim }); setDetail(""); onSubmitted();
      } else if (result.kind === "denied") {
        held.current = false; onHoldChange(false);
        setSubmit({ phase: "denied", code: result.code });
      } else if (result.kind === "unauthorized" || result.kind === "forbidden") {
        held.current = false; onHoldChange(false);
        setSubmit({ phase: "error", message: "Access could not be verified. Sign in or contact support before sending a report." });
      } else {
        // Without server idempotency, an unavailable/failed reply cannot prove
        // that no report was recorded. Do not automatically resubmit.
        setSubmit({ phase: "uncertain" });
      }
    } catch {
      if (alive.current) setSubmit({ phase: "uncertain" });
    }
  };

  return (
    <section aria-labelledby="order-claims" className="grid gap-4">
      <h2 id="order-claims" className="body-m font-700">
        Report an issue
      </h2>
      <p className="body-s text-ink-mute">A report requests review. It does not by itself approve or execute a refund, replacement, or shipment.</p>

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
        <p className="body-s text-ink-mute">No issue reports were returned for this record.</p>
      )}
      {!claimsKnown && <p className="body-s text-ink-mute">Issue-report history is unavailable or still loading. This does not confirm whether a report exists.</p>}

      {order.lines.length === 0 ? <ResearchEmptyState title="Item details are needed to report an issue."
        body="Contact support to review this record. No item or claim eligibility can be inferred from missing line details." /> :
      <form className="card" onSubmit={(e) => void send(e)} aria-label="Report an issue with this order">
        <div className="grid gap-4" style={{ maxWidth: 560 }}>
          <div>
            <label className="form-label" htmlFor="ra-claim-sku">
              Item
            </label>
            <select
              id="ra-claim-sku"
              className="input-field"
              disabled={fieldsLocked}
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
              disabled={fieldsLocked}
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
              disabled={fieldsLocked}
              rows={4}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={2000}
              required
              data-testid="ra-claim-detail"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-secondary" disabled={fieldsLocked} data-testid="ra-claim-submit">
              {submit.phase === "busy" ? "Sending..." : "Send report"}
            </button>
          </div>
          <div aria-live="polite">
            {submit.phase === "sent" && (
              <p className="body-s text-ink-2" role="status" data-testid="ra-claim-sent">
                The server returned report {submit.claim.claimId} with status {CLAIM_STATE_META[submit.claim.state].label}. Check report history for updates.
              </p>
            )}
            {submit.phase === "denied" && <ResearchDenialNotice code={submit.code} />}
            {submit.phase === "uncertain" && (
              <p className="body-s text-ink-2" role="status">
                We could not confirm whether your report was recorded. Do not send it again or reload this page until support confirms the outcome. Contact{" "}
                <a href="mailto:team@xeniostechnology.com">team@xeniostechnology.com</a>. Your draft is retained here; no automatic retry will be sent.
              </p>
            )}
            {submit.phase === "error" && (
              <p className="body-s font-700" role="alert">
                {submit.message}
              </p>
            )}
          </div>
        </div>
      </form>}
    </section>
  );
}

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = decodeMemberOrderId(params?.id);
  const { memberToken, memberChecking } = useResearch();
  if (memberChecking || !memberToken || !orderId) return (
    <ResearchMemberShell eyebrow="Member · Orders" title="Order"
      actions={<Link href={MEMBER_ROUTES.orders} className="btn btn-ghost">All orders</Link>}>
      <ResearchRouteBoundary state={memberChecking ? "loading" : !memberToken ? "unauthorized" : "ok"}>
        <ResearchEmptyState title="This record address is not valid." body="Open your order history and choose a record to continue." />
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
  return <OwnedOrderDetail key={`${memberToken}:${orderId}`} token={memberToken} orderId={orderId} />;
}

function OwnedOrderDetail({ token, orderId }: { token: string; orderId: string }) {
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [claims, setClaims] = useState<ClaimDto[]>([]);
  const [claimsKnown, setClaimsKnown] = useState(false);
  const [claimHeld, setClaimHeld] = useState(false);
  const claimHold = useRef(false);
  const alive = useRef(false);
  const generation = useRef(0);
  const claimsGeneration = useRef(0);
  const onHoldChange = useCallback((held: boolean) => { claimHold.current = held; setClaimHeld(held); }, []);

  const loadClaims = useCallback(async (order: OrderDetailDto) => {
    if (!alive.current) return;
    const request = ++claimsGeneration.current;
    const orderRequest = generation.current;
    setClaims([]); setClaimsKnown(false);
    try {
      const result = await listClaims(token);
      if (!alive.current || request !== claimsGeneration.current || orderRequest !== generation.current) return;
      const rows = result.kind === "ok" ? readMemberClaims(result.data, order) : null;
      setClaims(rows ?? []); setClaimsKnown(rows !== null);
    } catch {
      if (alive.current && request === claimsGeneration.current && orderRequest === generation.current) {
        setClaims([]); setClaimsKnown(false);
      }
    }
  }, [token]);

  const load = useCallback(async () => {
    if (!alive.current || claimHold.current) return;
    const request = ++generation.current;
    ++claimsGeneration.current;
    setClaims([]); setClaimsKnown(false);
    setState({ phase: "loading" });
    try {
      const result = await getOrder(token, orderId);
      if (!alive.current || request !== generation.current) return;
      switch (result.kind) {
      case "ok": {
        const order = readMemberOrderDetail(result.data, orderId);
        if (!order) { setState({ phase: "error" }); return; }
        setState({ phase: "ok", order });
        void loadClaims(order);
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
      if (alive.current && request === generation.current) setState({ phase: "error" });
    }
  }, [orderId, token, loadClaims]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; ++generation.current; ++claimsGeneration.current; };
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
      title={order ? `${order.recordKind === "request" ? "Request" : order.recordKind === "order" ? "Order" : "Record"} ${order.orderId}` : "Order"}
      lead={order ? `Placed ${formatDate(order.placedAt) ?? order.placedAt}.` : undefined}
      actions={
        <>
          <Link href={MEMBER_ROUTES.orders} className="btn btn-ghost">All orders</Link>
          <button type="button" className="btn btn-ghost" disabled={claimHeld} onClick={() => void load()}>Refresh record</button>
        </>
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage="This record could not be verified. Please try again."
        onRetry={() => void load()}
        unavailableTitle="This order is not available."
        unavailableBody="This source could not provide the requested record. That does not establish whether it exists, belongs to your account, or is eligible for any action. Open your order history or contact support."
      >
        {state.phase === "denied" ? (
          <div className="grid gap-4" data-testid="ra-order-denied">
            <ResearchDenialNotice code={state.code} />
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
                  <span className="mono-label text-ink-mute">Recorded status</span>
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
                  shipping is shown once for the whole record.
                </p>
                <div className="grid gap-4 mt-3">
                  {order.shipmentsSource !== "connected" ? (
                    <ResearchEmptyState title="Shipment details unavailable."
                      body="This source does not establish shipment completeness. Missing details do not mean no shipment exists." />
                  ) : order.shipments.length > 0 ? (
                    order.shipments.map((shipment, i) => (
                      <section key={i} className="card" aria-label={`Shipment ${i + 1} of ${order.shipments.length}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="mono-label text-ink-mute">
                              Shipment {i + 1} of {order.shipments.length} · Shipment owner: {SHIPMENT_OWNER_LABELS[shipment.owner]}
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
                                "No tracking number was returned for this shipment."
                              )}
                            </p>
                          </div>
                          <ResearchStatusBadge label={shipment.status} tone="neutral" />
                        </div>
                      </section>
                    ))
                  ) : (
                    <ResearchEmptyState
                      title="No shipment records returned."
                      body="The connected source returned no shipment records; no delivery or payment outcome is inferred."
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
                token={token}
                claims={claims}
                claimsKnown={claimsKnown}
                onSubmitted={() => void loadClaims(order)}
                onHoldChange={onHoldChange}
              />

              <section aria-label="Support for this order" className="card">
                <h2 className="body-m font-700">Need help with this order?</h2>
                <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                  A person answers. Include your order id and we will pick it up from there.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    className="btn btn-secondary"
                    href="mailto:team@xeniostechnology.com"
                  >
                    Email support
                  </a>
                  <Link href={ACCESS_ROUTES.support} className="btn btn-ghost">
                    Support options
                  </Link>
                </div>
              </section>

              <ResearchSecureNotice>
                This page reflects the returned record, not a complete-history or purchasing-eligibility guarantee.
                Totals are reported by the server; shipping is one charge per order even when it ships in several packages.
              </ResearchSecureNotice>
            </div>
          )
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
