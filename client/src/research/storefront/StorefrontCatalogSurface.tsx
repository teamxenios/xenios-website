import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { DEFAULT_MASTER_OFFERING_SORT } from "@shared/research/master-offerings/contract";
import type { MasterOfferingCatalogQuery } from "@shared/research/master-offerings/contract";
import {
  EMPTY_PUBLIC_STOREFRONT_FACETS,
  type PublicStorefrontPage,
} from "@shared/research/storefront/contract";
import { ResearchEmptyState } from "../ui/kit";
import { useCatalogQueryState, type CatalogHistory, browserCatalogHistory } from "../master-offerings/useCatalogQueryState";
import {
  PUBLIC_STOREFRONT_STATE_COPY,
  getPublicStorefrontCatalog,
  toPublicStorefrontSurfaceState,
  type PublicStorefrontSurfaceState,
} from "./storefrontApi";
import { StorefrontCatalogPage } from "./StorefrontCatalogPage";

const EMPTY_PAGE: PublicStorefrontPage = {
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 0,
  sort: DEFAULT_MASTER_OFFERING_SORT,
  products: [],
  facets: EMPTY_PUBLIC_STOREFRONT_FACETS,
};

function CatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul
      className="container-x grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
      data-testid="sf-skeleton"
    >
      {Array.from({ length: count }, (_unused, index) => (
        <li key={index}>
          <div className="card grid gap-3">
            <div className="h-3 w-24 rounded bg-[var(--surface-2,#e5e5e5)]" />
            <div className="h-5 w-3/4 rounded bg-[var(--surface-2,#e5e5e5)]" />
            <div className="h-3 w-full rounded bg-[var(--surface-2,#e5e5e5)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--surface-2,#e5e5e5)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The public catalog container: URL state in, one page of cards out.
 *
 * No token and no session. While the server has the storefront closed, this
 * renders the "not open yet" state WITH the member and application doors
 * still offered, so a closed catalog is never a dead end either.
 */
export function StorefrontCatalogSurface({
  history = browserCatalogHistory,
  fetchCatalog = getPublicStorefrontCatalog,
}: {
  history?: CatalogHistory;
  fetchCatalog?: typeof getPublicStorefrontCatalog;
}) {
  const { query, setQuery } = useCatalogQueryState(history);
  const [page, setPage] = useState<PublicStorefrontPage>(EMPTY_PAGE);
  const [state, setState] = useState<PublicStorefrontSurfaceState>("loading");
  const generation = useRef(0);

  const load = useCallback(
    async (current: MasterOfferingCatalogQuery) => {
      const mine = ++generation.current;
      setState("loading");
      const result = await fetchCatalog(current);
      // A slow earlier request must never overwrite a fast later one.
      if (mine !== generation.current) return;
      if (result.kind === "ok" && result.data?.ok === true) {
        setPage(result.data.catalog);
        setState("ok");
        return;
      }
      setPage(EMPTY_PAGE);
      setState(
        result.kind === "ok" ? "unavailable" : toPublicStorefrontSurfaceState(result),
      );
    },
    [fetchCatalog],
  );

  useEffect(() => {
    void load(query);
    return () => {
      generation.current += 1;
    };
  }, [load, query]);

  if (state !== "ok" && state !== "loading") {
    const copy = PUBLIC_STOREFRONT_STATE_COPY[state];
    const recoverable = state === "error";
    return (
      <main
        className="container-x grid min-w-0 gap-6"
        style={{ paddingTop: 48, paddingBottom: 64 }}
      >
        <header className="grid min-w-0 gap-2">
          <p className="mono-label text-ink-mute">Xenios Research</p>
          <h1 className="display-s">Research catalog</h1>
        </header>
        <ResearchEmptyState
          title={copy.title}
          body={copy.body}
          action={
            <div className="flex flex-wrap gap-3">
              {recoverable && (
                <button
                  type="button"
                  className="btn btn-secondary min-h-[44px]"
                  data-testid="sf-retry"
                  onClick={() => void load(query)}
                >
                  Try again
                </button>
              )}
              <Link
                href="/research/sign-in"
                className="btn btn-primary min-h-[44px]"
                data-testid="sf-closed-signin"
              >
                Member sign in
              </Link>
              <Link
                href="/research/apply"
                className="btn btn-secondary min-h-[44px]"
                data-testid="sf-closed-apply"
              >
                Apply for membership
              </Link>
            </div>
          }
        />
      </main>
    );
  }

  return (
    <>
      <StorefrontCatalogPage
        query={query}
        page={page}
        onQueryChange={setQuery}
        loading={state === "loading"}
      />
      {state === "loading" && page.total === 0 && <CatalogSkeleton />}
    </>
  );
}

export default StorefrontCatalogSurface;
