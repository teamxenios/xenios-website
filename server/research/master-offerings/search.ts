import {
  DEFAULT_MASTER_OFFERING_SORT,
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_DISPLAY_STATES,
  MASTER_OFFERING_FAMILIES,
  MASTER_OFFERING_FAMILY_LABELS,
  type MasterOfferingCatalogFacets,
  type MasterOfferingCatalogQuery,
  type MasterOfferingCatalogPage,
  type MasterOfferingDisplayState,
  type MasterOfferingFacetBucket,
  type MasterOfferingFamily,
  type MasterOfferingSort,
} from "@shared/research/master-offerings/contract";
import { projectMasterOfferingCard } from "./customer-projection";
import type { NormalizedMasterOffering } from "./model";
import {
  NO_MASTER_OFFERING_PRICES,
  type MasterOfferingPriceMap,
} from "./price-projection";
import {
  MASTER_OFFERING_DISPLAY_STATE_RANK,
  normalizeOfferingText,
  slugify,
} from "./normalize";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

/**
 * Split into tokens, rejoining a possessive that punctuation stripping split.
 *
 * The shared normalizer removes every non-alphanumeric, so "Men's" becomes
 * "men s" and "120's" becomes "120 s". A bare "s" is a substring of almost
 * everything, so it matched nearly the whole catalog and dragged unrelated
 * products to the top of a search for "men's panel". Rejoining it restores the
 * word the buyer typed.
 *
 * Deliberately only a lone "s", and only when there is a token before it. A
 * general rule that dropped short tokens would break "vitamin d", where the
 * single letter is the whole point of the query.
 */
