import type {
  MasterOfferingCatalogQuery,
  MasterOfferingCatalogPage,
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import { projectMasterOfferingCard } from "./customer-projection";
import type { NormalizedMasterOffering } from "./model";
import {
  NO_MASTER_OFFERING_PRICES,
  type MasterOfferingPriceMap,
} from "./price-projection";
import { normalizeOfferingText } from "./normalize";

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
  const computed: OfferingHaystack = {
    // The possessive-aware tokenizer is applied to the haystack too, so
    // "men's" indexes as "mens" on both sides of the comparison.
    text: normalizedTokens(text).join(" "),
    compact: text.replace(/ /g, ""),
  };
  HAYSTACKS.set(product, computed);
  return computed;
}

/**
 * Small, deterministic search scorer for a catalog of this size. It tolerates
 * punctuation differences such as BPC-157/BPC 157 and NAD+/NAD plus without an
 * external search service.
 */
export function scoreMasterOffering(
  product: NormalizedMasterOffering,
  query: string,
): number | null {
  return scoreAgainstNormalizedQuery(product, normalizeOfferingText(query));
}

/**
 * The hot path. The query is normalized once by the caller rather than once per
 * offering, which is the other half of the search cost at catalog scale.
 */
function scoreAgainstNormalizedQuery(
  product: NormalizedMasterOffering,
  normalizedQuery: string,
): number | null {
  if (normalizedQuery === "") return 0;
  const tokens = normalizedTokens(normalizedQuery);
  const haystack = searchableText(product);
  const matchesToken = (token: string): boolean =>
    haystack.text.includes(token) || haystack.compact.includes(token);
  if (!tokens.every(matchesToken)) return null;

  const name = normalizeOfferingText(product.displayName);
  // A separator-free spelling of the exact name is still an exact-name match.
  if (name.replace(/ /g, "") === normalizedQuery.replace(/ /g, "")) return 1_000;
  if (name === normalizedQuery) return 1_000;
  if (name.startsWith(normalizedQuery)) return 800;
  if (name.includes(normalizedQuery)) return 650;

  const alias = product.aliases
    .map(normalizeOfferingText)
    .find((value) => value === normalizedQuery);
  if (alias) return 600;

  const variantExact = product.variants.some(
    (variant) => normalizeOfferingText(variant.label) === normalizedQuery,
  );
  if (variantExact) return 500;
  return 100 + tokens.length;
}

function includesFamily(
  product: NormalizedMasterOffering,
  families: readonly MasterOfferingFamily[] | undefined,
): boolean {
  return !families || families.length === 0 || families.includes(product.family);
}

function includesState(
  product: NormalizedMasterOffering,
  states: readonly MasterOfferingDisplayState[] | undefined,
): boolean {
  return !states || states.length === 0 || states.includes(product.displayState);
}

/**
 * The paged match set, still in normalized server form.
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
  offerings: readonly NormalizedMasterOffering[];
}

/**
 * Every member-safe offering that matches, in display order, with no paging.
 *
 * The export lane needs the whole match set, and the completeness gate needs to
 * assert that paging never drops a member-safe offering. Both read this, so the
 * paged and unpaged views can never diverge in their filtering.
 */
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
  for (const product of products) searchableText(product);
}

export function matchMasterOfferings(
  products: readonly NormalizedMasterOffering[],
  query: MasterOfferingCatalogQuery = {},
): readonly NormalizedMasterOffering[] {
  const normalizedQuery = normalizeOfferingText(query.q ?? "");
  return products
    .filter((product) => product.visibility === "member")
    .filter((product) => includesFamily(product, query.families))
    .filter((product) => includesState(product, query.states))
    .flatMap((product) => {
      const score = scoreAgainstNormalizedQuery(product, normalizedQuery);
      return score === null ? [] : [{ product, score }];
    })
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return `${left.product.displayName}|${left.product.slug}`.localeCompare(
        `${right.product.displayName}|${right.product.slug}`,
      );
    })
    .map(({ product }) => product);
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

  const matches = matchMasterOfferings(products, query);
  const total = matches.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const selected = start >= total ? [] : matches.slice(start, start + pageSize);

  return { page, pageSize, total, totalPages, offerings: selected };
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
    products: selection.offerings.map((offering) =>
      projectMasterOfferingCard(offering, prices),
    ),
  };
}
