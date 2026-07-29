// The one way an authoritative customer price reaches a screen.
//
// PriceDisplay accepts the price-or-unavailable projection and renders
// exactly one of four honest states:
//   - the formatted amount, with the full phrase (amount, optional unit,
//     audience) carried on the amount's aria-label so a screen reader hears
//     "Price: $1,800.00 per unit for members" in one announcement;
//   - "Not currently available" for the explicit not-available projection,
//     for a missing projection, and for any amount the formatter rejects
//     (zero, negative, malformed): a $0.00 render is impossible;
//   - a skeleton with role="status" while loading, never a fake number;
//   - the unavailable state on error, never a raw error string.
//
// Layout is inline text: no fixed widths, size follows the surrounding font,
// so it holds up at 320px and at any zoom. compareAt display is deliberately
// out of scope (compare_at is excluded from customer audiences).

import { PriceUnavailable } from "./PriceUnavailable";
import {
  AUDIENCE_PHRASES,
  isPriceUnavailable,
  priceAriaPhrase,
  tryFormatCustomerAmountCents,
  type CustomerPriceProjection,
} from "./format";

export interface PriceDisplayProps {
  /** The authoritative projection. Absent means not loaded: renders unavailable. */
  price?: CustomerPriceProjection | null;
  /** True while the price is being fetched. */
  loading?: boolean;
  /** True when the fetch failed. Renders the unavailable state, never the error. */
  error?: boolean;
  /** Optional unit phrase for the accessible name, e.g. "per unit". */
  unitLabel?: string;
  /**
   * Show the audience qualifier ("for members") as visible text next to the
   * amount, so sighted readers get the same audience clarity the accessible
   * phrase carries. On by default; turn off where the surrounding surface
   * already names the audience (e.g. a "Member price" table header).
   */
  showAudience?: boolean;
  className?: string;
  testId?: string;
}

export function PriceDisplay({
  price,
  loading = false,
  error = false,
  unitLabel,
  showAudience = true,
  className,
  testId = "price-display",
}: PriceDisplayProps) {
  if (loading) {
    return (
      <span role="status" data-testid={`${testId}-loading`} className={className}>
        <span className="sr-only">Loading price</span>
        <span
          aria-hidden="true"
          className="inline-block h-[1em] w-[4.5em] max-w-full animate-pulse rounded bg-current opacity-20 align-middle"
        />
      </span>
    );
  }

  if (error || price == null || isPriceUnavailable(price)) {
    return <PriceUnavailable testId={`${testId}-unavailable`} className={className} />;
  }

  const formatted = tryFormatCustomerAmountCents(price.amountCents, price.currency);
  if (!formatted.ok) {
    // The impossible-$0 invariant: a zero, negative, or malformed amount is
    // not a price, so it renders the honest unavailable state.
    return <PriceUnavailable testId={`${testId}-unavailable`} className={className} />;
  }

  const qualifier = showAudience ? AUDIENCE_PHRASES[price.audience] : null;

  return (
    <span data-testid={testId} className={className}>
      <span
        data-testid={`${testId}-amount`}
        aria-label={priceAriaPhrase(formatted.text, price.audience, unitLabel)}
        className="tabular"
      >
        {formatted.text}
      </span>
      {qualifier && (
        <span data-testid={`${testId}-audience`} aria-hidden="true" className="body-s text-ink-mute">
          {" "}
          {qualifier}
        </span>
      )}
    </span>
  );
}
