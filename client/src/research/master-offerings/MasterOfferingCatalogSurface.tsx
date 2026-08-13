import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MasterOfferingCatalogPage,
  MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import { ResearchEmptyState } from "../ui/kit";
import {
  MASTER_OFFERING_STATE_COPY,
  getMasterOfferingCatalog,
  toMasterOfferingSurfaceState,
  type MasterOfferingSurfaceState,
} from "./catalogApi";
import { FullCatalogPage } from "./FullCatalogPage";
import {
  useCatalogQueryState,
  type CatalogHistory,
  browserCatalogHistory,
} from "./useCatalogQueryState";

/**
 * The catalog container: URL state in, one page of cards out, with the
 * non-ok states rendered honestly and a way back from each of them.
 *
 * It is still routed nowhere. The composition root decides when a member
 * reaches it, and this file holds no token of its own: the caller passes one.
 */

const EMPTY_PAGE: MasterOfferingCatalogPage = {
  ok: true,
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 0,
  products: [],
};

/** A skeleton the same shape as a card, so the page does not jump on arrival. */
function CatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul
      className="grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
      data-testid="mo-skeleton"
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

export function MasterOfferingCatalogSurface({
  memberToken,
  history = browserCatalogHistory,
  fetchCatalog = getMasterOfferingCatalog,
}: {
  memberToken: string | null;
  history?: CatalogHistory;
  fetchCatalog?: typeof getMasterOfferingCatalog;
}) {
  const { query, setQuery } = useCatalogQueryState(history);
  const [page, setPage] = useState<MasterOfferingCatalogPage>(EMPTY_PAGE);
  const [state, setState] = useState<MasterOfferingSurfaceState>("loading");
  const generation = useRef(0);

  const load = useCallback(
    async (current: MasterOfferingCatalogQuery) => {
      const mine = ++generation.current;
      setState("loading");
      const result = await fetchCatalog(memberToken, current);
      // A slow first request must never overwrite a fast later one. Without
      // this, typing in the search box can leave the previous query's results
      // on screen under the current query's filters.
      if (mine !== generation.current) return;
      if (result.kind === "ok" && result.data?.ok === true) {
        setPage(result.data.catalog);
        setState("ok");
        return;
      }
      setPage(EMPTY_PAGE);
      setState(
        result.kind === "ok" ? "unavailable" : toMasterOfferingSurfaceState(result),
      );
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
    const copy = MASTER_OFFERING_STATE_COPY[state];
    const recoverable = state === "error" || state === "unavailable";
    return (
      <main className="grid min-w-0 gap-6">
        <header className="grid min-w-0 gap-2">
          <p className="mono-label text-ink-mute">Xenios Research</p>
          <h1 className="display-s">Full catalog</h1>
        </header>
        <ResearchEmptyState
          title={copy.title}
          body={copy.body}
          action={
            recoverable ? (
              <button
                type="button"
                className="btn btn-secondary min-h-[44px]"
                data-testid="mo-retry"
                onClick={() => void load(query)}
              >
                Try again
              </button>
            ) : undefined
          }
        />
      </main>
    );
  }

  return (
    <>
      <FullCatalogPage
        query={query}
        page={page}
        onQueryChange={setQuery}
        loading={state === "loading"}
        memberToken={memberToken}
      />
      {state === "loading" && page.total === 0 && <CatalogSkeleton />}
    </>
  );
}

export default MasterOfferingCatalogSurface;
