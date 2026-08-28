import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILIES,
  MASTER_OFFERING_FAMILY_LABELS,
  MASTER_OFFERING_SORT_LABELS,
  MASTER_OFFERING_SORTS,
  isMasterOfferingDisplayState,
  isMasterOfferingFamily,
  isMasterOfferingSort,
  type MasterOfferingCatalogFacets,
  type MasterOfferingCatalogQuery,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
  type MasterOfferingSort,
} from "@shared/research/master-offerings/contract";
import type { MasterOfferingPriceListFormat } from "@shared/research/master-offerings/pricing-contract";
import {
  MASTER_OFFERING_PRICE_LIST_FAILURE_COPY,
  fetchMasterOfferingPriceList,
  saveMasterOfferingPriceList,
} from "./catalogApi";
import { MASTER_OFFERING_FILTER_STATES } from "./integration-packet";

const ALL = "all";
const SEARCH_DEBOUNCE_MS = 250;

function withCount(label: string, count: number | undefined): string {
  return count === undefined ? label : `${label} (${count})`;
}

/**
 * Search and discovery controls over the member-safe DTO. Families, states and
 * sorts come from the closed shared vocabulary; categories and their labels
 * come back from the server's current facet response. Nothing here can select
 * audience, breadth, launch scope, activation state, or commerce mode.
 */
