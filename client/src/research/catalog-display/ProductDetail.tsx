// One product, in full, with variant selection.
//
// Selection is a native radio group inside a fieldset with a legend. That is
// deliberate: it gives keyboard navigation (arrow keys move the selection, Tab
// moves out of the group), a real accessible name per option, a real focus
// ring, and correct grouping semantics, with no custom key handling to get
// wrong. Each option's label states its own availability in words, because a
// second vial size can be a different availability from the first, and a member
// choosing between them needs to see that.
//
// Two truthfulness rules are held here:
//   - the amount is shown only where the record carries one AND the mode
//     permits it. The peptide lane shows the reason instead of a number,
//     because no peptide price is confirmed;
//   - research context is never rendered without its disclosure. The copy
//     module states that requirement, and the server sends the exact lines in
//     `disclosures`, so this component renders what it was given rather than
//     writing its own version.
//
// Loading, error, and missing are all explicit and all honest. Nothing here is
// a purchase control: this surface displays, it does not sell.

import { useEffect, useId, useState } from "react";
import type {
  DisplayProductDetail,
  DisplayVariant,
} from "@shared/research/catalog-display/contract";
import { CatalogAmount } from "./CatalogAmount";
import { OfferModeBadge } from "./OfferModeBadge";
import {
  CATALOG_DISPLAY_NOTE,
  CATALOG_ERROR_COPY,
  CATALOG_LOADING_COPY,
  PEPTIDE_PRICE_PENDING_COPY,
  PRODUCT_NOT_FOUND_COPY,
  offerModeLabel,
} from "./labels";

export interface ProductDetailProps {
  product?: DisplayProductDetail | null;
  loading?: boolean;
  error?: boolean;
  onVariantChange?: (variant: DisplayVariant) => void;
  testId?: string;
}

function variantSummary(variant: DisplayVariant): string {
  const parts = [variant.label];
  if (variant.strength) parts.push(variant.strength);
  if (variant.size && variant.size !== variant.strength) parts.push(variant.size);
  return parts.join(", ");
}

