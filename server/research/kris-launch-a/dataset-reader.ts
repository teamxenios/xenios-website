/**
 * The production reader for the Launch A catalog artifact.
 *
 * It refuses rather than degrades. An absent, unreadable, wrong-schema,
 * ambiguous or privacy-failing artifact raises `KrisDatasetUnavailable`, the
 * route answers 503 `kris_catalog_unavailable`, and the browser says the
 * catalog is not available. It deliberately never returns an empty catalog on
 * failure: zero items reads as "there is nothing here", which is the one thing
 * this surface must never say by accident.
 *
 * WHY THE PRIVACY CHECKS RUN AGAIN ON READ
 * ----------------------------------------
 * `scripts/research/build-kris-launch-a.ts` already scans the artifact for
 * private column names, supplier names, cost figures and internal prose. This
 * reader re-checks the key-level half of that on every load anyway, because the
 * file is produced by a separate process, possibly on a different day, possibly
 * by a future edit to the builder, and a reader that trusts its input is how a
 * private field reaches a browser. The invariants the builder asserted must
 * still read exactly false here, and a single banned key anywhere in the file,
 * at any depth, refuses the whole dataset.
 *
 * WHAT IT DOES NOT TRUST FROM THE FILE
 *   - Labels. `familyLabel` and `channelLabel` are re-derived from the shared
 *     contract, so a stale or edited label in the artifact cannot reach a
 *     browser while the code says something else.
 *   - Price display. The `$` string is rebuilt from `amountCents` and the file's
 *     own string must AGREE with it or the dataset is refused. A display that
 *     said $8.00 over an amount of 8800 is a lie a member would act on.
 *   - Counts. The declared `counts` block is recounted and reported as
 *     `countsAgree` rather than believed.
 */

