/**
 * Matching, sorting, faceting and paging for Launch A.
 *
 * The shape follows the sibling master-offerings lane, for the reasons that
 * lane wrote down: one traversal produces the match set AND every facet count,
 * the query is normalized once per search rather than once per product, and
 * every sort ends in a tie breaker that makes the order TOTAL so paging cannot
 * repeat or skip a row.
 *
 * The one thing that is genuinely different here is price. Launch A can be
 * sorted by price, and two of its 420 rows have no price at all. Those rows are
 * not cheap and they are not expensive, so they sort to the END of both
 * directions rather than to the top of one of them. See PRICE_LAST below.
 */

import {
  DEFAULT_KRIS_SORT,
  KRIS_CHANNELS,
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILIES,
  KRIS_FAMILY_LABELS,
  type KrisCatalogFacets,
  type KrisCatalogQuery,
  type KrisChannel,
  type KrisFacetBucket,
  type KrisFamily,
  type KrisSort,
} from "@shared/research/kris-launch-a/contract";
import type { KrisProductRecord } from "./dataset-reader";

export const KRIS_DEFAULT_PAGE_SIZE = 24;
export const KRIS_MAX_PAGE_SIZE = 100;

/**
 * Fold one string for comparison.
 *
 * Written here rather than imported from the master-offerings lane on purpose:
 * that module belongs to another lane, and a shared normalizer would mean a
 * refactor there silently changes what a Kris search matches. It is six lines,
 * and owning them is cheaper than the coupling.
 *
 * `+` and `&` become words because the catalog is full of them (NAD+, Syringes
 * & Alcohol Swabs) and a buyer types either form.
 */
export function normalizeKrisText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

interface Haystack {
  /** Everything searchable, normalized and space separated. */
  text: string;
  /**
   * The same text with the spaces removed.
   *
   * Research names are alphanumeric codes and a buyer types them as they
   * remember them: BPC-157, BPC 157, or bpc157. The first two normalize to the
   * same two tokens; the third normalizes to one token that is not a substring
   * of "bpc 157" and so matched nothing at all. Comparing space-stripped forms
   * on both sides closes that.
   */
  compact: string;
  name: string;
  nameCompact: string;
  specification: string;
}

const HAYSTACKS = new WeakMap<KrisProductRecord, Haystack>();

function haystackOf(product: KrisProductRecord): Haystack {
  const cached = HAYSTACKS.get(product);
  if (cached !== undefined) return cached;
  const text = normalizeKrisText(
    [
      product.displayName,
      product.specification,
      KRIS_FAMILY_LABELS[product.family],
      KRIS_CHANNEL_LABELS[product.channel],
      product.format,
      product.dosageForm ?? "",
    ].join(" "),
  );
  const name = normalizeKrisText(product.displayName);
  const computed: Haystack = {
    text,
    compact: text.replace(/ /g, ""),
    name,
    nameCompact: name.replace(/ /g, ""),
    specification: normalizeKrisText(product.specification),
  };
  HAYSTACKS.set(product, computed);
  return computed;
}

interface PreparedQuery {
  normalized: string;
  compact: string;
  tokens: readonly string[];
}

function prepareQuery(query: string): PreparedQuery {
  const normalized = normalizeKrisText(query);
  return {
    normalized,
    compact: normalized.replace(/ /g, ""),
    tokens: normalized.split(" ").filter(Boolean),
  };
}

/**
 * Score one product, or null when it does not match at all.
 *
 * Every token must appear. An empty query scores everything at zero, which
 * leaves the tie breaker to decide the order, which is what makes the default
 * listing the catalog's own order rather than an accident.
 */
function scoreAgainst(
  product: KrisProductRecord,
  query: PreparedQuery,
): number | null {
  if (query.normalized === "") return 0;
  const haystack = haystackOf(product);
  const matches = (token: string): boolean =>
    haystack.text.includes(token) || haystack.compact.includes(token);
  if (!query.tokens.every(matches)) return null;

  if (haystack.nameCompact === query.compact) return 1_000;
  if (haystack.name === query.normalized) return 1_000;
  if (haystack.name.startsWith(query.normalized)) return 800;
  if (haystack.name.includes(query.normalized)) return 650;
  if (haystack.specification.includes(query.normalized)) return 600;
  return 100 + query.tokens.length;
}

