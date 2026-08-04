import { useEffect, useState } from "react";

import { EarlyAccessCatalogGrid } from "./EarlyAccessCatalogGrid";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import type { EarlyAccessQuantity } from "./EarlyAccessQuantitySelector";
import {
  loadEarlyAccessCatalog,
  type EarlyAccessCatalogLoad,
} from "../adapters/earlyAccessCatalog";

/**
 * The catalogue, loaded from the mounted server endpoint.
 *
 * This is the composition seam and nothing else: it calls the adapter, holds the
 * result, and renders the grid. It computes no money, decides no availability,
 * and holds no product data of its own. There are no fixture rows in this file,
 * deliberately, so it is impossible for the browser to show a catalogue the
 * server did not send.
 *
 * Every non-ok outcome is rendered as itself rather than as an empty catalogue,
 * because "there are no products" and "we could not read the response" and "your
 * session lapsed" lead a customer to three different actions.
 */

export interface EarlyAccessCatalogSectionProps {
  /** Required, no default. See EarlyAccessProductCard for why. */
  fulfillmentTargetCopy: string;
  /** Injected for tests. Defaults to the real mounted endpoint. */
  load?: () => Promise<EarlyAccessCatalogLoad>;
  onSelect?(product: EarlyAccessCardProduct): void;
  testId?: string;
}

type State = { status: "loading" } | { status: "loaded"; load: EarlyAccessCatalogLoad };

export function EarlyAccessCatalogSection({
  fulfillmentTargetCopy,
  load = () => loadEarlyAccessCatalog(),
  onSelect = () => {},
  testId = "early-access-catalog-section",
}: EarlyAccessCatalogSectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [quantities, setQuantities] = useState<Record<string, EarlyAccessQuantity>>({});

  useEffect(() => {
    let live = true;
    void load().then((result) => {
      if (live) setState({ status: "loaded", load: result });
    });
    return () => {
      live = false;
    };
  }, [load]);

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

  return (
    <section data-testid={testId} data-state="ok" data-received={result.received}>
      <EarlyAccessCatalogGrid
        products={result.products}
        dropped={result.dropped}
        quantities={quantities}
        onQuantityChange={(variantId, quantity) =>
          setQuantities((current) => ({ ...current, [variantId]: quantity }))
        }
        onSelect={onSelect}
        fulfillmentTargetCopy={fulfillmentTargetCopy}
      />
    </section>
  );
}
