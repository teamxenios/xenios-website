import { useEffect, useRef, useState } from "react";
import type {
  MasterOfferingCatalogPage,
  MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import { ResearchEmptyState, ResearchSecureNotice } from "../ui/kit";
import {
  CATALOG_ACCESS_PATH_LABELS,
  refineCardsByAccessPath,
  type CatalogAccessPath,
} from "./catalog-access-path";
import {
  CatalogAccessPathRefine,
  CatalogActiveFilters,
  activeCatalogFilters,
} from "./CatalogActiveFilters";
import { MasterOfferingCard } from "./MasterOfferingCard";
import {
  MasterOfferingCatalogControls,
  MasterOfferingPriceListDownload,
} from "./MasterOfferingCatalogControls";

export function MasterOfferingPagination({
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
        onClick={() => onPage(page - 1)}
      >
        Previous page
      </button>
      <p className="body-s text-ink-mute" data-testid="mo-page-position">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </button>
    </nav>
  );
}

/**
 * The full member-safe catalog surface.
 *
 * It is deliberately presentational: the page it renders, the query it echoes,
 * and the callbacks it calls all come from the caller. It performs no fetch,
 * holds no token, and mounts no route, so the composition root decides when and
 * whether this reaches a member.
 *
 * It renders one page of cards, never the whole catalog into the first DOM.
 */
export function FullCatalogPage({
  query,
  page,
  onQueryChange,
  onSearchChange,
  loading = false,
  memberToken = null,
}: {
  query: MasterOfferingCatalogQuery;
  page: MasterOfferingCatalogPage;
  onQueryChange: (next: MasterOfferingCatalogQuery) => void;
  onSearchChange?: (next: MasterOfferingCatalogQuery) => void;
  loading?: boolean;
  /** Passed straight to the price-list download, which authenticates. */
  memberToken?: string | null;
}) {
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const currentPage = page.page;
  const firstRender = useRef(true);
  // Page-local, deliberately not in the URL: the shared query contract has no
  // access-path member, so a link cannot carry it and the server cannot count
  // it. See CatalogAccessPathRefine for why it is still worth having.
  const [accessPath, setAccessPath] = useState<CatalogAccessPath | null>(null);

  useEffect(() => {
    // Move focus to the results heading after an explicit page change, so a
    // keyboard or screen-reader user is not left at the bottom of the old page.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    resultsHeading.current?.focus();
  }, [currentPage]);

  const showing = page.products.length;
  const refined = refineCardsByAccessPath(page.products, accessPath);
  const hasFilters = activeCatalogFilters(query, page.facets).some(
    (filter) => filter.key !== "sort",
  );

  return (
    <div className="grid min-w-0 gap-6">
      <header className="grid min-w-0 gap-2">
        <p className="mono-label text-ink-mute">Xenios Research</p>
        <h1 className="display-s">Full catalog</h1>
        <p className="body-s text-ink-2 max-w-[70ch] min-w-0 break-words">
          Every offering we can show you, with its truthful availability and its
          approved price. Where a price is not yet approved it says so. Each
          exact variant states its available next step: direct checkout, a
          request, Care, updates, or no current action.
        </p>
        <ResearchSecureNotice>
          Private catalog. Not indexed, and not for redistribution.
        </ResearchSecureNotice>
      </header>

      <MasterOfferingCatalogControls
        query={query}
        facets={page.facets}
        loading={loading}
        onChange={onQueryChange}
        onSearchChange={onSearchChange}
      />
      <CatalogActiveFilters
        query={query}
        facets={page.facets}
        onChange={onQueryChange}
      />
      <MasterOfferingPriceListDownload query={query} memberToken={memberToken} />

      <section aria-labelledby="mo-catalog-results" className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <h2
            id="mo-catalog-results"
            className="body-l font-700"
            tabIndex={-1}
            ref={resultsHeading}
          >
            Results
          </h2>
          <p
            className="body-s text-ink-mute"
            role="status"
            aria-live="polite"
            data-testid="mo-result-count"
          >
            {loading
              ? "Loading the catalog"
              : page.total === 0
                ? hasFilters
                  ? "No offerings match these filters"
                  : "No offerings to show yet"
                : accessPath === null
                  ? `Showing ${showing} of ${page.total} offerings`
                  : `Showing ${refined.length} of ${showing} on this page, ${page.total} in the catalog`}
          </p>
        </div>

        {!loading && page.total > 0 && (
          <div className="mt-4">
            <CatalogAccessPathRefine
              products={page.products}
              value={accessPath}
              onChange={setAccessPath}
            />
          </div>
        )}

        {!loading && page.total === 0 ? (
          <div className="mt-4">
            {hasFilters ? (
              <ResearchEmptyState
                title="Nothing matches these filters."
                body="Clear the search or widen the family, category, or listing-state filters."
                action={
                  <button
                    type="button"
                    className="btn btn-secondary min-h-[44px]"
                    data-testid="mo-no-results-clear"
                    onClick={() =>
                      onQueryChange(query.pageSize ? { pageSize: query.pageSize } : {})
                    }
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              // No filters and no rows is a different fact from "your filters
              // are too narrow": it is the catalog telling the truth that it
              // has nothing to show this member yet. Blaming the filters here
              // would send a member clearing controls that are already clear.
              <ResearchEmptyState
                title="There is nothing in the catalog to show yet."
                body="Nothing is wrong with your account. Offerings appear here as they are prepared."
              />
            )}
          </div>
        ) : !loading && refined.length === 0 ? (
          <div className="mt-4">
            <ResearchEmptyState
              title={`No card on this page has ${
                accessPath === null ? "that next step" : CATALOG_ACCESS_PATH_LABELS[accessPath]
              } as a next step.`}
              body="Other pages may. Choose Any next step to see this whole page again, or page through the catalog."
              action={
                <button
                  type="button"
                  className="btn btn-secondary min-h-[44px]"
                  data-testid="mo-refine-clear"
                  onClick={() => setAccessPath(null)}
                >
                  Any next step
                </button>
              }
            />
          </div>
        ) : (
          <ul
            className="grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="mo-card-list"
          >
            {refined.map((product) => (
              <MasterOfferingCard key={product.id} product={product} />
            ))}
          </ul>
        )}

        <MasterOfferingPagination
          page={page.page}
          totalPages={page.totalPages}
          onPage={(next) => onQueryChange({ ...query, page: next })}
        />
      </section>
    </div>
  );
}

export default FullCatalogPage;
