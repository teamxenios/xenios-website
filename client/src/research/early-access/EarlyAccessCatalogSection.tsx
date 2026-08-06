import { useEffect, useMemo, useState } from "react";

import { EarlyAccessCatalogGrid } from "./EarlyAccessCatalogGrid";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";
import { EarlyAccessSelectionBar } from "./EarlyAccessSelectionBar";
import {
  loadEarlyAccessCatalog,
  type EarlyAccessCatalogLoad,
} from "../adapters/earlyAccessCatalog";

/**
 * The catalogue, loaded from the mounted server endpoint.
 *
 * This is the composition seam and nothing else: it calls the adapter, holds the
 * result, and renders the grid. It computes no availability and holds no product
 * data of its own. There are no fixture rows in this file, deliberately, so it is
 * impossible for the browser to show a catalogue the server did not send.
 *
 * Every non-ok outcome is rendered as itself rather than as an empty catalogue,
 * because "there are no products" and "we could not read the response" and "your
 * session lapsed" lead a customer to three different actions. Since search was
 * added there is a fourth: "your search matched nothing", which is also stated
 * as itself rather than shown as a bare grid.
 */

export interface EarlyAccessCatalogSectionProps {
  /** Required, no default. See the notice below for why. */
  fulfillmentTargetCopy: string;
  /** Injected for tests. Defaults to the real mounted endpoint. */
  load?: () => Promise<EarlyAccessCatalogLoad>;
  onSelect?(product: EarlyAccessCardProduct): void;
  /** Invoked when the customer continues from the summary. */
  onReview?(): void;
  testId?: string;
}

type State = { status: "loading" } | { status: "loaded"; load: EarlyAccessCatalogLoad };

/** All / Available / Held. Nothing is computed here; see `isAvailable`. */
const FILTERS = ["all", "available", "held"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  available: "Available",
  held: "Held",
};

/**
 * Availability is the SERVER's answer, read through the one mapping seam.
 *
 * `availabilityStateOf` in earlyAccessCatalogView already requires BOTH
 * `row.availability` and `row.purchasable === true` to agree before a row is
 * anything other than TEMPORARILY_HELD, and it fails safe to held. So this
 * reads that decision rather than making a second one. There is deliberately no
 * eligibility rule in this file: a browser that decided what was purchasable
 * would be a second authority, and the moment it disagreed with the server the
 * customer would be offered something they cannot buy.
 */
function isAvailable(product: EarlyAccessCardProduct): boolean {
  return product.availability !== "TEMPORARILY_HELD";
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
  const [state, setState] = useState<State>({ status: "loading" });
  const [quantities, setQuantities] = useState<Record<string, EarlyAccessQuantity>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    void load().then((result) => {
      if (live) setState({ status: "loaded", load: result });
    });
    return () => {
      live = false;
    };
  }, [load]);

  const products: readonly EarlyAccessCardProduct[] =
    state.status === "loaded" && state.load.kind === "ok" ? state.load.products : [];

  /**
   * Search and filter run over the units ALREADY RETURNED, in memory. Typing
   * never re-queries: a search box that refetches would let a customer's
   * keystrokes shape a server request, and the catalogue a customer sees would
   * depend on what they typed rather than on what they are approved for.
   */
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      if (filter === "available" && !isAvailable(product)) return false;
      if (filter === "held" && isAvailable(product)) return false;
      if (term === "") return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.strength.toLowerCase().includes(term)
      );
    });
  }, [products, query, filter]);

  const counts = useMemo(
    () => ({
      all: products.length,
      available: products.filter(isAvailable).length,
      held: products.filter((product) => !isAvailable(product)).length,
    }),
    [products],
  );

  const selectedProducts = useMemo(
    () => products.filter((product) => selected.has(product.variantId)),
    [products, selected],
  );

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

  /** Held units can never enter the selection. The server refuses them too. */
  const toggleSelected = (product: EarlyAccessCardProduct) => {
    if (!isAvailable(product)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(product.variantId)) next.delete(product.variantId);
      else next.add(product.variantId);
      return next;
    });
    onSelect(product);
  };

  return (
    <section data-testid={testId} data-state="ok" data-received={result.received}>
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid={`${testId}-toolbar`}>
        <label className="sr-only" htmlFor={`${testId}-search`}>
          Search products
        </label>
        <input
          id={`${testId}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products..."
          data-testid={`${testId}-search`}
          className="input min-w-0 flex-1"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter the catalogue">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              data-testid={`${testId}-filter-${option}`}
              className={`btn btn-sm ${filter === option ? "btn-primary" : "btn-secondary"}`}
            >
              {FILTER_LABEL[option]} {counts[option]}
            </button>
          ))}
        </div>
      </div>

      {/*
        ONE fulfillment notice for the whole catalogue. This sentence used to be
        rendered on every card, so a 22-product shelf repeated it 22 times. It is
        still the caller's string with no default here, for the same reason it
        had no default on the card: the canonical copy lives server-side and a
        constant in the browser would be a second copy that drifts.
      */}
      <p data-testid={`${testId}-fulfillment`} className="body-xs text-ink-mute mt-3">
        {fulfillmentTargetCopy}
      </p>

      {/*
        The bundle offer, also once. It names the offer and states no total,
        because the discount and the payable total are the server's to compute
        and to state on the order review.
      */}
      <p data-testid={`${testId}-bundle`} className="body-xs text-ink-mute mt-1">
        Order three units of a product as the Research Bundle and save 20% on the bundle.
      </p>

      <div className="mt-4">
        {products.length > 0 && visible.length === 0 ? (
          // A search that matched nothing is NOT an empty catalogue, and must
          // not render as a bare grid. The customer needs to know their query
          // is the reason, because the remedy is theirs.
          <p data-testid={`${testId}-no-matches`} role="status" className="body-s text-ink-2">
            No products match this search.
          </p>
        ) : (
          <EarlyAccessCatalogGrid
            products={visible}
            dropped={result.dropped}
            quantities={quantities}
            onQuantityChange={(variantId, quantity) =>
              setQuantities((current) => ({ ...current, [variantId]: quantity }))
            }
            onSelect={toggleSelected}
            selectedVariantIds={selected}
          />
        )}
      </div>

      {/*
        Count and next step only. The money lives on EarlyAccessOrderSummary,
        which renders the SERVER's figures or says they are not confirmed. No
        subtotal is assembled here: see EarlyAccessSelectionBar for why.
      */}
      <EarlyAccessSelectionBar
        selectedCount={selectedProducts.length}
        unitCount={selectedProducts.reduce(
          (total, product) => total + (quantities[product.variantId] ?? 1),
          0,
        )}
        onReview={onReview}
        testId={`${testId}-selection`}
      />
    </section>
  );
}
