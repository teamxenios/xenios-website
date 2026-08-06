import {
  EarlyAccessProductCard,
  type EarlyAccessCardProduct,
} from "./EarlyAccessProductCard";
import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";

/**
 * The Private Early Access catalogue grid.
 *
 * Renders every row it is given, including the ones nobody can buy today. A
 * held product is shown and labelled rather than hidden, because a customer who
 * cannot find a product they were told about assumes the site is broken, while a
 * customer who sees it marked unavailable has been told the truth.
 *
 * The grid computes no money and makes no availability decision. Both arrive
 * already decided, from the server row through one mapping seam. Compactness
 * lives here as column count only: four cards per row on a wide desktop, three
 * on a narrow one, two on a tablet, one on a phone.
 *
 * The fulfillment target sentence is deliberately NOT a prop here any more. It
 * is rendered once at catalogue level by the section, because a sentence about
 * the catalogue repeated on every one of twenty-two cards was most of the wall
 * this redesign removes.
 */

export interface EarlyAccessCatalogGridProps {
  products: readonly EarlyAccessCardProduct[];
  /**
   * How many server rows could not be rendered truthfully. Surfaced rather than
   * swallowed: a catalogue that is quietly three rows short is a defect that
   * looks like a design.
   */
  dropped?: number;
  /** Chosen quantity per variant id. Absent means nothing chosen yet. */
  quantities: Readonly<Record<string, EarlyAccessQuantity>>;
  /** Variant ids currently in the customer's selection. */
  selectedIds?: ReadonlySet<string>;
  onQuantityChange(variantId: string, quantity: EarlyAccessQuantity): void;
  onSelect(product: EarlyAccessCardProduct): void;
  onRemove?(product: EarlyAccessCardProduct): void;
  testId?: string;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function EarlyAccessCatalogGrid({
  products,
  dropped = 0,
  quantities,
  selectedIds = EMPTY_SELECTION,
  onQuantityChange,
  onSelect,
  onRemove = () => {},
  testId = "early-access-catalog",
}: EarlyAccessCatalogGridProps) {
  if (products.length === 0) {
    // An empty catalogue is stated plainly. It is never dressed up as "coming
    // soon", because the customer has a password and was told there is a
    // catalogue, and the honest reading is that something is wrong.
    return (
      <section data-testid={testId} data-row-count={0}>
        <p data-testid={`${testId}-empty`}>
          The research catalogue is not available right now. Nothing has been charged and no
          order has been placed. Please contact us and we will confirm what is available.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid={testId}
      data-row-count={products.length}
      className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {products.map((product) => (
        <EarlyAccessProductCard
          key={`${product.productId}:${product.variantId}`}
          testId={`${testId}-card-${product.variantId}`}
          product={product}
          quantity={quantities[product.variantId] ?? null}
          selected={selectedIds.has(product.variantId)}
          onQuantityChange={(quantity) => onQuantityChange(product.variantId, quantity)}
          onSelect={() => onSelect(product)}
          onRemove={() => onRemove(product)}
        />
      ))}

      {dropped > 0 ? (
        <p data-testid={`${testId}-dropped`} role="status">
          {dropped} {dropped === 1 ? "product is" : "products are"} temporarily not listed while we
          confirm their details.
        </p>
      ) : null}
    </section>
  );
}
