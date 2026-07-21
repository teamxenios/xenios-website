import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { getCart, getStoreCredit, quoteShipping, submitCheckout } from "../../adapters/commerce";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { PRICE_NOT_CONFIRMED } from "./commerce-presentation";
import type { CartDto, CheckoutRequest, OrderSummaryDto, StoreCreditDto } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";

// ---------------------------------------------------------------------------
// Member Checkout (/research/member/checkout). The FULL flow, built now:
// shipping address, service selection, on-demand shipping quote, required
// agreements plus the research attestation, optional store credit bounded by
// spendable credit, and a server-computed order summary. The submit routes on
// the machine code, never on message text:
//   ok                          confirmation with the order id and state
//   commerce_disabled           the canonical calm pending state; the form
//                               keeps every value, and the same flow works
//                               unchanged the day commerce switches on
//   large_order_review_required success-adjacent: the order EXISTS and is
//                               held for a personal review (about two hours)
//   anything else               the designed denial copy, form still editable
// The idempotency key is generated once on mount and stays stable across
// retries so a retried submit cannot create two orders; it regenerates only
// after a success.
// ---------------------------------------------------------------------------

// Sourced from the one canonical declaration so the wording cannot drift
// between the checkout summary, the cart, and the catalog.
export const PRICE_PENDING_COPY = PRICE_NOT_CONFIRMED;

function money(cents: number | null | undefined): string {
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }
  return PRICE_PENDING_COPY;
}

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual key
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const SHIPPING_SERVICES: Array<{ value: ShippingQuote["service"]; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "expedited_2day", label: "Expedited (2 day)" },
  { value: "next_day", label: "Next day" },
  { value: "same_day", label: "Same day" },
  { value: "temperature_controlled", label: "Temperature controlled" },
];

type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

type SubmitPhase =
  | { kind: "form" }
  | { kind: "placed"; order: OrderSummaryDto }
  | { kind: "held_for_review" };

