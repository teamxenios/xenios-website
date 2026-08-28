import { createHash } from "node:crypto";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  MASTER_OFFERING_FAMILIES,
  MASTER_OFFERING_FAMILY_LABELS,
  isMasterOfferingCategorySlug,
  isMasterOfferingDisplayState,
  isMasterOfferingFamily,
  isMasterOfferingSort,
  type MasterOfferingAction,
  type MasterOfferingCardView,
  type MasterOfferingCatalogQuery,
  type MasterOfferingDetailView,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
  type MasterOfferingSort,
  type MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import type { MasterOfferingPriceView } from "@shared/research/master-offerings/pricing-contract";
import type {
  PublicStorefrontFacetBucket,
  PublicStorefrontFacets,
} from "@shared/research/storefront/contract";

/**
 * Public copy is a separately published fact. Catalog presence, an approved
 * price, an activation, demand, or a workflow state is not publication.
 *
 * The authority adapter must read these records from the durable publication
 * source on every request. It may not synthesize them from the catalog row or
 * cache them past `validUntil`. A single atomic authority read must provide
 * both the exact catalog revision and the complete set of publication rows
 * current at `readAt`.
 */
export const PUBLIC_STOREFRONT_PUBLICATION_STATES = [
  "published",
  "draft",
  "held",
  "unpublished",
  "unknown",
] as const;

export type PublicStorefrontPublicationState =
  (typeof PUBLIC_STOREFRONT_PUBLICATION_STATES)[number];

export interface PublicStorefrontPublicationRecord {
  offeringId: string;
  family: MasterOfferingFamily;
  slug: string;
  state: PublicStorefrontPublicationState;
  publicationRevisionId: string | null;
  copyRevisionId: string | null;
  cardCopyDigest: string | null;
  detailCopyDigest: string | null;
  publishedAt: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  supersededAt: string | null;
}

export interface PublicStorefrontPublicationSnapshot {
  schemaVersion: 1;
  authorityRevisionId: string;
  catalogRevisionId: string;
  readAt: string;
  validUntil: string;
  records: readonly PublicStorefrontPublicationRecord[];
}

/**
 * The only values a catalog adapter may use to perform the source read. The
 * browser supplies none of them. Passing the exact revisions to the adapter
 * prevents it from quietly answering from a different catalog generation.
 */
export interface PublicStorefrontPublicationScope {
  authorityRevisionId: string;
  catalogRevisionId: string;
  readAt: string;
}

export interface PublicStorefrontCatalogCandidateSnapshot {
  schemaVersion: 1;
  catalogRevisionId: string;
  /**
   * The complete member-safe candidate set at `catalogRevisionId`, before any
   * public filtering, search, facets, or pagination. No totals or facets are
   * accepted from this source; this module derives them after publication.
   */
  products: readonly MasterOfferingCardView[];
}

export interface PublicStorefrontPublicationAuthority {
  /**
   * Atomically reads durable current publication truth. Handlers call this
   * both before and after the catalog read; the adapter must perform a fresh
   * authority read each time rather than returning a memoized snapshot.
   */
  readCurrentSnapshot(): Promise<unknown> | unknown;
}

export interface PublicCatalogReadService {
  readCandidates(
    scope: PublicStorefrontPublicationScope,
  ): Promise<unknown> | unknown;
  /** Called only after the requested address has current publication proof. */
  readDetail(input: PublicStorefrontPublicationScope & {
    offeringId: string;
    family: MasterOfferingFamily;
    slug: string;
    publicationRevisionId: string;
    copyRevisionId: string;
  }): Promise<unknown> | unknown;
}

declare const AUTHORIZED_PUBLIC_STOREFRONT_CARD: unique symbol;
declare const AUTHORIZED_PUBLIC_STOREFRONT_DETAIL: unique symbol;

export interface AuthorizedPublicStorefrontCard {
  readonly product: MasterOfferingCardView;
  readonly publication: CurrentPublicStorefrontPublicationRecord;
  readonly [AUTHORIZED_PUBLIC_STOREFRONT_CARD]: true;
}

export interface AuthorizedPublicStorefrontDetail {
  readonly product: MasterOfferingDetailView;
  readonly publication: CurrentPublicStorefrontPublicationRecord;
  readonly [AUTHORIZED_PUBLIC_STOREFRONT_DETAIL]: true;
}

