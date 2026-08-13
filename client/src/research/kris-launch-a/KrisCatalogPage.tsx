import { useEffect, useRef } from "react";
import type {
  KrisCatalogPage as KrisCatalogPageView,
  KrisCatalogQuery,
} from "@shared/research/kris-launch-a/contract";
import { ResearchEmptyState, ResearchSecureNotice } from "../ui/kit";
import { KRIS_EMPTY_RESULT_COPY } from "./catalogApi";
import { KrisCatalogCard } from "./KrisCatalogCard";
import { KrisCatalogControls } from "./KrisCatalogControls";

export function KrisPagination({
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
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 mt-6"
      aria-label="Catalog pages"
    >
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        disabled={page <= 1}
        data-testid="kris-prev-page"
        onClick={() => onPage(page - 1)}
      >
        Previous page
      </button>
      <p className="body-s text-ink-mute" data-testid="kris-page-position">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        disabled={page >= totalPages}
        data-testid="kris-next-page"
        onClick={() => onPage(page + 1)}
      >
        Next page
      </button>
    </nav>
  );
}

/**
 * The Launch A catalog list.
 *
 * Presentational on purpose: the page it renders, the query it echoes and the
 * callbacks it calls all come from the caller. It performs no fetch and holds
 * no token.
 *
 * IT RENDERS ONE PAGE OF CARDS, NEVER THE WHOLE CATALOG. 420 items in the first
 * DOM is a phone that stalls on open, and paging is the server's job: this
 * surface asks for a page and renders exactly what came back.
 */
export function KrisCatalogPage({
  query,
  page,
  onQueryChange,
  loading = false,
}: {
  query: KrisCatalogQuery;
  page: KrisCatalogPageView;
  onQueryChange: (next: KrisCatalogQuery) => void;
  loading?: boolean;
}) {
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const currentPage = page.page;
  const firstRender = useRef(true);

  useEffect(() => {
    // Move focus to the results heading after a page change, so a keyboard or
    // screen reader user is not left at the bottom of the previous page.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    resultsHeading.current?.focus();
  }, [currentPage]);

  const showing = page.items.length;

  return (
    <main className="grid min-w-0 gap-6">
      <header className="grid min-w-0 gap-2">
        <p className="mono-label text-ink-mute">Xenios Research</p>
        <h1 className="display-s">Partner catalog</h1>
        <p className="body-s text-ink-2 max-w-[70ch] min-w-0 break-words">
          Every item in this catalog, with the access its channel requires and
          your partner price. Where a price is not set yet it says so. Nothing
          here is a purchase: items are browsed here and ordered through the
          workflow their access requires.
        </p>
        <ResearchSecureNotice>
          Private catalog and confidential prices. Not indexed, and not for
          redistribution.
        </ResearchSecureNotice>
      </header>

      <KrisCatalogControls
        query={query}
        onChange={onQueryChange}
        facets={page.facets}
      />

      <section aria-labelledby="kris-results" className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <h2 id="kris-results" className="body-l font-700" tabIndex={-1} ref={resultsHeading}>
            Results
          </h2>
          <p
            className="body-s text-ink-mute"
            role="status"
            aria-live="polite"
            data-testid="kris-result-count"
          >
            {loading
              ? "Loading the catalog"
              : page.total === 0
                ? "No items match these filters"
                : `Showing ${showing} of ${page.total} items`}
          </p>
        </div>

        {!loading && page.total === 0 ? (
          <div className="mt-4">
            {/* The empty FILTER result. A catalog that is not available is a
                different state with different copy and a Try again, and it is
                handled by the surface above this one. Telling a member their
                filters matched nothing while the catalog is down would be a
                lie about their search. */}
            <ResearchEmptyState
              title={KRIS_EMPTY_RESULT_COPY.title}
              body={KRIS_EMPTY_RESULT_COPY.body}
              action={
                <button
                  type="button"
                  className="btn btn-secondary min-h-[44px]"
                  data-testid="kris-clear-filters"
                  onClick={() => onQueryChange({})}
                >
                  Clear the filters
                </button>
              }
            />
          </div>
        ) : (
          <ul
            className="grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="kris-card-list"
          >
            {page.items.map((item) => (
              <KrisCatalogCard key={item.id} item={item} />
            ))}
          </ul>
        )}

        <KrisPagination
          page={page.page}
          totalPages={page.totalPages}
          onPage={(next) => onQueryChange({ ...query, page: next })}
        />
      </section>
    </main>
  );
}

export default KrisCatalogPage;
