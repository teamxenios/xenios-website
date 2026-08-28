import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import {
  PUBLIC_STOREFRONT_ACTION_LABELS,
  isActionablePublicAction,
  type PublicStorefrontDetail,
  type PublicStorefrontVariant,
} from "@shared/research/storefront/contract";
import { CatalogEvidenceNotice } from "../catalog-evidence/CatalogEvidenceNotice";
import { ResearchSecureNotice, ResearchStatusBadge } from "../ui/kit";
import {
  APPLY_HREF,
  CARE_HREF,
  EARLY_ACCESS_HREF,
  intentCarriesQuantity,
  safeStorefrontIntent,
  signInHrefForIntent,
} from "./entry-intent";
import { publicPriceLabel } from "./StorefrontCard";

/**
 * The public product page: choose an option, then continue.
 *
 * WHAT "CONTINUE" MEANS HERE. A signed-out visitor cannot transact, so no
 * button on this page buys anything. Each action instead carries the
 * visitor's exact selection into the flow that CAN complete it:
 *
 *   Order / Request Order -> sign in, returning to the member product page
 *                            with the variant and quantity preselected
 *   Request Quote         -> the same continuation; the member page resolves
 *                            the request path for that exact variant
 *   Continue through Care -> the Care access door, which is a different
 *                            pathway and never a purchase
 *
 * Nothing here is authority. After sign-in the member surface re-resolves the
 * action and the price from the server, so a hand-edited link can at most
 * preselect something the server then refuses.
 */

