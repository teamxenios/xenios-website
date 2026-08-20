import { Link } from "wouter";
import type { MasterOfferingDisplayState } from "@shared/research/master-offerings/contract";
import {
  PUBLIC_STOREFRONT_ACTION_LABELS,
  isActionablePublicAction,
  type PublicStorefrontCard as CardView,
  type PublicStorefrontVariant,
} from "@shared/research/storefront/contract";
import { ResearchStatusBadge, type BadgeTone } from "../ui/kit";

/**
 * One public catalog card.
 *
 * It decides nothing. The availability, the price text, and each variant's
 * action arrived resolved from the server; this renders them in the simple
 * customer vocabulary. Every eligible product carries a clear next step, and
 * a product with no next step says so in words rather than leaving a card the
 * visitor can click nowhere from.
 *
 * The card's CTA navigates to the product page. It never transacts: a
 * signed-out visitor cannot buy in place, and the product page is where the
 * variant, the quantity, and the sign-in continuation live.
 */

const STATE_TONE: Readonly<Record<MasterOfferingDisplayState, BadgeTone>> = {
  available_now: "success",
  available_this_week: "info",
  request_access: "info",
  approval_required: "pending",
  temporarily_unavailable: "warning",
  coming_soon: "pending",
  care_pathway: "info",
  planned: "neutral",
  unavailable: "neutral",
};

export function storefrontProductHref(family: string, slug: string): string {
  return `/research/catalog/${encodeURIComponent(family)}/${encodeURIComponent(slug)}`;
}

/** The price a public row may show: the server's text, or the on-request words. */
export function publicPriceLabel(variant: PublicStorefrontVariant): string {
  return variant.price.state === "priced"
    ? variant.price.display
    : "Price on request";
}

export function StorefrontCard({ product }: { product: CardView }) {
  const headingId = `sf-card-${product.family}-${product.slug}`;
  const href = storefrontProductHref(product.family, product.slug);
  const actionable = isActionablePublicAction(product.action);
  const label = PUBLIC_STOREFRONT_ACTION_LABELS[product.action];

  return (
    <li className="min-w-0">
      <article
        className="card grid min-w-0 gap-3"
        aria-labelledby={headingId}
        data-testid="sf-card"
        data-customer-action={product.action}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono-label text-ink-mute min-w-0 break-words">
              {product.familyLabel}
            </p>
            <h3 id={headingId} className="body-l font-700 mt-1 min-w-0 break-words">
              <Link
                className="underline-offset-4 hover:underline"
                href={href}
                data-testid="sf-card-link"
              >
                {product.displayName}
              </Link>
            </h3>
          </div>
          <ResearchStatusBadge
            label={product.displayLabel}
            tone={STATE_TONE[product.displayState]}
          />
        </div>

        <p className="body-s text-ink-2 min-w-0 break-words">
          {product.stateExplanation}
        </p>

        <dl className="grid min-w-0 gap-3 body-s sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="mono-label text-ink-mute">Category</dt>
            <dd className="mt-1 min-w-0 break-words">
              {product.subcategory
                ? `${product.category}, ${product.subcategory}`
                : product.category}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="mono-label text-ink-mute">Price</dt>
            <dd
              className="mt-1 tabular min-w-0 break-words"
              data-testid="sf-card-price"
            >
              {product.priceSummary}
            </dd>
          </div>
        </dl>

        {product.variants.length > 0 && (
          <div className="min-w-0">
            <p className="mono-label text-ink-mute">
              {product.variantCount === 1
                ? "1 option"
                : `${product.variantCount} options`}
            </p>
            <ul className="grid min-w-0 gap-2 mt-2 body-s">
              {product.variants.map((variant) => (
                <li
                  key={variant.id}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-t pt-2"
                  data-testid="sf-variant-row"
                >
                  <span className="font-700 min-w-0 break-words">
                    {variant.label}
                  </span>
                  <span className="text-ink-mute min-w-0 break-words">
                    {variant.displayLabel}
                  </span>
                  <span
                    className="tabular min-w-0 break-words"
                    data-testid="sf-variant-price"
                  >
                    {publicPriceLabel(variant)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Never a dead end: an eligible product gets a button to its page, and
            an ineligible one states its status in words on the same line. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actionable ? (
            <Link
              className={`btn min-h-[44px] ${
                product.action === "BUY_NOW" ? "btn-primary" : "btn-secondary"
              }`}
              href={href}
              data-testid="sf-card-cta"
              aria-label={`${label}, ${product.displayName}`}
            >
              {label}
            </Link>
          ) : (
            <span
              className="body-s text-ink-mute"
              data-testid="sf-card-status"
            >
              {label}
            </span>
          )}
          {!actionable && (
            <Link
              className="btn btn-secondary min-h-[44px]"
              href={href}
              data-testid="sf-card-details"
              aria-label={`View details, ${product.displayName}`}
            >
              View details
            </Link>
          )}
        </div>
      </article>
    </li>
  );
}

export default StorefrontCard;
