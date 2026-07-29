import { useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import {
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
} from "../ui/kit";

export type V3SupplementCatalogItem = {
  id: string;
  slug: string;
  displayName: string;
  summary: string;
  pricingState: "public_price_pending";
  approvedPrice: null;
  approvedVariantCount: 0;
  purchasingEnabled: false;
  documentationState: "pending";
  form: null;
  flavor: null;
};

export type V3SupplementCatalogState =
  | "loading"
  | "ok"
  | "error"
  | "unavailable";

export function V3SupplementCatalogExperience({
  items,
  state = "ok",
  errorMessage,
  onRetry,
  onSave,
}: {
  items: readonly V3SupplementCatalogItem[];
  state?: V3SupplementCatalogState;
  errorMessage?: string;
  onRetry?: () => void;
  onSave?: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recommended" | "name_ascending">(
    "recommended",
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    const filtered = items.filter((item) =>
      `${item.displayName} ${item.summary}`
        .toLocaleLowerCase("en-US")
        .includes(needle),
    );
    return sort === "name_ascending"
      ? [...filtered].sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        )
      : filtered;
  }, [items, query, sort]);

  return (
    <section aria-labelledby="v3-supplement-catalog-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label text-ink-mute">Xenios Research catalog</p>
          <h2 id="v3-supplement-catalog-title" className="h2 mt-2">
            Supplement categories
          </h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            Browse categories under review. Exact formulas, variants, prices,
            documentation, and availability appear only after approval.
          </p>
        </div>
        <ResearchStatusBadge label="Price pending" tone="pending" />
      </div>

      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Supplement categories are not available."
        unavailableBody="The catalog remains closed until approved records can be loaded."
      >
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2" htmlFor="supplement-preview-search">
            <span className="form-label">Search supplement categories</span>
            <input
              id="supplement-preview-search"
              className="input-field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-2" htmlFor="supplement-preview-sort">
            <span className="form-label">Sort</span>
            <select
              id="supplement-preview-sort"
              className="input-field"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as typeof sort)
              }
            >
              <option value="recommended">Recommended order</option>
              <option value="name_ascending">Name A–Z</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="mt-6">
            <ResearchEmptyState
              title="No supplement categories match."
              body="Clear the search or request sourcing for a category not listed."
              action={
                <Link
                  href={productRequestHref("supplements")}
                  className="btn btn-secondary"
                >
                  Request sourcing
                </Link>
              }
            />
          </div>
        ) : (
          <ul
            className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            style={{ listStyle: "none", padding: 0 }}
          >
            {visible.map((item) => (
              <li
                key={item.id}
                className="card grid content-start gap-4"
                data-testid={`supplement-preview-${item.slug}`}
                style={{ minWidth: 0, overflowWrap: "anywhere" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="body-l font-700">{item.displayName}</h3>
                  <ResearchStatusBadge label="Coming soon" tone="pending" />
                </div>
                <p className="body-s text-ink-2">{item.summary}</p>
                <dl className="grid gap-3 body-s">
                  <div>
                    <dt className="mono-label text-ink-mute">Customer price</dt>
                    <dd className="mt-1">Price not currently available</dd>
                  </div>
                  <div>
                    <dt className="mono-label text-ink-mute">Options</dt>
                    <dd className="mt-1">Approved variant required</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    href={productRequestHref(
                      "supplements",
                      item.displayName,
                    )}
                    className="btn btn-primary"
                  >
                    Request sourcing
                  </Link>
                  {onSave && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onSave(item.slug)}
                    >
                      Save for later
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ResearchRouteBoundary>
    </section>
  );
}
