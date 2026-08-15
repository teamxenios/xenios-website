import { useEffect, useMemo, useState } from "react";
import type {
  MasterOfferingAction,
  MasterOfferingDetailView,
  MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_PRICE_BASIS_LABEL,
  MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
} from "@shared/research/master-offerings/pricing-contract";
import { ResearchSecureNotice, ResearchStatusBadge } from "../ui/kit";
import {
  purchaseQuantityControl,
  type AcceptedExactVariantQuantityCapability,
} from "./integration-packet";

/**
 * The exact-variant surface.
 *
 * Everything consequential here is decided by the server: the action kind, its
 * label, its href, and the amount inside `add_to_cart`. This file chooses
 * nothing. It renders one action for one selected variant, and it renders a
 * quantity control only when the server said `add_to_cart` and an accepted
 * exact-variant quantity capability matches that exact identity.
 *
 * QUANTITY IS NOT A ROUTE. Under the founder quantity decision the normal band
 * is 1 through 50 with no review threshold inside it, and this lane could not
 * create one even if it wanted to: quantity is not an input to action
 * resolution anywhere in the catalog. The action is already decided before a
 * quantity exists, and the band comes from the injected capability rather than
 * from any constant here.
 */

export function priceLabel(variant: MasterOfferingVariantView): string {
  return variant.price.state === "priced"
    ? variant.price.display
    : MASTER_OFFERING_PRICE_ON_REQUEST_LABEL;
}

/** The accessible name every control carries, so a CTA is never a bare verb. */
function actionName(productName: string, variantLabel: string, label: string) {
  return `${label}, ${productName}, ${variantLabel}`;
}

export function MasterOfferingVariantAction({
  productName,
  variant,
  capability = null,
  quantity,
  onQuantityChange,
  onAddToCart,
}: {
  productName: string;
  variant: MasterOfferingVariantView;
  capability?: AcceptedExactVariantQuantityCapability | null;
  quantity?: number;
  onQuantityChange?: (next: number) => void;
  onAddToCart?: (action: Extract<MasterOfferingAction, { kind: "add_to_cart" }>, quantity: number) => void;
}) {
  const action = variant.action;
  const control = purchaseQuantityControl(action, capability);

  if (action.kind === "none") {
    return (
      <p className="body-s text-ink-mute" data-testid="mo-no-action">
        This variant is not available, and there is nothing to request right
        now.
      </p>
    );
  }

  if (action.kind === "add_to_cart") {
    const chosen = quantity ?? (control.visible ? control.minimum : 1);
    const quantityId = `mo-quantity-${variant.id}`;
    // Refuse, never clamp. Silently rewriting 51 to 50 would tell the buyer
    // they asked for something they did not. The server re-reads the quantity
    // and remains the authority; this only stops an obviously out-of-band
    // submit from making a pointless round trip.
    const outOfBand =
      control.visible &&
      (!Number.isSafeInteger(chosen) ||
        chosen < control.minimum ||
        chosen > control.maximum);
    return (
      <div className="grid min-w-0 gap-3" data-testid="mo-variant-action">
        {control.visible && (
          <label className="grid min-w-0 gap-2 max-w-[12rem]" htmlFor={quantityId}>
            <span className="form-label">
              Quantity, {productName}, {variant.label}
            </span>
            <input
              id={quantityId}
              className="input-field"
              type="number"
              inputMode="numeric"
              min={control.minimum}
              max={control.maximum}
              step={1}
              value={chosen}
              data-testid="mo-quantity"
              aria-invalid={outOfBand || undefined}
              aria-describedby={outOfBand ? `${quantityId}-band` : undefined}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isSafeInteger(next)) onQuantityChange?.(next);
              }}
            />
            {outOfBand && (
              <span
                id={`${quantityId}-band`}
                className="body-s text-ink-mute"
                data-testid="mo-quantity-band-note"
              >
                Choose between {control.minimum} and {control.maximum}.
              </span>
            )}
          </label>
        )}
        <button
          type="button"
          className="btn btn-primary min-h-[44px]"
          data-testid="mo-cta"
          disabled={outOfBand}
          aria-label={actionName(productName, variant.label, action.label)}
          onClick={() => {
            if (outOfBand) return;
            onAddToCart?.(action, chosen);
          }}
        >
          {action.label}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="mo-variant-action">
      <a
        className="btn btn-secondary min-h-[44px]"
        href={action.href}
        data-testid="mo-cta"
        aria-label={actionName(productName, variant.label, action.label)}
      >
        {action.label}
      </a>
    </div>
  );
}