import fs from "node:fs";
import {
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILY_LABELS,
  KRIS_PRICE_PENDING,
  isKrisChannel,
  isKrisFamily,
  isKrisPriceProfile,
  type KrisChannel,
  type KrisFamily,
  type KrisPriceProfile,
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import { KRIS_PRIVATE_MASTER_COLUMNS } from "./normalize";
import {
  KRIS_LAUNCH_A_DATASET_ENV_VAR,
  resolveKrisDatasetLocation,
  type KrisDatasetLocation,
  type KrisDatasetLocationProbe,
} from "./dataset-location";
import { warmKrisSearch } from "./search";

export { KRIS_LAUNCH_A_DATASET_ENV_VAR };

export class KrisDatasetUnavailable extends Error {
  constructor(readonly reason: string) {
    // Operator facing, and carrying no dataset content, so it is safe in a log.
    // The route never forwards it to a browser.
    super(`kris launch a dataset unavailable: ${reason}`);
    this.name = "KrisDatasetUnavailable";
  }
}

/**
 * Keys that must not appear anywhere in the artifact, at any depth.
 *
 * Two groups. The first is the exact private workbook headers, imported from
 * normalize.ts rather than retyped so the ban list cannot drift from the one
 * the builder enforces. The second is the camelCase shape the same facts would
 * take if a future edit picked them into a typed object instead of spreading a
 * raw row, which is the likelier accident now that the raw-row path is closed.
 */
export const KRIS_DATASET_BANNED_KEYS: readonly string[] = [
  ...KRIS_PRIVATE_MASTER_COLUMNS,
  "selectedSupplier",
  "supplier",
  "supplierName",
  "supplierSku",
  "supplierNotes",
  "supplierVariant",
  "alternativeSupplier",
  "alternativeCost",
  "buyCost",
  "buyCostPerUnit",
  "originalQuote",
  "suggestedSellPrice",
  "sellPrice",
  "grossProfit",
  "grossMargin",
  "margin",
  "markup",
  "savings",
  "savingsVsAlternative",
  "offersCompared",
  "suppliersCompared",
  "overlapType",
  "selectionRationale",
  "recommendedAction",
  "sourceFile",
  "sourceLocation",
  "sheetRow",
  "qualityRegulatoryNotes",
  "internalNote",
  "internalNotes",
  // Not a private field, an authority one. Launch A sells nothing, so nothing
  // in the DATA may carry a purchase flag or a purchase action: the access
  // policy in code is the only thing that speaks to purchasability, and it
  // always says false.
  "purchasable",
  "addToCart",
  "add_to_cart",
  "checkoutUrl",
];

/** Every invariant the builder asserted must still read exactly false. */
const REQUIRED_FALSE_INVARIANTS: readonly string[] = [
  "containsSupplierIdentity",
  "containsBuyCost",
  "containsMargin",
  "containsSavings",
  "containsInternalSourcingNotes",
  "containsSuggestedSellPrice",
  "itemCanBecomePurchasable",
];

/**
 * One product as the server holds it.
 *
 * Not a view. The browser-facing `KrisCatalogItemView` is built from this by
 * the projection, which is where the access policy and the price are attached.
 * Keeping them separate is what lets the service prove it projected only the
 * page it was asked for.
 */
export interface KrisProductRecord {
  id: string;
  slug: string;
  displayName: string;
  specification: string;
  family: KrisFamily;
  channel: KrisChannel;
  format: string;
  packBasis: string;
  moq: number | null;
  dosageForm: string | null;
  suppliedNote: string;
}

export type KrisPriceIndex = ReadonlyMap<string, KrisPriceView>;

export interface KrisDatasetSummary {
  generatedAt: string;
  masterSha256: string;
  krisSha256: string;
  /** Counted here, never trusted from the file's own header. */
  items: number;
  priced: number;
  pricePending: number;
  declaredItems: number;
  declaredPriced: number;
  declaredPricePending: number;
  countsAgree: boolean;
  profiles: readonly KrisPriceProfile[];
  families: Readonly<Record<string, number>>;
  channels: Readonly<Record<string, number>>;
}

export interface LoadedKrisDataset {
  products: readonly KrisProductRecord[];
  /**
   * Slug and id indexes, built once per load.
   *
   * A detail request must not walk 420 products to find one, and a
   * specification-scoped read must not walk them to find its price. The loader
   * already refuses a duplicate slug or id, so these can be simple maps.
   */
  bySlug: ReadonlyMap<string, KrisProductRecord>;
  byId: ReadonlyMap<string, KrisProductRecord>;
  prices: ReadonlyMap<KrisPriceProfile, KrisPriceIndex>;
  summary: KrisDatasetSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findBannedKey(
  value: unknown,
  banned: ReadonlySet<string>,
): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findBannedKey(entry, banned);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if (banned.has(key)) return key;
    const found = findBannedKey(value[key], banned);
    if (found !== null) return found;
  }
  return null;
}

/** The display string an amount must carry, built rather than believed. */
export function krisPriceDisplay(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function readProduct(value: unknown): KrisProductRecord {
  if (!isRecord(value)) {
    throw new KrisDatasetUnavailable("malformed product entry");
  }
  if (!nonBlank(value.id) || !nonBlank(value.slug) || !nonBlank(value.displayName)) {
    throw new KrisDatasetUnavailable("product is missing an id, slug or name");
  }
  if (!isKrisFamily(value.family)) {
    throw new KrisDatasetUnavailable(`product ${value.id} has an unknown family`);
  }
  if (!isKrisChannel(value.channel)) {
    throw new KrisDatasetUnavailable(`product ${value.id} has an unknown channel`);
  }
  const moq =
    typeof value.moq === "number" && Number.isSafeInteger(value.moq) && value.moq > 0
      ? value.moq
      : null;
  return {
    id: value.id,
    slug: value.slug,
    displayName: value.displayName,
    specification: nonBlank(value.specification)
      ? value.specification
      : value.displayName,
    family: value.family,
    channel: value.channel,
    format: nonBlank(value.format) ? value.format : "",
    packBasis: nonBlank(value.packBasis) ? value.packBasis : "",
    moq,
    dosageForm: nonBlank(value.dosageForm) ? value.dosageForm : null,
    suppliedNote: typeof value.suppliedNote === "string" ? value.suppliedNote : "",
  };
}

/**
 * One overlay entry into a price view, or a refusal.
 *
 * `pending` is a real state and is returned as the shared constant, so every
 * pending item is the same object shape and the same copy. A priced entry has
 * to be a positive whole number of cents whose own display agrees with it.
 */
function readPrice(
  entry: unknown,
  productId: string,
  fallbackBasis: string,
): KrisPriceView {
  if (!isRecord(entry)) {
    throw new KrisDatasetUnavailable(`price for ${productId} is malformed`);
  }
  if (entry.state === "pending") return KRIS_PRICE_PENDING;
  if (entry.state !== "priced") {
    throw new KrisDatasetUnavailable(
      `price for ${productId} has an unknown state`,
    );
  }
  const amountCents = entry.amountCents;
  if (
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    // Zero is refused rather than rendered. A sheet that says 0 is telling us
    // something we do not understand yet, not that the item is free.
    throw new KrisDatasetUnavailable(
      `price for ${productId} is not a positive whole number of cents`,
    );
  }
  const currency = nonBlank(entry.currency) ? entry.currency : "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new KrisDatasetUnavailable(`price for ${productId} has no currency`);
  }
  const display = krisPriceDisplay(amountCents);
  if (nonBlank(entry.display) && entry.display !== display) {
    // The file's own words disagreeing with its own number is not a rounding
    // difference, it is a price a member would act on being wrong.
    throw new KrisDatasetUnavailable(
      `price for ${productId} displays an amount it does not carry`,
    );
  }
  return {
    state: "priced",
    amountCents,
    currency,
    display,
    basis: nonBlank(entry.basis) ? entry.basis : fallbackBasis,
  };
}

