import { useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  MASTER_OFFERING_FAMILY_LABELS,
  MASTER_OFFERING_SORTS,
  MASTER_OFFERING_SORT_LABELS,
  isMasterOfferingFamily,
  isMasterOfferingSort,
  type MasterOfferingCatalogQuery,
  type MasterOfferingFamily,
  type MasterOfferingSort,
} from "@shared/research/master-offerings/contract";
import type { PublicStorefrontPage } from "@shared/research/storefront/contract";
import { ResearchEmptyState } from "../ui/kit";
import { StorefrontCard } from "./StorefrontCard";

const ALL = "all";

/**
 * Search, category, and sort for the public catalog.
 *
 * The family list is driven by the server's own facets, so a filter can only
 * ever narrow to something the catalog actually holds, and the counts tell a
 * visitor what is behind each option before they choose it. Availability is
 * NOT a public filter: a signed-out visitor browses what we can show and each
 * card states its own status.
 */
export function StorefrontControls({
  query,
  page,
  onChange,
}: {
  query: MasterOfferingCatalogQuery;
  page: PublicStorefrontPage;
  onChange: (next: MasterOfferingCatalogQuery) => void;
}) {
  const family = query.families?.[0] ?? ALL;
  const category = query.categories?.[0] ?? ALL;
  const sort = query.sort ?? ALL;

  return (
    <div className="card grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid min-w-0 gap-2" htmlFor="sf-search">
        <span className="form-label">Search</span>
        <input
          id="sf-search"
          className="input-field"
          type="search"
          maxLength={160}
          value={query.q ?? ""}
          placeholder="Product or strength"
          data-testid="sf-search"
          onChange={(event) => {
            const q = event.target.value;
            const { page: _page, q: _q, ...rest } = query;
            onChange(q.trim() ? { ...rest, q } : rest);
          }}
        />
      </label>

      <label className="grid min-w-0 gap-2" htmlFor="sf-family">
        <span className="form-label">Category</span>
        <select
          id="sf-family"
          className="input-field"
          value={family}
          data-testid="sf-family"
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, families: _families, ...rest } = query;
            onChange(
              isMasterOfferingFamily(value)
                ? { ...rest, families: [value as MasterOfferingFamily] }
                : rest,
            );
          }}
        >
          <option value={ALL}>All categories</option>
          {page.facets.families
            .filter((bucket) => bucket.count > 0 || bucket.value === family)
            .map((bucket) => (
              <option key={bucket.value} value={bucket.value}>
                {MASTER_OFFERING_FAMILY_LABELS[bucket.value] ?? bucket.label} (
                {bucket.count})
              </option>
            ))}
        </select>
      </label>

      <label className="grid min-w-0 gap-2" htmlFor="sf-category">
        <span className="form-label">Type</span>
        <select
          id="sf-category"
          className="input-field"
          value={category}
          data-testid="sf-category"
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, categories: _categories, ...rest } = query;
            onChange(value === ALL ? rest : { ...rest, categories: [value] });
          }}
        >
          <option value={ALL}>All types</option>
          {page.facets.categories
            .filter((bucket) => bucket.count > 0 || bucket.value === category)
            .map((bucket) => (
              <option key={bucket.value} value={bucket.value}>
                {bucket.label} ({bucket.count})
              </option>
            ))}
        </select>
      </label>

      <label className="grid min-w-0 gap-2" htmlFor="sf-sort">
        <span className="form-label">Sort</span>
        <select
          id="sf-sort"
          className="input-field"
          value={sort}
          data-testid="sf-sort"
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, sort: _sort, ...rest } = query;
            onChange(
              isMasterOfferingSort(value)
                ? { ...rest, sort: value as MasterOfferingSort }
                : rest,
            );
          }}
        >
          <option value={ALL}>Best match</option>
          {MASTER_OFFERING_SORTS.map((value) => (
            <option key={value} value={value}>
              {MASTER_OFFERING_SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function StorefrontPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 mt-6"
      aria-label="Catalog pages"
    >
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        disabled={page <= 1}
        data-testid="sf-prev"
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <p className="body-s text-ink-mute" data-testid="sf-page-position">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        disabled={page >= totalPages}
        data-testid="sf-next"
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

/**
 * The public catalog page. Presentational: the page, the query, and the
 * callbacks come from the container, so it fetches nothing and holds no
 * session of its own.
 */
export function StorefrontCatalogPage({
  query,
  page,
  onQueryChange,
  loading = false,
}: {
  query: MasterOfferingCatalogQuery;
  page: PublicStorefrontPage;
  onQueryChange: (next: MasterOfferingCatalogQuery) => void;
  loading?: boolean;
}) {
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const currentPage = page.page;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    resultsHeading.current?.focus();
  }, [currentPage]);

  return (
    <main className="container-x grid min-w-0 gap-6" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header className="grid min-w-0 gap-2">
        <p className="mono-label text-ink-mute">Xenios Research</p>
        <h1 className="display-s">Research catalog</h1>
        <p className="body-s text-ink-2 max-w-[70ch] min-w-0 break-words">
          Browse what we carry, with its current availability and its price
          where one is published. Where a price is not published yet, it says
          so. Anything you cannot order directly can still be requested, and a
          person picks it up.
        </p>
        <p className="body-s text-ink-mute">
          <Link
            href="/research/sign-in"
            className="underline"
            data-testid="sf-catalog-signin"
          >
            Member sign in
          </Link>
          {" · "}
          <Link href="/research/apply" className="underline" data-testid="sf-catalog-apply">
            Apply for membership
          </Link>
        </p>
      </header>

      <StorefrontControls query={query} page={page} onChange={onQueryChange} />

      <section aria-labelledby="sf-results" className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <h2 id="sf-results" className="body-l font-700" tabIndex={-1} ref={resultsHeading}>
            Results
          </h2>
          <p
            className="body-s text-ink-mute"
            role="status"
            aria-live="polite"
            data-testid="sf-result-count"
          >
            {loading
              ? "Loading the catalog"
              : page.total === 0
                ? "No products match your search"
                : `Showing ${page.products.length} of ${page.total} products`}
          </p>
        </div>

        {!loading && page.total === 0 ? (
          <div className="mt-4">
            <ResearchEmptyState
              title="Nothing matches your search."
              body="Clear the search box or choose a different category."
              action={
                <button
                  type="button"
                  className="btn btn-secondary min-h-[44px]"
                  data-testid="sf-clear"
                  onClick={() => onQueryChange({})}
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <ul className="grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3">
            {page.products.map((product) => (
              <StorefrontCard
                key={`${product.family}/${product.slug}`}
                product={product}
              />
            ))}
          </ul>
        )}

        <StorefrontPagination
          page={page.page}
          totalPages={page.totalPages}
          onPage={(next) => onQueryChange({ ...query, page: next })}
        />
      </section>
    </main>
  );
}

export default StorefrontCatalogPage;
