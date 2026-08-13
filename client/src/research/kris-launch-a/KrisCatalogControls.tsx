import {
  KRIS_CHANNELS,
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILIES,
  KRIS_FAMILY_LABELS,
  KRIS_SORTS,
  isKrisChannel,
  isKrisFamily,
  isKrisSort,
  type KrisCatalogFacets,
  type KrisCatalogQuery,
  type KrisChannel,
  type KrisFamily,
  type KrisSort,
} from "@shared/research/kris-launch-a/contract";
import { KRIS_MAX_QUERY_LENGTH, KRIS_PAGE_SIZES } from "./integration-packet";

const ALL = "all";

/** Plain-language names for the closed sort vocabulary. */
export const KRIS_SORT_LABELS: Readonly<Record<KrisSort, string>> = {
  relevance: "Best match",
  name_asc: "Name, A to Z",
  name_desc: "Name, Z to A",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
};

/** Append the facet count when the server sent one for this value. */
function withCount(
  label: string,
  buckets: KrisCatalogFacets["families"] | undefined,
  value: string,
): string {
  const bucket = buckets?.find((entry) => entry.value === value);
  return bucket ? `${label} (${bucket.count})` : label;
}

/**
 * Search, family, access channel, sort and page size.
 *
 * The vocabulary is the closed one from the contract, so a control can only
 * ever narrow this catalog. Nothing here can select a price profile, an
 * audience, or a commerce mode, because none of those exist in the query.
 */
export function KrisCatalogControls({
  query,
  onChange,
  facets,
}: {
  query: KrisCatalogQuery;
  onChange: (next: KrisCatalogQuery) => void;
  facets?: KrisCatalogFacets;
}) {
  const family = query.families?.[0] ?? ALL;
  const channel = query.channels?.[0] ?? ALL;
  const sort = query.sort ?? ALL;
  const pageSize = query.pageSize === undefined ? ALL : String(query.pageSize);

  return (
    <div className="card grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid min-w-0 gap-2" htmlFor="kris-search">
        <span className="form-label">Search this catalog</span>
        <input
          id="kris-search"
          className="input-field"
          type="search"
          maxLength={KRIS_MAX_QUERY_LENGTH}
          value={query.q ?? ""}
          placeholder="Item or specification"
          onChange={(event) => {
            const q = event.target.value;
            // A new search starts at page one: keeping the old page would show
            // an empty page and read as "no results".
            //
            // `q` is destructured out too, and that is the point. Without it,
            // emptying the box hands back the query it came from, so the old
            // search stays in the URL and in the results and there is no way to
            // clear it short of editing the address bar.
            const { page: _page, q: _q, ...rest } = query;
            onChange(q.trim() ? { ...rest, q } : rest);
          }}
        />
      </label>

      <label className="grid min-w-0 gap-2" htmlFor="kris-family">
        <span className="form-label">Family</span>
        <select
          id="kris-family"
          className="input-field"
          value={family}
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, families: _families, ...rest } = query;
            onChange(
              isKrisFamily(value)
                ? { ...rest, families: [value as KrisFamily] }
                : rest,
            );
          }}
        >
          <option value={ALL}>All families</option>
          {KRIS_FAMILIES.map((value) => (
            <option key={value} value={value}>
              {withCount(KRIS_FAMILY_LABELS[value], facets?.families, value)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid min-w-0 gap-2" htmlFor="kris-channel">
        <span className="form-label">Access</span>
        <select
          id="kris-channel"
          className="input-field"
          value={channel}
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, channels: _channels, ...rest } = query;
            onChange(
              isKrisChannel(value)
                ? { ...rest, channels: [value as KrisChannel] }
                : rest,
            );
          }}
        >
          <option value={ALL}>Any access</option>
          {KRIS_CHANNELS.map((value) => (
            <option key={value} value={value}>
              {withCount(KRIS_CHANNEL_LABELS[value], facets?.channels, value)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:contents">
        <label className="grid min-w-0 gap-2" htmlFor="kris-sort">
          <span className="form-label">Sort</span>
          <select
            id="kris-sort"
            className="input-field"
            value={sort}
            onChange={(event) => {
              const value = event.target.value;
              const { page: _page, sort: _sort, ...rest } = query;
              onChange(isKrisSort(value) ? { ...rest, sort: value } : rest);
            }}
          >
            <option value={ALL}>{KRIS_SORT_LABELS.relevance}</option>
            {KRIS_SORTS.filter((value) => value !== "relevance").map((value) => (
              <option key={value} value={value}>
                {KRIS_SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-2" htmlFor="kris-page-size">
          <span className="form-label">Per page</span>
          <select
            id="kris-page-size"
            className="input-field"
            value={pageSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              const { page: _page, pageSize: _pageSize, ...rest } = query;
              onChange(
                KRIS_PAGE_SIZES.includes(value) ? { ...rest, pageSize: value } : rest,
              );
            }}
          >
            {/* The default belongs to the server, so "the catalog decides" is
                the absence of the parameter rather than today's number frozen
                into every shared link. */}
            <option value={ALL}>The catalog default</option>
            {KRIS_PAGE_SIZES.map((value) => (
              <option key={value} value={String(value)}>
                {value} per page
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export default KrisCatalogControls;
