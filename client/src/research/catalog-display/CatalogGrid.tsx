// The catalog grid: every displayable product, with its truthful state.
//
// The component is deliberately data-in, event-out. It takes the wire DTOs the
// catalog display API returns and renders them; it fetches nothing, holds no
// catalog data of its own, and cannot construct a product. That is what keeps
// the browser bundle free of the catalog (see the security note in
// server/research/index.ts: a Vite SPA ships everything it imports).
//
// The four states are all honest:
//   loading  a role=status region that says it is loading, plus skeleton
//            cards that contain no numbers and no product names;
//   error    a role=alert with the approved sentence, never a raw error;
//   empty    the approved sentence explaining that an unlisted record is
//            unlisted because its documentation is not on file, not because
//            something broke;
//   loaded   the product cards.
//
// Accessibility: a labelled section, a real list, one heading per card, a real
// button per card with an accessible name that includes the product, a visible
// focus ring, no colour-only signalling, and no fixed widths anywhere, so it
// holds at 320px and at large zoom.

import type {
  CatalogVisibilityBreadth,
  DisplayProductCard,
} from "@shared/research/catalog-display/contract";
import { CatalogAmount } from "./CatalogAmount";
import { OfferModeBadge } from "./OfferModeBadge";
import {
  CATALOG_DISPLAY_NOTE,
  CATALOG_EMPTY_COPY,
  CATALOG_ERROR_COPY,
  CATALOG_LOADING_COPY,
  PEPTIDE_PRICE_PENDING_COPY,
} from "./labels";

export interface CatalogGridProps {
  products?: readonly DisplayProductCard[];
  loading?: boolean;
  error?: boolean;
  /** Shown as a quiet caption so a viewer can tell which breadth they are on. */
  breadth?: CatalogVisibilityBreadth;
  heading?: string;
  onSelect?: (product: DisplayProductCard) => void;
  testId?: string;
}

const HEADING_ID = "research-catalog-display-heading";

function SkeletonCard({ testId }: { testId: string }) {
  return (
    <li className="card grid content-start gap-3" data-testid={testId} aria-hidden="true">
      <span className="h-[1.25em] w-2/3 max-w-full animate-pulse rounded bg-current opacity-10" />
      <span className="h-[1em] w-1/2 max-w-full animate-pulse rounded bg-current opacity-10" />
      <span className="h-[1em] w-1/3 max-w-full animate-pulse rounded bg-current opacity-10" />
    </li>
  );
}

export function ProductCardTile({
  product,
  onSelect,
  testId,
}: {
  product: DisplayProductCard;
  onSelect?: (product: DisplayProductCard) => void;
  testId: string;
}) {
  const headingId = `${testId}-name`;
  return (
    <li className="card grid min-w-0 content-start gap-3" data-testid={testId}>
      <div className="grid gap-1">
        <p className="mono-label text-ink-mute">{product.category}</p>
        <h3 id={headingId} className="body-l font-700 min-w-0 break-words">
          {product.displayName}
        </h3>
        {product.brand && (
          <p className="body-s text-ink-mute min-w-0 break-words">{product.brand}</p>
        )}
      </div>

      {product.positioning && (
        <p className="body-s text-ink-2 min-w-0 break-words">{product.positioning}</p>
      )}

      <OfferModeBadge availability={product.availability} testId={`${testId}-availability`} />

      <div className="grid gap-1">
        <p className="mono-label text-ink-mute" id={`${testId}-amount-label`}>
          Member amount
        </p>
        {product.lane === "peptide" ? (
          // Structural, not a per record choice: the peptide customer
          // projection carries no money field, so there is nothing to format.
          // The surface says why instead of showing a placeholder number.
          <p className="body-s text-ink-2 min-w-0 break-words" data-testid={`${testId}-amount-pending`}>
            {PEPTIDE_PRICE_PENDING_COPY}
          </p>
        ) : (
          <CatalogAmount amount={product.price} testId={`${testId}-amount`} />
        )}
      </div>

      {product.variantCount > 0 && (
        <p className="body-s text-ink-mute" data-testid={`${testId}-variant-count`}>
          {product.variantCount === 1
            ? "1 presentation on file"
            : `${product.variantCount} presentations on file`}
        </p>
      )}

      {onSelect && (
        <button
          type="button"
          className="btn btn-secondary mt-auto justify-self-start"
          data-testid={`${testId}-select`}
          onClick={() => onSelect(product)}
        >
          {`View ${product.displayName}`}
        </button>
      )}
    </li>
  );
}

export function CatalogGrid({
  products,
  loading = false,
  error = false,
  breadth,
  heading = "Research catalog",
  onSelect,
  testId = "catalog-grid",
}: CatalogGridProps) {
  const gridClass = "mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <section aria-labelledby={HEADING_ID} data-testid={testId} className="min-w-0">
      <h2 id={HEADING_ID} className="h2">
        {heading}
      </h2>
      <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{CATALOG_DISPLAY_NOTE}</p>
      {breadth && (
        <p className="mono-label text-ink-mute mt-2" data-testid={`${testId}-breadth`}>
          {breadth === "full"
            ? "Showing the full catalog for your account"
            : "Showing the products available to your account"}
        </p>
      )}

      {loading && (
        <div role="status" data-testid={`${testId}-loading`}>
          <span className="sr-only">{CATALOG_LOADING_COPY}</span>
          <ul role="list" className={gridClass}>
            <SkeletonCard testId={`${testId}-skeleton-1`} />
            <SkeletonCard testId={`${testId}-skeleton-2`} />
            <SkeletonCard testId={`${testId}-skeleton-3`} />
          </ul>
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="body-s mt-6 max-w-[68ch]" data-testid={`${testId}-error`}>
          {CATALOG_ERROR_COPY}
        </p>
      )}

      {!loading && !error && (products?.length ?? 0) === 0 && (
        <p className="body-s text-ink-2 mt-6 max-w-[68ch]" data-testid={`${testId}-empty`}>
          {CATALOG_EMPTY_COPY}
        </p>
      )}

      {!loading && !error && (products?.length ?? 0) > 0 && (
        <ul role="list" className={gridClass} data-testid={`${testId}-list`}>
          {(products ?? []).map((product) => (
            <ProductCardTile
              key={`${product.lane}:${product.slug}`}
              product={product}
              onSelect={onSelect}
              testId={`${testId}-card-${product.lane}-${product.slug}`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