export function scoreKrisProduct(
  product: KrisProductRecord,
  query: string,
): number | null {
  return scoreAgainst(product, prepareQuery(query));
}

/**
 * The tie breaker every sort ends with.
 *
 * It exists to make paging safe rather than to express taste. The id is unique
 * per product, so this key is a TOTAL order: no two products ever compare
 * equal, so no sort can leave two of them in an order that depends on how the
 * input happened to be arranged. That is the property that stops page 2 from
 * repeating or skipping what page 1 showed.
 *
 * The leading family and name reproduce the artifact's own ordering, so the
 * default listing is the catalog in the order the builder wrote it.
 */
function tieBreakKey(product: KrisProductRecord): string {
  return `${product.family}|${product.displayName}|${product.specification}|${product.slug}|${product.id}`;
}

interface Decorated {
  product: KrisProductRecord;
  score: number;
  tie: string;
  /** Cents, or null for a pending price. Read once per match, never per compare. */
  amount: number | null;
}

type Comparator = (left: Decorated, right: Decorated) => number;

/**
 * A pending price sorts last in BOTH directions.
 *
 * Sorting cheapest first and putting "no price yet" at the top would read as
 * free; sorting dearest first and putting it at the top would read as the most
 * expensive thing in the catalog. Neither is true. An absent price is not a
 * position on the scale, so it leaves the scale, and it does so identically
 * whichever way the member is looking. This is why price_desc is deliberately
 * NOT the exact mirror of price_asc, unlike the two name sorts.
 */
function comparePrice(left: Decorated, right: Decorated, direction: 1 | -1): number {
  if (left.amount === null || right.amount === null) {
    if (left.amount === right.amount) return left.tie.localeCompare(right.tie);
    return left.amount === null ? 1 : -1;
  }
  if (left.amount !== right.amount) return (left.amount - right.amount) * direction;
  return left.tie.localeCompare(right.tie);
}

const COMPARATORS: Readonly<Record<KrisSort, Comparator>> = {
  relevance: (left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return left.tie.localeCompare(right.tie);
  },
  name_asc: (left, right) => {
    const byName = left.product.displayName.localeCompare(right.product.displayName);
    if (byName !== 0) return byName;
    return left.tie.localeCompare(right.tie);
  },
  // The exact reverse of name_asc, tie breaker included, so the two are mirror
  // images and each remains a total order.
  name_desc: (left, right) => -COMPARATORS.name_asc(left, right),
  price_asc: (left, right) => comparePrice(left, right, 1),
  price_desc: (left, right) => comparePrice(left, right, -1),
};

function sortFor(query: KrisCatalogQuery): KrisSort {
  const requested = query.sort;
  return requested !== undefined &&
    Object.prototype.hasOwnProperty.call(COMPARATORS, requested)
    ? requested
    : DEFAULT_KRIS_SORT;
}

/** The sort a query resolves to, for a caller that must echo it back. */
export function resolveKrisSort(query: KrisCatalogQuery = {}): KrisSort {
  return sortFor(query);
}

/**
 * A filter set, or null when the filter is not in play.
 *
 * Null rather than an empty set on purpose: "no channel filter" and "a channel
 * filter that matches nothing" are different questions, and only the first
 * means every product passes.
 */
