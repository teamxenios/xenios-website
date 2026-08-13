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

function normalizedTokens(value: string): string[] {
  return normalizeOfferingText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
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
const HAYSTACKS = new WeakMap<NormalizedMasterOffering, string>();

function searchableText(product: NormalizedMasterOffering): string {
  const cached = HAYSTACKS.get(product);
  if (cached !== undefined) return cached;
  const computed = normalizeOfferingText(
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
  if (!tokens.every((token) => haystack.includes(token))) return null;

  const name = normalizeOfferingText(product.displayName);
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