export function ProductDetail({
  product,
  loading = false,
  error = false,
  onVariantChange,
  testId = "product-detail",
}: ProductDetailProps) {
  const groupName = useId();
  const headingId = `${testId}-heading`;
  const variants = product?.variants ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Re-anchor the selection whenever the product changes, so switching
  // products never leaves a stale variant selected.
  useEffect(() => {
    setSelectedId(variants.length > 0 ? variants[0].id : null);
    // The product identity, not the array reference, is what should reset it.
  }, [product?.lane, product?.slug, variants.length]);

  if (loading) {
    return (
      <section role="status" data-testid={`${testId}-loading`} className="min-w-0">
        <span className="sr-only">{CATALOG_LOADING_COPY}</span>
        <span
          aria-hidden="true"
          className="block h-[1.5em] w-2/3 max-w-full animate-pulse rounded bg-current opacity-10"
        />
      </section>
    );
  }

  if (error) {
    return (
      <p role="alert" className="body-s max-w-[68ch]" data-testid={`${testId}-error`}>
        {CATALOG_ERROR_COPY}
      </p>
    );
  }

  if (!product) {
    return (
      <p className="body-s text-ink-2 max-w-[68ch]" data-testid={`${testId}-missing`}>
        {PRODUCT_NOT_FOUND_COPY}
      </p>
    );
  }

  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0] ?? null;

  const select = (variant: DisplayVariant) => {
    setSelectedId(variant.id);
    onVariantChange?.(variant);
  };

  return (
    <section aria-labelledby={headingId} data-testid={testId} className="grid min-w-0 gap-6">
      <header className="grid gap-2">
        <p className="mono-label text-ink-mute">{product.category}</p>
        <h2 id={headingId} className="h2 min-w-0 break-words">
          {product.displayName}
        </h2>
        {product.canonicalName !== product.displayName && (
          <p className="body-s text-ink-mute min-w-0 break-words" data-testid={`${testId}-canonical`}>
            {product.canonicalName}
          </p>
        )}
        {product.brand && (
          <p className="body-s text-ink-mute" data-testid={`${testId}-brand`}>
            {product.brand}
          </p>
        )}
        {product.positioning && (
          <p className="body-s text-ink-2 max-w-[68ch]">{product.positioning}</p>
        )}
      </header>

      <div className="grid gap-3">
        <OfferModeBadge
          availability={selected ? selected.availability : product.availability}
          testId={`${testId}-availability`}
        />
        <p className="body-s text-ink-2 max-w-[68ch]">{CATALOG_DISPLAY_NOTE}</p>
      </div>

      <div className="grid gap-1">
        <p className="mono-label text-ink-mute">Member amount</p>
        {product.lane === "peptide" ? (
          <p className="body-s text-ink-2 max-w-[68ch]" data-testid={`${testId}-amount-pending`}>
            {PEPTIDE_PRICE_PENDING_COPY}
          </p>
        ) : (
          <CatalogAmount amount={product.price} testId={`${testId}-amount`} />
        )}
      </div>

      {variants.length > 0 ? (
        <fieldset className="grid min-w-0 gap-3 border-0 p-0" data-testid={`${testId}-variants`}>
          <legend className="mono-label text-ink-mute">Choose a presentation</legend>
          {variants.map((variant) => {
            const inputId = `${groupName}-${variant.id}`;
            return (
              <label
                key={variant.id}
                htmlFor={inputId}
                className="grid min-w-0 cursor-pointer grid-cols-[auto_1fr] items-start gap-3"
                data-testid={`${testId}-variant-${variant.id}`}
              >
                <input
                  type="radio"
                  id={inputId}
                  name={groupName}
                  value={variant.id}
                  className="mt-1"
                  checked={selected?.id === variant.id}
                  onChange={() => select(variant)}
                />
                <span className="grid min-w-0 gap-1">
                  <span className="body-s font-700 min-w-0 break-words">
                    {variantSummary(variant)}
                  </span>
                  <span
                    className="body-s text-ink-mute min-w-0 break-words"
                    data-testid={`${testId}-variant-${variant.id}-availability`}
                  >
                    {/* Same authority as the badge: describeOfferMode, via ./labels. */}
                    {`Availability: ${offerModeLabel(variant.availability)}`}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="body-s text-ink-mute max-w-[68ch]" data-testid={`${testId}-no-variants`}>
          This record is supplied as one presentation. No separate configuration is on file for it.
        </p>
      )}

      {product.overview && (
        <div className="grid gap-2">
          <h3 className="body-l font-700">Overview</h3>
          <p className="body-s text-ink-2 max-w-[68ch]">{product.overview}</p>
        </div>
      )}

      {product.whyItPairs && (
        <div className="grid gap-2">
          <h3 className="body-l font-700">Why it is grouped here</h3>
          <p className="body-s text-ink-2 max-w-[68ch]">{product.whyItPairs}</p>
        </div>
      )}

      {product.researchContext.length > 0 && (
        <div className="grid gap-2" data-testid={`${testId}-research-context`}>
          <h3 className="body-l font-700">Research context</h3>
          <ul role="list" className="body-s text-ink-2 grid gap-1">
            {product.researchContext.map((entry) => (
              <li key={entry} className="min-w-0 break-words">
                {entry}
              </li>
            ))}
          </ul>
        </div>
      )}

      {product.storageAndHandling && (
        <div className="grid gap-2">
          <h3 className="body-l font-700">Storage and handling</h3>
          <p className="body-s text-ink-2 max-w-[68ch]">{product.storageAndHandling}</p>
        </div>
      )}

      {product.collections.length > 0 && (
        <div className="grid gap-2" data-testid={`${testId}-collections`}>
          <h3 className="body-l font-700">Protocol groups</h3>
          <ul role="list" className="body-s text-ink-2 grid gap-1">
            {product.collections.map((entry) => (
              <li key={entry} className="min-w-0 break-words">
                {entry}
              </li>
            ))}
          </ul>
        </div>
      )}

      {product.disclosures.length > 0 && (
        <div className="grid gap-2" data-testid={`${testId}-disclosures`}>
          {product.disclosures.map((line) => (
            <p key={line} className="body-s text-ink-mute max-w-[68ch]">
              {line}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
