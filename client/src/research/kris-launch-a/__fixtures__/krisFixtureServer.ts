import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_KRIS_SORT,
  KRIS_PRICE_PENDING,
  KRIS_PRICE_PROFILES,
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILY_LABELS,
  type KrisCatalogDetailView,
  type KrisCatalogFacets,
  type KrisCatalogItemView,
  type KrisCatalogPage,
  type KrisCatalogQuery,
  type KrisChannel,
  type KrisFamily,
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import {
  KRIS_CATALOG_DISCLOSURES,
  krisAccessPolicy,
} from "../../../../../server/research/kris-launch-a/access-policy";
import type { ApiResult } from "../../lib/api";

/**
 * A fixture server for Launch A, answering the committed contract.
 *
 * The real routes are being built in a sibling lane, so this is what the client
 * is developed and tested against. Two decisions make it worth trusting:
 *
 * It reads the REAL generated artifact, all 420 items, so every test runs
 * against the actual names, specifications, channels and prices rather than a
 * handful of invented rows that would agree with whatever the UI happened to
 * do.
 *
 * It applies the REAL access policy from `server/research/kris-launch-a`, so
 * the notices the surface renders are the exact strings the server will send.
 * Copying them here would let the two drift, and the whole point of the access
 * presentation is that it is faithful.
 *
 * Nothing under `server/` is modified. This reads.
 */

interface ArtifactProduct {
  id: string;
  slug: string;
  displayName: string;
  specification: string;
  family: KrisFamily;
  familyLabel: string;
  channel: KrisChannel;
  channelLabel: string;
  format: string;
  packBasis: string;
  moq: number | null;
  dosageForm: string | null;
  suppliedNote: string;
}

interface Artifact {
  counts: { items: number; priced: number; pricePending: number };
  products: ArtifactProduct[];
  priceOverlays: Record<string, Record<string, KrisPriceView | undefined>>;
}

const ARTIFACT_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "server",
  "research",
  "kris-launch-a",
  "data",
  "kris-launch-a-catalog.generated.json",
);

let cached: Artifact | null = null;

export function krisArtifact(): Artifact {
  if (cached === null) {
    cached = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as Artifact;
  }
  return cached;
}

/** The three layers composed the way the server composes them. */
export function krisFixtureItems(): KrisCatalogItemView[] {
  const artifact = krisArtifact();
  const overlay = artifact.priceOverlays[KRIS_PRICE_PROFILES[0]] ?? {};
  return artifact.products.map((product) => ({
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    specification: product.specification,
    family: product.family,
    familyLabel: KRIS_FAMILY_LABELS[product.family],
    channel: product.channel,
    channelLabel: KRIS_CHANNEL_LABELS[product.channel],
    format: product.format,
    packBasis: product.packBasis,
    moq: product.moq,
    dosageForm: product.dosageForm,
    price: overlay[product.id] ?? KRIS_PRICE_PENDING,
    access: krisAccessPolicy(product.channel),
    suppliedNote: product.suppliedNote,
  }));
}

export const KRIS_FIXTURE_DEFAULT_PAGE_SIZE = 24;

function priceOrder(price: KrisPriceView): number {
  return price.state === "priced" ? price.amountCents : Number.POSITIVE_INFINITY;
}

function matches(item: KrisCatalogItemView, query: KrisCatalogQuery): boolean {
  const q = query.q?.trim().toLowerCase() ?? "";
  if (
    q !== "" &&
    !`${item.displayName} ${item.specification}`.toLowerCase().includes(q)
  ) {
    return false;
  }
  if (query.families?.length && !query.families.includes(item.family)) return false;
  if (query.channels?.length && !query.channels.includes(item.channel)) return false;
  return true;
}

function facetsFor(items: readonly KrisCatalogItemView[]): KrisCatalogFacets {
  const families = new Map<string, number>();
  const channels = new Map<string, number>();
  for (const item of items) {
    families.set(item.family, (families.get(item.family) ?? 0) + 1);
    channels.set(item.channel, (channels.get(item.channel) ?? 0) + 1);
  }
  return {
    families: Array.from(families, ([value, count]) => ({
      value,
      label: KRIS_FAMILY_LABELS[value as KrisFamily],
      count,
    })),
    channels: Array.from(channels, ([value, count]) => ({
      value,
      label: KRIS_CHANNEL_LABELS[value as KrisChannel],
      count,
    })),
  };
}

/** One page of the catalog, filtered, sorted and sliced by the fixture. */
export function krisFixtureCatalog(query: KrisCatalogQuery = {}): KrisCatalogPage {
  const all = krisFixtureItems();
  // Facets are counted over the search match, before the family and channel
  // narrowing, so the counts do not collapse to the filter that is already on.
  const searched = all.filter((item) => matches(item, { q: query.q }));
  const matched = searched.filter((item) => matches(item, query));

  const sort = query.sort ?? DEFAULT_KRIS_SORT;
  const sorted = matched.slice();
  if (sort === "name_asc" || sort === "name_desc") {
    sorted.sort((left, right) => left.displayName.localeCompare(right.displayName));
    if (sort === "name_desc") sorted.reverse();
  } else if (sort === "price_asc" || sort === "price_desc") {
    // A pending price sorts last either way. It is not cheap and it is not
    // expensive: it is not a number at all.
    const priced = sorted.filter((item) => item.price.state === "priced");
    const pending = sorted.filter((item) => item.price.state !== "priced");
    priced.sort((left, right) => priceOrder(left.price) - priceOrder(right.price));
    if (sort === "price_desc") priced.reverse();
    sorted.length = 0;
    sorted.push(...priced, ...pending);
  }

  const pageSize = query.pageSize ?? KRIS_FIXTURE_DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    ok: true,
    profile: KRIS_PRICE_PROFILES[0],
    page,
    pageSize,
    total: sorted.length,
    totalPages: sorted.length === 0 ? 0 : totalPages,
    sort,
    facets: facetsFor(searched),
    items: sorted.slice(start, start + pageSize),
  };
}

export function krisFixtureDetail(
  family: KrisFamily,
  slug: string,
): KrisCatalogDetailView | null {
  const item = krisFixtureItems().find(
    (entry) => entry.family === family && entry.slug === slug,
  );
  return item === undefined
    ? null
    : { ...item, disclosures: KRIS_CATALOG_DISCLOSURES };
}

/** Drop-in replacements for the two adapter functions. */
export async function krisFixtureFetchCatalog(
  _token: string | null,
  query: KrisCatalogQuery = {},
): Promise<ApiResult<KrisCatalogPage>> {
  return { kind: "ok", data: krisFixtureCatalog(query) };
}

export async function krisFixtureFetchDetail(
  _token: string | null,
  family: KrisFamily,
  slug: string,
): Promise<ApiResult<KrisCatalogDetailView>> {
  const detail = krisFixtureDetail(family, slug);
  return detail === null
    ? { kind: "unavailable" }
    : { kind: "ok", data: detail };
}
