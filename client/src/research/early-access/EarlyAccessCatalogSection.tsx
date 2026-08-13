import { useEffect, useMemo, useState } from "react";

import { EarlyAccessCatalogGrid } from "./EarlyAccessCatalogGrid";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";
import { EarlyAccessSelectionBar } from "./EarlyAccessSelectionBar";
import { routeEarlyAccessQuantity } from "@shared/research/early-access-quantity";
import {
  loadEarlyAccessCatalog,
  type EarlyAccessCatalogLoad,
} from "../adapters/earlyAccessCatalog";

export type EarlyAccessCatalogSelection = Readonly<{
  product: EarlyAccessCardProduct;
  quantity: EarlyAccessQuantity;
}>;

export interface EarlyAccessCatalogSectionProps {
  fulfillmentTargetCopy: string;
  load?: () => Promise<EarlyAccessCatalogLoad>;
  onSelect?(product: EarlyAccessCardProduct): void;
  onReview?(selection: EarlyAccessCatalogSelection): void;
  onOrderRequest?(selection: EarlyAccessCatalogSelection): void;
  reviewEnabled?: boolean;
  testId?: string;
}

type State = { status: "loading" } | { status: "loaded"; load: EarlyAccessCatalogLoad };
const FILTERS = ["all", "available", "held"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { all: "All", available: "Available", held: "Held" };

function isAvailable(product: EarlyAccessCardProduct): boolean {
  return product.availability !== "TEMPORARILY_HELD";
}

const loadFromServer = () => loadEarlyAccessCatalog();

export function EarlyAccessCatalogSection({
  fulfillmentTargetCopy,
  load = loadFromServer,
  onSelect = () => {},
  onReview = () => {},
  onOrderRequest = () => {},
  reviewEnabled = true,
  testId = "early-access-catalog-section",
}: EarlyAccessCatalogSectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [quantities, setQuantities] = useState<Record<string, EarlyAccessQuantity>>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    void load().then((result) => { if (live) setState({ status: "loaded", load: result }); });
    return () => { live = false; };
  }, [load]);

  const products: readonly EarlyAccessCardProduct[] =
    state.status === "loaded" && state.load.kind === "ok" ? state.load.products : [];

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      if (filter === "available" && !isAvailable(product)) return false;
      if (filter === "held" && isAvailable(product)) return false;
      if (term === "") return true;
      return [product.name, product.strength, product.description]
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [products, query, filter]);

  const counts = useMemo(() => ({
    all: products.length,
    available: products.filter(isAvailable).length,
    held: products.filter((product) => !isAvailable(product)).length,
  }), [products]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.variantId === selectedVariantId) ?? null,
    [products, selectedVariantId],
  );
  const selectedIds = useMemo(
    () => new Set(selectedVariantId === null ? [] : [selectedVariantId]),
    [selectedVariantId],
  );

  if (state.status === "loading") {
    return <section data-testid={testId} data-state="loading"><p>Loading the research catalogue.</p></section>;
  }
  const result = state.load;
  if (result.kind === "locked") {
    return <section data-testid={testId} data-state="locked"><p>Your private session has ended. Unlock again to view the research catalogue. Nothing has been ordered or charged.</p></section>;
  }
  if (result.kind === "unreadable" || result.kind === "error") {
    return <section data-testid={testId} data-state="fault"><p>We could not load the research catalogue just now. This is a fault on our side, not an empty catalogue. Nothing has been ordered or charged.</p></section>;
  }

  const toggleSelected = (product: EarlyAccessCardProduct) => {
    if (!isAvailable(product)) return;
    setSelectedVariantId((current) => current === product.variantId ? null : product.variantId);
    onSelect(product);
  };
  const selectedQuantity = selectedProduct === null ? 0 : (quantities[selectedProduct.variantId] ?? 1);
  const selectedRoute = selectedProduct === null
    ? null
    : routeEarlyAccessQuantity(selectedQuantity, selectedProduct.quantityLimit);

  return (
    <section data-testid={testId} data-state="ok" data-received={result.received}>
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid={`${testId}-toolbar`}>
        <label className="sr-only" htmlFor={`${testId}-search`}>Search products</label>
        <input id={`${testId}-search`} type="search" value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="Search products..."
          data-testid={`${testId}-search`} className="input-field min-w-0 flex-1" style={{ maxWidth: 360 }} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter the catalogue">
          {FILTERS.map((option) => (
            <button key={option} type="button" onClick={() => setFilter(option)}
              aria-pressed={filter === option} data-testid={`${testId}-filter-${option}`}
              data-count={counts[option]}
              className={`btn ${filter === option ? "btn-primary" : "btn-secondary"}`}>
              {FILTER_LABEL[option]} {counts[option]}
            </button>
          ))}
        </div>
      </div>
      <p className="body-s text-ink-mute mt-3" data-testid={`${testId}-fulfillment`}>{fulfillmentTargetCopy}</p>
      <p className="body-s text-ink-mute mt-1" data-testid={`${testId}-single-product`}>
        Normal order quantities are 1 through 50. Quantity alone does not trigger review.
        Quantity 3 receives the server-confirmed Research Bundle pricing.
      </p>
      <div className="mt-4">
        {products.length > 0 && visible.length === 0 ? (
          <p data-testid={`${testId}-no-matches`} role="status" className="body-s text-ink-2">No products match this search.</p>
        ) : (
          <EarlyAccessCatalogGrid products={visible} dropped={result.dropped}
            quantities={quantities}
            onQuantityChange={(variantId, quantity) => setQuantities((current) => ({ ...current, [variantId]: quantity }))}
            onSelect={toggleSelected} selectedVariantIds={selectedIds} />
        )}
      </div>
      <EarlyAccessSelectionBar selectedCount={selectedProduct === null ? 0 : 1}
        unitCount={selectedQuantity}
        actionLabel={selectedRoute?.kind === "order_request" ? "Request this order" : "Review order"}
        reviewEnabled={reviewEnabled}
        onReview={() => {
          if (selectedProduct !== null) {
            const next = { product: selectedProduct, quantity: selectedQuantity };
            if (selectedRoute?.kind === "direct_cart") onReview(next);
            else if (selectedRoute?.kind === "order_request") onOrderRequest(next);
          }
        }} testId={`${testId}-selection`} />
    </section>
  );
}
