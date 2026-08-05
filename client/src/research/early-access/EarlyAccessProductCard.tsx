import {
  EarlyAccessQuantitySelector,
  type EarlyAccessQuantity,
} from "./EarlyAccessQuantitySelector";

/**
 * One product card in the Private Early Access catalogue.
 *
 * THIS COMPONENT COMPUTES NO MONEY. It renders the single-unit price the server
 * gave it and nothing else. The bundle total, the discount and the payable total
 * are all server-computed and appear on the order review, never here. A card
 * that multiplied a price by a quantity would be a second pricing runtime in the
 * browser, and the moment it disagreed with the server the customer would be
 * shown a number they will not be charged.
 *
 * The quantity control is the existing EarlyAccessQuantitySelector rather than a
 * second radiogroup. That component already owns the keyboard and screen-reader
 * behaviour, and two quantity models in one flow is how they drift apart.
 */

export const EARLY_ACCESS_AVAILABILITY_STATES = [
  /** Orderable now. */
  "AVAILABLE",
  /**
   * Visible and selectable, but it cannot reach payment instructions until
   * operations confirms availability and a reservation exists. The customer is
   * told this while choosing, not after they try to pay.
   */
  "AVAILABILITY_CONFIRMATION_REQUIRED",
  /** Visible and unsellable. Shown rather than hidden. */
  "TEMPORARILY_HELD",
] as const;

export type EarlyAccessAvailabilityState = (typeof EARLY_ACCESS_AVAILABILITY_STATES)[number];

export type EarlyAccessCardProduct = Readonly<{
  productId: string;
  variantId: string;
  name: string;
  strength: string;
  /**
   * Server-approved single-unit price, and the ONLY money on this card.
   *
   * NULL on a founder-held row. No amount is shown beside a unit nobody may
   * buy: a price next to an unavailable product reads as an offer, and the
   * customer would be entitled to expect it.
   */
  unitPriceCents: number | null;
  currency: string;
  /** Short approved description. Never a supplier note. */
  description: string;
  availability: EarlyAccessAvailabilityState;
}>;

export interface EarlyAccessProductCardProps {
  product: EarlyAccessCardProduct;
  quantity: EarlyAccessQuantity | null;
  onQuantityChange(quantity: EarlyAccessQuantity): void;
  onSelect(): void;
  /**
   * The fulfillment target sentence, REQUIRED and with no default on purpose.
   *
   * The canonical string lives server-side in ops/manual-action-record.ts and
   * there is no shared module the browser can import it from yet. A default here
   * would be a second copy that drifts, and a shortened variant of that sentence
   * already exists in that module's own test file. Passing it in makes a wrong
   * sentence a visible decision at the call site rather than a constant nobody
   * re-reads.
   */
  fulfillmentTargetCopy: string;
  testId?: string;
}

/** Formats one already-final amount. Not arithmetic on money. */
function formatUnitPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

const AVAILABILITY_COPY: Record<EarlyAccessAvailabilityState, string> = {
  AVAILABLE: "Available to order",
  AVAILABILITY_CONFIRMATION_REQUIRED: "Availability confirmed by our team before payment",
  TEMPORARILY_HELD: "Temporarily unavailable",
};

const ACTION_COPY: Record<EarlyAccessAvailabilityState, string> = {
  AVAILABLE: "Select",
  AVAILABILITY_CONFIRMATION_REQUIRED: "Request availability",
  TEMPORARILY_HELD: "Unavailable",
};

export function EarlyAccessProductCard({
  product,
  quantity,
  onQuantityChange,
  onSelect,
  fulfillmentTargetCopy,
  testId = "early-access-product-card",
}: EarlyAccessProductCardProps) {
  const sellable = product.availability !== "TEMPORARILY_HELD";

  return (
    <article
      data-testid={testId}
      data-availability={product.availability}
      className="grid min-w-0 gap-3"
    >
      {/*
        One consistent placeholder for every product. No product photography is
        shown at all, rather than an image that might be the wrong strength or
        the wrong vial. A wrong image on a research product is worse than none.
      */}
      <div data-testid={`${testId}-media`} aria-hidden="true" className="aspect-square w-full" />

      <h3 data-testid={`${testId}-name`}>{product.name}</h3>
      <p data-testid={`${testId}-strength`}>{product.strength}</p>
      <p data-testid={`${testId}-description`}>{product.description}</p>

      {product.unitPriceCents === null ? (
        // No price, and no placeholder that could be mistaken for one.
        <p data-testid={`${testId}-no-price`}>Not available to order</p>
      ) : (
        <p data-testid={`${testId}-unit-price`}>
          {formatUnitPrice(product.unitPriceCents, product.currency)} per unit
        </p>
      )}

      <EarlyAccessQuantitySelector
        value={quantity}
        onChange={onQuantityChange}
        disabled={!sellable}
        testId={`${testId}-quantity`}
      />

      {/*
        Names the offer. States no total, because the total is the server's to
        compute and to state on the order review.
      */}
      <p data-testid={`${testId}-savings`}>
        Order three units as the Research Bundle and save 20% on the bundle.
      </p>

      <p data-testid={`${testId}-availability`}>{AVAILABILITY_COPY[product.availability]}</p>

      {product.availability === "AVAILABILITY_CONFIRMATION_REQUIRED" ? (
        <p data-testid={`${testId}-availability-detail`}>
          Our team confirms availability with the supplier before any payment
          instructions are shown.
        </p>
      ) : null}

      <button
        type="button"
        data-testid={`${testId}-action`}
        onClick={onSelect}
        disabled={!sellable}
      >
        {ACTION_COPY[product.availability]}
      </button>

      <p data-testid={`${testId}-fulfillment`}>{fulfillmentTargetCopy}</p>
    </article>
  );
}
