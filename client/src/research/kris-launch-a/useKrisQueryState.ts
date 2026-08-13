import { useCallback, useEffect, useState } from "react";
import type { KrisCatalogQuery } from "@shared/research/kris-launch-a/contract";
import {
  browserCatalogHistory,
  type CatalogHistory,
} from "../master-offerings/useCatalogQueryState";
import { krisQueryToSearch, parseKrisQueryFromSearch } from "./integration-packet";

/**
 * Catalog state lives in the URL.
 *
 * That is what makes back and forward work, what makes a filtered catalog
 * shareable, and what makes a deep link survive a hard reload. The alternative,
 * holding filters only in React state, quietly breaks the browser's own
 * navigation and is the usual reason a catalog feels wrong on a phone.
 *
 * The history seam and the browser implementation are reused from the v2
 * catalog rather than written a second time. They carry no v2 types: a search
 * string in, a search string out, and a popstate subscription. One correct
 * implementation of that is better than two that can drift.
 *
 * `parseKrisQueryFromSearch` is the only way a URL becomes state, so a
 * hand-edited link can narrow the catalog but can never name a family, a
 * channel, a sort or a page size the contract does not have.
 */

export interface KrisQueryState {
  query: KrisCatalogQuery;
  /** A filter change: a new history entry, so back returns the previous view. */
  setQuery(next: KrisCatalogQuery): void;
  /** A correction that should not add a history entry of its own. */
  replaceQuery(next: KrisCatalogQuery): void;
}

export function useKrisQueryState(
  history: CatalogHistory = browserCatalogHistory,
): KrisQueryState {
  const [query, setLocal] = useState<KrisCatalogQuery>(() =>
    parseKrisQueryFromSearch(history.search()),
  );

  useEffect(() => {
    // Back and forward rewrite the URL without telling React. Re-reading the
    // URL on popstate is what keeps the rendered filters and the address bar
    // from drifting apart.
    return history.subscribe(() => {
      setLocal(parseKrisQueryFromSearch(history.search()));
    });
  }, [history]);

  const commit = useCallback(
    (next: KrisCatalogQuery, mode: "push" | "replace") => {
      const search = krisQueryToSearch(next);
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

export { browserCatalogHistory };
export type { CatalogHistory };
