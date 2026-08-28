import { useCallback, useEffect, useState } from "react";
import type { CatalogHistory } from "./useCatalogQueryState";
import { browserCatalogHistory } from "./useCatalogQueryState";
import {
  parseCatalogDiscoveryQuery,
  serializeCatalogDiscoveryQuery,
  type CatalogDiscoveryQuery,
} from "./catalog-discovery-query";

export interface CatalogDiscoveryQueryState {
  query: CatalogDiscoveryQuery;
  /** Discrete filters create history so Back restores the earlier view. */
  setQuery(next: CatalogDiscoveryQuery): void;
  /** Search corrections replace the current entry instead of stacking keys. */
  replaceQuery(next: CatalogDiscoveryQuery): void;
}

export function useCatalogDiscoveryQueryState(
  history: CatalogHistory = browserCatalogHistory,
): CatalogDiscoveryQueryState {
  const [query, setLocal] = useState<CatalogDiscoveryQuery>(() =>
    parseCatalogDiscoveryQuery(history.search()),
  );

  useEffect(
    () =>
      history.subscribe(() => {
        setLocal(parseCatalogDiscoveryQuery(history.search()));
      }),
    [history],
  );

  const commit = useCallback(
    (next: CatalogDiscoveryQuery, mode: "push" | "replace") => {
      const search = serializeCatalogDiscoveryQuery(next);
      if (search !== history.search()) {
        if (mode === "push") history.push(search);
        else history.replace(search);
      }
      setLocal(parseCatalogDiscoveryQuery(search));
    },
    [history],
  );

  return {
    query,
    setQuery: useCallback((next) => commit(next, "push"), [commit]),
    replaceQuery: useCallback((next) => commit(next, "replace"), [commit]),
  };
}
