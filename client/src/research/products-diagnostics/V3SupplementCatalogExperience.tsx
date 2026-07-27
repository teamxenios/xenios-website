import { useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import {
  ResearchEmptyState,
  ResearchPendingPanel,
  ResearchStatusBadge,
} from "../ui/kit";

export type V3SupplementCatalogItem = {
  id: string;
  brand: string;
  displayName: string;
  category: string;
  publicState: "coming_soon";
  formatState: "pending_confirmation";
  sizeState: "pending_confirmation";
  flavorState: "pending_if_applicable";
  subscriptionState: "disabled";
  supplierState: "relationship_pending";
  pairingState: "review_pending";
  price: null;
  sku: null;
  primaryCta: "Notify me";
  secondaryCta: "Request sourcing";
};

export function V3SupplementCatalogExperience({
  items,
}: {
  items: readonly V3SupplementCatalogItem[];
}) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"editorial" | "name" | "brand">(
    "editorial",
  );

  const brands = useMemo(
    () => Array.from(new Set(items.map((item) => item.brand))).sort(),
    [items],
  );
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))).sort(),
    [items],
  );
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("en-US");
    return items
      .filter((item) => {
        if (brand !== "all" && item.brand !== brand) return false;
        if (category !== "all" && item.category !== category) return false;
        return (
          !search ||
          [item.displayName, item.brand, item.category]
            .join(" ")
            .toLocaleLowerCase("en-US")
            .includes(search)
        );
      })
      .slice()
      .sort((left, right) => {
        if (sort === "name") {
          return left.displayName.localeCompare(right.displayName);
        }
        if (sort === "brand") {
          return (
            left.brand.localeCompare(right.brand) ||
            left.displayName.localeCompare(right.displayName)
          );
        }
        return items.indexOf(left) - items.indexOf(right);
      });
  }, [brand, category, items, query, sort]);

  const clear = () => {
    setQuery("");
    setBrand("all");
    setCategory("all");
    setSort("editorial");
  };

  return (
    <section aria-labelledby="v3-supplement-catalog">
      <div className="max-w-[68ch]">
        <p className="mono-cap text-pulse">Supplement catalog</p>
        <h2 id="v3-supplement-catalog" className="display-s mt-3">
          Formulas under review
        </h2>
        <p className="body-m text-ink-2 mt-4">
          Browse candidate formulas without invented flavors, sizes, prices,
          subscriptions, or availability. Verified facts replace each pending
          state only after review.
        </p>
      </div>

      <div
        className="card mt-6 grid gap-4 md:grid-cols-2"
        aria-label="Supplement catalog controls"
      >
        <label className="grid gap-2" htmlFor="v3-supplement-search">
          <span className="form-label">Search supplements</span>
          <input
            id="v3-supplement-search"
            className="input-field"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, brand, or category"
          />
        </label>
        <label className="grid gap-2" htmlFor="v3-supplement-brand">
          <span className="form-label">Brand</span>
          <select
            id="v3-supplement-brand"
            className="input-field"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          >
            <option value="all">All brands</option>
            {brands.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2" htmlFor="v3-supplement-category">
          <span className="form-label">Category</span>
          <select
            id="v3-supplement-category"
            className="input-field"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2" htmlFor="v3-supplement-sort">
          <span className="form-label">Sort</span>
          <select
            id="v3-supplement-sort"
            className="input-field"
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "editorial" | "name" | "brand")
            }
          >
            <option value="editorial">Editorial order</option>
            <option value="name">Name</option>
            <option value="brand">Brand</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="body-s text-ink-2" role="status" aria-live="polite">
          {visible.length} {visible.length === 1 ? "formula" : "formulas"}
        </p>
        {(query || brand !== "all" || category !== "all") && (
          <button type="button" className="btn btn-ghost" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4">
          <ResearchEmptyState
            title="No formulas match those filters."
            body="Clear the filters or request a formula for sourcing review. A request is not an order or availability promise."
            action={
              <button type="button" className="btn btn-secondary" onClick={clear}>
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <ul
          className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {visible.map((item) => (
            <li
              key={item.id}
              className="card grid gap-4"
              style={{ minWidth: 0, overflowWrap: "anywhere" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mono-label text-ink-mute">{item.brand}</p>
                  <h3 className="body-l font-700 mt-1">{item.displayName}</h3>
                </div>
                <ResearchStatusBadge label="Coming soon" tone="pending" />
              </div>
              <p className="body-s text-ink-2">{item.category}</p>
              <ResearchPendingPanel
                kind="supplier_pending"
                body="Formula, format, size, flavor where applicable, price, and availability are being confirmed."
              />
              <p className="body-s text-ink-mute">
                Pairing review pending. No subscription or product pairing is
                active.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={productRequestHref("supplements", item.displayName)}
                  className="btn btn-primary"
                >
                  Notify me
                </Link>
                <Link
                  href={productRequestHref("supplements", item.displayName)}
                  className="btn btn-ghost"
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