function filterSet<TValue extends string>(
  values: readonly TValue[] | undefined,
): ReadonlySet<string> | null {
  return values && values.length > 0 ? new Set<string>(values) : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function bucket<TValue extends string>(
  order: readonly TValue[],
  labels: Readonly<Record<TValue, string>>,
  counts: Map<string, number>,
): KrisFacetBucket[] {
  return order.map((value) => ({
    value,
    label: labels[value],
    count: counts.get(value) ?? 0,
  }));
}

/** How the price of one product is read while sorting. */
export type KrisPriceAmountLookup = (productId: string) => number | null;

const NO_PRICES: KrisPriceAmountLookup = () => null;

export interface KrisMatchResult {
  matches: readonly KrisProductRecord[];
  facets: KrisCatalogFacets;
}

/**
 * The whole matching and counting pass, in one traversal.
 *
 * Facet semantics: a facet excludes its OWN selection from its own counts and
 * applies every other active filter. So with channels=ruo_research selected,
 * the channel counts still answer "how many would I get if I switched to
 * clinical", while the family counts stay scoped to RUO.
 *
 * The text query is not a facet. A product the member's own words exclude is
 * not an alternative they could reach by changing one filter, so it counts
 * nowhere.
 */
export function matchKrisCatalog(
  products: readonly KrisProductRecord[],
  query: KrisCatalogQuery = {},
  priceAmountOf: KrisPriceAmountLookup = NO_PRICES,
): KrisMatchResult {
  const prepared = prepareQuery(query.q ?? "");
  const families = filterSet<KrisFamily>(query.families);
  const channels = filterSet<KrisChannel>(query.channels);
  const familyCounts = new Map<string, number>();
  const channelCounts = new Map<string, number>();
  const sort = sortFor(query);
  // Prices are read only when a price sort actually needs them. A name or
  // relevance listing of the whole catalog asks the overlay nothing.
  const needsPrice = sort === "price_asc" || sort === "price_desc";

  const decorated: Decorated[] = [];
  for (const product of products) {
    const score = scoreAgainst(product, prepared);
    if (score === null) continue;

    const inFamily = families === null || families.has(product.family);
    const inChannel = channels === null || channels.has(product.channel);

    if (inChannel) {
      familyCounts.set(product.family, (familyCounts.get(product.family) ?? 0) + 1);
    }
    if (inFamily) {
      channelCounts.set(
        product.channel,
        (channelCounts.get(product.channel) ?? 0) + 1,
      );
    }
    if (inFamily && inChannel) {
      decorated.push({
        product,
        score,
        tie: tieBreakKey(product),
        amount: needsPrice ? priceAmountOf(product.id) : null,
      });
    }
  }

  decorated.sort(COMPARATORS[sort]);

  return {
    matches: decorated.map((entry) => entry.product),
    facets: {
      families: bucket(KRIS_FAMILIES, KRIS_FAMILY_LABELS, familyCounts),
      channels: bucket(KRIS_CHANNELS, KRIS_CHANNEL_LABELS, channelCounts),
    },
  };
}

export interface KrisSelection {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: KrisSort;
  products: readonly KrisProductRecord[];
  facets: KrisCatalogFacets;
}

/**
 * The paged match set, still in server form, with facet counts for the WHOLE
 * match set rather than for the page.
 *
 * Server-side paging: the caller receives at most `pageSize` products, so the
 * projection and the price resolution downstream run for one page and never for
 * the catalog.
 */
export function selectKrisCatalog(
  products: readonly KrisProductRecord[],
  query: KrisCatalogQuery = {},
  priceAmountOf: KrisPriceAmountLookup = NO_PRICES,
): KrisSelection {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(
    positiveInteger(query.pageSize, KRIS_DEFAULT_PAGE_SIZE),
    KRIS_MAX_PAGE_SIZE,
  );
  const { matches, facets } = matchKrisCatalog(products, query, priceAmountOf);
  const total = matches.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total,
    totalPages,
    sort: sortFor(query),
    products: start >= total ? [] : matches.slice(start, start + pageSize),
    facets,
  };
}

/**
 * Precompute every haystack.
 *
 * Moves the normalization cost to dataset load, once, rather than onto
 * whichever member happens to type the first query.
 */
export function warmKrisSearch(products: readonly KrisProductRecord[]): void {
  for (const product of products) haystackOf(product);
}
