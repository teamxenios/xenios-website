// The honest empty state for a price: the approved copy, rendered as plain
// text. Kept as its own component (rather than folded into PriceDisplay) so
// catalog and detail lanes can render the unavailable state directly, without
// constructing a price projection first. Words carry the meaning; there is no
// color-only signaling to lose.

import { PRICE_UNAVAILABLE_COPY } from "./format";

export interface PriceUnavailableProps {
  className?: string;
  testId?: string;
}

export function PriceUnavailable({ className, testId = "price-unavailable" }: PriceUnavailableProps) {
  return (
    <span data-testid={testId} className={className}>
      {PRICE_UNAVAILABLE_COPY}
    </span>
  );
}
