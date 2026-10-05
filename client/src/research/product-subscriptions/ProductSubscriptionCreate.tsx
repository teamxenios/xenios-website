import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { SUBSCRIPTION_FREQUENCIES, type SubscriptionFrequencyDays } from "@shared/research/commerce";
import { PERSISTENT_CART_QUANTITY_MAX } from "@shared/research/persistent-cart";
import { createSubscription, type MemberToken } from "../adapters/commerce";
import { MEMBER_ROUTES } from "../lib/routes";

/**
 * Presentation input for the canonical create contract, never offer authority.
 * The page owner must supply one exact server-resolved eligible variant and its
 * presented price version. The current member catalog lacks that subscription
 * projection; pass null until it exists. Never derive eligibility from a price,
 * cart selection, account membership, or a client-configured SKU.
 */
export interface SubscriptionProductForReview {
  sku: string;
  displayName: string;
  variantLabel: string;
  subscriptionEligible: boolean;
  purchasable: boolean;
  priceCents: number | null;
  currency: string;
  priceVersion: string | null;
}

export interface ProductSubscriptionCreateProps {
  memberToken: MemberToken;
  /** Current canonical product_commerce capability for this member. */
  commerceEnabled: boolean;
  product: SubscriptionProductForReview | null;
}

type Outcome =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "denied"; message: string }
  | { phase: "uncertain" }
  | { phase: "saved"; subscriptionId: string };

function denialMessage(code: string): string {
  switch (code) {
    case "commerce_disabled":
    case "capability_disabled":
      return "Product subscription requests are not available yet. Your selections remain here; no subscription was created by this attempt.";
    case "payment_disabled":
    case "payment_method_required":
      return "Payment setup is unavailable. Your selections remain here; this attempt did not complete a purchase.";
    case "agreement_required":
      return "Required agreements must be completed before this request can proceed. Your selections remain here.";
    case "quantity_invalid":
      return `Choose a whole-number quantity from 1 to ${PERSISTENT_CART_QUANTITY_MAX}.`;
    case "activation_required":
    case "membership_inactive":
    case "recovery_session":
    case "forbidden":
      return "Your account cannot submit this request. Sign in with an approved customer account.";
    default:
      return "This subscription request was declined. Refresh the product details before trying again. Your selections remain here.";
  }
}

function canReview(product: SubscriptionProductForReview | null): product is SubscriptionProductForReview & { priceCents: number; priceVersion: string } {
  return product !== null && product.subscriptionEligible === true && product.purchasable === true
    && typeof product.sku === "string" && product.sku.trim().length > 0
    && typeof product.displayName === "string" && product.displayName.trim().length > 0
    && typeof product.variantLabel === "string" && product.variantLabel.trim().length > 0
    && typeof product.priceVersion === "string" && product.priceVersion.trim().length > 0
    && typeof product.priceCents === "number" && Number.isSafeInteger(product.priceCents) && product.priceCents > 0
    && /^[A-Z]{3}$/.test(product.currency);
}

export function ProductSubscriptionCreate(props: ProductSubscriptionCreateProps) {
  // Remount on a principal or reviewed product/price change: a delayed result
  // cannot become another account's receipt or another variant's confirmation.
  const scope = JSON.stringify([props.memberToken, props.product]);
  return <SubscriptionForm key={scope} {...props} />;
}