function normalizedTokens(value: string): string[] {
  const raw = normalizeOfferingText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const token of raw) {
    if (token === "s" && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}s`;
      continue;
    }
    merged.push(token);
  }
  return merged;
}

/**
 * The normalized haystack for one offering, computed once per offering object.
 *
 * Without this, a single search normalizes the full text of all 1,121 offerings
 * on every keystroke, which measured at roughly 40ms per query against the real
 * catalog size. A WeakMap keyed on the offering object needs no invalidation:
 * the dataset reader hands out the same objects until the file changes, and a
 * regenerated dataset produces new objects that simply miss the cache.
 */
interface OfferingHaystack {
  /** Normalized, space separated. */
  text: string;
  /** The normalized display name, and the same with spaces removed. */
  name: string;
  nameCompact: string;
  /** Normalized aliases and variant labels, for the exact-match tiers. */
  aliases: readonly string[];
  variantLabels: readonly string[];
  /**
   * The same text with the spaces removed.
   *
   * Research names are alphanumeric codes, and a buyer types them the way they
   * remember them: BPC-157, BPC 157, or bpc157. The first two normalize to the
   * same two tokens, but the third normalizes to one token that is not a
   * substring of "bpc 157", so it matched nothing at all. Comparing a
   * space-stripped token against a space-stripped haystack closes that, and it
   * costs one extra string per offering because both forms are memoized.
   */
  compact: string;
}

const HAYSTACKS = new WeakMap<NormalizedMasterOffering, OfferingHaystack>();

function searchableText(product: NormalizedMasterOffering): OfferingHaystack {
  const cached = HAYSTACKS.get(product);
  if (cached !== undefined) return cached;
  const text = normalizeOfferingText(
    [
      product.displayName,
      product.canonicalName,
      product.family,
      product.category,
      product.subcategory ?? "",
      product.brand ?? "",
      ...product.aliases,
      ...product.variants.map((variant) => variant.label),
    ].join(" "),
  );
  const name = normalizeOfferingText(product.displayName);
  const computed: OfferingHaystack = {
    // The possessive-aware tokenizer is applied to the haystack too, so
    // "men's" indexes as "mens" on both sides of the comparison.
    text: normalizedTokens(text).join(" "),
    compact: text.replace(/ /g, ""),
    name,
    nameCompact: name.replace(/ /g, ""),
    aliases: product.aliases.map(normalizeOfferingText),
    variantLabels: product.variants.map((variant) =>
      normalizeOfferingText(variant.label),
    ),
  };
  HAYSTACKS.set(product, computed);
  return computed;
}

/**
 * Small, deterministic search scorer for a catalog of this size. It tolerates
 * punctuation differences such as BPC-157/BPC 157 and NAD+/NAD plus without an
 * external search service.
 */
/**
 * Everything about the query that does not depend on the offering.
 *
 * Computed once per search. Recomputing it per offering is invisible on a
 * fixture and costs one normalize call per product per query at catalog scale,
 * which is exactly the shape of cost that hides until the catalog is real.
 */
interface PreparedQuery {
  normalized: string;
  compact: string;
  tokens: readonly string[];
}

function prepareQuery(query: string): PreparedQuery {
  const normalized = normalizeOfferingText(query);
  return {
    normalized,
    compact: normalized.replace(/ /g, ""),
    tokens: normalizedTokens(normalized),
  };
}

export function scoreMasterOffering(
  product: NormalizedMasterOffering,
  query: string,
): number | null {
  return scoreAgainstNormalizedQuery(product, prepareQuery(query));
}

/**
 * The hot path. The query is normalized once by the caller rather than once per
 * offering, which is the other half of the search cost at catalog scale.
 */
function scoreAgainstNormalizedQuery(
  product: NormalizedMasterOffering,
  query: PreparedQuery,
): number | null {
  if (query.normalized === "") return 0;
  const haystack = searchableText(product);
  const matchesToken = (token: string): boolean =>
    haystack.text.includes(token) || haystack.compact.includes(token);
  if (!query.tokens.every(matchesToken)) return null;

  // A separator-free spelling of the exact name is still an exact-name match.
  if (haystack.nameCompact === query.compact) return 1_000;
  if (haystack.name === query.normalized) return 1_000;
  if (haystack.name.startsWith(query.normalized)) return 800;
  if (haystack.name.includes(query.normalized)) return 650;
  if (haystack.aliases.includes(query.normalized)) return 600;
  if (haystack.variantLabels.includes(query.normalized)) return 500;
  return 100 + query.tokens.length;
}

/**
 * The category slug for one offering, memoized per offering object.
 *
 * The same WeakMap discipline as the search haystack, and for the same reason:
 * the reader hands out stable objects, so the slug is computed once per
 * offering for the life of the dataset rather than once per request.
 */
const CATEGORY_SLUGS = new WeakMap<NormalizedMasterOffering, string>();

export function masterOfferingCategorySlug(
  product: NormalizedMasterOffering,
): string {
  const cached = CATEGORY_SLUGS.get(product);
  if (cached !== undefined) return cached;
  const computed = slugify(product.category);
  CATEGORY_SLUGS.set(product, computed);
  return computed;
}

/**
 * The tie breaker every sort ends with.
 *
 * It exists to make paging safe rather than to express taste. Both slug and id
 * are unique per offering, so this key is a total order: no two offerings ever
 * compare equal, so no sort can leave two offerings in an order that depends on
 * how the input happened to be arranged. That is the property that keeps page 2
 * from repeating or skipping what page 1 showed.
 *
 * The leading `displayName|slug` is byte for byte the ordering the catalog
 * already shipped, so the default sort returns exactly today's order. The
 * trailing id is a no-op while slugs are unique and a guarantee if one ever
 * is not.
 */
function tieBreakKey(product: NormalizedMasterOffering): string {
  return `${product.displayName}|${product.slug}|${product.id}`;
}

interface Decorated {
  product: NormalizedMasterOffering;
  score: number;
  tie: string;
}

type DecoratedComparator = (left: Decorated, right: Decorated) => number;

const COMPARATORS: Readonly<Record<MasterOfferingSort, DecoratedComparator>> = {
  relevance: (left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return left.tie.localeCompare(right.tie);
  },
  name_asc: (left, right) => {
    const byName = left.product.displayName.localeCompare(
      right.product.displayName,
    );
    if (byName !== 0) return byName;
    return left.tie.localeCompare(right.tie);
  },
  // The exact reverse of name_asc, tie breaker included, so the two sorts are
  // mirror images of one another and each remains a total order.
  name_desc: (left, right) => -COMPARATORS.name_asc(left, right),
  availability: (left, right) => {
    const byState =
      MASTER_OFFERING_DISPLAY_STATE_RANK[left.product.displayState] -
      MASTER_OFFERING_DISPLAY_STATE_RANK[right.product.displayState];
    if (byState !== 0) return byState;
    return left.tie.localeCompare(right.tie);
  },
};

function sortFor(query: MasterOfferingCatalogQuery): MasterOfferingSort {
  const requested = query.sort;
  return requested !== undefined &&
    Object.prototype.hasOwnProperty.call(COMPARATORS, requested)
    ? requested
    : DEFAULT_MASTER_OFFERING_SORT;
}

/** The sort a query resolves to, for a caller that must echo it back. */
export function resolveMasterOfferingSort(
  query: MasterOfferingCatalogQuery = {},
): MasterOfferingSort {
  return sortFor(query);
}

/**
 * A filter set, or null when that filter is not in play.
 *
 * Null rather than an empty set on purpose: "no family filter" and "a family
 * filter that happens to match nothing" are different questions, and only the
 * first means every offering passes.
 */
interface CatalogFilters {
  prepared: PreparedQuery;
  families: ReadonlySet<string> | null;
  states: ReadonlySet<string> | null;
  categories: ReadonlySet<string> | null;
}

function filterSet(
  values: readonly string[] | undefined,
): ReadonlySet<string> | null {
  return values && values.length > 0 ? new Set(values) : null;
}

function prepareFilters(query: MasterOfferingCatalogQuery): CatalogFilters {
  return {
    prepared: prepareQuery(query.q ?? ""),
    families: filterSet(query.families),
    states: filterSet(query.states),
    categories: filterSet(query.categories),
  };
}

interface FacetTally {
  label: string;
  count: number;
}

function bump(tallies: Map<string, FacetTally>, key: string): void {
  const existing = tallies.get(key);
  if (existing !== undefined) existing.count += 1;
}

function seed(
  tallies: Map<string, FacetTally>,
  key: string,
  label: string,
): void {
  const existing = tallies.get(key);
  if (existing === undefined) {
    tallies.set(key, { label, count: 0 });
    return;
  }
  // Two raw categories could slugify to the same token. The count stays exact
  // because the filter uses the same slug, so both are selected together; the
  // label settles on the lexicographically first so the response is stable
  // rather than dependent on catalog order.
  if (label.localeCompare(existing.label) < 0) existing.label = label;
}

function buckets<TValue extends string>(
  tallies: Map<string, FacetTally>,
  order: readonly TValue[] | null,
): MasterOfferingFacetBucket<TValue>[] {
  const keys =
    order === null
      ? Array.from(tallies.keys()).sort((left, right) =>
          (tallies.get(left) as FacetTally).label.localeCompare(
            (tallies.get(right) as FacetTally).label,
          ),
        )
      : order;
  return keys.flatMap((key) => {
    const tally = tallies.get(key as string);
    return tally === undefined
      ? []
      : [{ value: key as TValue, label: tally.label, count: tally.count }];
  });
}

const STATES_BY_RANK: readonly MasterOfferingDisplayState[] =
  MASTER_OFFERING_DISPLAY_STATES.slice().sort(
    (left, right) =>
      MASTER_OFFERING_DISPLAY_STATE_RANK[left] -
      MASTER_OFFERING_DISPLAY_STATE_RANK[right],
  );

export interface MasterOfferingMatchResult {
  matches: readonly NormalizedMasterOffering[];
  facets: MasterOfferingCatalogFacets;
}

/**
 * The whole matching and counting pass.
 *
 * One traversal of the catalog produces the match set and all three facet
 * groups. The alternative shape, one filtered scan per facet, would score every
 * offering three more times; here the score is computed once per offering and
 * fanned out into the counters, because whether an offering matches the text
 * query is independent of which facet is being counted.
 *
 * Facet semantics: a facet excludes its own selection from its own counts, and
 * every other active filter applies. So with families=supplements selected, the
 * family counts still answer "how many would I get if I switched to
 * diagnostics", while the state and category counts stay scoped to supplements.
 */
export function matchMasterOfferingsWithFacets(
  products: readonly NormalizedMasterOffering[],
  query: MasterOfferingCatalogQuery = {},
): MasterOfferingMatchResult {
  const filters = prepareFilters(query);
  const familyTallies = new Map<string, FacetTally>();
  for (const family of MASTER_OFFERING_FAMILIES) {
    seed(familyTallies, family, MASTER_OFFERING_FAMILY_LABELS[family]);
  }
  const stateTallies = new Map<string, FacetTally>();
  for (const state of MASTER_OFFERING_DISPLAY_STATES) {
    seed(stateTallies, state, MASTER_OFFERING_DISPLAY_LABELS[state]);
  }
  const categoryTallies = new Map<string, FacetTally>();

  const decorated: Decorated[] = [];
  for (const product of products) {
    // The one visibility check that matters. The generated dataset already
    // excludes every admin hold, and this refuses one again, so no hold can
    // reach a page, a filter, or a count.
    if (product.visibility !== "member") continue;

    const categorySlug = masterOfferingCategorySlug(product);
    // Registered before the text query is considered, so the category facet
    // always publishes the full member-safe vocabulary even when the current
    // search matches none of it.
    seed(categoryTallies, categorySlug, product.category);

    const score = scoreAgainstNormalizedQuery(product, filters.prepared);
    // The text query is not a facet. An offering the member's own words exclude
    // is not an alternative they could reach by changing one filter, so it
    // counts nowhere.
    if (score === null) continue;

    const inFamily =
      filters.families === null || filters.families.has(product.family);
    const inState =
      filters.states === null || filters.states.has(product.displayState);
    const inCategory =
      filters.categories === null || filters.categories.has(categorySlug);

    if (inState && inCategory) bump(familyTallies, product.family);
    if (inFamily && inCategory) bump(stateTallies, product.displayState);
    if (inFamily && inState) bump(categoryTallies, categorySlug);
    if (inFamily && inState && inCategory) {
      decorated.push({ product, score, tie: tieBreakKey(product) });
    }
  }

  decorated.sort(COMPARATORS[sortFor(query)]);

  return {
    matches: decorated.map((entry) => entry.product),
    facets: {
      families: buckets<MasterOfferingFamily>(
        familyTallies,
        MASTER_OFFERING_FAMILIES,
      ),
      // Strongest first, the same rank the availability sort uses.
      states: buckets<MasterOfferingDisplayState>(stateTallies, STATES_BY_RANK),
      categories: buckets(categoryTallies, null),
    },
  };
}

export function matchMasterOfferings(
  products: readonly NormalizedMasterOffering[],
  query: MasterOfferingCatalogQuery = {},
): readonly NormalizedMasterOffering[] {
  return matchMasterOfferingsWithFacets(products, query).matches;
}

/**
 * Precompute every haystack.
 *
 * Measured against the real catalog, the first search paid 130ms to normalize
 * all 1,121 offerings while later searches cost about 9ms. Doing it when the
 * dataset loads moves that cost off the first member who types something.
 */
export function warmMasterOfferingSearch(
  products: readonly NormalizedMasterOffering[],
): void {
  for (const product of products) {
    searchableText(product);
    // The category slug is memoized on the same WeakMap discipline, so warming
    // it here keeps the first faceted request off the cold path too.
    masterOfferingCategorySlug(product);
  }
}

/**
 * The paged match set, still in normalized server form, with the facet counts
 * for the whole match set rather than for the page.
 *
 * The service needs this shape because prices are resolved per variant against
 * Product Control, and only the selected page should be priced. Pricing every
 * match would ask the authority about the whole catalog to render 24 cards.
 */
export interface MasterOfferingSelection {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: MasterOfferingSort;
  offerings: readonly NormalizedMasterOffering[];
  facets: MasterOfferingCatalogFacets;
}

export function selectMasterOfferings(
  products: readonly NormalizedMasterOffering[],
  query: MasterOfferingCatalogQuery = {},
): MasterOfferingSelection {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(
    positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const { matches, facets } = matchMasterOfferingsWithFacets(products, query);
  const total = matches.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const selected = start >= total ? [] : matches.slice(start, start + pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    sort: sortFor(query),
    offerings: selected,
    facets,
  };
}

/**
 * Project one page of member-safe cards. Prices default to on request, so a
 * caller that composes no price authority still gets a truthful page.
 */
export function queryMasterOfferings(
  products: readonly NormalizedMasterOffering[],
  query: MasterOfferingCatalogQuery = {},
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
): MasterOfferingCatalogPage {
  const selection = selectMasterOfferings(products, query);
  return {
    ok: true,
    page: selection.page,
    pageSize: selection.pageSize,
    total: selection.total,
    totalPages: selection.totalPages,
    sort: selection.sort,
    products: selection.offerings.map((offering) =>
      projectMasterOfferingCard(offering, prices),
    ),
    facets: selection.facets,
  };
}