export function MasterOfferingCatalogControls({
  query,
  facets,
  loading = false,
  onChange,
  onSearchChange,
}: {
  query: MasterOfferingCatalogQuery;
  facets: MasterOfferingCatalogFacets;
  loading?: boolean;
  onChange: (next: MasterOfferingCatalogQuery) => void;
  /** Search replaces its URL entry after a short pause; discrete filters push. */
  onSearchChange?: (next: MasterOfferingCatalogQuery) => void;
}) {
  const family = query.families?.[0] ?? ALL;
  const state = query.states?.[0] ?? ALL;
  const category = query.categories?.[0] ?? ALL;
  const sort = query.sort ?? DEFAULT_MASTER_OFFERING_SORT;
  const [searchDraft, setSearchDraft] = useState(query.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const queryRef = useRef(query);
  const searchCallbackRef = useRef(onSearchChange ?? onChange);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  queryRef.current = query;
  searchCallbackRef.current = onSearchChange ?? onChange;

  useEffect(() => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    setSearchDraft(query.q ?? "");
  }, [query]);

  useEffect(
    () => () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    [],
  );

  const familyCounts = new Map(
    facets.families.map((bucket) => [bucket.value, bucket.count] as const),
  );
  const stateCounts = new Map(
    facets.states.map((bucket) => [bucket.value, bucket.count] as const),
  );
  const activeFilterCount =
    (searchDraft.trim() ? 1 : 0) +
    (query.families?.length ?? 0) +
    (query.states?.length ?? 0) +
    (query.categories?.length ?? 0);
  const canReset =
    activeFilterCount > 0 || sort !== DEFAULT_MASTER_OFFERING_SORT;

  function cancelPendingSearch() {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }

  function currentQueryWithDraft(): MasterOfferingCatalogQuery {
    const { page: _page, q: _q, ...rest } = queryRef.current;
    const q = searchDraft.trim().slice(0, 160);
    return q ? { ...rest, q } : rest;
  }

  function scheduleSearch(value: string) {
    const bounded = value.slice(0, 160);
    setSearchDraft(bounded);
    cancelPendingSearch();
    searchTimer.current = setTimeout(() => {
      const { page: _page, q: _q, ...rest } = queryRef.current;
      const q = bounded.trim();
      searchCallbackRef.current(q ? { ...rest, q } : rest);
      searchTimer.current = null;
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="card grid min-w-0 gap-4" data-testid="mo-catalog-controls">
      <button
        type="button"
        className="btn btn-secondary min-h-[44px] md:hidden"
        aria-expanded={filtersOpen}
        aria-controls="mo-catalog-filter-fields"
        data-testid="mo-filter-toggle"
        onClick={() => setFiltersOpen((current) => !current)}
      >
        {filtersOpen ? "Hide filters" : "Show filters"}
      </button>

      <div
        id="mo-catalog-filter-fields"
        className={`${filtersOpen ? "grid" : "hidden"} min-w-0 gap-4 md:grid md:grid-cols-2 xl:grid-cols-6`}
      >
        <label
          className="grid min-w-0 gap-2 xl:col-span-2"
          htmlFor="mo-catalog-search"
        >
          <span className="form-label">Search the catalog</span>
          <input
            id="mo-catalog-search"
            className="input-field min-h-[44px]"
            type="search"
            maxLength={160}
            value={searchDraft}
            placeholder="Name, strength, or format"
            aria-describedby="mo-catalog-search-help"
            onChange={(event) => scheduleSearch(event.target.value)}
          />
          <span id="mo-catalog-search-help" className="sr-only">
            Results update after a brief pause.
          </span>
        </label>

        <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-family">
          <span className="form-label">Family</span>
          <select
            id="mo-catalog-family"
            className="input-field min-h-[44px]"
            value={family}
            onChange={(event) => {
              cancelPendingSearch();
              const value = event.target.value;
              const {
                families: _families,
                ...rest
              } = currentQueryWithDraft();
              onChange(
                isMasterOfferingFamily(value)
                  ? { ...rest, families: [value as MasterOfferingFamily] }
                  : rest,
              );
            }}
          >
            <option value={ALL}>All families</option>
            {MASTER_OFFERING_FAMILIES.map((value) => (
              <option key={value} value={value}>
                {withCount(
                  MASTER_OFFERING_FAMILY_LABELS[value],
                  familyCounts.get(value),
                )}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-category">
          <span className="form-label">Category</span>
          <select
            id="mo-catalog-category"
            className="input-field min-h-[44px]"
            value={category}
            aria-busy={loading || undefined}
            onChange={(event) => {
              cancelPendingSearch();
              const value = event.target.value;
              const {
                categories: _categories,
                ...rest
              } = currentQueryWithDraft();
              onChange(
                facets.categories.some((bucket) => bucket.value === value)
                  ? { ...rest, categories: [value] }
                  : rest,
              );
            }}
          >
            <option value={ALL}>
              {loading && facets.categories.length === 0
                ? "Loading categories"
                : "All categories"}
            </option>
            {facets.categories.map((bucket) => (
              <option key={bucket.value} value={bucket.value}>
                {withCount(bucket.label, bucket.count)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-state">
          <span className="form-label">Listing state</span>
          <select
            id="mo-catalog-state"
            className="input-field min-h-[44px]"
            value={state}
            onChange={(event) => {
              cancelPendingSearch();
              const value = event.target.value;
              const { states: _states, ...rest } = currentQueryWithDraft();
              onChange(
                isMasterOfferingDisplayState(value)
                  ? { ...rest, states: [value as MasterOfferingDisplayState] }
                  : rest,
              );
            }}
          >
            <option value={ALL}>Any listing state</option>
            {MASTER_OFFERING_FILTER_STATES.map((value) => (
              <option key={value} value={value}>
                {withCount(
                  MASTER_OFFERING_DISPLAY_LABELS[value],
                  stateCounts.get(value),
                )}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-sort">
          <span className="form-label">Sort by</span>
          <select
            id="mo-catalog-sort"
            className="input-field min-h-[44px]"
            value={sort}
            onChange={(event) => {
              cancelPendingSearch();
              const value = event.target.value;
              const { sort: _sort, ...rest } = currentQueryWithDraft();
              onChange(
                isMasterOfferingSort(value)
                  ? { ...rest, sort: value as MasterOfferingSort }
                  : rest,
              );
            }}
          >
            {MASTER_OFFERING_SORTS.map((value) => (
              <option key={value} value={value}>
                {MASTER_OFFERING_SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p className="body-s text-ink-mute" data-testid="mo-active-filter-count">
          {activeFilterCount === 0
            ? "No filters applied"
            : `${activeFilterCount} active ${
                activeFilterCount === 1 ? "filter" : "filters"
              }`}
        </p>
        <button
          type="button"
          className="btn btn-secondary min-h-[44px]"
          disabled={!canReset}
          data-testid="mo-clear-filters"
          onClick={() => {
            cancelPendingSearch();
            setSearchDraft("");
            onChange(query.pageSize ? { pageSize: query.pageSize } : {});
          }}
        >
          Clear filters and sort
        </button>
      </div>
    </div>
  );
}

/**
 * The price-list download.
 *
 * It fetches the export with the member's bearer token and hands the bytes to
 * the browser, because a link download cannot carry that header and the export
 * route has no cookie fallback. The file is still composed entirely by the
 * server: nothing here assembles catalog data, and a response that is not the
 * format that was asked for is refused rather than saved.
 */
export function MasterOfferingPriceListDownload({
  query,
  memberToken = null,
  fetchPriceList = fetchMasterOfferingPriceList,
  savePriceList = saveMasterOfferingPriceList,
}: {
  query: MasterOfferingCatalogQuery;
  memberToken?: string | null;
  fetchPriceList?: typeof fetchMasterOfferingPriceList;
  savePriceList?: typeof saveMasterOfferingPriceList;
}) {
  const [busy, setBusy] = useState<MasterOfferingPriceListFormat | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function download(format: MasterOfferingPriceListFormat) {
    if (busy !== null) return;
    setBusy(format);
    setMessage(null);
    const result = await fetchPriceList(memberToken, query, format);
    setBusy(null);
    if (!result.ok) {
      setMessage(MASTER_OFFERING_PRICE_LIST_FAILURE_COPY[result.failure]);
      return;
    }
    savePriceList(result.blob, result.filename);
    setMessage("Your price list download has started.");
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary min-h-[44px]"
          data-testid="mo-download-csv"
          disabled={busy !== null}
          onClick={() => void download("csv")}
        >
          {busy === "csv" ? "Preparing CSV" : "Download price list, CSV"}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-[44px]"
          data-testid="mo-download-json"
          disabled={busy !== null}
          onClick={() => void download("json")}
        >
          {busy === "json" ? "Preparing JSON" : "Download price list, JSON"}
        </button>
        <p className="body-s text-ink-mute min-w-0 break-words">
          The download matches the filters above and lists approved prices only.
        </p>
      </div>
      <p
        className="body-s text-ink-mute min-w-0 break-words"
        role="status"
        aria-live="polite"
        data-testid="mo-download-status"
      >
        {message ?? ""}
      </p>
    </div>
  );
}
