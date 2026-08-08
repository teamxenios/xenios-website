import type { EarlyAccessCartLineRefusal } from "@shared/research/early-access-cart";
import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";

const COPY: Record<EarlyAccessCartLineRefusal["code"], string> = {
  PRODUCT_NOT_FOUND: "This item is no longer in the current catalogue.",
  PRODUCT_HELD: "This item is currently held and cannot be ordered.",
  RELEASE_REQUIRED: "This item is not released for ordering.",
  RELEASE_STALE: "This item's release changed. Review the current catalogue.",
  RELEASE_REVOKED: "This item's release was withdrawn.",
  PRICE_CHANGED: "The unit price changed. Review the current catalogue price.",
  QUANTITY_INVALID: "The selected quantity is not currently available.",
  SUPPLIER_UNAVAILABLE: "The supplier route is not currently available.",
  SHIPPING_UNAVAILABLE: "This destination is not currently served.",
  CURRENCY_MISMATCH: "This item's currency does not match the cart.",
};

export function EarlyAccessCartLineIssues({
  issues,
  products,
  onReturn,
}: Readonly<{
  issues: readonly EarlyAccessCartLineRefusal[];
  products: readonly EarlyAccessCardProduct[];
  onReturn(): void;
}>) {
  return (
    <section className="card border-[var(--pulse)] p-4" role="alert">
      <h2 className="body-m font-700">Review these cart items</h2>
      <ul className="mt-3 grid gap-3">
        {issues.map((issue) => {
          const product = products.find(
            (candidate) =>
              candidate.productId === issue.productId && candidate.variantId === issue.variantId,
          );
          return (
            <li key={`${issue.productId}:${issue.variantId}:${issue.code}`} className="body-s">
              <strong>{product?.name ?? issue.productId}</strong>
              {product?.strength ? ` · ${product.strength}` : ""}: {COPY[issue.code]}
              {issue.code === "PRICE_CHANGED" && typeof issue.currentUnitPriceCents === "number" ? (
                <> Current server unit price: {(issue.currentUnitPriceCents / 100).toLocaleString("en-US", { style: "currency", currency: issue.currency ?? "USD" })}.</>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn-secondary mt-4" onClick={onReturn}>
        Return to catalogue
      </button>
    </section>
  );
}
