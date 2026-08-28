import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_KRIS_SORT,
  KRIS_PRICE_PROFILES,
  type KrisCatalogPage as KrisCatalogPageView,
  type KrisCatalogQuery,
} from "@shared/research/kris-launch-a/contract";
import { ResearchEmptyState } from "../ui/kit";
import {
  KRIS_STATE_COPY,
  getKrisCatalog,
  toKrisSurfaceState,
  type KrisSurfaceState,
} from "./catalogApi";
import { KrisCatalogPage } from "./KrisCatalogPage";
import {
  browserCatalogHistory,
  useKrisQueryState,
  type CatalogHistory,
} from "./useKrisQueryState";

/**
 * The catalog container: URL state in, one page of cards out, with every non-ok
 * state rendered honestly and a way back from each of them.
 *
 * It holds no token of its own. The caller passes one, so the composition root
 * decides when a member reaches this.
 */

const EMPTY_PAGE: KrisCatalogPageView = {
  ok: true,
  profile: KRIS_PRICE_PROFILES[0],
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 0,
  sort: DEFAULT_KRIS_SORT,
  facets: { families: [], channels: [] },
  items: [],
};

/** A skeleton the shape of a card, so the page does not jump on arrival. */
export function KrisCatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul
      className="grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
      data-testid="kris-skeleton"
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

export function KrisCatalogSurface({
  memberToken,
  history = browserCatalogHistory,
  fetchCatalog = getKrisCatalog,
}: {
  memberToken: string | null;
  history?: CatalogHistory;
  fetchCatalog?: typeof getKrisCatalog;
}) {
  const { query, setQuery } = useKrisQueryState(history);
  const [page, setPage] = useState<KrisCatalogPageView>(EMPTY_PAGE);
  const [state, setState] = useState<KrisSurfaceState>("loading");
  const generation = useRef(0);

  const load = useCallback(
    async (current: KrisCatalogQuery) => {
      const mine = ++generation.current;
      setState("loading");
      const result = await fetchCatalog(memberToken, current);
      // A slow first request must never overwrite a fast later one. Without
      // this, typing in the search box can leave the previous query's results
      // on screen under the current query's filters.
      if (mine !== generation.current) return;
      if (result.kind === "ok" && result.data?.ok === true) {
        setPage(result.data);
        setState("ok");
        return;
      }
      setPage(EMPTY_PAGE);
      // A 200 that is not the contract's page is not an empty catalog. It is a
      // route that is not there, and it is reported as unavailable rather than
      // rendered as "nothing matches".
      setState(result.kind === "ok" ? "unavailable" : toKrisSurfaceState(result));
    },
    [fetchCatalog, memberToken],
  );

  useEffect(() => {
    void load(query);
    return () => {
      generation.current += 1;
    };
  }, [load, query]);

  if (state !== "ok" && state !== "loading") {
    const copy = KRIS_STATE_COPY[state];
    const recoverable = state === "error" || state === "unavailable";
    return (
      <div className="grid min-w-0 gap-6">
        <header className="grid min-w-0 gap-2">
          <p className="mono-label text-ink-mute">Xenios Research</p>
          <h1 className="display-s">Partner catalog</h1>
        </header>
        <ResearchEmptyState
          title={copy.title}
          body={copy.body}
          action={
            recoverable ? (
              <button
                type="button"
                className="btn btn-secondary min-h-[44px]"
                data-testid="kris-retry"
                onClick={() => void load(query)}
              >
                Try again
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <>
      <KrisCatalogPage
        query={query}
        page={page}
        onQueryChange={setQuery}
        loading={state === "loading"}
      />
      {state === "loading" && page.total === 0 && <KrisCatalogSkeleton />}
    </>
  );
}

export default KrisCatalogSurface;