export interface CurrentPublicStorefrontPublicationRecord
  extends PublicStorefrontPublicationRecord {
  state: "published";
  publicationRevisionId: string;
  copyRevisionId: string;
  cardCopyDigest: string;
  detailCopyDigest: string;
  publishedAt: string;
  effectiveAt: string;
  revokedAt: null;
  supersededAt: null;
}

export interface PublishedPublicStorefrontSelection {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: MasterOfferingSort;
  products: readonly AuthorizedPublicStorefrontCard[];
  facets: PublicStorefrontFacets;
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_RECORDS = 2_000;
const MAX_SNAPSHOT_LIFETIME_MS = 10_000;
const MAX_TEXT_LENGTH = 4_096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function nonBlank(value: unknown, maximum = MAX_TEXT_LENGTH): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maximum
  );
}

function revision(value: unknown): value is string {
  return typeof value === "string" && SAFE_REVISION.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || canonicalTimestamp(value);
}

function epoch(value: string): number {
  return Date.parse(value);
}

function publicationState(
  value: unknown,
): value is PublicStorefrontPublicationState {
  return (
    typeof value === "string" &&
    (PUBLIC_STOREFRONT_PUBLICATION_STATES as readonly string[]).includes(value)
  );
}

function nullableRevision(value: unknown): value is string | null {
  return value === null || revision(value);
}

function nullableDigest(value: unknown): value is string | null {
  return value === null || digest(value);
}

function parsePublicationRecord(
  value: unknown,
): PublicStorefrontPublicationRecord | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "offeringId",
      "family",
      "slug",
      "state",
      "publicationRevisionId",
      "copyRevisionId",
      "cardCopyDigest",
      "detailCopyDigest",
      "publishedAt",
      "effectiveAt",
      "expiresAt",
      "revokedAt",
      "supersededAt",
    ]) ||
    !nonBlank(value.offeringId, 192) ||
    !isMasterOfferingFamily(value.family) ||
    typeof value.slug !== "string" ||
    !SAFE_SLUG.test(value.slug) ||
    !publicationState(value.state) ||
    !nullableRevision(value.publicationRevisionId) ||
    !nullableRevision(value.copyRevisionId) ||
    !nullableDigest(value.cardCopyDigest) ||
    !nullableDigest(value.detailCopyDigest) ||
    !nullableTimestamp(value.publishedAt) ||
    !nullableTimestamp(value.effectiveAt) ||
    !nullableTimestamp(value.expiresAt) ||
    !nullableTimestamp(value.revokedAt) ||
    !nullableTimestamp(value.supersededAt)
  ) {
    return null;
  }
  if (
    value.state === "published" &&
    (value.publicationRevisionId === null ||
      value.copyRevisionId === null ||
      value.cardCopyDigest === null ||
      value.detailCopyDigest === null ||
      value.publishedAt === null ||
      value.effectiveAt === null)
  ) {
    return null;
  }
  return value as unknown as PublicStorefrontPublicationRecord;
}

/**
 * Parses and freshness-checks an authority response as one indivisible value.
 * One malformed record invalidates the whole response; silently skipping an
 * unintelligible authority row could turn corruption into publication.
 */
export function parsePublicStorefrontPublicationSnapshot(
  value: unknown,
  now: string,
): PublicStorefrontPublicationSnapshot | null {
  if (
    !canonicalTimestamp(now) ||
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "authorityRevisionId",
      "catalogRevisionId",
      "readAt",
      "validUntil",
      "records",
    ]) ||
    value.schemaVersion !== 1 ||
    !revision(value.authorityRevisionId) ||
    !revision(value.catalogRevisionId) ||
    !canonicalTimestamp(value.readAt) ||
    !canonicalTimestamp(value.validUntil) ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_RECORDS
  ) {
    return null;
  }

  const readAt = epoch(value.readAt);
  const validUntil = epoch(value.validUntil);
  const current = epoch(now);
  if (
    readAt > current ||
    current >= validUntil ||
    current - readAt > MAX_SNAPSHOT_LIFETIME_MS ||
    validUntil <= readAt ||
    validUntil - readAt > MAX_SNAPSHOT_LIFETIME_MS
  ) {
    return null;
  }

  const records: PublicStorefrontPublicationRecord[] = [];
  const ids = new Set<string>();
  const addresses = new Set<string>();
  for (const candidate of value.records) {
    const parsed = parsePublicationRecord(candidate);
    if (parsed === null) return null;
    const address = `${parsed.family}\u0000${parsed.slug}`;
    if (ids.has(parsed.offeringId) || addresses.has(address)) return null;
    ids.add(parsed.offeringId);
    addresses.add(address);
    records.push(parsed);
  }

  return {
    schemaVersion: 1,
    authorityRevisionId: value.authorityRevisionId,
    catalogRevisionId: value.catalogRevisionId,
    readAt: value.readAt,
    validUntil: value.validUntil,
    records,
  };
}

