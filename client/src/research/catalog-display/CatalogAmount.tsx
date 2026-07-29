// The one way an amount reaches the catalog display surface.
//
// It reuses the pricing lane's components and formatter rather than growing a
// second money path:
//   - no displayable amount, loading, or error all render through
//     PriceDisplay, which owns the honest unavailable, skeleton, and error
//     states;
//   - a displayable amount is formatted with tryFormatCustomerAmountCents, the
//     exact function PriceDisplay uses, and any rejection (zero, negative,
//     non integer, unsafe, unsupported currency) falls back to
//     PriceUnavailable. A "$0.00" render is impossible on this surface too.
//
// Why not hand the amount to PriceDisplay directly: PriceDisplay takes the
// authoritative CatalogPriceProjection, whose priced branch requires priceId,
// productId, variantId, effectiveAt, and version. This catalog holds none of
// them. Every one of the three catalogs records effectiveDate as null on
// purpose, because no price here has an effective date yet. Filling those
// fields with placeholders to satisfy a type would put invented facts into the
// price path, which is the one place this repository refuses to guess. So the
// unavailable and loading states go through PriceDisplay, and the priced state
// goes through the same formatter under this component's own markup.

import { PriceDisplay } from "../pricing/PriceDisplay";
import { PriceUnavailable } from "../pricing/PriceUnavailable";
import { priceAriaPhrase, tryFormatCustomerAmountCents } from "../pricing/format";
import {
  isDisplayableAmount,
  type MemberAmount,
} from "@shared/research/catalog-display/contract";

export interface CatalogAmountProps {
  /** The founder approved member amount, or null where none may be shown. */
  amount: MemberAmount | null;
  loading?: boolean;
  error?: boolean;
  /** Optional unit phrase for the accessible name, for example "per vial". */
  unitLabel?: string;
  className?: string;
  testId?: string;
}

export function CatalogAmount({
  amount,
  loading = false,
  error = false,
  unitLabel,
  className,
  testId = "catalog-amount",
}: CatalogAmountProps) {
  if (loading) {
    return <PriceDisplay loading testId={testId} className={className} />;
  }
  if (error) {
    return <PriceDisplay error testId={testId} className={className} />;
  }
  if (!isDisplayableAmount(amount)) {
    // The explicit not-available projection. PriceDisplay renders the approved
    // unavailable copy; no number of any kind is produced.
    return (
      <PriceDisplay
        price={{ state: "not_currently_available" }}
        testId={testId}
        className={className}
      />
    );
  }

  const formatted = tryFormatCustomerAmountCents(amount.amountCents, amount.currency);
  if (!formatted.ok) {
    return <PriceUnavailable testId={`${testId}-unavailable`} className={className} />;
  }

  return (
    <span data-testid={testId} className={className}>
      <span
        data-testid={`${testId}-value`}
        aria-label={priceAriaPhrase(formatted.text, "member", unitLabel)}
        className="tabular"
      >
        {formatted.text}
      </span>
      <span data-testid={`${testId}-audience`} aria-hidden="true" className="body-s text-ink-mute">
        {" "}
        for members
      </span>
    </span>
  );
}
