import {
  EarlyAccessCompactQuantityControl,
} from "./EarlyAccessCompactQuantityControl";
import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";

/**
 * One product card in the Private Early Access catalogue. Compact on purpose:
 * twenty-two of these have to read as one shelf, not twenty-two pages.
 *
 * THIS COMPONENT COMPUTES NO MONEY. It renders the single-unit price the server
 * gave it and nothing else. The bundle total, the discount and the payable total
 * are all server-computed and appear on the order review, never here. A card
 * that multiplied a price by a quantity would be a second pricing runtime in the
 * browser, and the moment it disagreed with the server the customer would be
 * shown a number they will not be charged.
 *
 * THIS COMPONENT AUTHORS NO PRODUCT FACTS. The description is rendered exactly
 * as the server sent it, and when the server sent none, nothing is rendered in
 * its place: no inferred blurb, no research claim, no copy derived from the
 * product's name. The server is the only authority on what a product is.
 *
 * The fulfillment target sentence is rendered ONCE at catalogue level by the
 * section, not repeated on every card; it describes the catalogue's
 * fulfillment, not any one unit's.
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
  /** Short approved description, exactly as the server sent it. Never a supplier note. */
  description: string;
  availability: EarlyAccessAvailabilityState;
}>;

export interface EarlyAccessProductCardProps {
  product: EarlyAccessCardProduct;
  quantity: EarlyAccessQuantity | null;
  onQuantityChange(quantity: EarlyAccessQuantity): void;
  /** Adds the product, at the currently chosen quantity, to the selection. */
  onSelect(): void;
  /** Removes the product from the selection. Only offered while selected. */
  onRemove?(): void;
  /** Whether this product is currently in the customer's selection. */
  selected?: boolean;
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
  AVAILABLE: "Add",
  AVAILABILITY_CONFIRMATION_REQUIRED: "Request availability",
  TEMPORARILY_HELD: "Unavailable",
};

export function EarlyAccessProductCard({
  product,
  quantity,
  onQuantityChange,
  onSelect,
  onRemove = () => {},
  selected = false,
  testId = "early-access-product-card",
}: EarlyAccessProductCardProps) {
  const sellable = product.availability !== "TEMPORARILY_HELD";
  const productLabel = `${product.name} ${product.strength}`;

  return (
    <article
      data-testid={testId}
      data-availability={product.availability}
      data-selected={selected ? "true" : "false"}
      className="card flex min-w-0 flex-col gap-2"
    >
      {/*
        No product photography, and no placeholder block either. An image that
        might be the wrong strength or the wrong vial is worse than none, and an
        empty square the height of the card was most of what made the old page
        feel endless.
      */}
      <h3 className="body-m font-700 min-w-0 break-words" data-testid={`${testId}-name`}>
        {product.name}
      </h3>
      <p className="body-s text-ink-mute" data-testid={`${testId}-strength`}>
        {product.strength}
      </p>

      {/*
        The server's description, verbatim, or nothing. Rendered de-emphasized
        so a repeated server placeholder cannot dominate the card, but never
        replaced, shortened into a different sentence, or invented client-side.
      */}
      {product.description !== "" && (
        <p
          className="body-s text-ink-mute min-w-0 break-words"
          data-testid={`${testId}-description`}
        >
          {product.description}
        </p>
      )}

      {sellable ? (
        <>
          {product.unitPriceCents === null ? (
            // No price, and no placeholder that could be mistaken for one.
            <p className="body-s text-ink-2 mt-auto" data-testid={`${testId}-no-price`}>
              Not available to order
            </p>
          ) : (
            <p className="body-m font-700 tabular mt-auto" data-testid={`${testId}-unit-price`}>
              {formatUnitPrice(product.unitPriceCents, product.currency)}
              <span className="body-s text-ink-mute font-normal"> per unit</span>
            </p>
          )}

          <p className="body-s text-ink-mute" data-testid={`${testId}-availability`}>
            {AVAILABILITY_COPY[product.availability]}
          </p>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <EarlyAccessCompactQuantityControl
              value={quantity}
              onChange={onQuantityChange}
              productLabel={productLabel}
              testId={`${testId}-quantity`}
            />
            {/*
              One action, whose meaning tracks the selection. Unselected it adds
              at the chosen quantity; selected it removes. Never both at once,
              and never a disabled decoy.
            */}
            {selected ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRemove}
                aria-label={`Remove ${productLabel} from your order`}
                data-testid={`${testId}-remove`}
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSelect}
                aria-label={`${ACTION_COPY[product.availability]}, ${productLabel}`}
                data-testid={`${testId}-action`}
              >
                {ACTION_COPY[product.availability]}
              </button>
            )}
          </div>

          {selected && (
            <p
              role="status"
              aria-live="polite"
              className="body-s text-ink-2"
              data-testid={`${testId}-selected`}
            >
              Added to your order.
            </p>
          )}
        </>
      ) : (
        <>
          {/*
            A held row renders NO purchase surface at all: no price, no
            quantity, no action, disabled or otherwise. A disabled control is
            still present in the DOM and the accessibility tree: it announces
            itself, it can be re-enabled from devtools, and it tells the
            customer "you could buy this" about a unit no named human has
            approved for sale. Absent is the only state that cannot be misread.
            The server refuses the order regardless; this is the surface
            agreeing with it.
          */}
          <p className="body-s font-700 mt-auto" data-testid={`${testId}-availability`}>
            {AVAILABILITY_COPY.TEMPORARILY_HELD}
          </p>
          <p className="body-s text-ink-mute" data-testid={`${testId}-held-note`}>
            Not available to order right now.
          </p>
        </>
      )}
    </article>
  );
}
