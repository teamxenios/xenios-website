import type {
  MasterOfferingCardView,
  MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import { MASTER_OFFERING_PRICE_ON_REQUEST_LABEL } from "@shared/research/master-offerings/pricing-contract";
import {
  CUSTOMER_ACTION_LABELS,
  customerActionFromMasterOfferingAction,
} from "@shared/research/launch/customer-action";
import { Link } from "wouter";
import { ResearchStatusBadge, type BadgeTone } from "../ui/kit";
import { fullCatalogProductHref } from "./integration-packet";

/**
 * State tone is a second signal, never the only one. Every card also carries
 * the state in words, so the meaning survives colour blindness, a greyscale
 * print, and a screen reader.
 */
const STATE_TONE: Readonly<Record<MasterOfferingCardView["displayState"], BadgeTone>> =
  {
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

/**
 * The card-level control for one variant's server-resolved action, stated in
 * the six-word launch vocabulary.
 *
 * This component decides nothing. The action kind, its label, its href, and
 * the amount inside `add_to_cart` all arrived resolved from the server; the
 * six-action translation may restate or downgrade that verdict but can never
 * upgrade it, so a card cannot look more purchasable than the detail page is.
 *
 * Buy Now deliberately navigates to the detail page rather than adding from
 * the card: the quantity band and the cart handoff live there, on the exact
 * variant, and a one-click add from a browsing list would be a purchase with
 * no quantity the buyer ever chose.
 */
function VariantActionControl({
  product,
  variant,
}: {
  product: MasterOfferingCardView;
  variant: MasterOfferingVariantSummary;
}) {
  const action = variant.action;
  const customerAction = customerActionFromMasterOfferingAction(
    action,
    variant.price,
  );
  const name = `${product.displayName}, ${variant.label}`;

  if (action.kind === "add_to_cart" && customerAction === "BUY_NOW") {
    return (
      <Link
        className="btn btn-primary min-h-[44px]"
        href={fullCatalogProductHref(product.family, product.slug)}
        data-testid="mo-card-buy-now"
        data-customer-action={customerAction}
        aria-label={`${CUSTOMER_ACTION_LABELS.BUY_NOW}, ${name}`}
      >
        {CUSTOMER_ACTION_LABELS.BUY_NOW}
      </Link>
    );
  }

  if (action.kind === "none") {
    return (
      <span
        className="body-s text-ink-mute"
        data-testid="mo-card-no-action"
        data-customer-action={customerAction}
      >
        {CUSTOMER_ACTION_LABELS.NOT_AVAILABLE}
      </span>
    );
  }

  if (action.kind === "add_to_cart") {
    // A resolved purchase whose price the vocabulary refused (a malformed
    // amount, or a price view that contradicts it) renders as the on-request
    // state, never as a Buy button and never as silence. The detail page
    // re-resolves and remains the authority.
    return (
      <Link
        className="btn btn-secondary min-h-[44px]"
        href={fullCatalogProductHref(product.family, product.slug)}
        data-testid="mo-card-action"
        data-customer-action={customerAction}
        aria-label={`${CUSTOMER_ACTION_LABELS.REQUEST_QUOTE}, ${name}`}
      >
        {CUSTOMER_ACTION_LABELS.REQUEST_QUOTE}
      </Link>
    );
  }

  // The request, care, held, and updates family: the server named the path
  // and the href; the card restates it without inventing a purchase.
  return (
    <a
      className="btn btn-secondary min-h-[44px]"
      href={action.href}
      data-testid="mo-card-action"
      data-customer-action={customerAction}
      aria-label={`${action.label}, ${name}`}
    >
      {action.label}
    </a>
  );
}

export function MasterOfferingVariantRow({
  product,
  variant,
}: {
  product: MasterOfferingCardView;
  variant: MasterOfferingVariantSummary;
}) {
  const price =
    variant.price.state === "priced"
      ? variant.price.display
      : MASTER_OFFERING_PRICE_ON_REQUEST_LABEL;
  return (
    <li
      className="grid min-w-0 gap-2 border-t pt-2 body-s"
      data-testid="mo-variant-row"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        {/* A long variant label wraps inside the card. It never widens the row,
            because a row wider than the phone is a page that scrolls sideways. */}
        <span className="font-700 min-w-0 break-words">{variant.label}</span>
        <span className="text-ink-mute min-w-0 break-words">
          {variant.displayLabel}
        </span>
        <span className="tabular min-w-0 break-words" data-testid="mo-variant-price">
          {price}
        </span>
      </div>
      {/* The action sits on its own wrapping line so a 44px touch target never
          fights the price for width on a phone. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <VariantActionControl product={product} variant={variant} />
      </div>
    </li>
  );
}

/**
 * One catalog card. It states the family, the truthful availability, the
 * strengths, the approved prices, and each variant's server-resolved action in
 * the six-word launch vocabulary. Every action arrives resolved; the card
 * renders it and resolves nothing. The exact purchase, with its quantity band,
 * still happens only on the detail surface.
 */
export function MasterOfferingCard({
  product,
}: {
  product: MasterOfferingCardView;
}) {
  const summary = product.priceSummary;
  const headingId = `mo-card-${product.id}`;
  return (
    <li className="min-w-0">
      <article
        className="card grid min-w-0 gap-3"
        aria-labelledby={headingId}
        data-testid="mo-card"
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono-label text-ink-mute min-w-0 break-words">
              {product.familyLabel}
            </p>
            <h3 id={headingId} className="body-l font-700 mt-1 min-w-0 break-words">
              {/* The v2 detail page, family segment and all. The v1 product
                  page cannot serve these slugs: they are family-prefixed and
                  keyed in a different store, so it answers "unavailable" and
                  the card reads as a dead link. A wouter Link keeps this a
                  client-side navigation, like every other member page. */}
              <Link
                className="inline-flex min-h-[44px] min-w-[44px] items-center underline-offset-4 hover:underline"
                href={fullCatalogProductHref(product.family, product.slug)}
                data-testid="mo-card-link"
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
            <dd className="mt-1 tabular min-w-0 break-words" data-testid="mo-card-price">
              {summary.display}
            </dd>
          </div>
        </dl>

        {product.variants.length > 0 && (
          <div className="min-w-0">
            <p className="mono-label text-ink-mute">
              {product.variantCount === 1
                ? "1 variant"
                : `${product.variantCount} variants`}
            </p>
            <ul className="grid min-w-0 gap-2 mt-2">
              {product.variants.map((variant) => (
                <MasterOfferingVariantRow
                  key={variant.id}
                  product={product}
                  variant={variant}
                />
              ))}
            </ul>
          </div>
        )}
      </article>
    </li>
  );
}