export function publicStorefrontPublicationScope(
  snapshot: PublicStorefrontPublicationSnapshot,
): PublicStorefrontPublicationScope {
  return {
    authorityRevisionId: snapshot.authorityRevisionId,
    catalogRevisionId: snapshot.catalogRevisionId,
    readAt: snapshot.readAt,
  };
}

export function isPublicStorefrontPublicationSnapshotCurrent(
  snapshot: PublicStorefrontPublicationSnapshot,
  now: string,
): boolean {
  if (!canonicalTimestamp(now)) return false;
  const current = epoch(now);
  const readAt = epoch(snapshot.readAt);
  const validUntil = epoch(snapshot.validUntil);
  return (
    readAt <= current &&
    current < validUntil &&
    current - readAt <= MAX_SNAPSHOT_LIFETIME_MS &&
    validUntil - readAt <= MAX_SNAPSHOT_LIFETIME_MS
  );
}

function isCurrentPublication(
  record: PublicStorefrontPublicationRecord,
  snapshot: PublicStorefrontPublicationSnapshot,
  currentAt = snapshot.readAt,
): record is CurrentPublicStorefrontPublicationRecord {
  if (!canonicalTimestamp(currentAt)) return false;
  const authorityAsOf = epoch(snapshot.readAt);
  const asOf = epoch(currentAt);
  return (
    record.state === "published" &&
    record.publicationRevisionId !== null &&
    record.copyRevisionId !== null &&
    record.cardCopyDigest !== null &&
    record.detailCopyDigest !== null &&
    record.publishedAt !== null &&
    record.effectiveAt !== null &&
    epoch(record.publishedAt) <= authorityAsOf &&
    epoch(record.effectiveAt) <= authorityAsOf &&
    (record.expiresAt === null || epoch(record.expiresAt) > asOf) &&
    record.revokedAt === null &&
    record.supersededAt === null
  );
}

function isPrice(value: unknown): value is MasterOfferingPriceView {
  if (!isRecord(value) || typeof value.state !== "string") return false;
  if (value.state === "on_request") return true;
  return (
    value.state === "priced" &&
    Number.isSafeInteger(value.amountCents) &&
    Number(value.amountCents) > 0 &&
    value.currency === "USD" &&
    nonBlank(value.display, 128) &&
    value.basis === "exact_listed_unit" &&
    nonBlank(value.priceId, 192) &&
    Number.isSafeInteger(value.priceVersion) &&
    Number(value.priceVersion) > 0 &&
    canonicalTimestamp(value.effectiveAt) &&
    nullableTimestamp(value.expiresAt)
  );
}

function isAction(value: unknown): value is MasterOfferingAction {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "add_to_cart") {
    return (
      value.label === "Add to Cart" &&
      nonBlank(value.productId, 192) &&
      nonBlank(value.variantId, 192) &&
      nonBlank(value.sku, 192) &&
      canonicalTimestamp(value.evaluatedAt) &&
      isRecord(value.amount) &&
      Number.isSafeInteger(value.amount.amountCents) &&
      Number(value.amount.amountCents) > 0 &&
      value.amount.currency === "USD"
    );
  }
  if (value.kind === "none") {
    return value.label === null && value.href === null;
  }
  const labels: Readonly<Record<string, string>> = {
    request_access: "Request Access",
    request_early_access_purchase: "Request Early Access Purchase",
    apply: "Apply",
    notify_me: "Notify Me",
    join_waitlist: "Join Waitlist",
    explore_care: "Explore Care",
    get_updates: "Get Updates",
  };
  return labels[value.kind] === value.label && nonBlank(value.href, 1_024);
}

function isVariant(
  value: unknown,
): value is MasterOfferingVariantSummary {
  return (
    isRecord(value) &&
    nonBlank(value.id, 192) &&
    nonBlank(value.label, 512) &&
    isMasterOfferingDisplayState(value.displayState) &&
    nonBlank(value.displayLabel, 256) &&
    isPrice(value.price) &&
    isAction(value.action)
  );
}

function isPriceSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const states = ["none", "single", "range", "mixed"];
  return (
    typeof value.state === "string" &&
    states.includes(value.state) &&
    Number.isSafeInteger(value.variantCount) &&
    Number(value.variantCount) >= 0 &&
    Number.isSafeInteger(value.pricedVariantCount) &&
    Number(value.pricedVariantCount) >= 0 &&
    Number(value.pricedVariantCount) <= Number(value.variantCount) &&
    (value.currency === null || value.currency === "USD") &&
    (value.fromCents === null ||
      (Number.isSafeInteger(value.fromCents) && Number(value.fromCents) > 0)) &&
    (value.toCents === null ||
      (Number.isSafeInteger(value.toCents) && Number(value.toCents) > 0)) &&
    nonBlank(value.display, 128)
  );
}

function publicCategorySlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "offering";
}

function isCard(value: unknown): value is MasterOfferingCardView {
  if (
    !isRecord(value) ||
    !nonBlank(value.id, 192) ||
    typeof value.slug !== "string" ||
    !SAFE_SLUG.test(value.slug) ||
    !nonBlank(value.displayName, 512) ||
    !nonBlank(value.canonicalName, 512) ||
    !isMasterOfferingFamily(value.family) ||
    !nonBlank(value.familyLabel, 256) ||
    !nonBlank(value.category, 512) ||
    !isMasterOfferingCategorySlug(publicCategorySlug(value.category)) ||
    !(value.subcategory === null || nonBlank(value.subcategory, 512)) ||
    !(value.brand === null || nonBlank(value.brand, 512)) ||
    !isMasterOfferingDisplayState(value.displayState) ||
    !nonBlank(value.displayLabel, 256) ||
    !nonBlank(value.stateExplanation, 2_048) ||
    !["approved", "draft", "needs_review", "missing"].includes(
      String(value.copyState),
    ) ||
    !Number.isSafeInteger(value.variantCount) ||
    Number(value.variantCount) < 0 ||
    !Array.isArray(value.variants) ||
    value.variants.length !== value.variantCount ||
    value.variants.length > 1_000 ||
    !value.variants.every(isVariant) ||
    !isPriceSummary(value.priceSummary)
  ) {
    return false;
  }
  const variantIds = new Set(value.variants.map((variant) => variant.id));
  return variantIds.size === value.variants.length;
}

function isDetail(value: unknown): value is MasterOfferingDetailView {
  return (
    isCard(value) &&
    isRecord(value) &&
    (value.overview === null || nonBlank(value.overview, MAX_TEXT_LENGTH)) &&
    Array.isArray(value.disclosures) &&
    value.disclosures.length <= 100 &&
    value.disclosures.every((entry) => nonBlank(entry, 2_048))
  );
}

export function parsePublicStorefrontCatalogCandidateSnapshot(
  value: unknown,
  expectedCatalogRevisionId: string,
): PublicStorefrontCatalogCandidateSnapshot | null {
  if (
    !revision(expectedCatalogRevisionId) ||
    !isRecord(value) ||
    !exactKeys(value, ["schemaVersion", "catalogRevisionId", "products"]) ||
    value.schemaVersion !== 1 ||
    value.catalogRevisionId !== expectedCatalogRevisionId ||
    !Array.isArray(value.products) ||
    value.products.length > MAX_RECORDS ||
    !value.products.every(isCard)
  ) {
    return null;
  }
  const ids = new Set<string>();
  const addresses = new Set<string>();
  for (const product of value.products) {
    const address = `${product.family}\u0000${product.slug}`;
    if (ids.has(product.id) || addresses.has(address)) return null;
    ids.add(product.id);
    addresses.add(address);
  }
  return {
    schemaVersion: 1,
    catalogRevisionId: expectedCatalogRevisionId,
    products: value.products,
  };
}

