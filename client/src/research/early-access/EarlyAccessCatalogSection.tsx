import { useEffect, useId, useMemo, useState } from "react";

import { EarlyAccessCatalogGrid } from "./EarlyAccessCatalogGrid";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";
import {
  EarlyAccessSelectionSummary,
  type EarlyAccessSelectionLine,
} from "./EarlyAccessSelectionSummary";
import {
  loadEarlyAccessCatalog,
  type EarlyAccessCatalogLoad,
} from "../adapters/earlyAccessCatalog";

/**
 * The catalogue, loaded from the mounted server endpoint.
 *
 * This remains the composition seam: it calls the adapter, holds the result,
 * and renders the shelf. It computes no availability, decides no price, and
 * holds no product data of its own. There are no fixture rows in this file,
 * deliberately, so it is impossible for the browser to show a catalogue the
 * server did not send.
 *
 * WHAT IS NEW HERE IS PRESENTATION STATE ONLY: a search box, three filters and
 * a running selection. All three operate exclusively on the rows the server
 * already returned for this session. Search never fetches, filtering never
 * reveals a unit the response did not carry, and selecting never overrides the
 * availability the server decided. The counts on the filters are counted from
 * the response, not written here.
 *
 * Every non-ok outcome is rendered as itself rather than as an empty catalogue,
 * because "there are no products" and "we could not read the response" and "your
 * session lapsed" lead a customer to three different actions.
 */

export interface EarlyAccessCatalogSectionProps {
  /** Required, no default: the canonical sentence is passed down from the route. */
  fulfillmentTargetCopy: string;
  /** Injected for tests. Defaults to the real mounted endpoint. */
  load?: () => Promise<EarlyAccessCatalogLoad>;
  /** Told when a product is added to the selection. */
  onSelect?(product: EarlyAccessCardProduct): void;
  /** Told when the customer asks to continue with their current selection. */
  onReview?(lines: readonly EarlyAccessSelectionLine[]): void;
  testId?: string;
}

type State = { status: "loading" } | { status: "loaded"; load: EarlyAccessCatalogLoad };

type CatalogFilter = "all" | "available" | "held";

/** Held is the server's word, read from the state the server projected. */
function isHeld(product: EarlyAccessCardProduct): boolean {
  return product.availability === "TEMPORARILY_HELD";
}

/**
 * Case-insensitive match over the fields the server sent: display name,
 * strength, and description. Nothing is matched against data the response did
 * not carry, because nothing else exists client-side to match against.
 */
function matchesQuery(product: EarlyAccessCardProduct, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    product.name.toLowerCase().includes(needle) ||
    product.strength.toLowerCase().includes(needle) ||
    product.description.toLowerCase().includes(needle)
  );
}

/**
 * Hoisted so the default has ONE identity for the life of the module.
 *
 * Written inline as a default parameter it was a new function on every render,
 * which changed the effect's dependency every time the effect set state: the
 * catalogue re-fetched itself forever, hammering the endpoint from every
 * customer's browser. A stable reference makes the effect run once.
 */
const loadFromServer = () => loadEarlyAccessCatalog();

