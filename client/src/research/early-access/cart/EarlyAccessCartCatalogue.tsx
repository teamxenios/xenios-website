import { useEffect, useMemo, useState } from "react";
import {
  EarlyAccessAssistedOrderQuantityAction,
  type EarlyAccessCardProduct,
} from "../EarlyAccessProductCard";
import { earlyAccessCategoryLabel } from "../earlyAccessCatalogView";
import {
  EarlyAccessQuantitySelector,
  type EarlyAccessQuantity,
} from "../EarlyAccessQuantitySelector";
import type { BrowserCart, BrowserCartItem } from "./cartStore";
import { browserCartUnitCount } from "./cartStore";
import { routeEarlyAccessQuantity } from "@shared/research/early-access-quantity";

export type EarlyAccessOrderRequest = Readonly<{
  productId: string;
  variantId: string;
  requestedQuantity: number;
}>;

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

function keyOf(product: Pick<EarlyAccessCardProduct, "productId" | "variantId">): string {
  return `${product.productId}\u0000${product.variantId}`;
}

export function EarlyAccessCartCatalogue({
  products,
  cart,
  onPut,
  onRemove,
  onOpenCart,
}: Readonly<{
  products: readonly EarlyAccessCardProduct[];
  cart: BrowserCart;
  onPut(item: BrowserCartItem): void;
  onRemove(productId: string, variantId: string): void;
  onOpenCart(): void;
  /**
   * Compatibility callback for older parents. High quantities now follow the
   * capability-gated canonical assisted-order link and are never represented
   * as transferred client state.
   */
  onRequestOrder(request: EarlyAccessOrderRequest): void;
}>) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "held">("all");
  const [draftQuantities, setDraftQuantities] = useState<Record<string, EarlyAccessQuantity>>({});
  const [removedDirectCartQuantities, setRemovedDirectCartQuantities] = useState<
    Record<string, EarlyAccessQuantity>
  >({});

  const cartByKey = useMemo(
    () => new Map(cart.items.map((item) => [`${item.productId}\u0000${item.variantId}`, item])),
    [cart],
  );
  const productsByKey = useMemo(
    () => new Map(products.map((product) => [keyOf(product), product])),
    [products],
  );
  const overLimitCartItems = useMemo(
    () => cart.items.filter((item) => {
      const product = productsByKey.get(keyOf(item));
      if (
        product === undefined ||
        product.availability === "TEMPORARILY_HELD" ||
        product.unitPriceCents === null
      ) {
        return false;
      }
      return routeEarlyAccessQuantity(item.quantity, product.quantityLimit)?.kind ===
        "order_request";
    }),
    [cart.items, productsByKey],
  );

  useEffect(() => {
    if (overLimitCartItems.length === 0) return;

    // The browser cart is only a convenience copy. Reconcile it against the
    // current server-projected ceiling before the customer can open the direct
    // checkout, while retaining the requested number solely as local display
    // state for the assisted-order explanation below.
    setDraftQuantities((current) => {
      const next = { ...current };
      for (const item of overLimitCartItems) next[keyOf(item)] = item.quantity;
      return next;
    });
    setRemovedDirectCartQuantities((current) => {
      const next = { ...current };
      for (const item of overLimitCartItems) next[keyOf(item)] = item.quantity;
      return next;
    });
    for (const item of overLimitCartItems) {
      onRemove(item.productId, item.variantId);
    }
  }, [onRemove, overLimitCartItems]);
  const counts = useMemo(
    () => ({
      all: products.length,
      available: products.filter((product) => product.availability !== "TEMPORARILY_HELD").length,
      held: products.filter((product) => product.availability === "TEMPORARILY_HELD").length,
    }),
    [products],
  );
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const available = product.availability !== "TEMPORARILY_HELD";
      if (filter === "available" && !available) return false;
      if (filter === "held" && available) return false;
      if (!term) return true;
      return [
        product.name,
        product.strength,
        product.description,
        earlyAccessCategoryLabel(product.category) ?? "",
      ]
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [filter, products, query]);

  return (
    <section className="grid gap-5" aria-labelledby="early-access-catalogue-heading">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="early-access-cart-search">Search products</label>
        <input
          id="early-access-cart-search"
          className="input-field min-w-0 flex-1"
          style={{ maxWidth: 420 }}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products..."
        />
        {(["all", "available", "held"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={`btn ${filter === value ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "All" : value === "available" ? "Available" : "Held"} {counts[value]}
          </button>
        ))}
      </div>

      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--rule)] bg-[var(--paper)] p-3 shadow-sm">
        <p className="body-s">
          <strong>{cart.items.length}</strong> products · <strong>{browserCartUnitCount(cart)}</strong> units
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={cart.items.length === 0 || overLimitCartItems.length > 0}
          onClick={onOpenCart}
        >
          View cart ({cart.items.length})
        </button>
      </div>

      {visible.length === 0 ? (
        <p role="status" className="body-s text-ink-mute">No products match this search.</p>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => {
            const key = keyOf(product);
            const item = cartByKey.get(key) ?? null;
            const held = product.availability === "TEMPORARILY_HELD" || product.unitPriceCents === null;
            const quantity = item?.quantity ?? draftQuantities[key] ?? 1;
            const route = routeEarlyAccessQuantity(quantity, product.quantityLimit);
            const needsOrderRequest = route?.kind === "order_request";
            const category = earlyAccessCategoryLabel(product.category);
            return (
              <article key={key} className="card grid min-w-0 content-start gap-2 p-4">
                {category !== null ? (
                  <p
                    className="mono-label min-w-0 break-words text-ink-mute"
                    data-testid={`cart-catalogue-category-${product.variantId}`}
                  >
                    {category}
                  </p>
                ) : null}
                <h2 className="body-m font-700 leading-snug">{product.name}</h2>
                <p className="mono-label text-ink-mute">{product.strength}</p>
                {product.description ? (
                  <p className="body-xs min-w-0 break-words text-ink-mute">{product.description}</p>
                ) : null}
                {product.unitPriceCents === null ? (
                  <p className="body-s text-ink-mute">Not available to order</p>
                ) : (
                  <p className="body-s font-700">{money(product.unitPriceCents, product.currency)} per unit</p>
                )}

                {held ? (
                  <p className="body-s text-pulse">Temporarily unavailable</p>
                ) : (
                  <>
                    <EarlyAccessQuantitySelector
                      value={quantity as EarlyAccessQuantity}
                      onChange={(next) => {
                        setDraftQuantities((current) => ({ ...current, [key]: next }));
                        if (item !== null) {
                          const nextRoute = routeEarlyAccessQuantity(
                            next,
                            product.quantityLimit,
                          );
                          if (nextRoute?.kind === "order_request") {
                            setRemovedDirectCartQuantities((current) => ({
                              ...current,
                              [key]: next,
                            }));
                            onRemove(item.productId, item.variantId);
                          } else if (nextRoute?.kind === "direct_cart") {
                            setRemovedDirectCartQuantities((current) => {
                              if (!(key in current)) return current;
                              const nextState = { ...current };
                              delete nextState[key];
                              return nextState;
                            });
                            onPut({ ...item, quantity: nextRoute.quantity });
                          }
                        } else if (
                          routeEarlyAccessQuantity(next, product.quantityLimit)?.kind ===
                          "direct_cart"
                        ) {
                          setRemovedDirectCartQuantities((current) => {
                            if (!(key in current)) return current;
                            const nextState = { ...current };
                            delete nextState[key];
                            return nextState;
                          });
                        }
                      }}
                      testId={`cart-catalogue-quantity-${product.variantId}`}
                    />
                    {needsOrderRequest ? (
                      <>
                        {removedDirectCartQuantities[key] !== undefined ? (
                          <p
                            className="body-xs min-w-0 break-words text-ink-2"
                            role="status"
                            data-testid={`cart-catalogue-${product.variantId}-removed-from-direct-cart`}
                          >
                            This line was removed from the direct cart because its quantity is
                            above the current server limit. No order request was sent and nothing
                            was transferred to assisted ordering.
                          </p>
                        ) : null}
                        <EarlyAccessAssistedOrderQuantityAction
                          testId={`cart-catalogue-${product.variantId}`}
                        />
                      </>
                    ) : (
                      <button
                        type="button"
                        className={`btn mt-1 w-full ${item ? "btn-secondary" : "btn-primary"}`}
                        onClick={() => {
                          if (item !== null) {
                            onRemove(item.productId, item.variantId);
                          } else if (route?.kind === "direct_cart") {
                            setRemovedDirectCartQuantities((current) => {
                              if (!(key in current)) return current;
                              const nextState = { ...current };
                              delete nextState[key];
                              return nextState;
                            });
                            onPut({
                              productId: product.productId,
                              variantId: product.variantId,
                              quantity: route.quantity,
                            });
                          }
                        }}
                      >
                        {item ? "Remove from cart" : "Add to cart"}
                      </button>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
