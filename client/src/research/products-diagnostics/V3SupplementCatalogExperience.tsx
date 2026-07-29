import { useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import {
  ResearchEmptyState,
  ResearchStatusBadge,
} from "../ui/kit";

export type SupplementPreviewView = {
  slug: string;
  displayName: string;
};

export function V3SupplementCatalogExperience({
  items,
}: {
  items: readonly SupplementPreviewView[];
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-US");
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.displayName} ${item.slug}`
        .toLocaleLowerCase("en-US")
        .includes(normalized),
    );
  }, [items, query]);

  return (
    <section
      className="container-x section-y"
      aria-labelledby="supplement-catalog-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label text-ink-mute">Xenios Research catalog</p>
          <h2 id="supplement-catalog-heading" className="display-s mt-2">
            Supplements being evaluated
          </h2>
        </div>
        <Link
          href={productRequestHref("supplements")}
          className="btn btn-primary"
        >
          Request sourcing
        </Link>
      </div>

      <label className="mt-6 grid max-w-xl gap-2" htmlFor="supplement-search">
        <span className="form-label">Search supplements</span>
        <input
          id="supplement-search"
          className="input-field"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by ingredient or category"
        />
      </label>

      <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? "profile" : "profiles"}
      </p>

      {visible.length === 0 ? (
        <div className="mt-5">
          <ResearchEmptyState
            title="No supplements match that search."
            body="Try another term or request a supplement for sourcing review. A request is not an availability or purchase promise."
            action={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            }
          />
        </div>
      ) : (
        <ul
          className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {visible.map((item) => (
            <li
              key={item.slug}
              className="card grid gap-4"
              style={{ minWidth: 0, overflowWrap: "anywhere" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="body-l font-700">{item.displayName}</h3>
                <ResearchStatusBadge label="Coming soon" tone="pending" />
              </div>
              <dl className="grid gap-3 body-s">
                <div>
                  <dt className="mono-label text-ink-mute">Customer price</dt>
                  <dd className="mt-1">Price not currently available</dd>
                </div>
                <div>
                  <dt className="mono-label text-ink-mute">Options</dt>
                  <dd className="mt-1">Format and presentation being confirmed</dd>
                </div>
              </dl>
              <p className="body-s text-ink-2">
                Purchase remains disabled until an exact approved product,
                variant, customer price, and availability record exists.
              </p>
              <div>
                <Link
                  href={productRequestHref("supplements", item.displayName)}
                  className="btn btn-secondary"
                >
                  Request sourcing
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