export function EarlyAccessCatalogSection({
  fulfillmentTargetCopy,
  load = loadFromServer,
  onSelect = () => {},
  onReview = () => {},
  testId = "early-access-catalog-section",
}: EarlyAccessCatalogSectionProps) {
  const searchId = useId();
  const [state, setState] = useState<State>({ status: "loading" });
  const [quantities, setQuantities] = useState<Record<string, EarlyAccessQuantity>>({});
  // The running selection: variant id -> chosen quantity, in the order added.
  // Presentation state only. The server re-decides everything at order time.
  const [selections, setSelections] = useState<Record<string, EarlyAccessQuantity>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");

  useEffect(() => {
    let live = true;
    void load().then((result) => {
      if (live) setState({ status: "loaded", load: result });
    });
    return () => {
      live = false;
    };
  }, [load]);

  const products = useMemo<readonly EarlyAccessCardProduct[]>(() => {
    if (state.status !== "loaded" || state.load.kind !== "ok") return [];
    return state.load.products;
  }, [state]);

  const filtered = useMemo(() => {
    const byFilter =
      filter === "all"
        ? products
        : products.filter((product) => (filter === "held" ? isHeld(product) : !isHeld(product)));
    return byFilter.filter((product) => matchesQuery(product, query));
  }, [products, filter, query]);

  if (state.status === "loading") {
    return (
      <section data-testid={testId} data-state="loading">
        <p data-testid={`${testId}-loading`}>Loading the research catalogue.</p>
      </section>
    );
  }

  const result = state.load;

  if (result.kind === "locked") {
    // NOT an empty catalogue. A signed-out customer shown an empty shelf
    // concludes there is nothing to buy, when the truth is that they need to
    // unlock again.
    return (
      <section data-testid={testId} data-state="locked">
        <p data-testid={`${testId}-locked`}>
          Your private session has ended. Unlock again to view the research catalogue. Nothing has
          been ordered or charged.
        </p>
      </section>
    );
  }

  if (result.kind === "unreadable" || result.kind === "error") {
    // Also not an empty catalogue. This is a fault, and saying so is what gets
    // it reported rather than absorbed as "there is nothing available".
    return (
      <section data-testid={testId} data-state="fault">
        <p data-testid={`${testId}-fault`}>
          We could not load the research catalogue just now. This is a fault on our side, not an
          empty catalogue. Nothing has been ordered or charged.
        </p>
      </section>
    );
  }

  // A genuinely empty catalogue keeps its plain statement, with no toolbar over
  // an empty shelf and no summary of nothing.
  if (products.length === 0) {
    return (
      <section data-testid={testId} data-state="ok" data-received={result.received}>
        <EarlyAccessCatalogGrid
          products={products}
          dropped={result.dropped}
          quantities={quantities}
          onQuantityChange={() => {}}
          onSelect={() => {}}
        />
      </section>
    );
  }

  const heldCount = products.filter(isHeld).length;
  const availableCount = products.length - heldCount;
  const counts: Record<CatalogFilter, number> = {
    all: products.length,
    available: availableCount,
    held: heldCount,
  };

  const setQuantity = (variantId: string, quantity: EarlyAccessQuantity) => {
    setQuantities((current) => ({ ...current, [variantId]: quantity }));
    // A quantity change on an already-selected product updates the selection,
    // so the summary never shows a quantity the card no longer shows.
    setSelections((current) =>
      variantId in current ? { ...current, [variantId]: quantity } : current,
    );
  };

  const addToSelection = (product: EarlyAccessCardProduct) => {
    // Defence in depth: the card offers no Add on a held row, and this refuses
    // one anyway. The server would refuse the order regardless.
    if (isHeld(product) || product.unitPriceCents === null) return;
    const quantity = quantities[product.variantId] ?? 1;
    setSelections((current) => ({ ...current, [product.variantId]: quantity }));
    onSelect(product);
  };

  const removeFromSelection = (product: EarlyAccessCardProduct) => {
    setSelections((current) => {
      const next = { ...current };
      delete next[product.variantId];
      return next;
    });
  };

  const lines: EarlyAccessSelectionLine[] = Object.entries(selections).flatMap(
    ([variantId, quantity]) => {
      const product = products.find((candidate) => candidate.variantId === variantId);
      // A selection can only ever point at a product from this response, and
      // only at a priced one; anything else is dropped rather than invented.
      if (product === undefined || product.unitPriceCents === null) return [];
      return [
        {
          variantId,
          name: product.name,
          strength: product.strength,
          quantity,
          unitPriceCents: product.unitPriceCents,
          currency: product.currency,
        },
      ];
    },
  );

  const filterButton = (value: CatalogFilter, label: string) => (
    <button
      type="button"
      className={filter === value ? "btn btn-primary" : "btn btn-secondary"}
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      data-testid={`${testId}-filter-${value}`}
      data-count={counts[value]}
    >
      {label} {counts[value]}
    </button>
  );

  return (
    <section data-testid={testId} data-state="ok" data-received={result.received}>
      {/*
        The toolbar. Search and filters narrow what is SHOWN from the rows the
        server returned for this session; they never fetch and never reveal a
        unit the response did not carry.
      */}
      <div
        className="flex min-w-0 flex-wrap items-center gap-3"
        data-testid={`${testId}-toolbar`}
      >
        <label htmlFor={searchId} className="sr-only">
          Search products
        </label>
        <input
          id={searchId}
          type="search"
          className="input-field"
          style={{ maxWidth: 320 }}
          placeholder="Search products"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid={`${testId}-search`}
        />
        <div
          role="group"
          aria-label="Filter products"
          className="flex min-w-0 flex-wrap items-center gap-2"
        >
          {filterButton("all", "All")}
          {filterButton("available", "Available")}
          {filterButton("held", "Held")}
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="body-s text-ink-mute mt-3"
        data-testid={`${testId}-result-count`}
      >
        Showing {filtered.length} of {products.length} products.
      </p>

      {/*
        The catalogue-level facts, stated ONCE. The fulfillment sentence is the
        canonical server-side wording passed down unchanged, and the bundle
        offer is named once here instead of once per card.
      */}
      <p
        className="body-s text-ink-mute mt-2 max-w-[80ch]"
        data-testid={`${testId}-fulfillment`}
      >
        {fulfillmentTargetCopy}
      </p>
      <p className="body-s text-ink-mute mt-1" data-testid={`${testId}-bundle-offer`}>
        Order three units as the Research Bundle and save 20% on the bundle.
      </p>

      <div className="mt-5 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {filtered.length === 0 ? (
            /*
              An explicit empty RESULT, never a blank grid. The catalogue is
              fine; the search or filter simply matched nothing, and the way
              back is one button.
            */
            <div className="card min-w-0" role="status" data-testid={`${testId}-no-matches`}>
              <p className="body-s text-ink-2">
                No products match your search or filter. The catalogue itself is unchanged.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  data-testid={`${testId}-clear-filters`}
                >
                  Clear search and filters
                </button>
              </div>
            </div>
          ) : (
            <EarlyAccessCatalogGrid
              products={filtered}
              dropped={result.dropped}
              quantities={quantities}
              selectedIds={new Set(Object.keys(selections))}
              onQuantityChange={setQuantity}
              onSelect={addToSelection}
              onRemove={removeFromSelection}
            />
          )}
        </div>

        {/*
          The running selection, always within reach: a sticky bottom bar while
          the catalogue scrolls on a phone, a sticky side rail on a desktop. The
          customer never has to pass the last of twenty-two cards to find the
          next action.
        */}
        <aside
          className="sticky bottom-0 z-10 min-w-0 lg:bottom-auto lg:top-24"
          data-testid={`${testId}-summary-rail`}
        >
          <EarlyAccessSelectionSummary lines={lines} onReview={() => onReview(lines)} />
        </aside>
      </div>
    </section>
  );
}
