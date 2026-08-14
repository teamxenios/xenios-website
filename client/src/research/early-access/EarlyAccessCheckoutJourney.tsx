import { useEffect, useMemo, useRef, useState } from "react";

import type { EarlyAccessCatalogSelection } from "./EarlyAccessCatalogSection";
import {
  loadEarlyAccessInvoice,
  loadEarlyAccessOrderStatus,
  placeEarlyAccessOrder,
  submitEarlyAccessPaymentProof,
  type EarlyAccessContact,
  type EarlyAccessInvoiceView,
  type EarlyAccessOrderStatusView,
  type EarlyAccessOrderView,
  type EarlyAccessShipTo,
} from "../adapters/earlyAccessCheckout";
import { EarlyAccessProofUpload } from "./EarlyAccessProofUpload";
import {
  clearPendingAttempt,
  intentFingerprint,
  newIdempotencyKey,
  readPendingAttempt,
  rememberLastOrderNumber,
  rememberPendingAttempt,
  type OrderIntent,
} from "./pendingOrderStore";
import { EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  earlyAccessPaymentOptionLabel,
  isEarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";

/**
 * The one-product checkout for the supervised Early Access pilot.
 *
 * SHAPE OF THE JOURNEY. Details (contact + shipping) → a TRUE review step →
 * explicit confirmation → server placement → payment instructions → status.
 * No durable order write happens before the confirm button on the review
 * step: the details form only moves the customer forward locally.
 *
 * MONEY. This component computes none. It shows the server-supplied unit
 * price before placement, and after placement it shows only the subtotal,
 * discount and payable total the SERVER wrote into the order and invoice.
 * The quantity-three Research Bundle stays a server decision.
 *
 * IDEMPOTENCY. One attempt carries one cryptographically random key, minted
 * before the first submission and remembered (with the attempt's product,
 * variant and quantity only) in sessionStorage, so a refresh mid-attempt can
 * retry with the SAME key instead of minting a duplicate order. An uncertain
 * outcome (connection lost, unreadable answer) retries the same key. The key
 * is cleared on success, on a definitive server refusal, and on deliberate
 * abandonment. See pendingOrderStore.ts for the exact storage contract.
 */

type Phase = "details" | "review" | "submitting" | "payment" | "status";

export interface EarlyAccessCheckoutJourneyProps {
  selection: EarlyAccessCatalogSelection;
  onBack(): void;
  /**
   * The server said the price is no longer the one the customer confirmed.
   * The route returns to a FRESHLY LOADED catalogue and requires a new
   * confirmation; nothing was ordered.
   */
  onPriceChanged(): void;
  onPhaseChange?(phase: Phase): void;
  testId?: string;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

function instructionLines(value: unknown): readonly string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(instructionLines);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => {
      if (typeof item === "string" && item.trim()) return [`${key}: ${item.trim()}`];
      return instructionLines(item);
    });
  }
  return [];
}

/**
 * Light client-side validation. The server re-validates everything; this only
 * catches what would certainly be refused, before the customer leaves the form.
 */
export function contactProblems(contact: EarlyAccessContact): string[] {
  const problems: string[] = [];
  const email = contact.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    problems.push("Enter a valid email address for order updates.");
  }
  const digits = contact.phone.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) {
    problems.push("Enter a valid phone number, 7 to 15 digits.");
  }
  return problems;
}

export function shippingProblems(shipTo: EarlyAccessShipTo): string[] {
  const problems: string[] = [];
  if (shipTo.recipientName.trim().length < 2) problems.push("Enter the recipient's name.");
  if (shipTo.line1.trim().length < 3) problems.push("Enter the street address.");
  if (shipTo.city.trim().length < 2) problems.push("Enter the city.");
  if (shipTo.region.trim().length < 2) problems.push("Enter the state or region.");
  if (shipTo.postalCode.trim().length < 3) problems.push("Enter the postal code.");
  if (!/^[A-Z]{2}$/.test(shipTo.country)) problems.push("Country must be a two-letter code.");
  return problems;
}

/**
 * Every refusal the order door can answer with, said in the customer's terms.
 * Codes the server refuses with but this table does not name fall through to
 * the generic line; nothing is ever presented as more certain than it is.
 */
