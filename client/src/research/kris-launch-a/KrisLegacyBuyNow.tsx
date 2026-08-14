import { useState } from "react";
import type { KrisCatalogDetailView } from "@shared/research/kris-launch-a/contract";
import { productRequestHref } from "@shared/research/product-request-sources";
import { EarlyAccessCheckoutJourney } from "../early-access/EarlyAccessCheckoutJourney";
import type { EarlyAccessCatalogSelection } from "../early-access/EarlyAccessCatalogSection";
import { EarlyAccessQuantitySelector } from "../early-access/EarlyAccessQuantitySelector";

function requestProductName(item: KrisCatalogDetailView): string {
  const specification = item.specification.trim();
  return specification === ""
    ? item.displayName
    : `${item.displayName} (${specification})`;
}

function requestHref(item: KrisCatalogDetailView): string {
  return productRequestHref("products", requestProductName(item));
}

/**
 * Convert only a server-approved exact Product Control handoff. The generated
 * Kris artifact cannot create this shape, and no name/SKU guess is made here.
 */
export function toKrisLegacyOrderSelection(
  item: KrisCatalogDetailView,
  quantity: number,
): EarlyAccessCatalogSelection | null {
  const order = item.legacyOrder;
  if (
    item.purchaseMode !== "direct_eligible" ||
    item.canBuyNow !== true ||
    order === null ||
    item.price.state !== "priced" ||
    order.unitPriceCents !== item.price.amountCents ||
    order.currency !== item.price.currency ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > order.quantityLimit
  ) {
    return null;
  }

  return {
    product: {
      productId: order.productId,
      variantId: order.variantId,
      name: item.displayName,
      strength: item.specification,
      unitPriceCents: order.unitPriceCents,
      currency: order.currency,
      description: item.suppliedNote,
      availability: "AVAILABLE",
      quantityLimit: order.quantityLimit,
    },
    quantity,
  };
}

export function KrisLegacyBuyNow({
  item,
  onAuthorityChanged,
}: Readonly<{
  item: KrisCatalogDetailView;
  onAuthorityChanged?: () => void;
}>) {
  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState<EarlyAccessCatalogSelection | null>(null);

  if (selection !== null) {
    return (
      <EarlyAccessCheckoutJourney
        selection={selection}
        onBack={() => setSelection(null)}
        onPriceChanged={() => {
          setSelection(null);
          onAuthorityChanged?.();
        }}
        testId="kris-legacy-order"
      />
    );
  }

  if (item.purchaseMode === "provider_workflow") {
    const pathway = item.pathway?.kind === item.purchaseMode ? item.pathway : null;
    return (
      <section className="card grid min-w-0 gap-3" data-testid="kris-purchase-provider">
        <h2 className="body-l font-700">{pathway?.headline ?? "Provider workflow required"}</h2>
        <p className="body-s text-ink-2">
          {pathway?.explanation ?? "This item is never available through direct Buy Now."}
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            className="btn btn-primary w-fit"
            href={requestHref(item)}
            data-testid="kris-request-provider"
          >
            Start Provider Workflow
          </a>
          <a className="btn btn-secondary w-fit" href="/research/member/metabolic-care">
            Explore Xenios Care
          </a>
        </div>
      </section>
    );
  }

  if (item.purchaseMode === "price_pending") {
    const pathway = item.pathway?.kind === item.purchaseMode ? item.pathway : null;
    return (
      <section className="card grid min-w-0 gap-3" data-testid="kris-purchase-price-pending">
        <h2 className="body-l font-700">{pathway?.headline ?? "Price Pending"}</h2>
        <p className="body-s text-ink-2">
          {pathway?.explanation ?? "No order can start until an approved price is available."}
        </p>
        <a
          className="btn btn-primary w-fit"
          href={requestHref(item)}
          data-testid="kris-request-price"
        >
          {pathway?.request.label ?? "Request price"}
        </a>
      </section>
    );
  }

  if (item.purchaseMode === "classification_pending") {
    const pathway = item.pathway?.kind === item.purchaseMode ? item.pathway : null;
    return (
      <section className="card grid min-w-0 gap-3" data-testid="kris-purchase-pending">
        <h2 className="body-l font-700">{pathway?.headline ?? "Pending Activation"}</h2>
        <p className="body-s text-ink-2">
          {pathway?.explanation ?? "This item is visible, but direct purchase is not active."}
        </p>
        <a
          className="btn btn-primary w-fit"
          href={requestHref(item)}
          data-testid="kris-request-activation"
        >
          {pathway?.request.label ?? "Register interest"}
        </a>
      </section>
    );
  }

  const next = toKrisLegacyOrderSelection(item, quantity);
  if (next === null || item.legacyOrder === null) {
    return (
      <section className="card grid min-w-0 gap-3" data-testid="kris-purchase-revalidation">
        <h2 className="body-l font-700">Pending Activation</h2>
        <p className="body-s text-ink-2">Product Control is being revalidated for this exact variant.</p>
        <a
          className="btn btn-primary w-fit"
          href={requestHref(item)}
          data-testid="kris-request-item"
        >
          Request this item
        </a>
      </section>
    );
  }

  return (
    <section className="card grid min-w-0 gap-4" data-testid="kris-purchase-direct">
      <div>
        <p className="mono-label text-pulse">Direct eligible</p>
        <h2 className="body-l font-700 mt-2">Buy this exact variant</h2>
        <p className="body-s text-ink-2 mt-1">
          Buy Now creates one Early Access order and a manual-payment invoice. It does not charge you.
        </p>
      </div>
      <EarlyAccessQuantitySelector
        value={quantity}
        maxQuantity={item.legacyOrder.quantityLimit}
        onChange={setQuantity}
        testId="kris-buy-now-quantity"
      />
      <button
        type="button"
        className="btn btn-primary w-fit"
        onClick={() => setSelection(next)}
        data-testid="kris-buy-now"
      >
        Buy Now
      </button>
      <p className="body-s text-ink-mute">
        Product Control, price, availability, quantity, agreements, shipping, and release are checked again before the order exists.
      </p>
    </section>
  );
}

export default KrisLegacyBuyNow;
