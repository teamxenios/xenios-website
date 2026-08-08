import type { BrowserCart, BrowserCartItem } from "./cartStore";

export type CartDisplayProduct = Readonly<{
  productId: string;
  variantId: string;
  name: string;
  strength: string;
  unitPriceCents: number | null;
  currency: string;
  availability: string;
}>;

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

export function EarlyAccessCartPanel({
  cart,
  products,
  onUpdate,
  onRemove,
  onContinueShopping,
  onContinue,
}: Readonly<{
  cart: BrowserCart;
  products: readonly CartDisplayProduct[];
  onUpdate(item: BrowserCartItem): void;
  onRemove(item: BrowserCartItem): void;
  onContinueShopping(): void;
  onContinue(): void;
}>) {
  const rows = cart.items.map((item) => ({ item, product: products.find((product) => product.productId === item.productId && product.variantId === item.variantId) ?? null }));
  return (
    <section className="grid gap-5" aria-labelledby="early-access-cart-heading">
      <div>
        <p className="mono-cap text-pulse">Private Early Access</p>
        <h2 id="early-access-cart-heading" className="display-xs mt-2">Your cart</h2>
        <p className="body-s text-ink-mute mt-2">Prices shown here are the latest catalogue unit prices. The server confirms every line and the final payable total before an order is created.</p>
      </div>
      {rows.length === 0 ? (
        <div className="card p-5"><p>Your cart is empty.</p><button type="button" className="btn btn-primary mt-4" onClick={onContinueShopping}>Browse products</button></div>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ item, product }) => (
            <article key={`${item.productId}:${item.variantId}`} className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <h3 className="body-m font-700">{product?.name ?? item.productId}</h3>
                <p className="mono-label text-ink-mute">{product?.strength ?? item.variantId}</p>
                {product?.unitPriceCents !== null && product?.unitPriceCents !== undefined ? (
                  <p className="body-s mt-2">{money(product.unitPriceCents, product.currency)} per unit</p>
                ) : <p className="body-s text-pulse mt-2">This line must be reviewed again.</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`cart-qty-${item.variantId}`}>Quantity for {product?.name ?? item.variantId}</label>
                <select id={`cart-qty-${item.variantId}`} className="input-field w-24" value={item.quantity}
                  onChange={(event) => onUpdate({ ...item, quantity: Number(event.target.value) })}>
                  {[1, 2, 3].map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" onClick={() => onRemove(item)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--rule)] pt-4">
        <button type="button" className="btn btn-secondary" onClick={onContinueShopping}>Continue shopping</button>
        <button type="button" className="btn btn-primary" disabled={rows.length === 0 || rows.some((row) => row.product === null || row.product.unitPriceCents === null)} onClick={onContinue}>
          Continue to shipping
        </button>
      </div>
    </section>
  );
}