const REFUSAL_COPY: Record<string, string> = {
  SESSION_REQUIRED:
    "Your private session has ended. Unlock Early Access again, then return to the catalogue. Nothing was ordered or charged.",
  IDENTITY_REQUIRED:
    "Your access session could not be prepared. Sign out, unlock again, and retry. Nothing was ordered or charged.",
  AGREEMENT_REQUIRED:
    "Accept the Research Use Policy above before placing the order. Nothing was ordered or charged.",
  PRODUCT_HELD: "This product is currently held and cannot be ordered.",
  RELEASE_REQUIRED: "This product is not released for ordering.",
  RELEASE_STALE:
    "The product release changed while you were reviewing. Return to the catalogue and start from the current listing.",
  RELEASE_REVOKED:
    "This product's release was withdrawn before your order was created. Nothing was ordered or charged.",
  QUANTITY_EXCEEDED:
    `That quantity is not available. Choose a permitted quantity from 1 to ${EARLY_ACCESS_MAX_QUANTITY}; this product may have a lower Product Control limit.`,
  SUPPLIER_UNAVAILABLE:
    "The supplier route is temporarily unavailable. Nothing was ordered or charged. Please try again later.",
  SHIPPING_UNAVAILABLE:
    "We cannot ship to this destination yet. Review the address or contact Xenios support. Nothing was ordered or charged.",
  PAYABLE_TOTAL_INVALID:
    "The server refused to write an order whose money did not reconcile. Nothing was ordered or charged. Please contact Xenios support.",
  IDEMPOTENCY_CONFLICT:
    "An earlier attempt from this session already created an order with different details. Nothing new was created. Check your order status below or contact Xenios support with your order number.",
  CONNECTION_FAILED:
    "The connection failed before the server's answer arrived, so the order may or may not have been created. Retry below: the retry reuses the SAME order attempt and cannot create a duplicate.",
  UNAVAILABLE:
    "The server's answer could not be read, so the order may or may not have been created. Retry below: the retry reuses the SAME order attempt and cannot create a duplicate.",
};

/** Refusals that end the attempt: the server answered definitively, no order exists. */
const DEFINITIVE_REFUSALS = new Set([
  "SESSION_REQUIRED",
  "IDENTITY_REQUIRED",
  "AGREEMENT_REQUIRED",
  "PRODUCT_HELD",
  "RELEASE_REQUIRED",
  "RELEASE_STALE",
  "RELEASE_REVOKED",
  "QUANTITY_EXCEEDED",
  "SUPPLIER_UNAVAILABLE",
  "SHIPPING_UNAVAILABLE",
  "PAYABLE_TOTAL_INVALID",
  "REQUEST_INVALID",
]);

