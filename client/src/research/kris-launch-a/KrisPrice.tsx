import {
  KRIS_PRICE_PENDING,
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";

/**
 * A price, or an honest absence.
 *
 * Two of the 420 items have no price yet. They render "Price pending", which is
 * a real state with its own copy: never $0, never an empty space where a price
 * goes, never a guess.
 *
 * The zero guard below is defence in depth, not a suspicion of the server. The
 * data spine already refuses a zero amount at normalization time, and the two
 * pending rows arrive as `state: "pending"`. If a priced view ever arrived with
 * nothing usable in it, saying "pending" is the truthful answer and "$0.00" is
 * not, so this decides that here rather than letting a formatted zero reach a
 * buyer.
 */
export function krisPriceText(price: KrisPriceView): string {
  if (price.state === "pending") return KRIS_PRICE_PENDING.display;
  if (!Number.isFinite(price.amountCents) || price.amountCents <= 0) {
    return KRIS_PRICE_PENDING.display;
  }
  return price.display.trim() === "" ? KRIS_PRICE_PENDING.display : price.display;
}

export function krisPriceIsPending(price: KrisPriceView): boolean {
  return krisPriceText(price) === KRIS_PRICE_PENDING.display;
}

/**
 * The price and, when there is one, the basis it is measured on. The basis
 * comes straight from the sheet ("Per bottle of 60", "Box of 10 normalized to
 * per vial") and is not decoration: a number without it is not comparable.
 */
export function KrisPrice({
  price,
  showBasis = true,
}: {
  price: KrisPriceView;
  showBasis?: boolean;
}) {
  const pending = krisPriceIsPending(price);
  return (
    <span className="grid min-w-0 gap-1">
      <span
        className="tabular min-w-0 break-words"
        data-testid="kris-price"
        data-state={pending ? "pending" : "priced"}
      >
        {krisPriceText(price)}
      </span>
      {showBasis && !pending && price.state === "priced" && price.basis.trim() !== "" && (
        <span
          className="body-s text-ink-mute min-w-0 break-words"
          data-testid="kris-price-basis"
        >
          {price.basis}
        </span>
      )}
    </span>
  );
}
