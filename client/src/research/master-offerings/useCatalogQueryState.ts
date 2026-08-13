import { useCallback, useEffect, useState } from "react";
import type { MasterOfferingCatalogQuery } from "@shared/research/master-offerings/contract";
import {
  catalogQueryToSearch,
  parseCatalogQueryFromSearch,
} from "./integration-packet";

/**
 * Catalog state lives in the URL.
 *
 * That is what makes back and forward work, what makes a filtered catalog
 * shareable, and what makes a deep link survive a reload. The alternative,
 * holding filters only in React state, quietly breaks the browser's own
 * navigation and is the usual reason a catalog feels wrong on a phone.
 *
 * `parseCatalogQueryFromSearch` is the only way a URL becomes state, so a
 * hand-edited or stale link can narrow the catalog but never widen audience,
 * breadth, or commerce. Anything outside the closed vocabulary is dropped.
 */

export interface CatalogHistory {
  search(): string;
  push(search: string): void;
  replace(search: string): void;
  subscribe(listener: () => void): () => void;
}

export const browserCatalogHistory: CatalogHistory = {
  search: () => window.location.search,
  push: (search) =>
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    ),
  replace: (search) =>
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    ),
  subscribe: (listener) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  },
};

export interface CatalogQueryState {
  query: MasterOfferingCatalogQuery;
  /** A filter change: a new history entry, so back returns the previous view. */
  setQuery(next: MasterOfferingCatalogQuery): void;
  /** A correction that should not add a history entry of its own. */
  replaceQuery(next: MasterOfferingCatalogQuery): void;
}

export function useCatalogQueryState(
  history: CatalogHistory = browserCatalogHistory,
): CatalogQueryState {
  const [query, setLocal] = useState<MasterOfferingCatalogQuery>(() =>
    parseCatalogQueryFromSearch(history.search()),
  );

  useEffect(() => {
    // Back and forward rewrite the URL without telling React. Re-reading the
    // URL on popstate is what keeps the rendered filters and the address bar
    // from drifting apart.
    return history.subscribe(() => {
      setLocal(parseCatalogQueryFromSearch(history.search()));
    });
  }, [history]);

  const commit = useCallback(
    (next: MasterOfferingCatalogQuery, mode: "push" | "replace") => {
      const search = catalogQueryToSearch(next);
      if (search === history.search()) {
        // Nothing changed. Pushing here would stack identical entries and make
        // the back button feel broken.
        setLocal(next);
        return;
      }
      if (mode === "push") history.push(search);
      else history.replace(search);
      setLocal(next);
    },
    [history],
  );

  return {
    query,
    setQuery: useCallback((next) => commit(next, "push"), [commit]),
    replaceQuery: useCallback((next) => commit(next, "replace"), [commit]),
  };
}