function Field({
  id,
  label,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mono-label text-ink-mute">
        {label}
        {optional ? " (optional)" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function Checkout() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [loadDenial, setLoadDenial] = useState<{ code: string; message?: string } | null>(null);
  const [cart, setCart] = useState<CartDto | null>(null);
  const [storeCredit, setStoreCredit] = useState<StoreCreditDto | null>(null);

  // Shipping address (country is fixed to US by the contract).
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [service, setService] = useState<ShippingQuote["service"]>("standard");

  // On-demand shipping quote.
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteDenial, setQuoteDenial] = useState<{ code: string; message?: string } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Agreements and attestation.
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [attestation, setAttestation] = useState(false);

  // Store credit input, entered in dollars, bounded by spendable credit.
  const [creditInput, setCreditInput] = useState("");

  // Generated once on mount; stable across retries; regenerated only after a
  // success so a retried submit can never create two orders.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newIdempotencyKey());

  const [phase, setPhase] = useState<SubmitPhase>({ kind: "form" });
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitDenial, setSubmitDenial] = useState<{ code: string; message?: string } | null>(null);
  const [submitUnavailable, setSubmitUnavailable] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    setLoadDenial(null);
    const [cartResult, creditResult] = await Promise.all([getCart(memberToken), getStoreCredit(memberToken)]);
    // Store credit is optional context: when its endpoint is not available the
    // checkout still works, with no credit input shown.
    if (creditResult.kind === "ok") setStoreCredit(creditResult.data.storeCredit);
    if (cartResult.kind === "ok") {
      setCart(cartResult.data.cart);
      setState("ok");
      return;
    }
    if (cartResult.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (cartResult.kind === "denied") {
      setLoadDenial({ code: cartResult.code, message: cartResult.message });
      setState("ok");
      return;
    }
    if (cartResult.kind === "unavailable" || cartResult.kind === "forbidden") {
      setState("unavailable");
      return;
    }
    setErrorMessage(cartResult.message);
    setState("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const destination = useMemo(
    () => ({
      line1: line1.trim(),
      ...(line2.trim() ? { line2: line2.trim() } : {}),
      city: city.trim(),
      state: stateCode.trim(),
      postalCode: postalCode.trim(),
      country: "US" as const,
    }),
    [line1, line2, city, stateCode, postalCode],
  );

  const addressComplete =
    destination.line1.length > 0 &&
    destination.city.length > 0 &&
    destination.state.length > 0 &&
    destination.postalCode.length > 0;

  const requiredAgreements = cart?.requiredAgreements ?? [];
  const allAgreed = requiredAgreements.every((key) => accepted[key]);

  const spendableCents = storeCredit?.spendableCents ?? 0;
  const creditCents = useMemo(() => {
    const parsed = Number.parseFloat(creditInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(Math.round(parsed * 100), spendableCents);
  }, [creditInput, spendableCents]);

  const requestQuote = async () => {
    setQuoteBusy(true);
    setQuoteDenial(null);
    setQuoteError(null);
    setQuote(null);
    const result = await quoteShipping(memberToken, { destination, service });
    setQuoteBusy(false);
    if (result.kind === "ok") {
      setQuote(result.data.quote);
      return;
    }
    if (result.kind === "denied") {
      setQuoteDenial({ code: result.code, message: result.message });
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable") {
      setQuoteError("Shipping quotes are not available yet. The order can still be reviewed with the standard figure.");
      return;
    }
    setQuoteError(result.kind === "error" ? result.message : "The quote did not come back. Please try again.");
  };

  const submit = async () => {
    setValidation(null);
    setSubmitDenial(null);
    setSubmitUnavailable(false);
    setSubmitError(null);
    if (!addressComplete) {
      setValidation("Fill in the shipping address (street, city, state, and ZIP) before placing the order.");
      return;
    }
    if (!allAgreed || !attestation) {
      setValidation("Accept the required agreements and the research attestation before placing the order.");
      return;
    }
    const request: CheckoutRequest = {
      shippingAddress: destination,
      shippingService: service,
      ...(creditCents > 0 ? { applyStoreCreditCents: creditCents } : {}),
      acceptedAgreementKeys: requiredAgreements.filter((key) => accepted[key]),
      researchAttestation: attestation,
      idempotencyKey,
    };
    setSubmitBusy(true);
    const result = await submitCheckout(memberToken, request);
    setSubmitBusy(false);
    if (result.kind === "ok") {
      setPhase({ kind: "placed", order: result.data.order });
      // Only now does the key rotate: the next order is a new intent.
      setIdempotencyKey(newIdempotencyKey());
      return;
    }
    if (result.kind === "denied") {
      if (result.code === "large_order_review_required") {
        // Not an error: the order exists and is held for a personal review.
        setPhase({ kind: "held_for_review" });
        return;
      }
      setSubmitDenial({ code: result.code, message: result.message });
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable") {
      setSubmitUnavailable(true);
      return;
    }
    setSubmitError(result.kind === "error" ? result.message : "The order was not placed. Please try again.");
  };

  // ------------------------------ render -----------------------------------

  if (phase.kind === "placed") {
    return (
      <ResearchMemberShell title="Checkout" lead="Your order is in.">
        <section role="status" className="card" data-testid="checkout-confirmation">
          <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
            <p className="mono-label text-ink-mute">Order placed</p>
            <ResearchStatusBadge label="Confirmed" tone="success" />
          </div>
          <p className="body-m font-700 mt-2">Order {phase.order.orderId} was placed.</p>
          <p className="body-s text-ink-2 mt-2">
            Current state: {phase.order.state.replace(/_/g, " ")}. Every order is personally reviewed before it
            ships; you can follow it from your orders page.
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={MEMBER_ROUTES.orders} className="btn btn-primary">
              View your orders
            </Link>
            <Link href={MEMBER_ROUTES.products} className="btn btn-ghost">
              Back to products
            </Link>
          </div>
        </section>
      </ResearchMemberShell>
    );
  }

  if (phase.kind === "held_for_review") {
    const p = denialPresentation("large_order_review_required");
    return (
      <ResearchMemberShell title="Checkout" lead="Your order is in and is getting a personal look.">
        <section role="status" aria-live="polite" className="card ra-pending ra-pending-samuel_review_pending" data-testid="checkout-held">
          <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
            <p className="mono-label text-ink-mute">With the review team</p>
            <ResearchStatusBadge label="In review" tone="info" />
          </div>
          <p className="body-m font-700 mt-2">{p.title}</p>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{p.body}</p>
          <div className="mt-4">
            <Link href={MEMBER_ROUTES.orders} className="btn btn-primary">
              View your orders
            </Link>
          </div>
        </section>
      </ResearchMemberShell>
    );
  }

  return (
    <ResearchMemberShell
      title="Checkout"
      lead="Shipping, agreements, and a final look at the numbers. Totals are computed by the server; nothing you see here is invented by the browser."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void load()}
        unavailableTitle="Checkout is not open yet."
        unavailableBody="It is being prepared. Nothing is wrong with your account, and your cart is kept."
      >
        {loadDenial ? (
          <ResearchDenialNotice code={loadDenial.code} message={loadDenial.message} />
        ) : !cart || cart.lines.length === 0 ? (
          <ResearchEmptyState
            title="There is nothing to check out."
            body="Your cart is empty. Add a product first, then come back here."
            action={
              <Link href={MEMBER_ROUTES.products} className="btn btn-primary">
                Browse products
              </Link>
            }
          />
        ) : (
          <div className="grid gap-6">
            {submitDenial && <ResearchDenialNotice code={submitDenial.code} message={submitDenial.message} />}
            {submitUnavailable && (
              <ResearchPendingPanel
                kind="not_configured"
                title="Checkout is not open yet."
                body="The order was not placed and nothing you entered was lost. This exact flow works unchanged once checkout opens."
              />
            )}
            {submitError && (
              <p role="alert" className="body-s text-ink-2">
                {submitError}
              </p>
            )}

            {/* Shipping address */}
            <section className="card" aria-label="Shipping address">
              <p className="mono-label text-ink-mute">Shipping address</p>
              <div className="mt-3 grid gap-3">
                <Field id="co-line1" label="Street address">
                  <input
                    id="co-line1"
                    className="input-field"
                    autoComplete="address-line1"
                    value={line1}
                    onChange={(e) => setLine1(e.target.value)}
                    data-testid="co-line1"
                  />
                </Field>
                <Field id="co-line2" label="Apartment, suite, unit" optional>
                  <input
                    id="co-line2"
                    className="input-field"
                    autoComplete="address-line2"
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    data-testid="co-line2"
                  />
                </Field>
                <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                  <Field id="co-city" label="City">
                    <input
                      id="co-city"
                      className="input-field"
                      autoComplete="address-level2"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      data-testid="co-city"
                    />
                  </Field>
                  <Field id="co-state" label="State">
                    <input
                      id="co-state"
                      className="input-field"
                      autoComplete="address-level1"
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      data-testid="co-state"
                    />
                  </Field>
                  <Field id="co-postal" label="ZIP">
                    <input
                      id="co-postal"
                      className="input-field"
                      autoComplete="postal-code"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      data-testid="co-postal"
                    />
                  </Field>
                </div>
                <p className="body-s text-ink-mute">Country: United States. Orders ship within the US only for now.</p>
              </div>
            </section>

            {/* Shipping service and on-demand quote */}
            <section className="card" aria-label="Shipping service">
              <p className="mono-label text-ink-mute">Shipping service</p>
              <div className="mt-3 grid gap-3">
                <Field id="co-service" label="Service">
                  <select
                    id="co-service"
                    className="input-field"
                    value={service}
                    onChange={(e) => setService(e.target.value as ShippingQuote["service"])}
                    data-testid="co-service"
                  >
                    {SHIPPING_SERVICES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={quoteBusy || !addressComplete}
                    onClick={() => void requestQuote()}
                    data-testid="co-quote"
                  >
                    {quoteBusy ? "Getting quote..." : "Get shipping quote"}
                  </button>
                  {!addressComplete && (
                    <p className="body-s text-ink-mute mt-2">Fill in the address first to quote shipping.</p>
                  )}
                </div>
                {quote && (
                  <div role="status" data-testid="co-quote-result">
                    <p className="body-m font-700 tabular">{money(quote.amountCents)}</p>
                    <p className="body-s text-ink-2 mt-1">
                      {quote.estimatedDeliveryRange
                        ? `Estimated ${quote.estimatedDeliveryRange.earliestDays} to ${quote.estimatedDeliveryRange.latestDays} days.`
                        : "No confirmed delivery window."}
                    </p>
                    <p className="body-s text-ink-mute mt-1">{quote.disclosure}</p>
                  </div>
                )}
                {quoteDenial && <ResearchDenialNotice code={quoteDenial.code} message={quoteDenial.message} />}
                {quoteError && (
                  <p role="alert" className="body-s text-ink-2">
                    {quoteError}
                  </p>
                )}
              </div>
            </section>

            {/* Store credit */}
            {storeCredit && (
              <section className="card" aria-label="Store credit">
                <p className="mono-label text-ink-mute">Store credit</p>
                <p className="body-s text-ink-2 mt-2">
                  Available now: <span className="tabular">{money(storeCredit.spendableCents)}</span>
                  {storeCredit.pendingCents > 0 && (
                    <>
                      {" "}· Pending review: <span className="tabular">{money(storeCredit.pendingCents)}</span>
                    </>
                  )}
                </p>
                {spendableCents > 0 ? (
                  <div className="mt-3" style={{ maxWidth: 240 }}>
                    <Field id="co-credit" label="Apply store credit (USD)" optional>
                      <input
                        id="co-credit"
                        className="input-field"
                        type="number"
                        min={0}
                        step="0.01"
                        max={spendableCents / 100}
                        value={creditInput}
                        onChange={(e) => setCreditInput(e.target.value)}
                        data-testid="co-credit"
                      />
                    </Field>
                    {creditCents > 0 && (
                      <p className="body-s text-ink-2 mt-2">
                        Applying <span className="tabular">{money(creditCents)}</span>. Only credit that is available
                        now can be spent; credit pending review cannot.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="body-s text-ink-mute mt-2">No spendable credit right now.</p>
                )}
              </section>
            )}

            {/* Agreements */}
            <section className="card" aria-label="Agreements">
              <p className="mono-label text-ink-mute">Agreements</p>
              <div className="mt-3 grid gap-3">
                {requiredAgreements.map((key) => (
                  <label key={key} className="flex items-start gap-3 body-s text-ink-2">
                    <input
                      type="checkbox"
                      checked={Boolean(accepted[key])}
                      onChange={(e) => setAccepted((prev) => ({ ...prev, [key]: e.target.checked }))}
                      data-testid={`co-agree-${key}`}
                    />
                    <span>I accept the {key.replace(/_/g, " ")}.</span>
                  </label>
                ))}
                <label className="flex items-start gap-3 body-s text-ink-2">
                  <input
                    type="checkbox"
                    checked={attestation}
                    onChange={(e) => setAttestation(e.target.checked)}
                    data-testid="co-attest"
                  />
                  <span>I confirm these materials are for research purposes.</span>
                </label>
              </div>
            </section>

            {/* Order summary: server-computed figures only. */}
            <section className="card" aria-label="Order summary">
              <p className="mono-label text-ink-mute">Order summary</p>
              <ul className="mt-3 grid gap-2">
                {cart.lines.map((line) => (
                  <li key={line.sku} className="flex items-center justify-between gap-4">
                    <span className="body-s">
                      {line.displayName} <span className="text-ink-mute tabular">x {line.quantity}</span>
                    </span>
                    <span className="body-s tabular">{money(line.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid gap-2" style={{ borderTop: "1px solid var(--border, rgba(128,128,128,0.25))", paddingTop: 12 }}>
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-s text-ink-2">Subtotal</dt>
                  <dd className="body-s tabular">{money(cart.subtotalCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-s text-ink-2">Shipping (once per order)</dt>
                  <dd className="body-s tabular">{money(cart.shippingCents)}</dd>
                </div>
                {cart.storeCreditAppliedCents > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="body-s text-ink-2">Store credit applied</dt>
                    <dd className="body-s tabular">-{money(cart.storeCreditAppliedCents)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-m font-700">Estimated total</dt>
                  <dd className="body-m font-700 tabular">{money(cart.estimatedTotalCents)}</dd>
                </div>
              </dl>
              {cart.shipmentGroups.length > 1 && (
                <p className="body-s text-ink-mute mt-3">
                  This order ships as {cart.shipmentGroups.length} shipments; shipping is charged once for the whole
                  order.
                </p>
              )}
            </section>

            {validation && (
              <p role="alert" className="body-s text-ink-2" data-testid="co-validation">
                {validation}
              </p>
            )}

            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitBusy}
                onClick={() => void submit()}
                data-testid="co-submit"
              >
                {submitBusy ? "Placing order..." : "Place order"}
              </button>
            </div>

            <ResearchSecureNotice>
              The cart is revalidated at checkout and every total is computed by the server. A retried submit reuses
              the same order intent, so it can never create two orders.
            </ResearchSecureNotice>
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
