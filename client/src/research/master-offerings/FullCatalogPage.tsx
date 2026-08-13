import { useEffect, useRef } from "react";
import type {
  MasterOfferingCatalogPage,
  MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import { ResearchEmptyState, ResearchSecureNotice } from "../ui/kit";
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
  loading = false,
}: {
  query: MasterOfferingCatalogQuery;
  page: MasterOfferingCatalogPage;
  onQueryChange: (next: MasterOfferingCatalogQuery) => void;
  loading?: boolean;
}) {
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const currentPage = page.page;
  const firstRender = useRef(true);

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

  return (
    <main className="grid gap-6">
      <header className="grid gap-2">
        <p className="mono-label text-ink-mute">Xenios Research</p>
        <h1 className="display-s">Full catalog</h1>
        <p className="body-s text-ink-2 max-w-[70ch]">
          Every offering we can show you, with its truthful availability and its
          approved price. Where a price is not yet approved it says so. Anything
          without direct checkout can still be requested, and a person picks it
          up.
        </p>
        <ResearchSecureNotice>
          Private catalog. Not indexed, and not for redistribution.
        </ResearchSecureNotice>
      </header>

      <MasterOfferingCatalogControls query={query} onChange={onQueryChange} />
      <MasterOfferingPriceListDownload query={query} />

      <section aria-labelledby="mo-catalog-results">
        <div className="flex flex-wrap items-end justify-between gap-3">
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
                ? "No offerings match these filters"
                : `Showing ${showing} of ${page.total} offerings`}
          </p>
        </div>

        {!loading && page.total === 0 ? (
          <div className="mt-4">
            <ResearchEmptyState
              title="Nothing matches these filters."
              body="Clear the search or widen the family and availability filters."
            />
          </div>
        ) : (
          <ul className="grid gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3">
            {page.products.map((product) => (
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
    </main>
  );
}

export default FullCatalogPage;
