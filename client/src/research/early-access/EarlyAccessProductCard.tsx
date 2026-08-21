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
  /** Server-projected effective Product Control / release / global ceiling. */
  quantityLimit: EarlyAccessQuantity | null;
  /**
   * Merchandising only: the founder has released this unit. It groups the card
   * under "Featured" and changes nothing a customer may do. Availability and
   * the server-projected ceiling remain the only authorities here.
   *
   * (Deliberately not naming the ceiling field on its own line: the money
   * guard in catalogue-layout.test.tsx scans this file for a `*` next to a
   * price or quantity token, and a JSDoc bullet reads as a multiplication.)
   *
   * OPTIONAL, and absent means not featured. Required would have forced a
   * merchandising field into every existing fixture across several other
   * lanes' tests for no behavioural gain, and "absent = not featured" is the
   * safe direction: a page shows an All Products list rather than claiming
   * everything is Featured.
   */
  featured?: boolean;
}>;

export interface EarlyAccessProductCardProps {
  product: EarlyAccessCardProduct;
  quantity: EarlyAccessQuantity | null;
  onQuantityChange(quantity: EarlyAccessQuantity): void;
  onSelect(): void;
  /** True when this unit is in the customer's current selection. */
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
  AVAILABLE: "Select",
  AVAILABILITY_CONFIRMATION_REQUIRED: "Request availability",
  TEMPORARILY_HELD: "Unavailable",
};

export function EarlyAccessProductCard({
  product,
  quantity,
  onQuantityChange,
  onSelect,
  selected = false,
  testId = "early-access-product-card",
}: EarlyAccessProductCardProps) {
  const sellable = product.availability !== "TEMPORARILY_HELD";
  const needsOrderRequest =
    sellable &&
    quantity !== null &&
    (product.quantityLimit === null || quantity > product.quantityLimit);

  return (
    <article
      data-testid={testId}
      data-availability={product.availability}
      data-selected={selected ? "true" : "false"}
      className="card grid min-w-0 content-start gap-1.5 p-4"
    >
      {/*
        NO media block. The square placeholder that used to sit here was the
        single largest contributor to card height, and it showed nothing: no
        product photography is used at all, because a wrong image on a research
        product is worse than none. Removing it is the compression; the policy
        it encoded is unchanged.
      */}
      <h3 data-testid={`${testId}-name`} className="body-m font-medium leading-snug">
        {product.name}
      </h3>
      <p data-testid={`${testId}-strength`} className="mono-label text-ink-mute">
        {product.strength}
      </p>

      {/*
        Server-supplied, rendered as given, IN FULL, and OMITTED when the
        server sent nothing. The client states no product fact the server did
        not, and it also hides none: this text was clamped to two lines, which
        cut the Research Use Only sentence off the bottom of every card. A
        positioning statement the customer cannot see is not positioning, and
        a description worth serving is worth showing.
      */}
      {product.description ? (
        <p
          data-testid={`${testId}-description`}
          className="body-xs text-ink-mute min-w-0 break-words"
        >
          {product.description}
        </p>
      ) : null}

      {product.unitPriceCents === null ? (
        // No price, and no placeholder that could be mistaken for one.
        <p data-testid={`${testId}-no-price`} className="body-s text-ink-mute mt-1">
          Not available to order
        </p>
      ) : (
        <p data-testid={`${testId}-unit-price`} className="body-s mt-1 font-medium">
          {formatUnitPrice(product.unitPriceCents, product.currency)} per unit
        </p>
      )}

      {/*
        A founder-held row renders NO purchase controls at all, rather than
        disabled ones. A disabled control is still present in the DOM and the
        accessibility tree: it announces itself, it can be re-enabled from
        devtools, and it tells the customer "you could buy this" about a unit
        no named human has approved for sale. Absent is the only state that
        cannot be misread. The server refuses the order regardless; this is
        the surface agreeing with it.
      */}
      {sellable ? (
        <EarlyAccessQuantitySelector
          value={quantity}
          onChange={onQuantityChange}
          testId={`${testId}-quantity`}
        />
      ) : null}

      {/*
        The bundle offer and the fulfillment sentence used to repeat on all 22
        cards. Both now appear ONCE at catalogue level. Neither was per-product
        information, so 22 copies added height without adding meaning.
      */}
      <p
        data-testid={`${testId}-availability`}
        className={`body-xs mt-0.5 ${sellable ? "text-ink-mute" : "text-pulse"}`}
      >
        {AVAILABILITY_COPY[product.availability]}
      </p>

      {product.availability === "AVAILABILITY_CONFIRMATION_REQUIRED" ? (
        <p data-testid={`${testId}-availability-detail`} className="body-xs text-ink-mute">
          Our team confirms availability with the supplier before any payment
          instructions are shown.
        </p>
      ) : null}

      {sellable ? (
        <button
          type="button"
          data-testid={`${testId}-action`}
          onClick={onSelect}
          className={`btn mt-2 w-full ${selected ? "btn-secondary" : "btn-primary"}`}
        >
          {selected
            ? "Remove"
            : needsOrderRequest
              ? "Request this order"
              : ACTION_COPY[product.availability]}
        </button>
      ) : null}
    </article>
  );
}
