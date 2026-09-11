import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { getCart, getStoreCredit, isCheckoutQuoteSnapshot, quoteShipping, submitCheckout } from "../../adapters/commerce";
import { loadPaymentClientConfig, submitDurableCheckout, type DurableCheckoutResult, type DurableCheckoutState, type PaymentClientConfig } from "../../adapters/durableCheckout";
import { loadCheckoutContinuation, type CheckoutCancellationReason, type CheckoutContinuationView } from "../../adapters/checkoutContinuation";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { PaymentAuthenticationStep, stripeAuthenticator, type PaymentAuthenticator } from "../../payments/PaymentAuthenticationStep";
import { PaymentMethodCollector, type CollectPaymentMethod, type PaymentMethodCollectorClient } from "../../payments/PaymentMethodCollector";
import { clearCheckoutResume, readCheckoutResume, writeCheckoutResume } from "../../payments/checkout-resume";
import { ResearchMemberShell } from "../../ui/shells";
import {
  capabilityStatusOrPending,
  ResearchCapabilityBoundary,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { agreementLabel, PRICE_NOT_CONFIRMED } from "./commerce-presentation";
import type { CartDto, CheckoutQuoteSnapshot, CheckoutRequest, OrderSummaryDto, StoreCreditDto } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";

// ---------------------------------------------------------------------------
// Member Checkout (/research/member/checkout). The FULL flow: shipping
// address, service selection, on-demand shipping quote, required agreements
// plus the research attestation, optional store credit bounded by spendable
// credit, a server-computed order summary, and ONE of two doors:
//
//   The durable card door (POST /api/research/checkout/durable), used when the
//   server publishes a payment configuration. The card is collected inside the
//   provider's own element (a pm_ reference; never card data), the request is
//   FROZEN at first submit and resent verbatim on any retry, the same request
//   key continues the same execution, and the page shows the execution's
//   truthful state: bank authentication mounts the continuation step; an
//   uncertain answer says so and never invites a second payment; completed
//   shows the order reference; cancelled says nothing was charged. A checkout
//   that stops for authentication or loses its answer is resumed after a
//   refresh through an owner-checked server lookup (only the request key is
//   kept in this tab; no secret, no payload).
//
//   The ordering door (POST /api/research/checkout), exactly as before, when no
//   payment configuration is published (production today), for a fully
//   credit-covered order (no provider effect), and for an order the durable
//   door refers to review. The submit routes on the machine code, never on
//   message text:
//     ok                          confirmation with the order id and state
//     commerce_disabled           the canonical calm pending state; the form
//                                 keeps every value
//     large_order_review_required success-adjacent: the order EXISTS and is
//                                 held for a personal review
//     anything else               the designed denial copy, form still editable
//
// The idempotency key is generated once on mount and stays stable across
// retries so a retried submit cannot create two orders; it regenerates only
// after an order is placed or a durable checkout ends in cancelled.
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

/** Consistency check only; the browser never prices or grants credit. */
function matchesDisplayedCart(snapshot: CheckoutQuoteSnapshot, cart: CartDto): boolean {
  let sum = 0;
  for (const line of cart.lines) {
    if (typeof line.lineTotalCents !== "number" || !Number.isSafeInteger(line.lineTotalCents) || line.lineTotalCents < 0) return false;
    sum += line.lineTotalCents;
    if (!Number.isSafeInteger(sum)) return false;
  }
  return snapshot.subtotalCents === cart.subtotalCents && snapshot.subtotalCents === sum;
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
  | { kind: "held_for_review" }
  /** The durable door verified the payment with the provider and recorded the order. */
  | { kind: "paid"; orderId: string }
  /**
   * The durable door named an order the continuation door does not know (an
   * order placed through the ordering door under this key). The order EXISTS;
   * this page must not mint a new request and invite a second one.
   */
  | { kind: "order_exists"; orderId: string };

type PaymentConfigState = { kind: "loading" } | { kind: "ok"; config: PaymentClientConfig } | { kind: "off" };

/**
 * The durable submission's lifecycle on this page. `frozen` holds the exact
 * request already sent (or being sent) so a retry can only repeat it;
 * `execution` mirrors the server's truthful state for the request key.
 */
type DurableState =
  | { kind: "idle" }
  | { kind: "frozen"; request: CheckoutRequest }
  | { kind: "execution"; requestKey: string; orderId: string | null; state: DurableCheckoutState; note: string | null; source: "durable" | "resume" }
  | { kind: "cancelled"; orderId: string | null; reason: CheckoutCancellationReason }
  /**
   * A resumed reference the server does not (yet) know. It is NOT proof that
   * nothing was created: the durable door persists the execution last, so a
   * request that dropped mid-flight can have produced an order without an
   * execution row. The buyer decides what to do, told the truth.
   */
  | { kind: "unresolved"; requestKey: string };

const NOT_SETTLED: readonly DurableCheckoutState[] = ["pending", "authentication_required", "processing", "reconciliation_required"];

export interface CheckoutProps {
  /** Test seam: the provider client for card collection. Defaults to Stripe Elements. */
  paymentMethodClient?: PaymentMethodCollectorClient;
  /** Test seam: the provider client for bank authentication. Defaults to Stripe.js. */
  authenticator?: PaymentAuthenticator;
}

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
    <div className="min-w-0">
      <label htmlFor={id} className="mono-label text-ink-mute">
        {label}
        {optional ? " (optional)" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function Checkout({ paymentMethodClient, authenticator }: CheckoutProps = {}) {
  const { memberToken, member } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [loadDenial, setLoadDenial] = useState<{ code: string; message?: string } | null>(null);
  const [cart, setCart] = useState<CartDto | null>(null);
  const [storeCredit, setStoreCredit] = useState<StoreCreditDto | null>(null);
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigState>({ kind: "loading" });

  // Shipping address (country is fixed to US by the contract).
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [service, setService] = useState<ShippingQuote["service"]>("standard");

  // On-demand shipping quote.
  const [quoteRecord, setQuoteRecord] = useState<{ binding: string; snapshot: CheckoutQuoteSnapshot } | null>(null);
  const quoteGeneration = useRef(0);
  const [quoteCartMismatch, setQuoteCartMismatch] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteDenial, setQuoteDenial] = useState<{ code: string; message?: string } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Agreements and attestation.
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [attestation, setAttestation] = useState(false);

  // Generated once on mount; stable across retries; regenerated only after an
  // order is placed (or a durable checkout ends cancelled) so a retried submit
  // can never create two orders.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newIdempotencyKey());

  const [phase, setPhase] = useState<SubmitPhase>({ kind: "form" });
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitDenial, setSubmitDenial] = useState<{ code: string; message?: string } | null>(null);
  const [submitUnavailable, setSubmitUnavailable] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  // The durable door's lifecycle and the provider-hosted card collector.
  const [durable, setDurable] = useState<DurableState>({ kind: "idle" });
  const collectRef = useRef<CollectPaymentMethod | null>(null);
  const collectionInFlight = useRef<number | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  // Principal fence: every asynchronous answer is applied only if the token
  // that requested it is still the page's token. Unmount or an account switch
  // retires the token, so a late answer never renders under another account.
  const cartScope = member?.cartScope ?? null;
  const principal = useRef({ token: memberToken, scope: cartScope, generation: 0 });
  if (principal.current.token !== memberToken || principal.current.scope !== cartScope) {
    principal.current = { token: memberToken, scope: cartScope, generation: principal.current.generation + 1 };
  }
  const sessionGeneration = principal.current.generation;
  const [loadedGeneration, setLoadedGeneration] = useState<number | null>(null);
  const loadGeneration = useRef(0);
  const stillCurrent = useCallback((token: string | null) => token !== null
    && principal.current.token === token && principal.current.generation === sessionGeneration, [sessionGeneration]);
  useEffect(() => {
    return () => {
      principal.current = { ...principal.current, token: null, generation: principal.current.generation + 1 };
    };
  }, []);
  // An account or organization switch clears every private answer this page
  // holds: the execution in progress, the frozen request and the collector.
  useEffect(() => {
    setDurable({ kind: "idle" });
    setPhase({ kind: "form" });
    setSubmitDenial(null);
    setSubmitError(null);
    // These belong to the page, not to the retired token: leaving them set left
    // the next account's checkout disabled and labelled "Paying...".
    setSubmitBusy(false);
    setQuoteBusy(false);
    setSubmitUnavailable(false);
    setValidation(null);
    setQuoteRecord(null);
    setQuoteError(null);
    setQuoteDenial(null);
    setQuoteCartMismatch(false);
    setStoreCredit(null);
    setCart(null);
    setAccepted({});
    setAttestation(false);
    setLine1(""); setLine2(""); setCity(""); setStateCode(""); setPostalCode("");
    setService("standard");
    collectRef.current = null;
    setCardComplete(false);
  }, [sessionGeneration]);

  const load = useCallback(async () => {
    const token = memberToken;
    const generation = ++loadGeneration.current;
    quoteGeneration.current += 1;
    setQuoteRecord(null);
    setQuoteBusy(false);
    setQuoteError(null);
    setQuoteDenial(null);
    setQuoteCartMismatch(false);
    setState("loading");
    setErrorMessage(undefined);
    setLoadDenial(null);
    setPaymentConfig({ kind: "loading" });
    const [cartResult, creditResult, configResult] = await Promise.all([getCart(token), getStoreCredit(token), loadPaymentClientConfig(token)]);
    if (!stillCurrent(token) || generation !== loadGeneration.current) return;
    setLoadedGeneration(sessionGeneration);
    // Store credit is optional context: when its endpoint is not available the
    // checkout still works, with no credit input shown.
    if (creditResult.kind === "ok") setStoreCredit(creditResult.data.storeCredit);
    // The payment configuration decides the door. Anything but an explicit
    // answer keeps the ordering door: the page never guesses a provider.
    setPaymentConfig(configResult.kind === "ok" ? { kind: "ok", config: configResult.data.config } : { kind: "off" });
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
  }, [memberToken, sessionGeneration, stillCurrent]);

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

  // Resume: a checkout that stopped (bank authentication, a lost answer) is
  // looked up again through the owner-checked continuation door. The record
  // is only a reference bound to this account's scope; the server decides.
  useEffect(() => {
    if (paymentConfig.kind !== "ok" || durable.kind !== "idle" || phase.kind !== "form") return;
    const record = readCheckoutResume(cartScope);
    if (!record) return;
    if (record.settled && record.orderId) {
      // A purchase that already completed in this tab. Show what they bought,
      // never a fresh card field over the same cart.
      setPhase({ kind: "paid", orderId: record.orderId });
      return;
    }
    setIdempotencyKey(record.requestKey);
    setDurable({ kind: "execution", requestKey: record.requestKey, orderId: record.orderId, state: "pending", note: "Picking up the checkout you started.", source: "resume" });
  }, [paymentConfig, cartScope, durable.kind, phase.kind]);

  const commerceStatus = capabilityStatusOrPending(capabilities, "product_commerce");

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
  // While a request is frozen the button resends it byte for byte, so every
  // input that would change it is withheld. Otherwise the page would show
  // figures computed from edits the retry will not carry.
  const frozen = durable.kind === "frozen";
  // Render-bound identity: no effect delay can expose an old account/cart or
  // address quote, and A -> B -> A cannot revive an earlier asynchronous answer.
  const binding = JSON.stringify([sessionGeneration, destination, service, cart]);
  const quoteBinding = useRef(binding);
  if (quoteBinding.current !== binding) {
    quoteBinding.current = binding;
    quoteGeneration.current += 1;
  }
  const snapshot = quoteRecord?.binding === binding && cart !== null
    && isCheckoutQuoteSnapshot(quoteRecord.snapshot, service)
    && matchesDisplayedCart(quoteRecord.snapshot, cart) ? quoteRecord.snapshot : null;
  // A quote does not activate card checkout. The assisted door retains its cart
  // estimate and must not claim that a customer has consented to a card charge.
  const quotedConsent = frozen ? durable.request.checkoutConsent ?? null : snapshot?.checkoutConsent ?? null;
  const cardDoor = paymentConfig.kind === "ok" && (quotedConsent?.totalCents ?? cart?.estimatedTotalCents ?? 0) > 0;
  const consent = cardDoor ? quotedConsent : null;
  const quote = snapshot?.quote ?? (frozen && quoteRecord?.binding === binding ? quoteRecord.snapshot.quote : null);
  const creditCents = consent?.appliedCents ?? cart?.storeCreditAppliedCents ?? 0;
  // The cart estimate selects the established assisted/card door only. It is
  // never presented or submitted as consent for a new card charge.
  const estimatedChargeCents = consent?.totalCents ?? cart?.estimatedTotalCents ?? 0;
  const quoteRequired = cardDoor && snapshot === null;
  const activeConfig = paymentConfig.kind === "ok" ? paymentConfig.config : null;

  const authenticate = useMemo<PaymentAuthenticator>(() => {
    if (authenticator) return authenticator;
    if (activeConfig?.provider === "stripe" && activeConfig.publishableKey) return stripeAuthenticator(activeConfig.publishableKey);
    // The test provider completes its customer action server-side; the browser has nothing to run.
    return async () => "authenticated";
  }, [authenticator, activeConfig]);

  useEffect(() => {
    setQuoteRecord(null);
    setQuoteBusy(false);
    setQuoteDenial(null);
    setQuoteError(null);
    setQuoteCartMismatch(false);
  }, [binding]);

  useEffect(() => {
    if (frozen || quoteRecord?.binding !== binding) return;
    const remaining = Date.parse(quoteRecord.snapshot.expiresAt) - Date.now();
    const timer = window.setTimeout(() => {
      setQuoteRecord(null);
      setQuoteError("This checkout quote expired. Get a fresh quote before paying.");
      quoteGeneration.current += 1;
    }, Math.min(Math.max(remaining, 0), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [binding, frozen, quoteRecord]);

  const requestQuote = async () => {
    const token = memberToken;
    if (!stillCurrent(token) || !addressComplete || frozen || !cart) return;
    const requestedBinding = quoteBinding.current;
    const generation = ++quoteGeneration.current;
    setQuoteBusy(true);
    setQuoteDenial(null);
    setQuoteError(null);
    setQuoteCartMismatch(false);
    setQuoteRecord(null);
    let result: Awaited<ReturnType<typeof quoteShipping>>;
    try { result = await quoteShipping(token, { destination, service }); }
    catch { result = { kind: "unavailable" }; }
    if (!stillCurrent(token) || quoteBinding.current !== requestedBinding || quoteGeneration.current !== generation) return;
    setQuoteBusy(false);
    if (result.kind === "ok") {
      // Re-check here as well as at the transport boundary: time can pass while
      // a promise is suspended, and tests/alternate adapters are not authority.
      if (!isCheckoutQuoteSnapshot(result.data, service)) {
        setQuoteError("A complete, current checkout quote is unavailable. Please request a fresh quote.");
        return;
      }
      if (!matchesDisplayedCart(result.data, cart)) {
        setQuoteCartMismatch(true);
        setQuoteError("Your cart prices changed. Refresh the cart, then get a new quote before paying.");
        return;
      }
      setQuoteRecord({ binding: requestedBinding, snapshot: result.data });
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
      setQuoteError(cardDoor ? "A complete checkout quote is unavailable. Nothing was submitted; request a fresh quote before paying."
        : "Shipping quotes are not available yet. The order can still be reviewed with the standard figure.");
      return;
    }
    setQuoteError(result.kind === "error" ? result.message : "The quote did not come back. Please try again.");
  };

  const baseRequest = (): CheckoutRequest => ({
    shippingAddress: destination,
    shippingService: service,
    ...(creditCents > 0 ? { applyStoreCreditCents: creditCents } : {}),
    acceptedAgreementKeys: requiredAgreements.filter((key) => accepted[key]),
    researchAttestation: attestation,
    idempotencyKey,
    // The server snapshot is the buyer's expected intent, not a browser price.
    // Assisted requests do not manufacture card consent.
    ...(cardDoor && snapshot !== null ? { checkoutConsent: { ...snapshot.checkoutConsent }, expectedTotalCents: snapshot.checkoutConsent.totalCents } : {}),
  });

  // ------------------------- the ordering door ------------------------------

  const submitLegacy = async (request: CheckoutRequest) => {
    const token = memberToken;
    setSubmitBusy(true);
    const result = await submitCheckout(token, request);
    if (!stillCurrent(token)) return;
    setSubmitBusy(false);
    if (result.kind === "ok") {
      setPhase({ kind: "placed", order: result.data.order });
      // Only now does the key rotate: the next order is a new intent.
      setIdempotencyKey(newIdempotencyKey());
      setDurable({ kind: "idle" });
      return;
    }
    if (result.kind === "denied") {
      if (result.code === "large_order_review_required") {
        // Not an error: the order exists and is held for a personal review.
        setPhase({ kind: "held_for_review" });
        setDurable({ kind: "idle" });
        return;
      }
      setSubmitDenial({ code: result.code, message: result.message });
      setDurable({ kind: "idle" });
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable") {
      setSubmitUnavailable(true);
      setDurable({ kind: "idle" });
      return;
    }
    setSubmitError(result.kind === "error" ? result.message : "The order was not placed. Please try again.");
    setDurable({ kind: "idle" });
  };

  // -------------------------- the durable door ------------------------------

  const applyOutcome = (checkout: DurableCheckoutResult) => {
    if (checkout.state === "completed") {
      // NOT cleared: this is the only trace of a payment that succeeded, and a
      // token refresh remounts the member area. Without it the buyer came back
      // to an empty checkout page with their cart still in it.
      if (cartScope) writeCheckoutResume({ scope: cartScope, requestKey: checkout.requestKey, orderId: checkout.orderId, startedAt: new Date().toISOString(), settled: true });
      setPhase({ kind: "paid", orderId: checkout.orderId });
      setIdempotencyKey(newIdempotencyKey());
      setDurable({ kind: "idle" });
      return;
    }
    if (checkout.state === "cancelled") {
      clearCheckoutResume(cartScope);
      // Settled and terminal: the key can never bind another effect, so the next
      // order is a new intent. Without this the form below stayed live under a
      // spent key and every further attempt answered idempotency_conflict.
      setIdempotencyKey(newIdempotencyKey());
      setDurable({ kind: "cancelled", orderId: checkout.orderId, reason: checkout.cancellation?.reason ?? "provider" });
      return;
    }
    if (cartScope) writeCheckoutResume({ scope: cartScope, requestKey: checkout.requestKey, orderId: checkout.orderId, startedAt: new Date().toISOString() });
    setDurable({
      kind: "execution",
      requestKey: checkout.requestKey,
      orderId: checkout.orderId,
      state: checkout.state,
      note: checkout.idempotent ? "This is the checkout you already started; nothing was submitted twice." : null,
      source: "durable",
    });
  };

  const sendDurable = async (request: CheckoutRequest) => {
    const token = memberToken;
    setSubmitBusy(true);
    const result = await submitDurableCheckout(token, request);
    if (!stillCurrent(token)) return;
    setSubmitBusy(false);
    if (result.kind === "ok") {
      applyOutcome(result.data.checkout);
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "denied") {
      if (result.code === "idempotency_conflict") {
        // The key already names an execution with different details. Its truth
        // is shown through the owner-checked lookup; nothing new was created.
        setDurable({ kind: "execution", requestKey: request.idempotencyKey, orderId: null, state: "pending", note: "A checkout with these details is already in progress under this request. Showing its current state.", source: "durable" });
        return;
      }
      if (result.code === "large_order_review_required" || result.code === "payment_disabled") {
        // The ordering door creates no execution, so a pointer naming this key
        // could never be resolved by the continuation door.
        clearCheckoutResume(cartScope);
        // Both persisted nothing and both belong to the ordering door with the
        // SAME request: a held order for a personal review, and an order the
        // server priced as fully covered by store credit (no provider effect).
        // Showing "payments are not switched on" under a live card field would
        // dead-end a buyer the ordering door would serve.
        await submitLegacy(request);
        return;
      }
      // Any other denial persisted nothing: the form is editable again and the
      // same key may carry the corrected request. Nothing exists to resume.
      clearCheckoutResume(cartScope);
      setSubmitDenial({ code: result.code, message: result.message });
      setDurable({ kind: "idle" });
      // The price moved under the buyer. Re-read the cart so the figure they
      // are asked to approve next is the current one.
      if (result.code === "cart_revalidation_failed") void load();
      return;
    }
    // Unavailable or a failed connection AFTER the request left the page: the
    // outcome is unknown, so the request stays frozen and a retry can only
    // repeat it. The server continues the same execution or answers that
    // nothing exists; either way nothing is charged twice.
    setDurable({ kind: "frozen", request });
    setSubmitError(
      result.kind === "error"
        ? "We could not confirm whether your order was placed. Retry sends the same request, so nothing can be charged twice."
        : "Checkout is not available right now. Nothing you entered was lost. Retry sends the same request, so nothing can be charged twice.",
    );
  };

  const submit = async () => {
    if (!stillCurrent(memberToken) || loadedGeneration !== sessionGeneration || submitBusy || collectionInFlight.current === sessionGeneration) return;
    setValidation(null);
    setSubmitDenial(null);
    setSubmitUnavailable(false);
    setSubmitError(null);
    if (durable.kind === "frozen") {
      // A retry of a request whose answer was lost: byte-for-byte the same.
      await sendDurable(durable.request);
      return;
    }
    if (!addressComplete) {
      setValidation("Fill in the shipping address (street, city, state, and ZIP) before placing the order.");
      return;
    }
    if (!allAgreed || !attestation) {
      setValidation("Accept the required agreements and the research attestation before placing the order.");
      return;
    }
    if (cardDoor && (snapshot === null || !isCheckoutQuoteSnapshot(snapshot, service))) {
      setQuoteRecord(null);
      setValidation("Get a complete, current checkout quote and review its total and store credit before paying.");
      return;
    }
    const request = baseRequest();
    if (!cardDoor) {
      await submitLegacy(request);
      return;
    }
    const collect = collectRef.current;
    if (!collect) {
      setValidation("Enter your card details in the secure card field before paying.");
      return;
    }
    const token = memberToken;
    const requestedBinding = quoteBinding.current;
    const generation = quoteGeneration.current;
    collectionInFlight.current = sessionGeneration;
    setSubmitBusy(true);
    let collected: Awaited<ReturnType<CollectPaymentMethod>>;
    try { collected = await collect(); }
    catch { collected = { ok: false, message: "The secure card field could not finish. Please try again." }; }
    finally { if (collectionInFlight.current === sessionGeneration) collectionInFlight.current = null; }
    if (!stillCurrent(token)) return;
    if (quoteBinding.current !== requestedBinding || quoteGeneration.current !== generation
      || !isCheckoutQuoteSnapshot(snapshot, service)) {
      setSubmitBusy(false);
      setQuoteRecord(null);
      setValidation("Checkout details or the quote changed while the card field was working. Get a new quote and review it before paying.");
      return;
    }
    if (!collected.ok) {
      setSubmitBusy(false);
      setValidation(collected.message);
      return;
    }
    const frozen: CheckoutRequest = { ...request, paymentMethodReference: collected.reference };
    setDurable({ kind: "frozen", request: frozen });
    // The pointer is written BEFORE the request leaves. If the answer is lost
    // and the buyer refreshes, the next mount resumes THIS key through the
    // owner-checked door instead of minting a new one and paying twice. It
    // carries no secret and no payload: only the key, which authorizes nothing.
    if (cartScope) writeCheckoutResume({ scope: cartScope, requestKey: frozen.idempotencyKey, orderId: null, startedAt: new Date().toISOString() });
    await sendDurable(frozen);
  };

  const startNewRequest = () => {
    clearCheckoutResume(cartScope);
    setIdempotencyKey(newIdempotencyKey());
    setDurable({ kind: "idle" });
    setSubmitError(null);
    setSubmitDenial(null);
  };

  /**
   * Ask the server what it knows about the key this page is holding.
   *
   * A `not_found` is deliberately NOT treated as proof that nothing was
   * created: the durable door persists the execution LAST, after the order, so
   * a request that dropped mid-flight can leave an order with no execution row.
   * Minting a new key on that answer is how a buyer ends up with two orders.
   * The buyer is told what is known and decides.
   */
  const resolveCurrentKey = async () => {
    const token = memberToken;
    const key = idempotencyKey;
    setSubmitBusy(true);
    setSubmitError(null);
    const result = await loadCheckoutContinuation(token, key);
    if (!stillCurrent(token)) return;
    setSubmitBusy(false);
    if (result.kind === "ok") {
      const view = result.data.continuation;
      applyOutcome({
        requestKey: key,
        orderId: view.orderId,
        state: view.state,
        idempotent: true,
        ...(view.cancellation ? { cancellation: view.cancellation } : {}),
      });
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "denied" && result.code === "not_found") {
      setDurable({ kind: "unresolved", requestKey: key });
      return;
    }
    setSubmitError("We could not check that request just now. Nothing was charged twice; please try again in a moment.");
  };

  // ------------------------------ render -----------------------------------

  // Hide all previous-account output synchronously, including a frozen intent
  // or paid result, before effects clear state and load the current principal.
  if (!memberToken || loadedGeneration !== sessionGeneration) {
    return <ResearchMemberShell title="Checkout">
      <ResearchRouteBoundary state={memberToken ? "loading" : "unauthorized"}>{null}</ResearchRouteBoundary>
    </ResearchMemberShell>;
  }

  if (phase.kind === "paid") {
    return (
      <ResearchMemberShell title="Checkout" lead="Your payment is confirmed and your order is recorded.">
        <section role="status" className="card" data-testid="checkout-paid">
          <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
            <p className="mono-label text-ink-mute">Order placed</p>
            <ResearchStatusBadge label="Payment received" tone="success" />
          </div>
          <p className="body-m font-700 mt-2">Order {phase.orderId} is recorded.</p>
          <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
            The payment was verified with the payment provider before this page said so. Payment received is not shipment:
            every order is personally reviewed before it ships, and you can follow it from your orders.
          </p>
          <div className="mt-4 flex gap-3" style={{ flexWrap: "wrap" }}>
            <Link href={MEMBER_ROUTES.order.replace(":id", encodeURIComponent(phase.orderId))} className="btn btn-primary" data-testid="checkout-paid-order">
              View this order
            </Link>
            <Link href={MEMBER_ROUTES.orders} className="btn btn-ghost">
              View your orders
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                clearCheckoutResume(cartScope);
                setIdempotencyKey(newIdempotencyKey());
                setDurable({ kind: "idle" });
                setPhase({ kind: "form" });
              }}
              data-testid="checkout-paid-new-order"
            >
              Start another order
            </button>
          </div>
        </section>
      </ResearchMemberShell>
    );
  }

  if (phase.kind === "order_exists") {
    return (
      <ResearchMemberShell title="Checkout" lead="This order already exists.">
        <section role="status" className="card" data-testid="checkout-order-exists">
          <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
            <p className="mono-label text-ink-mute">Order on file</p>
            <ResearchStatusBadge label="Already submitted" tone="info" />
          </div>
          <p className="body-m font-700 mt-2">Order {phase.orderId} is on your account.</p>
          <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
            This request was already turned into an order, so nothing was submitted again. Open the order to see its
            current payment and review state.
          </p>
          <div className="mt-4 flex gap-3" style={{ flexWrap: "wrap" }}>
            <Link href={MEMBER_ROUTES.order.replace(":id", encodeURIComponent(phase.orderId))} className="btn btn-primary" data-testid="checkout-order-exists-link">
              View this order
            </Link>
            <Link href={MEMBER_ROUTES.orders} className="btn btn-ghost">
              View your orders
            </Link>
          </div>
        </section>
      </ResearchMemberShell>
    );
  }

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

  // A durable checkout in progress: the continuation step owns the screen
  // until the server reports a settled state. No form, no second submit.
  if (durable.kind === "execution" && memberToken) {
    const execution = durable;
    return (
      <ResearchMemberShell title="Checkout" lead="Finishing your payment.">
        <section className="card" data-testid="checkout-execution" data-state={execution.state}>
          {execution.note && (
            <p className="body-s text-ink-2 mb-3" data-testid="checkout-execution-note">
              {execution.note}
            </p>
          )}
          {execution.orderId && (
            <p className="body-s text-ink-mute mb-3">
              Order reference <span className="tabular">{execution.orderId}</span>
            </p>
          )}
          <PaymentAuthenticationStep
            memberToken={memberToken}
            requestKey={execution.requestKey}
            authenticate={authenticate}
            onView={(view: CheckoutContinuationView) => {
              if (!stillCurrent(memberToken)) return;
              if (NOT_SETTLED.includes(view.state)) {
                if (cartScope) writeCheckoutResume({ scope: cartScope, requestKey: view.requestKey, orderId: view.orderId, startedAt: new Date().toISOString() });
                setDurable((current) =>
                  current.kind === "execution" && (current.orderId !== view.orderId || current.state !== view.state)
                    ? { ...current, orderId: view.orderId, state: view.state }
                    : current,
                );
              }
            }}
            onCompleted={(orderId) => {
              if (!stillCurrent(memberToken)) return;
              applyOutcome({ requestKey: execution.requestKey, orderId, state: "completed", idempotent: true });
            }}
            onCancelled={(orderId, reason) => {
              if (!stillCurrent(memberToken)) return;
              applyOutcome({ requestKey: execution.requestKey, orderId, state: "cancelled", idempotent: true, cancellation: { reason } });
            }}
            onMissing={() => {
              if (!stillCurrent(memberToken)) return;
              // An order id is EVIDENCE that an order exists, whether it came
              // from the durable door's answer or from a pointer the server
              // itself filled in. Only a reference with no order at all is
              // genuinely unresolved.
              if (execution.orderId) {
                // The durable door named this order but no execution owns it: an
                // order placed through the ordering door under this key. It
                // EXISTS, so this page must not offer to pay for it again.
                clearCheckoutResume(cartScope);
                setPhase({ kind: "order_exists", orderId: execution.orderId });
                setDurable({ kind: "idle" });
                return;
              }
              // The server knows no execution for this reference. That is not
              // proof that nothing was created, so the key is kept and the
              // buyer is told the truth instead of being handed a fresh one.
              setDurable({ kind: "unresolved", requestKey: execution.requestKey });
            }}
          />
          <ResearchSecureNotice>
            Payment results come from the payment provider, verified by the server. If this page is closed, the same
            checkout is picked up again when you return; it is never submitted twice.
          </ResearchSecureNotice>
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
          // While product_commerce is not enabled the member cannot add an
          // item, so "add a product first" would instruct an impossible
          // action. The capability boundary renders the honest not-open state
          // instead; when commerce is enabled the designed empty state returns.
          <ResearchCapabilityBoundary status={commerceStatus}>
            <ResearchEmptyState
              title="There is nothing to check out."
              body="Your cart is empty. Add a product first, then come back here."
              action={
                <Link href={MEMBER_ROUTES.products} className="btn btn-primary">
                  Browse products
                </Link>
              }
            />
          </ResearchCapabilityBoundary>
        ) : commerceStatus.state !== "enabled" || !cart.checkoutReady ? (
          // A populated cart used to be handed straight to the transactional
          // form: product_commerce and checkoutReady gated only the empty
          // branch and the server, so a direct visit to /member/checkout
          // showed quote and place-order controls for a cart the server would
          // refuse. The server stays fail-closed either way; this branch makes
          // the page tell the truth. While held, the ENTIRE form is withheld
          // (no quote control, no submit control, no request leaves the page),
          // the server's own blocking reasons render in the designed denial
          // copy, and the one action offered is the way back to the cart.
          // When commerce itself is off, the capability boundary renders the
          // canonical not-open state instead.
          <ResearchCapabilityBoundary status={commerceStatus}>
            <section className="grid gap-6" data-testid="co-held" aria-label="Checkout held">
              <ResearchPendingPanel
                kind="not_configured"
                title="Checkout is not open for this cart."
                body="Nothing was lost and your cart is kept exactly as it is. The reasons below come from the order system itself; this page opens the moment every line clears."
              />
              {cart.blockingReasons.length > 0 && (
                <div className="grid gap-3" data-testid="co-held-reasons">
                  {cart.blockingReasons.map((code) => (
                    <ResearchDenialNotice key={code} code={code} />
                  ))}
                </div>
              )}
              <div>
                <Link href={MEMBER_ROUTES.cart} className="btn btn-primary" data-testid="co-held-back-to-cart">
                  Back to your cart
                </Link>
              </div>
            </section>
          </ResearchCapabilityBoundary>
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
              <p role="alert" className="body-s text-ink-2" data-testid="co-submit-error">
                {submitError}
              </p>
            )}
            {durable.kind === "unresolved" && (
              <section role="status" className="card" data-testid="checkout-unresolved">
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
                  <p className="mono-label text-ink-mute">We could not confirm this attempt</p>
                  <ResearchStatusBadge label="Unconfirmed" tone="warning" />
                </div>
                <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
                  We have no payment in progress for your last attempt. That does not prove an order was not created, so
                  please do not pay again yet. Check your orders first; if nothing is there, you can start a new request.
                </p>
                <div className="mt-3 flex gap-3" style={{ flexWrap: "wrap" }}>
                  <Link href={MEMBER_ROUTES.orders} className="btn btn-primary" data-testid="co-unresolved-orders">
                    Check your orders
                  </Link>
                  <button type="button" className="btn btn-secondary" onClick={() => void resolveCurrentKey()} disabled={submitBusy} data-testid="co-unresolved-recheck">
                    {submitBusy ? "Checking..." : "Check again"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={startNewRequest} disabled={submitBusy} data-testid="co-new-request">
                    Start a new order request
                  </button>
                </div>
              </section>
            )}
            {durable.kind === "cancelled" && (
              <section role="status" className="card" data-testid="checkout-cancelled" data-reason={durable.reason}>
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
                  <p className="mono-label text-ink-mute">{durable.reason === "declined" ? "Card declined" : "Payment cancelled"}</p>
                  <ResearchStatusBadge label="Nothing charged" tone="neutral" />
                </div>
                <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                  {durable.reason === "declined"
                    ? "Your card was declined and nothing was charged. Your cart and details are kept; start a new order request to try another card."
                    : "That checkout was cancelled and nothing was charged. Your cart and details are kept; start a new order request when you are ready."}
                </p>
                <div className="mt-3">
                  <button type="button" className="btn btn-secondary" onClick={startNewRequest} data-testid="co-new-request">
                    Start a new order request
                  </button>
                </div>
              </section>
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
                    disabled={frozen}
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
                    disabled={frozen}
                    data-testid="co-line2"
                  />
                </Field>
                <div
                  className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]"
                  data-testid="co-locality-grid"
                >
                  <Field id="co-city" label="City">
                    <input
                      id="co-city"
                      className="input-field"
                      autoComplete="address-level2"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={frozen}
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
                      disabled={frozen}
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
                      disabled={frozen}
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
                    disabled={frozen}
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
                    disabled={quoteBusy || !addressComplete || frozen}
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
                {quoteCartMismatch && (
                  <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={submitBusy || frozen} data-testid="co-refresh-cart">
                    Refresh cart
                  </button>
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
{/* No amount is asked for here. Both checkout doors apply the available
                    credit to the order themselves and charge from THAT figure, so an
                    input would be a choice the server does not honour, and the page
                    would print an "applying" amount that is never applied. */}
                {spendableCents > 0 ? (
                  <p className="body-s text-ink-2 mt-2" data-testid="co-credit-applied">
                    {cardDoor && !consent ? "Get a current quote to see the credit applied to this order." : <>Applied to this order: <span className="tabular">{money(creditCents)}</span>.</>} Your available credit is
                    used automatically; credit still pending review cannot be spent yet.
                  </p>
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
                      disabled={frozen}
                      data-testid={`co-agree-${key}`}
                    />
                    <span>I accept the {agreementLabel(key)} agreement.</span>
                  </label>
                ))}
                <label className="flex items-start gap-3 body-s text-ink-2">
                  <input
                    type="checkbox"
                    checked={attestation}
                    onChange={(e) => setAttestation(e.target.checked)}
                    disabled={frozen}
                    data-testid="co-attest"
                  />
                  <span>I confirm these materials are for research purposes.</span>
                </label>
              </div>
            </section>

            {/* Payment: provider-hosted card collection when the card door is open. */}
            {activeConfig && cardDoor && durable.kind !== "frozen" && (
              <section className="card" aria-label="Payment" data-testid="co-payment">
                <p className="mono-label text-ink-mute">Payment</p>
                <div className="mt-3">
                  <PaymentMethodCollector
                    config={activeConfig}
                    client={paymentMethodClient}
                    disabled={submitBusy}
                    onCollector={(collect) => {
                      collectRef.current = collect;
                      setCardComplete(collect !== null);
                    }}
                  />
                </div>
              </section>
            )}
            {durable.kind === "frozen" && (
              <section className="card" aria-label="Payment" data-testid="co-payment-frozen">
                <p className="mono-label text-ink-mute">Payment</p>
                <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
                  Your card details were handed to the payment provider for this request, and we do not yet know how it
                  ended. Retrying repeats the exact same request, so it cannot charge you twice. Until we know, the
                  details below are locked: an order may already exist for this attempt.
                </p>
                <div className="mt-3 flex gap-3" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => void resolveCurrentKey()} disabled={submitBusy} data-testid="co-check-request">
                    {submitBusy ? "Checking..." : "Check what happened"}
                  </button>
                  <Link href={MEMBER_ROUTES.orders} className="btn btn-ghost" data-testid="co-frozen-orders">
                    Check your orders
                  </Link>
                </div>
              </section>
            )}

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
                  <dd className="body-s tabular">{cardDoor ? (quote ? money(quote.amountCents) : PRICE_PENDING_COPY) : money(cart.shippingCents)}</dd>
                </div>
                {creditCents > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="body-s text-ink-2">Store credit applied</dt>
                    <dd className="body-s tabular">{cardDoor && !consent ? PRICE_PENDING_COPY : `-${money(creditCents)}`}</dd>
                  </div>
                )}
                {/* On the card door the figure below is the amount the card is
                    charged, computed from the same inputs the request carries.
                    Anything else would take consent for one number and charge
                    another. */}
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-m font-700">{frozen ? "Amount already submitted" : cardDoor ? "Charged to your card" : "Estimated total"}</dt>
                  <dd className="body-m font-700 tabular" data-testid="co-total">
                    {frozen
                      ? consent ? money(consent.totalCents) : "Awaiting the result"
                      : cardDoor
                        ? quote
                          ? money(estimatedChargeCents)
                          : PRICE_PENDING_COPY
                        : money(cart.estimatedTotalCents)}
                  </dd>
                </div>
              </dl>
              {consent && (
                <p className="body-s text-ink-2 mt-3" data-testid="co-consent-summary">
                  {frozen ? "Submitted intent" : "By paying, you approve"}: {money(consent.totalCents)} to your card and {money(consent.appliedCents)} in store credit.
                  {" "}Policy: {consent.policyVersion}. Credit applies to items, not shipping.
                </p>
              )}
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
                disabled={submitBusy || (cardDoor && !frozen && (!cardComplete || quoteRequired))}
                onClick={() => void submit()}
                data-testid="co-submit"
              >
                {submitBusy
                  ? cardDoor
                    ? "Paying..."
                    : "Placing order..."
                  : frozen
                    ? "Retry the same request"
                    : cardDoor
                      ? quote
                        ? `Pay ${money(estimatedChargeCents)} and place order`
                        : "Pay and place order"
                      : "Place order"}
              </button>
              {quoteRequired && !frozen && (
                <p className="body-s text-ink-mute mt-2" data-testid="co-quote-required">
                  Get a shipping quote for the service you chose so you can see the exact amount before paying.
                </p>
              )}
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