function sha256(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Stable identity of the authority facts, excluding only the read/expiry
 * window. A second fresh read may have a later clock window, but no record may
 * change while a response is being assembled.
 */
export function publicStorefrontPublicationSnapshotFingerprint(
  snapshot: PublicStorefrontPublicationSnapshot,
): string {
  const records = [...snapshot.records]
    .sort((left, right) =>
      `${left.offeringId}\u0000${left.family}\u0000${left.slug}`.localeCompare(
        `${right.offeringId}\u0000${right.family}\u0000${right.slug}`,
      ),
    )
    .map((record) => [
      record.offeringId,
      record.family,
      record.slug,
      record.state,
      record.publicationRevisionId,
      record.copyRevisionId,
      record.cardCopyDigest,
      record.detailCopyDigest,
      record.publishedAt,
      record.effectiveAt,
      record.expiresAt,
      record.revokedAt,
      record.supersededAt,
    ]);
  return sha256([
    "xenios-public-storefront-publication-snapshot-v1",
    snapshot.authorityRevisionId,
    snapshot.catalogRevisionId,
    records,
  ]);
}

function cardCopyPayload(product: MasterOfferingCardView): unknown {
  return [
    "xenios-public-storefront-card-copy-v1",
    product.id,
    product.slug,
    product.family,
    product.familyLabel,
    product.displayName,
    product.category,
    product.subcategory,
    product.displayState,
    product.displayLabel,
    product.stateExplanation,
    product.variantCount,
    product.variants.map((variant) => [
      variant.id,
      variant.label,
      variant.displayState,
      variant.displayLabel,
    ]),
  ];
}

/** Exact digest the durable approval record must bind for a list card. */
export function publicStorefrontCardCopyDigest(
  product: MasterOfferingCardView,
): string {
  return sha256(cardCopyPayload(product));
}

/** Exact digest the durable approval record must bind for a detail response. */
export function publicStorefrontDetailCopyDigest(
  product: MasterOfferingDetailView,
): string {
  return sha256([
    "xenios-public-storefront-detail-copy-v1",
    cardCopyPayload(product),
    product.overview,
    product.disclosures,
  ]);
}

/**
 * Joins the complete candidate snapshot to durable current publication truth.
 *
 * Every current publication record must have one exact approved candidate.
 * A missing or digest-mismatched current row makes the snapshot unavailable
 * rather than silently publishing an incomplete or stale catalog. Additional
 * draft/held/unpublished candidates are ignored before any aggregate exists.
 */
export function authorizePublicStorefrontCandidates(
  publication: PublicStorefrontPublicationSnapshot,
  candidates: PublicStorefrontCatalogCandidateSnapshot,
  currentAt = publication.readAt,
): readonly AuthorizedPublicStorefrontCard[] | null {
  if (publication.catalogRevisionId !== candidates.catalogRevisionId) {
    return null;
  }
  const byId = new Map(candidates.products.map((product) => [product.id, product]));
  const authorized: AuthorizedPublicStorefrontCard[] = [];
  for (const record of publication.records) {
    if (!isCurrentPublication(record, publication, currentAt)) continue;
    const product = byId.get(record.offeringId);
    if (
      product === undefined ||
      product.copyState !== "approved" ||
      product.family !== record.family ||
      product.slug !== record.slug ||
      publicStorefrontCardCopyDigest(product) !== record.cardCopyDigest
    ) {
      return null;
    }
    authorized.push({
      product,
      publication: record,
    } as AuthorizedPublicStorefrontCard);
  }
  return authorized;
}

export function findCurrentPublicStorefrontPublication(
  snapshot: PublicStorefrontPublicationSnapshot,
  family: MasterOfferingFamily,
  slug: string,
  currentAt = snapshot.readAt,
): CurrentPublicStorefrontPublicationRecord | null {
  const found = snapshot.records.find(
    (record) => record.family === family && record.slug === slug,
  );
  return found !== undefined && isCurrentPublication(found, snapshot, currentAt)
    ? found
    : null;
}

export function authorizePublicStorefrontDetail(
  value: unknown,
  record: CurrentPublicStorefrontPublicationRecord,
): AuthorizedPublicStorefrontDetail | null {
  if (
    !isDetail(value) ||
    value.copyState !== "approved" ||
    value.id !== record.offeringId ||
    value.family !== record.family ||
    value.slug !== record.slug ||
    publicStorefrontCardCopyDigest(value) !== record.cardCopyDigest ||
    publicStorefrontDetailCopyDigest(value) !== record.detailCopyDigest
  ) {
    return null;
  }
  return { product: value, publication: record } as AuthorizedPublicStorefrontDetail;
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function searchScore(product: MasterOfferingCardView, query: string): number | null {
  const wanted = normalizedText(query);
  if (wanted === "") return 0;
  const name = normalizedText(product.displayName);
  const haystack = normalizedText(
    [
      product.displayName,
      product.familyLabel,
      product.category,
      product.subcategory ?? "",
      ...product.variants.map((variant) => variant.label),
    ].join(" "),
  );
  const tokens = wanted.split(" ").filter(Boolean);
  if (!tokens.every((token) => haystack.includes(token))) return null;
  if (name === wanted) return 1_000;
  if (name.startsWith(wanted)) return 800;
  if (name.includes(wanted)) return 650;
  return 100 + tokens.length;
}

const DISPLAY_STATE_RANK: Readonly<Record<MasterOfferingDisplayState, number>> = {
  available_now: 0,
  available_this_week: 1,
  approval_required: 2,
  request_access: 3,
  care_pathway: 4,
  temporarily_unavailable: 5,
  coming_soon: 6,
  planned: 7,
  unavailable: 8,
};

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

interface DecoratedAuthorizedCard {
  authorized: AuthorizedPublicStorefrontCard;
  score: number;
}

function comparePublishedCards(
  sort: MasterOfferingSort,
  left: DecoratedAuthorizedCard,
  right: DecoratedAuthorizedCard,
): number {
  if (sort === "relevance" && left.score !== right.score) {
    return right.score - left.score;
  }
  if (sort === "availability") {
    const byState =
      DISPLAY_STATE_RANK[left.authorized.product.displayState] -
      DISPLAY_STATE_RANK[right.authorized.product.displayState];
    if (byState !== 0) return byState;
  }
  const leftKey = `${left.authorized.product.displayName}|${left.authorized.product.slug}|${left.authorized.product.id}`;
  const rightKey = `${right.authorized.product.displayName}|${right.authorized.product.slug}|${right.authorized.product.id}`;
  const byName = leftKey.localeCompare(rightKey);
  return sort === "name_desc" ? -byName : byName;
}

/**
 * Search, facet, sort, count, and paginate only the already-authorized set.
 * No source-supplied aggregate survives this boundary.
 */
export function selectPublishedPublicStorefront(
  authorized: readonly AuthorizedPublicStorefrontCard[],
  query: MasterOfferingCatalogQuery = {},
): PublishedPublicStorefrontSelection {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(positiveInteger(query.pageSize, 24), 100);
  const sort =
    query.sort !== undefined && isMasterOfferingSort(query.sort)
      ? query.sort
      : DEFAULT_MASTER_OFFERING_SORT;
  const families =
    query.families && query.families.length > 0
      ? new Set(query.families)
      : null;
  const categories =
    query.categories && query.categories.length > 0
      ? new Set(query.categories)
      : null;

  const familyCounts = new Map<MasterOfferingFamily, number>(
    MASTER_OFFERING_FAMILIES.map((family) => [family, 0]),
  );
  const categoryLabels = new Map<string, string>();
  const categoryCounts = new Map<string, number>();
  for (const entry of authorized) {
    const slug = publicCategorySlug(entry.product.category);
    const existing = categoryLabels.get(slug);
    if (
      existing === undefined ||
      entry.product.category.localeCompare(existing) < 0
    ) {
      categoryLabels.set(slug, entry.product.category);
    }
    categoryCounts.set(slug, 0);
  }

  const matches: DecoratedAuthorizedCard[] = [];
  for (const entry of authorized) {
    const score = searchScore(entry.product, query.q ?? "");
    if (score === null) continue;
    const categorySlug = publicCategorySlug(entry.product.category);
    const inFamily = families === null || families.has(entry.product.family);
    const inCategory = categories === null || categories.has(categorySlug);
    if (inCategory) {
      familyCounts.set(
        entry.product.family,
        (familyCounts.get(entry.product.family) ?? 0) + 1,
      );
    }
    if (inFamily) {
      categoryCounts.set(categorySlug, (categoryCounts.get(categorySlug) ?? 0) + 1);
    }
    if (inFamily && inCategory) {
      matches.push({ authorized: entry, score });
    }
  }

  matches.sort((left, right) => comparePublishedCards(sort, left, right));
  const total = matches.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const selected =
    start >= total
      ? []
      : matches.slice(start, start + pageSize).map((entry) => entry.authorized);

  const familyFacets: PublicStorefrontFacetBucket<MasterOfferingFamily>[] =
    MASTER_OFFERING_FAMILIES.map((family) => ({
      value: family,
      label: MASTER_OFFERING_FAMILY_LABELS[family],
      count: familyCounts.get(family) ?? 0,
    }));
  const categoryFacets: PublicStorefrontFacetBucket[] = Array.from(
    categoryLabels.entries(),
  )
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({
      value,
      label,
      count: categoryCounts.get(value) ?? 0,
    }));

  return {
    page,
    pageSize,
    total,
    totalPages,
    sort,
    products: selected,
    facets: { families: familyFacets, categories: categoryFacets },
  };
}