export function EarlyAccessCheckoutJourney({
  selection,
  onBack,
  onPriceChanged,
  onPhaseChange = () => {},
  testId = "early-access-checkout",
}: EarlyAccessCheckoutJourneyProps) {
  const [phase, setPhaseState] = useState<Phase>("details");
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [replayed, setReplayed] = useState(false);
  const [order, setOrder] = useState<EarlyAccessOrderView | null>(null);
  const [invoice, setInvoice] = useState<EarlyAccessInvoiceView | null>(null);
  const [status, setStatus] = useState<EarlyAccessOrderStatusView | null>(null);
  const [copied, setCopied] = useState(false);
  const [proofMethod, setProofMethod] = useState<EarlyAccessPaymentOptionCode | "">("");
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofMessage, setProofMessage] = useState<string | null>(null);
  const [contact, setContact] = useState<EarlyAccessContact>({ email: "", phone: "" });
  const [shipTo, setShipTo] = useState<EarlyAccessShipTo>({
    recipientName: "",
    line1: "",
    line2: null,
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  });
  const [problems, setProblems] = useState<readonly string[]>([]);
  // A pending attempt from before a refresh that belongs to a DIFFERENT
  // product/quantity. Confirming a new order while it exists is blocked until
  // the customer resumes it (by re-selecting that product) or discards it.
  const [strandedAttempt, setStrandedAttempt] = useState(() => {
    const pending = readPendingAttempt();
    if (pending === null) return null;
    const matches =
      pending.productId === selection.product.productId &&
      pending.variantId === selection.product.variantId &&
      pending.quantity === selection.quantity;
    return matches ? null : pending;
  });
  // The attempt key lives in a ref so a re-render can never re-mint it
  // mid-flight. It is created lazily at the first confirmation.
  const attemptKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // The contact and address of the FIRST submission, kept only in memory, so
  // an interrupted attempt whose details were since edited can be restored
  // exactly rather than silently resubmitted with different words under the
  // same key.
  const originalIntentRef = useRef<Readonly<{
    contact: EarlyAccessContact;
    shipTo: EarlyAccessShipTo;
  }> | null>(null);
  // Set when the customer's current details no longer match the unfinished
  // attempt's fingerprint. Confirming is blocked until they choose: restore
  // the original details, or discard the old attempt and place the edited
  // order under a fresh key.
  const [intentChanged, setIntentChanged] = useState<"restorable" | "unrestorable" | null>(null);

  const product = selection.product;
  const instructions = useMemo(() => instructionLines(invoice?.instructions), [invoice]);
  const setPhase = (next: Phase) => {
    setPhaseState(next);
    onPhaseChange(next);
  };
  useEffect(() => {
    onPhaseChange("details");
    // The journey announces its opening phase once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = (name: keyof EarlyAccessShipTo, value: string) =>
    setShipTo((current) => ({
      ...current,
      [name]: name === "country" ? value.toUpperCase() : value || (name === "line2" ? null : ""),
    }));

  const toReview = () => {
    const found = [...contactProblems(contact), ...shippingProblems(shipTo)];
    setProblems(found);
    if (found.length > 0) return;
    setError(null);
    setPhase("review");
  };

  const intentNow = (): OrderIntent => ({
    productId: product.productId,
    variantId: product.variantId,
    quantity: selection.quantity,
    email: contact.email,
    phone: contact.phone,
    recipientName: shipTo.recipientName,
    line1: shipTo.line1,
    line2: shipTo.line2,
    city: shipTo.city,
    region: shipTo.region,
    postalCode: shipTo.postalCode,
    country: shipTo.country,
  });

  const confirm = async () => {
    if (inFlightRef.current) return;
    if (product.unitPriceCents === null) {
      setError("This product has no orderable price.");
      return;
    }
    if (strandedAttempt !== null) return;

    const fingerprint = intentFingerprint(intentNow());
    const pending = readPendingAttempt();
    const pendingMatchesUnit =
      pending !== null &&
      pending.productId === product.productId &&
      pending.variantId === product.variantId &&
      pending.quantity === selection.quantity;

    // An unfinished attempt exists for THIS unit but the details have been
    // edited since. Submitting now would either silently replay the old
    // order (the parcel-to-the-old-address failure) or conflict server-side;
    // both are worse than asking. The customer chooses: restore the original
    // details, or discard the old attempt and place the edited order fresh.
    if (pendingMatchesUnit && pending.fingerprint !== fingerprint) {
      setIntentChanged(originalIntentRef.current === null ? "unrestorable" : "restorable");
      return;
    }

    // Reuse the key of the matching pending attempt (a refresh mid-attempt),
    // else mint one cryptographically. Never Math.random, never per-click.
    if (attemptKeyRef.current === null) {
      attemptKeyRef.current =
        pendingMatchesUnit && pending.fingerprint === fingerprint
          ? pending.idempotencyKey
          : newIdempotencyKey();
    }
    const idempotencyKey = attemptKeyRef.current;

    inFlightRef.current = true;
    setError(null);
    setRetryable(false);
    setIntentChanged(null);
    setPhase("submitting");
    if (originalIntentRef.current === null) {
      originalIntentRef.current = Object.freeze({
        contact: { ...contact },
        shipTo: { ...shipTo },
      });
    }
    // Remembered BEFORE the request leaves, so an interrupted attempt is
    // never forgotten while its outcome is unknown. The fingerprint is a
    // digest only: no contact or address text enters browser storage.
    rememberPendingAttempt({
      idempotencyKey,
      productId: product.productId,
      variantId: product.variantId,
      quantity: selection.quantity,
      fingerprint,
    });

    const placed = await placeEarlyAccessOrder({
      idempotencyKey,
      productId: product.productId,
      variantId: product.variantId,
      quantity: selection.quantity,
      expectedUnitPriceCents: product.unitPriceCents,
      expectedCurrency: product.currency,
      contact,
      shipTo,
    });
    inFlightRef.current = false;

    if (!placed.ok) {
      if (placed.code === "PRICE_CHANGED") {
        // The confirmed price is gone. The attempt ends, and the route
        // returns the customer to a freshly loaded catalogue for a new
        // confirmation against the current server price.
        clearPendingAttempt();
        attemptKeyRef.current = null;
        onPriceChanged();
        return;
      }
      const copy = REFUSAL_COPY[placed.code] ?? null;
      if (DEFINITIVE_REFUSALS.has(placed.code)) {
        // The server answered: no order exists. The attempt is over.
        clearPendingAttempt();
        attemptKeyRef.current = null;
        setError(copy ?? "The order could not be created. Nothing was charged. Please try again or contact Xenios support.");
        setRetryable(false);
        setPhase(placed.code === "SHIPPING_UNAVAILABLE" || placed.code === "QUANTITY_EXCEEDED" ? "details" : "review");
        return;
      }
      if (placed.code === "IDEMPOTENCY_CONFLICT") {
        // An order from this key exists with a different body. Retrying
        // cannot succeed and a new key could duplicate a real order, so the
        // attempt is surrendered to support.
        clearPendingAttempt();
        attemptKeyRef.current = null;
        setError(REFUSAL_COPY.IDEMPOTENCY_CONFLICT);
        setRetryable(false);
        setPhase("review");
        return;
      }
      // Uncertain: connection failed or the answer was unreadable. The key
      // and the pending record stay exactly as they are, and the one offered
      // action is a retry under the SAME key.
      setError(copy ?? REFUSAL_COPY.CONNECTION_FAILED);
      setRetryable(true);
      setPhase("review");
      return;
    }

    // Success. The pending attempt is finished; the order number is the only
    // thing this browser remembers, for same-session recovery.
    clearPendingAttempt();
    attemptKeyRef.current = null;
    setReplayed(placed.replayed === true);
    setOrder(placed.value);
    rememberLastOrderNumber(placed.value.orderNumber);
    const loadedInvoice = await loadEarlyAccessInvoice(placed.value.orderNumber);
    if (loadedInvoice.ok) setInvoice(loadedInvoice.value);
    const loadedStatus = await loadEarlyAccessOrderStatus(placed.value.orderNumber);
    if (loadedStatus.ok) setStatus(loadedStatus.value);
    setPhase("payment");
  };

  const restoreOriginal = () => {
    const original = originalIntentRef.current;
    if (original === null) return;
    setContact({ ...original.contact });
    setShipTo({ ...original.shipTo });
    setIntentChanged(null);
    setError(null);
  };

  const discardOriginal = () => {
    clearPendingAttempt();
    attemptKeyRef.current = null;
    originalIntentRef.current = null;
    setIntentChanged(null);
    setError(null);
    // A discarded attempt is over; what follows is a NEW order, confirmed
    // fresh, never presented as a retry of something else.
    setRetryable(false);
  };

  const refresh = async () => {
    if (order === null) return;
    const loaded = await loadEarlyAccessOrderStatus(order.orderNumber);
    if (loaded.ok) {
      setStatus(loaded.value);
      setError(null);
      setPhase("status");
    } else {
      setError("We could not refresh this order just now. Your order number remains valid.");
    }
  };

  const copyOrderNumber = async () => {
    if (order === null) return;
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the number stays selectable text.
      setCopied(false);
    }
  };

  const submitProof = async (file: File) => {
    if (order === null || proofSubmitting) return;
    if (!isEarlyAccessPaymentOptionCode(proofMethod)) {
      setError("Choose the manual payment method you used before recording proof details.");
      return;
    }
    setProofSubmitting(true);
    setProofMessage(null);
    setError(null);
    const submitted = await submitEarlyAccessPaymentProof({
      orderNumber: order.orderNumber,
      file,
      method: proofMethod,
    });
    setProofSubmitting(false);
    if (!submitted.ok) {
      setError(
        submitted.code === "CONNECTION_FAILED"
          ? "We could not reach the proof service. Nothing was marked paid; keep the file and try again."
          : "The proof details were not accepted. Check the file and payment method, then try again.",
      );
      return;
    }
    setProofMessage(submitted.value.message);
    const loaded = await loadEarlyAccessOrderStatus(order.orderNumber);
    if (loaded.ok) setStatus(loaded.value);
    setPhase("status");
  };

  /* ---------------------------------------------------------------- payment */

  if (order !== null) {
    const payable = invoice?.payableTotalCents ?? order.money.payableTotalCents;
    const currency = invoice?.currency ?? order.money.currency;
    const reference = invoice?.paymentReference ?? order.invoice.paymentReference;
    const proofUnderReview = proofMessage !== null || status?.payment.state === "under_review";
    const paymentConfirmed = status?.payment.paid === true;
    return (
      <section className="card min-w-0" data-testid={testId} data-phase={phase}>
        <p className="mono-label text-pulse">Order created</p>
        <h2 className="body-l font-700 mt-2">Payment and status</h2>
        {replayed && (
          <p className="body-s text-ink-2 mt-2" data-testid={`${testId}-replayed`} role="status">
            This is the order your earlier attempt already created. Nothing was duplicated.
          </p>
        )}
        <dl className="mt-4 grid gap-2 body-s">
          <div>
            <dt className="text-ink-mute">Order number</dt>
            <dd className="font-700 break-all">
              <span data-testid={`${testId}-order-number`}>{order.orderNumber}</span>{" "}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyOrderNumber()}
                data-testid={`${testId}-copy-order-number`}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Amount due</dt>
            <dd className="font-700 tabular" data-testid={`${testId}-payable`}>
              {money(payable, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Payment reference</dt>
            <dd className="font-700 break-all" data-testid={`${testId}-payment-reference`}>
              {reference}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Payment state</dt>
            <dd data-testid={`${testId}-payment-state`}>{status?.payment.state ?? order.paymentState}</dd>
          </div>
          <div>
            {/*
              The address THIS ORDER will actually use, read back from the
              server's own record, so a replayed attempt whose edits were
              refused can never leave the customer believing a correction
              was applied.
            */}
            <dt className="text-ink-mute">Ships to</dt>
            <dd className="break-words" data-testid={`${testId}-ships-to`}>
              {order.shipTo.recipientName}, {order.shipTo.line1}
              {order.shipTo.line2 ? `, ${order.shipTo.line2}` : ""}, {order.shipTo.city},{" "}
              {order.shipTo.region} {order.shipTo.postalCode}, {order.shipTo.country}
            </dd>
          </div>
          {order.contact ? (
            <div>
              <dt className="text-ink-mute">Order contact</dt>
              <dd className="break-words" data-testid={`${testId}-order-contact`}>
                {order.contact.email} · {order.contact.phone}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-2 body-s text-ink-mute max-w-[62ch]">
          If anything above is not what you intended, contact support with your order number
          before paying. Nothing ships until a named team member verifies payment.
        </p>
        {instructions.length > 0 ? (
          <div className="mt-4" data-testid={`${testId}-instructions`}>
            <h3 className="body-m font-700">Manual payment instructions</h3>
            <ul className="mt-2 grid gap-1 body-s">
              {instructions.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 body-s text-ink-2">
            Use the payment reference above. Xenios support will provide or confirm the available
            manual payment method for this pilot order.
          </p>
        )}
        {paymentConfirmed ? (
          <p className="mt-4 body-s text-ink-2" role="status" data-testid={`${testId}-payment-confirmed`}>
            Xenios has confirmed payment for this order.
          </p>
        ) : proofUnderReview ? (
          <p className="mt-4 body-s text-ink-2" role="status" data-testid={`${testId}-proof-under-review`}>
            {proofMessage ?? "Your payment confirmation is under review."} Your order is not paid
            until a named Xenios team member confirms the money arrived.
          </p>
        ) : (
          <div className="mt-5 grid gap-3" data-testid={`${testId}-proof-entry`}>
            <label className="grid gap-1 body-s">
              <span>Manual payment method used</span>
              <select
                className="input-field"
                value={proofMethod}
                disabled={proofSubmitting}
                onChange={(event) => {
                  const next = event.target.value;
                  setProofMethod(isEarlyAccessPaymentOptionCode(next) ? next : "");
                }}
                data-testid={`${testId}-proof-method`}
              >
                <option value="">Choose the method you used</option>
                {EARLY_ACCESS_PAYMENT_OPTION_CODES.map((code) => (
                  <option key={code} value={code}>
                    {earlyAccessPaymentOptionLabel(code)}
                  </option>
                ))}
              </select>
            </label>
            <EarlyAccessProofUpload
              orderNumber={order.orderNumber}
              submitting={proofSubmitting}
              onSubmit={submitProof}
              testId={`${testId}-proof`}
            />
          </div>
        )}
        <p className="mt-4 body-s text-ink-mute max-w-[62ch]">
          Nothing is marked paid automatically. A named Xenios team member verifies receipt before
          any supplier release, commission, shipment, or fulfillment. During this supervised pilot,
          keep using this same browser; if you lose this page, your order number above is what
          support needs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => void refresh()} data-testid={`${testId}-refresh`}>
            Refresh order status
          </button>
          <a className="btn btn-secondary" href="/support">
            Contact support
          </a>
        </div>
        {error ? (
          <p role="alert" className="mt-3 body-s text-pulse">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  /* ---------------------------------------------------------------- review */

  if (phase === "review" || phase === "submitting") {
    return (
      <section className="card min-w-0" data-testid={testId} data-phase={phase}>
        <p className="mono-label text-pulse">Review your order</p>
        <h2 className="body-l font-700 mt-2">Nothing is created until you confirm</h2>

        <dl className="mt-4 grid gap-2 body-s" data-testid={`${testId}-review-summary`}>
          <div>
            <dt className="text-ink-mute">Product</dt>
            <dd className="font-700" data-testid={`${testId}-review-product`}>
              {product.name} · {product.strength}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Quantity</dt>
            <dd data-testid={`${testId}-review-quantity`}>{selection.quantity}</dd>
          </div>
          <div>
            <dt className="text-ink-mute">Unit price (server)</dt>
            <dd className="tabular" data-testid={`${testId}-review-unit-price`}>
              {product.unitPriceCents === null
                ? "Not orderable"
                : `${money(product.unitPriceCents, product.currency)} per unit`}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Email</dt>
            <dd className="break-words" data-testid={`${testId}-review-email`}>
              {contact.email}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Phone</dt>
            <dd className="break-words" data-testid={`${testId}-review-phone`}>
              {contact.phone}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Recipient</dt>
            <dd className="break-words" data-testid={`${testId}-review-recipient`}>
              {shipTo.recipientName}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Street</dt>
            <dd className="break-words" data-testid={`${testId}-review-line1`}>
              {shipTo.line1}
            </dd>
          </div>
          {shipTo.line2 !== null && shipTo.line2 !== "" && (
            <div>
              <dt className="text-ink-mute">Line 2</dt>
              <dd className="break-words" data-testid={`${testId}-review-line2`}>
                {shipTo.line2}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-mute">City</dt>
            <dd className="break-words" data-testid={`${testId}-review-city`}>
              {shipTo.city}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">State / region</dt>
            <dd className="break-words" data-testid={`${testId}-review-region`}>
              {shipTo.region}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Postal code</dt>
            <dd className="break-words" data-testid={`${testId}-review-postal`}>
              {shipTo.postalCode}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Country</dt>
            <dd className="break-words" data-testid={`${testId}-review-country`}>
              {shipTo.country}
            </dd>
          </div>
        </dl>

        {intentChanged !== null && (
          <div className="mt-4 card min-w-0" role="alert" data-testid={`${testId}-intent-changed`}>
            <p className="body-s text-ink-2 max-w-[62ch]">
              An earlier attempt for this product did not finish, and the details you are
              confirming now are different from the ones it carried. Nothing has been submitted:
              choose whether to keep the original attempt or replace it, so an order can never
              ship with details you believe you changed.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {intentChanged === "restorable" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={restoreOriginal}
                  data-testid={`${testId}-restore-original`}
                >
                  Restore the original details
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={discardOriginal}
                data-testid={`${testId}-discard-original`}
              >
                Discard the old attempt and place this edited order
              </button>
            </div>
            {intentChanged === "unrestorable" && (
              <p className="mt-2 body-s text-ink-mute max-w-[62ch]">
                To resume the original attempt instead, re-enter exactly the details you used
                before.
              </p>
            )}
          </div>
        )}

        <p className="mt-3 body-s text-ink-mute max-w-[62ch]" data-testid={`${testId}-review-money-note`}>
          Bundle savings and the final payable amount are computed and confirmed by Xenios when the
          order is created. No figure on this page is a charge.
        </p>
        <p className="mt-1 body-s text-ink-mute max-w-[62ch]" data-testid={`${testId}-review-no-charge`}>
          Confirming creates the order and a server-confirmed invoice with manual payment
          instructions. It does not charge you.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPhase("details")}
            disabled={phase === "submitting"}
            data-testid={`${testId}-edit-details`}
          >
            Edit details
          </button>
          {retryable ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirm()}
              disabled={phase === "submitting"}
              data-testid={`${testId}-retry`}
            >
              Retry the same order attempt
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirm()}
              disabled={phase === "submitting" || strandedAttempt !== null}
              data-testid={`${testId}-confirm`}
            >
              {phase === "submitting" ? "Creating order..." : "Confirm and create order"}
            </button>
          )}
        </div>
        {error ? (
          <p role="alert" className="mt-3 body-s text-pulse" data-testid={`${testId}-error`}>
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  /* ---------------------------------------------------------------- details */

  return (
    <section className="card min-w-0" data-testid={testId} data-phase={phase}>
      <p className="mono-label text-pulse">Contact and shipping</p>
      <h2 className="body-l font-700 mt-2">One product, one order</h2>
      <div className="mt-4 body-s">
        <p className="font-700">
          {product.name} · {product.strength}
        </p>
        <p className="text-ink-2">
          Quantity {selection.quantity} ·{" "}
          {product.unitPriceCents === null
            ? "Price unavailable"
            : `${money(product.unitPriceCents, product.currency)} per unit`}
        </p>
        <p className="text-ink-mute mt-1 max-w-[62ch]">
          This pilot creates one order per product. To order a different product as well, complete
          this order first and start another.
        </p>
      </div>

      {strandedAttempt !== null && (
        <div className="mt-4 card min-w-0" role="status" data-testid={`${testId}-stranded`}>
          <p className="body-s text-ink-2 max-w-[62ch]">
            An earlier order attempt from this session did not finish, for a different product or
            quantity. To resume it safely, return to the catalogue and re-select that exact product
            and quantity. To abandon it instead, discard it here; nothing already created on the
            server is deleted by discarding.
          </p>
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                clearPendingAttempt();
                setStrandedAttempt(null);
              }}
              data-testid={`${testId}-discard-stranded`}
            >
              Discard the unfinished attempt
            </button>
          </div>
        </div>
      )}

      <form
        className="mt-5 grid gap-3 sm:grid-cols-2"
        // Our validator names every problem in one list and the server
        // re-validates everything; the browser's own bubbles would stop the
        // submit before that list could exist.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          toReview();
        }}
      >
        <fieldset className="contents" data-testid={`${testId}-contact`}>
          <legend className="sr-only">Contact</legend>
          <label className="grid gap-1">
            <span className="body-s">Email for order updates</span>
            <input
              className="input-field"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              data-testid={`${testId}-contact-email`}
            />
          </label>
          <label className="grid gap-1">
            <span className="body-s">Phone</span>
            <input
              className="input-field"
              type="tel"
              required
              maxLength={32}
              autoComplete="tel"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              data-testid={`${testId}-contact-phone`}
            />
          </label>
        </fieldset>
        <label className="grid gap-1 sm:col-span-2">
          <span className="body-s">Recipient name</span>
          <input className="input-field" required maxLength={120} autoComplete="name" value={shipTo.recipientName} onChange={(e) => field("recipientName", e.target.value)} data-testid={`${testId}-ship-recipient`} />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="body-s">Address line 1</span>
          <input className="input-field" required maxLength={120} autoComplete="address-line1" value={shipTo.line1} onChange={(e) => field("line1", e.target.value)} data-testid={`${testId}-ship-line1`} />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="body-s">Address line 2 (optional)</span>
          <input className="input-field" maxLength={120} autoComplete="address-line2" value={shipTo.line2 ?? ""} onChange={(e) => field("line2", e.target.value)} data-testid={`${testId}-ship-line2`} />
        </label>
        <label className="grid gap-1">
          <span className="body-s">City</span>
          <input className="input-field" required maxLength={64} autoComplete="address-level2" value={shipTo.city} onChange={(e) => field("city", e.target.value)} data-testid={`${testId}-ship-city`} />
        </label>
        <label className="grid gap-1">
          <span className="body-s">State / region</span>
          <input className="input-field" required maxLength={64} autoComplete="address-level1" value={shipTo.region} onChange={(e) => field("region", e.target.value)} data-testid={`${testId}-ship-region`} />
        </label>
        <label className="grid gap-1">
          <span className="body-s">Postal code</span>
          <input className="input-field" required maxLength={16} autoComplete="postal-code" value={shipTo.postalCode} onChange={(e) => field("postalCode", e.target.value)} data-testid={`${testId}-ship-postal`} />
        </label>
        <label className="grid gap-1">
          <span className="body-s">Country (2-letter)</span>
          <input className="input-field" required minLength={2} maxLength={2} autoComplete="country" value={shipTo.country} onChange={(e) => field("country", e.target.value)} data-testid={`${testId}-ship-country`} />
        </label>
        {problems.length > 0 && (
          <ul className="sm:col-span-2 grid gap-1" role="alert" data-testid={`${testId}-problems`}>
            {problems.map((problem) => (
              <li key={problem} className="body-s text-pulse">
                {problem}
              </li>
            ))}
          </ul>
        )}
        <div className="sm:col-span-2 mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={onBack} data-testid={`${testId}-back`}>
            Back to catalogue
          </button>
          <button type="submit" className="btn btn-primary" data-testid={`${testId}-to-review`}>
            Continue to review
          </button>
        </div>
      </form>
      <p className="body-s text-ink-mute mt-3 max-w-[62ch]">
        Nothing is created or charged on this step. You will review everything before the order is
        created.
      </p>
      {error ? (
        <p role="alert" className="mt-3 body-s text-pulse">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The same-session order recovery card. Rendered by the route when this
 * browser session remembers an order number and no checkout is in progress,
 * so a render failure or refresh does not strand the customer. The order
 * number alone grants nothing: the status read is re-authorized server-side
 * against this session's derived identity.
 */
export function EarlyAccessOrderRecoveryCard({
  orderNumber,
  testId = "early-access-order-recovery",
}: Readonly<{ orderNumber: string; testId?: string }>) {
  const [status, setStatus] = useState<EarlyAccessOrderStatusView | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const loaded = await loadEarlyAccessOrderStatus(orderNumber);
    if (loaded.ok) {
      setStatus(loaded.value);
      setFailed(false);
    } else {
      setFailed(true);
    }
  };

  return (
    <aside className="card min-w-0" data-testid={testId}>
      <p className="mono-label text-ink-mute">Your order from this session</p>
      <p className="body-s mt-2">
        <span className="font-700 break-all" data-testid={`${testId}-order-number`}>
          {orderNumber}
        </span>{" "}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(orderNumber)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          data-testid={`${testId}-copy`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </p>
      {status !== null && (
        <dl className="mt-3 grid gap-1 body-s" data-testid={`${testId}-status`}>
          <div>
            <dt className="text-ink-mute">Payment state</dt>
            <dd>{status.payment.state}</dd>
          </div>
          <div>
            <dt className="text-ink-mute">Amount due</dt>
            <dd className="tabular">{money(status.order.money.payableTotalCents, status.order.money.currency)}</dd>
          </div>
        </dl>
      )}
      {failed && (
        <p className="body-s text-ink-2 mt-2" role="alert">
          We could not load this order just now. The order number remains valid; contact support
          with it if this persists.
        </p>
      )}
      <div className="mt-3">
        <button type="button" className="btn btn-secondary" onClick={() => void load()} data-testid={`${testId}-load`}>
          {status === null ? "View order status" : "Refresh order status"}
        </button>
      </div>
    </aside>
  );
}