function SubscriptionForm({ memberToken, commerceEnabled, product }: ProductSubscriptionCreateProps) {
  const id = useId();
  const [quantity, setQuantity] = useState("1");
  const [frequency, setFrequency] = useState<SubscriptionFrequencyDays>(30);
  const [reviewed, setReviewed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ phase: "idle" });
  const alive = useRef(true);
  const submitted = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const ready = canReview(product);
  const units = Number(quantity);
  const validQuantity = quantity.trim().length > 0 && Number.isInteger(units)
    && units >= 1 && units <= PERSISTENT_CART_QUANTITY_MAX;
  const locked = outcome.phase === "busy" || outcome.phase === "saved" || outcome.phase === "uncertain";
  const enabled = Boolean(memberToken) && commerceEnabled && ready;
  const subtotal = ready && validQuantity && Number.isSafeInteger(product.priceCents * units)
    ? `${product.currency} ${(product.priceCents * units / 100).toFixed(2)}` : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!enabled || !ready || !validQuantity || !subtotal || !reviewed || locked || submitted.current) return;
    submitted.current = true;
    setOutcome({ phase: "busy" });
    const result = await createSubscription(memberToken, {
      sku: product.sku, quantity: units, frequencyDays: frequency, priceVersion: product.priceVersion,
    });
    if (!alive.current) return;
    if (result.kind === "ok") {
      setOutcome({ phase: "saved", subscriptionId: result.data.subscription.subscriptionId });
    } else if (result.kind === "denied" || result.kind === "unauthorized" || result.kind === "forbidden") {
      submitted.current = false;
      setOutcome({ phase: "denied", message: result.kind === "unauthorized"
        ? "Sign in again before submitting. Your selections remain here."
        : denialMessage(result.code ?? "forbidden") });
    } else {
      // The create endpoint has no durable idempotency contract. A lost reply
      // may have followed a write, so never auto-retry or declare no record.
      setOutcome({ phase: "uncertain" });
    }
  }

  return <section className="card" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="heading-s">Product subscription</h2>
    <p className="body-s mt-2">Request recurring deliveries of this exact product. This is separate from account access.</p>
    {!memberToken ? <p role="status">Sign in to review a product subscription.</p>
      : !ready ? <p role="status">A subscription offer is not available for this product yet.</p>
      : !commerceEnabled ? <p role="status">Product subscription requests are not open yet.</p> : null}
    {ready && <form onSubmit={submit} className="grid gap-4 mt-4">
      <div>
        <p className="font-700">{product.displayName}</p>
        <p>{product.variantLabel}</p>
        <p className="body-s">SKU: {product.sku}</p>
        <p className="body-s">Unit price: {product.currency} {(product.priceCents / 100).toFixed(2)}</p>
      </div>
      <fieldset disabled={!enabled || locked} className="grid gap-3">
        <legend className="font-700">Choose your schedule</legend>
        <label htmlFor={`${id}-quantity`}>Quantity</label>
        <input id={`${id}-quantity`} className="input-field" type="number" inputMode="numeric"
          min={1} max={PERSISTENT_CART_QUANTITY_MAX} step={1} required value={quantity}
          onChange={event => { setQuantity(event.target.value); setReviewed(false); }} />
        <label htmlFor={`${id}-frequency`}>Delivery frequency</label>
        <select id={`${id}-frequency`} className="input-field" value={frequency}
          onChange={event => { const days = Number(event.target.value); if ((SUBSCRIPTION_FREQUENCIES as readonly number[]).includes(days)) { setFrequency(days as SubscriptionFrequencyDays); setReviewed(false); } }}>
          {SUBSCRIPTION_FREQUENCIES.map(days => <option key={days} value={days}>Every {days} days</option>)}
        </select>
        {subtotal ? <p>Product subtotal per delivery: {subtotal}. Shipping and any taxes are not included.</p>
          : <p role="status">Choose a valid quantity to review the product subtotal.</p>}
        <p>The displayed price must be confirmed before purchase. This request does not authorize a charge or schedule a shipment. Payment and activation require a separate supported step.</p>
        <label className="flex gap-2" htmlFor={`${id}-review`}>
          <input id={`${id}-review`} type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
          <span>I reviewed this product, variant, quantity, frequency, and displayed price.</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={!validQuantity || !subtotal || !reviewed}>
          {outcome.phase === "busy" ? "Submitting request..." : "Request product subscription"}
        </button>
      </fieldset>
    </form>}
    {outcome.phase === "denied" && <p className="mt-4" role="alert">{outcome.message}</p>}
    {outcome.phase === "uncertain" && <p className="mt-4" role="alert">We could not confirm whether your request was saved. Check your product subscriptions before submitting again. This page cannot take payment or activate a subscription.</p>}
    {outcome.phase === "saved" && <div className="mt-4" role="status">
      <p>Subscription request saved. It is pending, with no payment or shipment scheduled.</p>
      <p>Request reference: {outcome.subscriptionId}</p>
      <p>Payment setup is not available here. This is not a completed purchase.</p>
    </div>}
    {(outcome.phase === "saved" || outcome.phase === "uncertain") && <a className="btn btn-ghost mt-4" href={MEMBER_ROUTES.subscriptions}>View product subscriptions</a>}
  </section>;
}
