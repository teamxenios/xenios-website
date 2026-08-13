import type {
  MasterOfferingCardView,
  MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import { MASTER_OFFERING_PRICE_ON_REQUEST_LABEL } from "@shared/research/master-offerings/pricing-contract";
import { ResearchStatusBadge, type BadgeTone } from "../ui/kit";
import { memberOfferingDetailHref } from "./integration-packet";

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

export function MasterOfferingVariantRow({
  variant,
}: {
  variant: MasterOfferingVariantSummary;
}) {
  const price =
    variant.price.state === "priced"
      ? variant.price.display
      : MASTER_OFFERING_PRICE_ON_REQUEST_LABEL;
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-2 body-s"
      data-testid="mo-variant-row"
    >
      <span className="font-700">{variant.label}</span>
      <span className="text-ink-mute">{variant.displayLabel}</span>
      <span className="tabular" data-testid="mo-variant-price">
        {price}
      </span>
    </li>
  );
}

/**
 * One catalog card. It states the family, the truthful availability, the
 * strengths, and the approved prices, and it carries no purchase action: an
 * exact variant action is resolved by the server on the detail surface only.
 */
export function MasterOfferingCard({
  product,
}: {
  product: MasterOfferingCardView;
}) {
  const summary = product.priceSummary;
  const headingId = `mo-card-${product.id}`;
  return (
    <li>
      <article
        className="card grid gap-3"
        aria-labelledby={headingId}
        data-testid="mo-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mono-label text-ink-mute">{product.familyLabel}</p>
            <h3 id={headingId} className="body-l font-700 mt-1">
              <a
                className="underline-offset-4 hover:underline"
                href={memberOfferingDetailHref(product.family, product.slug)}
              >
                {product.displayName}
              </a>
            </h3>
          </div>
          <ResearchStatusBadge
            label={product.displayLabel}
            tone={STATE_TONE[product.displayState]}
          />
        </div>

        <p className="body-s text-ink-2">{product.stateExplanation}</p>

        <dl className="grid gap-3 body-s sm:grid-cols-2">
          <div>
            <dt className="mono-label text-ink-mute">Category</dt>
            <dd className="mt-1">
              {product.subcategory
                ? `${product.category}, ${product.subcategory}`
                : product.category}
            </dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Price</dt>
            <dd className="mt-1 tabular" data-testid="mo-card-price">
              {summary.display}
            </dd>
          </div>
        </dl>

        {product.variants.length > 0 && (
          <div>
            <p className="mono-label text-ink-mute">
              {product.variantCount === 1
                ? "1 variant"
                : `${product.variantCount} variants`}
            </p>
            <ul className="grid gap-2 mt-2">
              {product.variants.map((variant) => (
                <MasterOfferingVariantRow key={variant.id} variant={variant} />
              ))}
            </ul>
          </div>
        )}
      </article>
    </li>
  );
}