/**
 * Validate and load one artifact. Pure: no filesystem and no environment, so
 * the whole refusal surface is unit testable.
 */
export function loadKrisDataset(raw: unknown): LoadedKrisDataset {
  if (!isRecord(raw)) {
    throw new KrisDatasetUnavailable("dataset is not an object");
  }
  if (raw.schemaVersion !== 1) {
    throw new KrisDatasetUnavailable(
      `unsupported schema version ${String(raw.schemaVersion)}`,
    );
  }
  if (!isRecord(raw.invariants)) {
    throw new KrisDatasetUnavailable("dataset declares no invariants");
  }
  for (const invariant of REQUIRED_FALSE_INVARIANTS) {
    if (raw.invariants[invariant] !== false) {
      throw new KrisDatasetUnavailable(`invariant ${invariant} is not false`);
    }
  }
  const banned = findBannedKey(raw, new Set(KRIS_DATASET_BANNED_KEYS));
  if (banned !== null) {
    throw new KrisDatasetUnavailable(`dataset carries the private key ${banned}`);
  }
  if (!Array.isArray(raw.products) || raw.products.length === 0) {
    throw new KrisDatasetUnavailable("dataset carries no products");
  }

  const products = raw.products.map(readProduct);
  const byId = new Map<string, KrisProductRecord>();
  const bySlug = new Map<string, KrisProductRecord>();
  for (const product of products) {
    if (byId.has(product.id)) {
      throw new KrisDatasetUnavailable(`duplicate product id ${product.id}`);
    }
    if (bySlug.has(product.slug)) {
      // Ambiguity is a refusal, not a pick. A slug that resolved twice would
      // make a deep link mean two products.
      throw new KrisDatasetUnavailable(`duplicate product slug ${product.slug}`);
    }
    byId.set(product.id, product);
    bySlug.set(product.slug, product);
  }

  if (!Array.isArray(raw.priceProfiles) || raw.priceProfiles.length === 0) {
    throw new KrisDatasetUnavailable("dataset declares no price profile");
  }
  const profiles: KrisPriceProfile[] = [];
  for (const profile of raw.priceProfiles) {
    if (!isKrisPriceProfile(profile)) {
      throw new KrisDatasetUnavailable(
        `dataset declares the unknown price profile ${String(profile)}`,
      );
    }
    profiles.push(profile);
  }
  if (!isRecord(raw.priceOverlays)) {
    throw new KrisDatasetUnavailable("dataset carries no price overlay");
  }
  for (const key of Object.keys(raw.priceOverlays)) {
    if (!profiles.includes(key as KrisPriceProfile)) {
      throw new KrisDatasetUnavailable(
        `dataset carries an overlay for the undeclared profile ${key}`,
      );
    }
  }

  const prices = new Map<KrisPriceProfile, KrisPriceIndex>();
  for (const profile of profiles) {
    const overlay = raw.priceOverlays[profile];
    if (!isRecord(overlay)) {
      throw new KrisDatasetUnavailable(`profile ${profile} has no overlay`);
    }
    const index = new Map<string, KrisPriceView>();
    for (const [productId, entry] of Object.entries(overlay)) {
      const product = byId.get(productId);
      if (product === undefined) {
        // An overlay keyed to a product that is not in the catalog means the
        // two halves of the artifact were built from different runs. Refuse:
        // the alternative is a price that belongs to something else.
        throw new KrisDatasetUnavailable(
          `profile ${profile} prices the unknown product ${productId}`,
        );
      }
      index.set(productId, readPrice(entry, productId, product.packBasis));
    }
    prices.set(profile, index);
  }

  // The declared profile's coverage, recounted. A product with NO overlay entry
  // is pending, which is a supported state rather than a fault, so it is
  // counted and not refused.
  const primary = prices.get(profiles[0]) as KrisPriceIndex;
  let priced = 0;
  for (const product of products) {
    if (primary.get(product.id)?.state === "priced") priced += 1;
  }

  const families: Record<string, number> = {};
  const channels: Record<string, number> = {};
  for (const product of products) {
    families[product.family] = (families[product.family] ?? 0) + 1;
    channels[product.channel] = (channels[product.channel] ?? 0) + 1;
  }

  const declared = isRecord(raw.counts) ? raw.counts : {};
  const declaredItems = typeof declared.items === "number" ? declared.items : -1;
  const declaredPriced = typeof declared.priced === "number" ? declared.priced : -1;
  const declaredPending =
    typeof declared.pricePending === "number" ? declared.pricePending : -1;
  const sources = isRecord(raw.sources) ? raw.sources : {};
  const master = isRecord(sources.masterCatalog) ? sources.masterCatalog : {};
  const kris = isRecord(sources.krisPricing) ? sources.krisPricing : {};

  return {
    products,
    bySlug,
    byId,
    prices,
    summary: {
      generatedAt: nonBlank(raw.generatedAt) ? raw.generatedAt : "",
      masterSha256: nonBlank(master.sha256) ? master.sha256 : "",
      krisSha256: nonBlank(kris.sha256) ? kris.sha256 : "",
      items: products.length,
      priced,
      pricePending: products.length - priced,
      declaredItems,
      declaredPriced,
      declaredPricePending: declaredPending,
      countsAgree:
        declaredItems === products.length &&
        declaredPriced === priced &&
        declaredPending === products.length - priced,
      profiles,
      families,
      channels,
    },
  };
}