export function MasterOfferingDetail({
  product,
  capabilityFor,
  onAddToCart,
}: {
  product: MasterOfferingDetailView;
  /**
   * Supplied by the composition root from the accepted quantity authority. It
   * is deliberately not derivable from anything on this page.
   */
  capabilityFor?: (
    variant: MasterOfferingVariantView,
  ) => AcceptedExactVariantQuantityCapability | null;
  onAddToCart?: (
    action: Extract<MasterOfferingAction, { kind: "add_to_cart" }>,
    quantity: number,
  ) => void;
}) {
  const variants = product.variants;
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState<number | undefined>(undefined);

  const selected = useMemo(
    () => variants.find((entry) => entry.id === selectedId) ?? variants[0],
    [variants, selectedId],
  );

  useEffect(() => {
    // A new variant is a new price and a new authority verdict. Carrying the
    // previous quantity across would silently apply one variant's limit to
    // another.
    setQuantity(undefined);
  }, [selectedId]);

  const capability = selected && capabilityFor ? capabilityFor(selected) : null;

  return (
    <main className="grid min-w-0 gap-6">
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
        <section aria-labelledby="mo-detail-variants" className="grid min-w-0 gap-4">
          <h2 id="mo-detail-variants" className="body-l font-700">
            Choose a variant
          </h2>

          <fieldset
            className="grid min-w-0 gap-2 border-0 p-0"
            data-testid="mo-variant-selector"
          >
            {/* A legend does not shrink the way a block does: it is sized by
                its own content, so a long product name here dragged the whole
                page wider than the phone. max-w-full plus a break is what
                stops one product name from making the page scroll sideways. */}
            <legend className="form-label max-w-full min-w-0 break-words">
              Variants of {product.displayName}
            </legend>
            {variants.map((variant) => {
              const inputId = `mo-variant-${variant.id}`;
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
                      name="mo-variant"
                      value={variant.id}
                      checked={variant.id === selected.id}
                      aria-label={`${variant.label}, ${product.displayName}, ${variant.displayLabel}`}
                      onChange={() => setSelectedId(variant.id)}
                    />
                    <span className="font-700 min-w-0 break-words">{variant.label}</span>
                  </span>
                  <span className="text-ink-mute min-w-0 break-words">
                    {variant.displayLabel}
                  </span>
                  <span
                    className="tabular min-w-0 break-words"
                    data-testid="mo-detail-variant-price"
                  >
                    {priceLabel(variant)}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="card grid min-w-0 gap-3" data-testid="mo-selected-variant">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
              <p className="body-l font-700 min-w-0 break-words">
                {selected.label}
              </p>
              <p className="tabular min-w-0 break-words" data-testid="mo-selected-price">
                {priceLabel(selected)}
              </p>
            </div>
            {selected.price.state === "priced" && (
              <p
                className="body-s text-ink-2 min-w-0 break-words"
                data-testid="mo-selected-price-basis"
              >
                {MASTER_OFFERING_PRICE_BASIS_LABEL}
              </p>
            )}
            <MasterOfferingVariantAction
              productName={product.displayName}
              variant={selected}
              capability={capability}
              quantity={quantity}
              onQuantityChange={setQuantity}
              onAddToCart={onAddToCart}
            />
          </div>
        </section>
      )}

      <section aria-labelledby="mo-detail-disclosures" className="grid min-w-0 gap-2">
        <h2 id="mo-detail-disclosures" className="body-l font-700">
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
          Private catalog. Not indexed, and not for redistribution.
        </ResearchSecureNotice>
      </section>
    </main>
  );
}

export default MasterOfferingDetail;
