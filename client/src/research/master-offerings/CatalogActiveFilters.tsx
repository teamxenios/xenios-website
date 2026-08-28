import {
  DEFAULT_MASTER_OFFERING_SORT,
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILY_LABELS,
  MASTER_OFFERING_SORT_LABELS,
  type MasterOfferingCardView,
  type MasterOfferingCatalogFacets,
  type MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import {
  CATALOG_ACCESS_PATHS,
  CATALOG_ACCESS_PATH_DESCRIPTIONS,
  CATALOG_ACCESS_PATH_LABELS,
  accessPathCountsOnPage,
  isCatalogAccessPath,
  type CatalogAccessPath,
} from "./catalog-access-path";

/**
 * One removable chip per active discovery filter.
 *
 * On a phone the filter fields are collapsed behind a toggle, so without this
 * row a member who arrives on a deep link cannot see WHY the catalog is
 * narrow without opening the fields. Each chip names the filter in the same
 * words the control uses and removes exactly that one filter; removing a
 * filter is a discrete change, so it goes through `onChange` (a history push)
 * like the select it mirrors. Paging is dropped on every removal because the
 * page a member was on no longer exists once the filter set changes.
 *
 * The category label comes from the server facet when the facet carries it;
 * a category the facet no longer lists is shown by its slug rather than
 * invented, so the chip never says something the server did not.
 */
export interface ActiveCatalogFilter {
  key: "q" | "family" | "category" | "state" | "sort";
  label: string;
  remove: () => MasterOfferingCatalogQuery;
}

export function activeCatalogFilters(
  query: MasterOfferingCatalogQuery,
  facets: MasterOfferingCatalogFacets,
): readonly ActiveCatalogFilter[] {
  const { page: _page, ...rest } = query;
  const filters: ActiveCatalogFilter[] = [];
  const q = query.q?.trim();
  if (q) {
    filters.push({
      key: "q",
      label: `Search: ${q}`,
      remove: () => {
        const { q: _q, ...next } = rest;
        return next;
      },
    });
  }
  const family = query.families?.[0];
  if (family) {
    filters.push({
      key: "family",
      label: `Family: ${MASTER_OFFERING_FAMILY_LABELS[family]}`,
      remove: () => {
        const { families: _families, ...next } = rest;
        return next;
      },
    });
  }
  const category = query.categories?.[0];
  if (category) {
    const bucket = facets.categories.find((entry) => entry.value === category);
    filters.push({
      key: "category",
      label: `Category: ${bucket?.label ?? category}`,
      remove: () => {
        const { categories: _categories, ...next } = rest;
        return next;
      },
    });
  }
  const state = query.states?.[0];
  if (state) {
    filters.push({
      key: "state",
      label: `Listing state: ${MASTER_OFFERING_DISPLAY_LABELS[state]}`,
      remove: () => {
        const { states: _states, ...next } = rest;
        return next;
      },
    });
  }
  if (query.sort !== undefined && query.sort !== DEFAULT_MASTER_OFFERING_SORT) {
    filters.push({
      key: "sort",
      label: `Sort: ${MASTER_OFFERING_SORT_LABELS[query.sort]}`,
      remove: () => {
        const { sort: _sort, ...next } = rest;
        return next;
      },
    });
  }
  return filters;
}

export function CatalogActiveFilters({
  query,
  facets,
  onChange,
}: {
  query: MasterOfferingCatalogQuery;
  facets: MasterOfferingCatalogFacets;
  onChange: (next: MasterOfferingCatalogQuery) => void;
}) {
  const filters = activeCatalogFilters(query, facets);
  if (filters.length === 0) return null;
  return (
    <ul
      className="flex min-w-0 flex-wrap gap-2"
      aria-label="Active filters"
      data-testid="mo-active-filters"
    >
      {filters.map((filter) => (
        <li key={filter.key} className="min-w-0">
          <button
            type="button"
            className="btn btn-secondary min-h-[44px] min-w-0 max-w-full break-words"
            data-testid={`mo-active-filter-${filter.key}`}
            aria-label={`Remove ${filter.label}`}
            onClick={() => onChange(filter.remove())}
          >
            {filter.label}
            <span aria-hidden="true"> ×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const ANY = "any";

/**
 * The access-path refinement for the page in view.
 *
 * WHY IT IS PAGE-LOCAL. The catalog query contract carries no access-path
 * member and the server owns every facet, so the browser has nothing it may
 * ask the server for. It can only narrow the cards it already holds. That is
 * useful on a phone, where a page of 24 cards is a long scroll, and it is
 * honest as long as the copy says "on this page" every time, which is why the
 * label, the counts, and the result sentence all say so. The moment the
 * shared contract gains an access-path filter this control should be replaced
 * by a server-facet control, and the exact snippet for that is recorded in
 * the helper handoff rather than smuggled in here.
 *
 * The counts are counts of CARDS whose variants include the path, on this
 * page, and nothing more. Only paths PRESENT on this page are offered: an
 * option reading "Buy Now (0 on this page)" would put the words "Buy Now" on
 * a page that has no purchasable row, and the standing rule is that those
 * words appear only where the server resolved a purchase. With fewer than two
 * paths on the page there is nothing to refine, so the control is not shown.
 */
export function CatalogAccessPathRefine({
  products,
  value,
  onChange,
}: {
  products: readonly MasterOfferingCardView[];
  value: CatalogAccessPath | null;
  onChange: (next: CatalogAccessPath | null) => void;
}) {
  const counts = accessPathCountsOnPage(products);
  const present = CATALOG_ACCESS_PATHS.filter((path) => (counts.get(path) ?? 0) > 0);
  if (present.length < 2 && value === null) return null;
  return (
    <div className="grid min-w-0 gap-2" data-testid="mo-access-path-refine">
      <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-access-path">
        <span className="form-label">Next step, on this page</span>
        <select
          id="mo-catalog-access-path"
          className="input-field min-h-[44px]"
          value={value ?? ANY}
          aria-describedby="mo-catalog-access-path-help"
          onChange={(event) => {
            const next = event.target.value;
            onChange(isCatalogAccessPath(next) ? next : null);
          }}
        >
          <option value={ANY}>Any next step</option>
          {present.map((path) => (
            <option key={path} value={path}>
              {CATALOG_ACCESS_PATH_LABELS[path]} ({counts.get(path) ?? 0} on this page)
            </option>
          ))}
          {value !== null && !present.includes(value) && (
            // The chosen path from the previous page is absent here. Keep it
            // selectable so the select never shows a value it does not hold,
            // and so the member can see what they chose before clearing it.
            <option value={value}>
              {CATALOG_ACCESS_PATH_LABELS[value]} (0 on this page)
            </option>
          )}
        </select>
      </label>
      <p
        id="mo-catalog-access-path-help"
        className="body-s text-ink-mute min-w-0 break-words"
      >
        {value === null
          ? "Narrows the cards on this page by the next step each exact variant states. It does not search the whole catalog."
          : CATALOG_ACCESS_PATH_DESCRIPTIONS[value]}
      </p>
    </div>
  );
}