export interface KrisDatasetFileSystem {
  statMtimeMs(filePath: string): number;
  readText(filePath: string): string;
}

const nodeFileSystem: KrisDatasetFileSystem = {
  statMtimeMs: (filePath) => fs.statSync(filePath).mtimeMs,
  readText: (filePath) => fs.readFileSync(filePath, "utf8"),
};

/**
 * The catalog source the service reads.
 *
 * Deliberately narrow, and deliberately not "give me everything". `products`
 * is the traversal the list and the facet counts genuinely need; `findBySlug`,
 * `findById` and `priceFor` are single lookups, so a detail request can be
 * proven to touch one product and one price rather than the whole file.
 */
export interface KrisCatalogSource {
  products(): readonly KrisProductRecord[];
  findBySlug(slug: string): KrisProductRecord | null;
  findById(id: string): KrisProductRecord | null;
  priceFor(profile: KrisPriceProfile, productId: string): KrisPriceView;
  hasProfile(profile: KrisPriceProfile): boolean;
}

/**
 * Reads the artifact from disk once, and again whenever the file changes.
 *
 * Parsing 420 products and 420 overlay entries on every request would make
 * paging slow for no reason; never re-reading would make a regenerated artifact
 * invisible until a restart.
 */
export class GeneratedKrisCatalogSource implements KrisCatalogSource {
  private cached: { mtimeMs: number; loaded: LoadedKrisDataset } | null = null;

  constructor(
    private readonly filePath: string,
    private readonly files: KrisDatasetFileSystem = nodeFileSystem,
  ) {
    if (!filePath.trim()) {
      throw new KrisDatasetUnavailable("no dataset path configured");
    }
  }