function ContinuationPanel({
  product,
  variant,
}: {
  product: PublicStorefrontDetail;
  variant: PublicStorefrontVariant;
}) {
  const wantsQuantity = intentCarriesQuantity(variant);
  const [quantityText, setQuantityText] = useState(
    String(EARLY_ACCESS_MIN_QUANTITY),
  );
  const quantity = /^(?:0|[1-9]\d*)$/.test(quantityText)
    ? Number(quantityText)
    : null;

  const intent = useMemo(
    () =>
      safeStorefrontIntent({
        family: product.family,
        slug: product.slug,
        variantId: variant.id,
        quantity:
          wantsQuantity && quantity !== null
            ? quantity
            : EARLY_ACCESS_MIN_QUANTITY,
        action: variant.action,
      }),
    [
      product.family,
      product.slug,
      variant.id,
      variant.action,
      quantity,
      wantsQuantity,
    ],
  );

  const label = PUBLIC_STOREFRONT_ACTION_LABELS[variant.action];

  if (!isActionablePublicAction(variant.action)) {
    return (
      <div className="grid min-w-0 gap-3" data-testid="sf-continuation">
        <p className="body-s text-ink-mute" data-testid="sf-detail-status">
          {variant.action === "TEMPORARILY_HELD"
            ? "This option is temporarily unavailable. Check this catalog for any future status change."
            : "This option is not available."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={APPLY_HREF}
            className="btn btn-secondary min-h-[44px]"
            data-testid="sf-detail-apply"
          >
            Apply for membership
          </Link>
        </div>
      </div>
    );
  }

  if (variant.action === "CARE") {
    return (
      <div className="grid min-w-0 gap-3" data-testid="sf-continuation">
        <p className="body-s text-ink-2 max-w-[60ch]">
          This is a Care pathway. A provider reviews it with you; it is not a
          direct purchase.
        </p>
        <Link
          href={CARE_HREF}
          className="btn btn-primary min-h-[44px]"
          data-testid="sf-detail-cta"
          aria-label={`${label}, ${product.displayName}, ${variant.label}`}
        >
          {label}
        </Link>
      </div>
    );
  }

  const quantityId = `sf-qty-${variant.id}`;
  const outOfBand =
    wantsQuantity &&
    (quantity === null ||
      !Number.isSafeInteger(quantity) ||
      quantity < EARLY_ACCESS_MIN_QUANTITY ||
      quantity > EARLY_ACCESS_MAX_QUANTITY);

  return (
    <div className="grid min-w-0 gap-3" data-testid="sf-continuation">
      {wantsQuantity && (
        <label className="grid min-w-0 gap-2 max-w-[12rem]" htmlFor={quantityId}>
          <span className="form-label">Quantity</span>
          <input
            id={quantityId}
            className="input-field"
            type="number"
            inputMode="numeric"
            min={EARLY_ACCESS_MIN_QUANTITY}
            max={EARLY_ACCESS_MAX_QUANTITY}
            step={1}
            value={quantityText}
            data-testid="sf-detail-quantity"
            aria-invalid={outOfBand || undefined}
            aria-describedby={outOfBand ? `${quantityId}-band` : undefined}
            onChange={(event) => setQuantityText(event.target.value)}
          />
          {outOfBand && (
            <span
              id={`${quantityId}-band`}
              className="body-s text-ink-mute"
              data-testid="sf-qty-band"
            >
              Choose between {EARLY_ACCESS_MIN_QUANTITY} and{" "}
              {EARLY_ACCESS_MAX_QUANTITY}.
            </span>
          )}
        </label>
      )}

      {outOfBand ? (
        <button
          type="button"
          className="btn btn-primary min-h-[44px]"
          data-testid="sf-detail-cta"
          aria-label={`${label}, ${product.displayName}, ${variant.label}`}
          disabled
        >
          {label}
        </button>
      ) : (
        <Link
          href={signInHrefForIntent(intent)}
          className="btn btn-primary min-h-[44px]"
          data-testid="sf-detail-cta"
          aria-label={`${label}, ${product.displayName}, ${variant.label}`}
        >
          {label}
        </Link>
      )}

      <p className="body-s text-ink-mute max-w-[60ch]" data-testid="sf-detail-continue-note">
        You will be asked to sign in, and we will bring you straight back to
        this product with your selection.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href={EARLY_ACCESS_HREF}
          className="body-s inline-flex min-h-[44px] min-w-[44px] items-center underline text-ink-mute"
          data-testid="sf-detail-early-access"
        >
          Have an early access password?
        </Link>
        <Link
          href={APPLY_HREF}
          className="body-s inline-flex min-h-[44px] min-w-[44px] items-center underline text-ink-mute"
          data-testid="sf-detail-apply"
        >
          Apply for membership
        </Link>
      </div>
    </div>
  );
}

export function StorefrontProductPage({
  product,
}: {
  product: PublicStorefrontDetail;
}) {
  const variants = product.variants;
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const selected = useMemo(
    () => variants.find((entry) => entry.id === selectedId) ?? variants[0],
    [variants, selectedId],
  );

  return (
    <div
      className="container-x grid min-w-0 gap-6"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <nav aria-label="Breadcrumb">
        <Link
          href="/research/catalog"
          className="body-s inline-flex min-h-[44px] min-w-[44px] items-center text-ink-mute underline"
          data-testid="sf-back-to-catalog"
        >
          Back to catalog
        </Link>
      </nav>

      <header className="grid min-w-0 gap-2">
        <p className="mono-label text-ink-mute">{product.familyLabel}</p>
        <h1 className="display-s min-w-0 break-words">{product.displayName}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <ResearchStatusBadge label={product.displayLabel} />
          <p className="body-s text-ink-2 min-w-0 break-words">
            {product.stateExplanation}
          </p>
        </div>
        {product.overview && (
          <p className="body-s text-ink-2 max-w-[70ch] min-w-0 break-words">
            {product.overview}
          </p>
        )}
      </header>

      {variants.length > 0 && selected && (
        <section aria-labelledby="sf-options" className="grid min-w-0 gap-4">
          <h2 id="sf-options" className="body-l font-700">
            Choose an option
          </h2>

          <fieldset
            className="grid min-w-0 gap-2 border-0 p-0"
            data-testid="sf-variant-selector"
          >
            <legend className="form-label max-w-full min-w-0 break-words">
              Options for {product.displayName}
            </legend>
            {variants.map((variant) => {
              const inputId = `sf-variant-${variant.id}`;
              return (
                <label
                  key={variant.id}
                  className="card flex min-w-0 flex-wrap items-center justify-between gap-3 min-h-[44px] body-s"
                  htmlFor={inputId}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <input
                      id={inputId}
                      type="radio"
                      name="sf-variant"
                      value={variant.id}
                      checked={variant.id === selected.id}
                      aria-label={`${variant.label}, ${product.displayName}, ${variant.displayLabel}`}
                      onChange={() => setSelectedId(variant.id)}
                    />
                    <span className="font-700 min-w-0 break-words">
                      {variant.label}
                    </span>
                  </span>
                  <span className="text-ink-mute min-w-0 break-words">
                    {variant.displayLabel}
                  </span>
                  <span
                    className="tabular min-w-0 break-words"
                    data-testid="sf-detail-variant-price"
                  >
                    {publicPriceLabel(variant)}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="card grid min-w-0 gap-3" data-testid="sf-selected">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
              <p className="body-l font-700 min-w-0 break-words">
                {selected.label}
              </p>
              <p
                className="tabular min-w-0 break-words"
                data-testid="sf-selected-price"
              >
                {publicPriceLabel(selected)}
              </p>
            </div>
            <ContinuationPanel
              key={selected.id}
              product={product}
              variant={selected}
            />
          </div>
        </section>
      )}

      <CatalogEvidenceNotice />

      <section aria-labelledby="sf-disclosures" className="grid min-w-0 gap-2">
        <h2 id="sf-disclosures" className="body-l font-700">
          What this listing does and does not mean
        </h2>
        <ul className="grid min-w-0 gap-2 body-s text-ink-2">
          {product.disclosures.map((disclosure) => (
            <li key={disclosure} className="min-w-0 break-words">
              {disclosure}
            </li>
          ))}
        </ul>
        <ResearchSecureNotice>
          Research materials are not for human or veterinary use.
        </ResearchSecureNotice>
      </section>
    </div>
  );
}

export default StorefrontProductPage;
