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
import { catalogQueryToSearch } from "./integration-packet";
import { usePublishedHeight } from "../lib/usePublishedHeight";
import "./catalog-toolbar.css";

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
 * The compact pager that rides in the catalog toolbar on phones, so a member
 * can change page without scrolling to the end of the list (KAN-225/10657).
 * It is a labelled group, not a second "Catalog pages" landmark: the full
 * pager after the last card stays the page's one pagination navigation.
 */
export function MasterOfferingToolbarPager({
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
    <div
      role="group"
      aria-label="Catalog pages, quick controls"
      className="flex min-w-0 items-center justify-between gap-2"
      data-testid="mo-toolbar-pager"
    >
      <button
        type="button"
        className="btn btn-secondary min-h-[44px] min-w-[44px]"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <p className="body-s text-ink-mute text-center min-w-0" data-testid="mo-toolbar-page-position">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        className="btn btn-secondary min-h-[44px] min-w-[44px]"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
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
  const surface = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const currentPage = page.page;
  const firstRender = useRef(true);
  // The page the member asked for with a pager, tied to that exact request.
  // A search or filter change also resets the page, but focus must stay in the
  // control the member is using, so only the pager's own page moves focus to
  // the results (KAN-31/10703, 10726).
  const pendingPageFocus = useRef<{
    page: number;
    /** The asked-for query in its URL form, to recognise it when it arrives. */
    request: string;
    /**
     * The query object the pager's request arrived as. The caller starts one
     * catalog request per query object, so a later object, even with the same
     * URL after Back and Forward, is a different request.
     */
    query: MasterOfferingCatalogQuery | null;
    /** Where focus was when the member asked. */
    origin: Element | null;
  } | null>(null);
  usePublishedHeight(toolbar, surface, "--research-catalog-toolbar-height");
  // Page-local, deliberately not in the URL: the shared query contract has no
  // access-path member, so a link cannot carry it and the server cannot count
  // it. See CatalogAccessPathRefine for why it is still worth having.
  const [accessPath, setAccessPath] = useState<CatalogAccessPath | null>(null);

  useEffect(() => {
    // Declared before the page effect, so in a commit that brings both a new
    // query and a new page, the query is recognised first.
    const pending = pendingPageFocus.current;
    if (!pending) return;
    if (pending.query === null) {
      // The first query after the click is the pager's own request.
      if (catalogQueryToSearch(query) === pending.request) pending.query = query;
      else pendingPageFocus.current = null;
    } else if (pending.query !== query) {
      // Any later query, from a control or from Back and Forward, takes over.
      pendingPageFocus.current = null;
    }
  }, [query]);

  useEffect(() => {
    // Move focus to the results heading after an explicit page change, so a
    // keyboard or screen-reader user is not left at the bottom of the old page.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const pending = pendingPageFocus.current;
    pendingPageFocus.current = null;
    // `query` is this render's, the one that brought the new page. A page
    // number or a URL alone also matches a search or a history traversal that
    // happens to land on the same page.
    if (!pending || pending.page !== currentPage || pending.query !== query) return;
    // If the member has moved focus while the page loaded, into Search on a
    // phone for instance, leave it there; moving it would close the keyboard.
    const active = document.activeElement;
    if (active && active !== document.body && active !== pending.origin) return;
    resultsHeading.current?.focus();
  }, [currentPage]);

  function goToPage(next: number) {
    const nextQuery = { ...query, page: next };
    pendingPageFocus.current = {
      page: next,
      request: catalogQueryToSearch(nextQuery),
      query: null,
      origin: document.activeElement,
    };
    onQueryChange(nextQuery);
  }

  // Any other way of changing the query takes over from a pending page.
  // Search cancels on the first keystroke, not after its debounce, so a
  // page that lands while the member is still typing cannot take focus.
  function cancelPageFocus() {
    pendingPageFocus.current = null;
  }
  function changeQuery(next: MasterOfferingCatalogQuery) {
    cancelPageFocus();
    onQueryChange(next);
  }
  const changeSearch = onSearchChange
    ? (next: MasterOfferingCatalogQuery) => {
        cancelPageFocus();
        onSearchChange(next);
      }
    : undefined;

  const showing = page.products.length;
  const refined = refineCardsByAccessPath(page.products, accessPath);
  const hasFilters = activeCatalogFilters(query, page.facets).some(
    (filter) => filter.key !== "sort",
  );

  return (
    <div className="grid min-w-0 gap-6" ref={surface}>
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

      {/* On phones this toolbar sticks below the member header, whose height
          the member chrome publishes as --research-sticky-chrome-height. */}
      <div ref={toolbar} className="research-catalog-toolbar min-w-0" data-testid="mo-catalog-toolbar">
        <MasterOfferingCatalogControls
          query={query}
          facets={page.facets}
          loading={loading}
          onChange={changeQuery}
          onSearchChange={changeSearch}
          onSearchInput={cancelPageFocus}
          pager={
            page.totalPages > 1 ? (
              <MasterOfferingToolbarPager
                page={page.page}
                totalPages={page.totalPages}
                onPage={goToPage}
              />
            ) : null
          }
        />
      </div>
      <CatalogActiveFilters
        query={query}
        facets={page.facets}
        onChange={changeQuery}
      />
      <MasterOfferingPriceListDownload query={query} memberToken={memberToken} />

      <section aria-labelledby="mo-catalog-results" className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <h2
            id="mo-catalog-results"
            className="body-l font-700 research-catalog-results-heading"
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
                      changeQuery(query.pageSize ? { pageSize: query.pageSize } : {})
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
          onPage={goToPage}
        />
      </section>
    </div>
  );
}

export default FullCatalogPage;