  load(): LoadedKrisDataset {
    let mtimeMs: number;
    try {
      mtimeMs = this.files.statMtimeMs(this.filePath);
    } catch {
      throw new KrisDatasetUnavailable("dataset file is not readable");
    }
    if (this.cached !== null && this.cached.mtimeMs === mtimeMs) {
      return this.cached.loaded;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.files.readText(this.filePath));
    } catch {
      throw new KrisDatasetUnavailable("dataset is not valid JSON");
    }
    const loaded = loadKrisDataset(parsed);
    // Pay the search normalization cost once per dataset here, rather than on
    // whichever member happens to type the first query.
    warmKrisSearch(loaded.products);
    this.cached = { mtimeMs, loaded };
    return loaded;
  }

  summary(): KrisDatasetSummary {
    return this.load().summary;
  }

  products(): readonly KrisProductRecord[] {
    return this.load().products;
  }

  findBySlug(slug: string): KrisProductRecord | null {
    return this.load().bySlug.get(slug) ?? null;
  }

  findById(id: string): KrisProductRecord | null {
    return this.load().byId.get(id) ?? null;
  }

  /**
   * The price for one product under one profile.
   *
   * A missing overlay entry is `Price pending`, never zero and never a guess.
   * That is the honest answer for the two Launch A rows that have no price yet,
   * and it stays the honest answer for any row a future workbook has not
   * priced.
   */
  priceFor(profile: KrisPriceProfile, productId: string): KrisPriceView {
    return this.load().prices.get(profile)?.get(productId) ?? KRIS_PRICE_PENDING;
  }

  hasProfile(profile: KrisPriceProfile): boolean {
    return this.load().prices.has(profile);
  }
}

/** An in-memory source for tests and fixtures. Same refusals, no filesystem. */
export class InMemoryKrisCatalogSource implements KrisCatalogSource {
  constructor(
    private readonly items: readonly KrisProductRecord[],
    private readonly overlay: ReadonlyMap<string, KrisPriceView> = new Map(),
    private readonly profile: KrisPriceProfile = "KRIS_VOLUME_PARTNER",
  ) {}

  products(): readonly KrisProductRecord[] {
    return this.items;
  }

  findBySlug(slug: string): KrisProductRecord | null {
    return this.items.find((item) => item.slug === slug) ?? null;
  }

  findById(id: string): KrisProductRecord | null {
    return this.items.find((item) => item.id === id) ?? null;
  }

  priceFor(profile: KrisPriceProfile, productId: string): KrisPriceView {
    if (profile !== this.profile) return KRIS_PRICE_PENDING;
    return this.overlay.get(productId) ?? KRIS_PRICE_PENDING;
  }

  hasProfile(profile: KrisPriceProfile): boolean {
    return profile === this.profile;
  }
}

const nodeLocationProbe: KrisDatasetLocationProbe = {
  exists: (filePath) => fs.existsSync(filePath),
};

/**
 * Build the source for this deployment.
 *
 * Null means "no artifact anywhere", and the composition root turns that into
 * an unavailable surface rather than an empty one.
 */
export function createKrisCatalogSourceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  files: KrisDatasetFileSystem = nodeFileSystem,
  probe: KrisDatasetLocationProbe = nodeLocationProbe,
  cwd: string = process.cwd(),
): GeneratedKrisCatalogSource | null {
  const location = resolveKrisDatasetLocation({ env, cwd, probe });
  if (location === null) return null;
  return new GeneratedKrisCatalogSource(location.filePath, files);
}

/**
 * The same resolution, reported rather than used. A deployment answering 503
 * should be able to say which rule ran and which path it chose without an
 * operator reading the source to work it out.
 */
export function describeKrisDatasetLocation(
  env: NodeJS.ProcessEnv = process.env,
  probe: KrisDatasetLocationProbe = nodeLocationProbe,
  cwd: string = process.cwd(),
): KrisDatasetLocation | null {
  return resolveKrisDatasetLocation({ env, cwd, probe });
}

export { KRIS_CHANNEL_LABELS, KRIS_FAMILY_LABELS };
