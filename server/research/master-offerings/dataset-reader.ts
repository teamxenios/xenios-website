/**
 * The production catalog reader.
 *
 * Until now the only `MasterOfferingCatalogReader` was the in-memory one used by
 * tests, which means a fully mounted catalog would have served zero offerings.
 * This reads the member-safe dataset that
 * `scripts/research/build-master-offerings.ts` generates, so the surface has
 * something real to show.
 *
 * It refuses rather than degrades. An absent, unreadable, wrong-schema,
 * ambiguous, or privacy-failing dataset raises `MasterOfferingDatasetUnavailable`,
 * the route answers `503 master_offerings_unavailable`, and the browser renders
 * "not available yet". It deliberately never returns an empty catalog on
 * failure: zero offerings is indistinguishable from "Xenios sells nothing",
 * which is the one thing this surface must never say by accident.
 *
 * The generated file carries no `visibility` field because the builder already
 * dropped every admin-only offering and every admin-only variant. This reader
 * marks what it loads as member visible, and the projection layer still checks
 * visibility on every path, so an admin-only row that somehow reached the file
 * would still be refused downstream.
 */

import fs from "node:fs";
import {
  MASTER_OFFERING_COPY_STATES,
  isMasterOfferingDisplayState,
  isMasterOfferingFamily,
  type MasterOfferingCopyState,
} from "@shared/research/master-offerings/contract";
import { warmMasterOfferingSearch } from "./search";
import {
  MASTER_OFFERINGS_DATASET_ENV_VAR,
  resolveMasterOfferingDatasetLocation,
  type DatasetLocationProbe,
  type MasterOfferingDatasetLocation,
} from "./dataset-location";
import type {
  MasterOfferingCatalogReader,
} from "./service";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";

// Re-exported because this module was the constant's home before the location
// rules grew their own file, and several callers still import it from here.
export { MASTER_OFFERINGS_DATASET_ENV_VAR };

export class MasterOfferingDatasetUnavailable extends Error {
  constructor(readonly reason: string) {
    // The message is operator facing and carries no dataset content, so it is
    // safe in a log. The route never forwards it to a browser.
    super(`master offerings dataset unavailable: ${reason}`);
    this.name = "MasterOfferingDatasetUnavailable";
  }
}

/**
 * Keys that must not appear anywhere in the generated file. This mirrors the
 * builder's own ban list. Checking it again on read is deliberate: the file is
 * produced by a separate process, possibly on a different day, and a reader
 * that trusts its input is how a private field reaches a browser.
 */
export const MASTER_OFFERINGS_DATASET_BANNED_KEYS: readonly string[] = [
  "supplierOrOwner",
  "supplier",
  "supplierSku",
  "sourceSku",
  "sourceGroup",
  "sourceNotes",
  "sourceReferences",
  "originalWholesaleCost",
  "updatedWholesaleCost",
  "wholesaleStatus",
  "originalSellPrice",
  "updatedSellPrice",
  "targetSellAtUpdatedCost",
  "recommendedLaunchSellPrice",
  "updatedMarkupMultiple",
  "updatedGrossProfit",
  "updatedGrossMargin",
  "activationRequirement",
  "canonicalKey",
  "planningPricePresent",
  "updatedWholesaleCostPresent",
  "sheetRow",
  "purchasable",
  "holds",
  "disputeReason",
  "internalNote",
  "internalNotes",
];

/** Every invariant the builder asserted must still read exactly false. */
const REQUIRED_FALSE_INVARIANTS: readonly string[] = [
  "containsSupplierIdentity",
  "containsWholesaleCost",
  "containsPlanningPrice",
  "containsMargin",
  "containsInternalNotes",
  "containsProviderNames",
  "planningRowCanBecomePurchasable",
];

export interface MasterOfferingDatasetSummary {
  generatedAt: string;
  sourceWorkbookSha256: string;
  /** Counted here, not trusted from the file's own header. */
  offerings: number;
  variants: number;
  /** What the file claims, kept so a mismatch is visible rather than silent. */
  declaredOfferings: number;
  declaredVariants: number;
  countsAgree: boolean;
  families: Readonly<Record<string, number>>;
  displayStates: Readonly<Record<string, number>>;
}

export interface LoadedMasterOfferingDataset {
  products: readonly NormalizedMasterOffering[];
  summary: MasterOfferingDatasetSummary;
  /**
   * Member-visible offerings by slug, built once per load.
   *
   * The detail route used to scan all 1,121 offerings on every request to find
   * one. The scan was correct and it refused an ambiguous slug by counting
   * matches, so this index has to keep that property rather than take the first
   * hit: a slug that somehow resolved twice must resolve to nothing. The loader
   * already refuses a dataset with duplicate slugs, so a collision here means
   * the two guards disagree, and the safe reading of that is no product.
   */
  bySlug: ReadonlyMap<string, NormalizedMasterOffering>;
}

function indexBySlug(
  products: readonly NormalizedMasterOffering[],
): ReadonlyMap<string, NormalizedMasterOffering> {
  const index = new Map<string, NormalizedMasterOffering>();
  const collided = new Set<string>();
  for (const product of products) {
    if (product.visibility !== "member") continue;
    if (index.has(product.slug)) {
      collided.add(product.slug);
      continue;
    }
    index.set(product.slug, product);
  }
  for (const slug of Array.from(collided)) index.delete(slug);
  return index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findBannedKey(value: unknown, banned: ReadonlySet<string>): string | null {
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

/**
 * A variant label that carries no meaning for a member.
 *
 * The workbook's "Variant / Format" column is sometimes the reseller's own SKU
 * ("R190", "R305-GFSK") or a bare dash. Twenty of the 1,181 member-safe
 * variants arrive that way. Both are wrong to show: an internal source SKU is
 * explicitly on the never-expose list, and a buyer reading "R190" learns
 * nothing.
 *
 * The shape rule is no lowercase letter and no whitespace, which is what an
 * internal code looks like and what a descriptive label never does. Measured
 * against the real catalog it selects exactly those twenty and nothing else:
 * every genuine label ("5 mg vial", "60 vegetarian capsules", "Per product
 * family") has both.
 */
function isOpaqueVariantLabel(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed === "") return true;
  return !/[a-z]/.test(trimmed) && !/\s/.test(trimmed);
}

function readVariant(
  value: unknown,
  offeringId: string,
  offeringName: string,
  variantCount: number,
): NormalizedMasterOfferingVariant {
  if (!isRecord(value)) {
    throw new MasterOfferingDatasetUnavailable(
      `offering ${offeringId} has a malformed variant`,
    );
  }
  if (!nonBlank(value.id) || typeof value.label !== "string") {
    throw new MasterOfferingDatasetUnavailable(
      `offering ${offeringId} has a variant with no id or label`,
    );
  }
  // A blank label is handled below with the other meaningless labels rather
  // than refused here, so that a dash and an empty string reach the same
  // truthful outcome instead of two different ones.
  if (!isMasterOfferingDisplayState(value.displayState)) {
    throw new MasterOfferingDatasetUnavailable(
      `variant ${value.id} has an unknown display state`,
    );
  }
  let label = value.label;
  if (isOpaqueVariantLabel(label)) {
    if (variantCount !== 1) {
      // Two variants of the same product both labelled with internal codes
      // cannot be told apart, and there is nothing truthful to call them.
      // Refuse rather than invent a name or leave a source SKU on screen.
      throw new MasterOfferingDatasetUnavailable(
        `offering ${offeringId} has an unlabelled variant among several`,
      );
    }
    // One variant means the variant is the product. Saying so is truthful and
    // invents nothing.
    label = offeringName;
  }
  return {
    id: value.id,
    label,
    displayState: value.displayState,
    visibility: "member",
    sourceReferences: [],
  };
}

function readCopyState(value: unknown): MasterOfferingCopyState {
  return (MASTER_OFFERING_COPY_STATES as readonly string[]).includes(
    value as string,
  )
    ? (value as MasterOfferingCopyState)
    : // An unrecognized copy state is not a reason to hide a product, but it is
      // a reason not to claim the copy was approved.
      "needs_review";
}

function readOffering(value: unknown): NormalizedMasterOffering {
  if (!isRecord(value)) {
    throw new MasterOfferingDatasetUnavailable("malformed offering entry");
  }
  if (!nonBlank(value.id) || !nonBlank(value.slug) || !nonBlank(value.displayName)) {
    throw new MasterOfferingDatasetUnavailable(
      "offering is missing an id, slug, or display name",
    );
  }
  if (!isMasterOfferingFamily(value.family)) {
    throw new MasterOfferingDatasetUnavailable(
      `offering ${value.id} has an unknown family`,
    );
  }
  if (!isMasterOfferingDisplayState(value.displayState)) {
    throw new MasterOfferingDatasetUnavailable(
      `offering ${value.id} has an unknown display state`,
    );
  }
  const rawVariants = Array.isArray(value.variants) ? value.variants : [];
  if (rawVariants.length === 0) {
    throw new MasterOfferingDatasetUnavailable(
      `offering ${value.id} has no member-safe variant`,
    );
  }
  const aliases = Array.isArray(value.aliases)
    ? value.aliases.filter(nonBlank)
    : [];
  return {
    id: value.id,
    slug: value.slug,
    // The generated file drops the canonical key on purpose. Nothing in the
    // display path reads it, and reconstructing one here would put a private
    // identity back into a member-safe object.
    canonicalKey: "",
    displayName: value.displayName,
    canonicalName: nonBlank(value.canonicalName)
      ? value.canonicalName
      : value.displayName,
    family: value.family,
    category: nonBlank(value.category) ? value.category : "Uncategorized",
    subcategory: nonBlank(value.subcategory) ? value.subcategory : null,
    brand: nonBlank(value.brand) ? value.brand : null,
    aliases,
    displayState: value.displayState,
    stateExplanation: nonBlank(value.stateExplanation)
      ? value.stateExplanation
      : "",
    copyState: readCopyState(value.copyState),
    visibility: "member",
    variants: rawVariants.map((variant) =>
      readVariant(
        variant,
        value.id as string,
        value.displayName as string,
        rawVariants.length,
      ),
    ),
    sourceReferences: [],
  };
}

/**
 * Validate and load one generated dataset. Pure: no filesystem, no environment,
 * so the whole refusal surface is unit testable.
 */
export function loadMasterOfferingDataset(
  raw: unknown,
): LoadedMasterOfferingDataset {
  if (!isRecord(raw)) {
    throw new MasterOfferingDatasetUnavailable("dataset is not an object");
  }
  if (raw.schemaVersion !== 1) {
    throw new MasterOfferingDatasetUnavailable(
      `unsupported schema version ${String(raw.schemaVersion)}`,
    );
  }
  if (!isRecord(raw.invariants)) {
    throw new MasterOfferingDatasetUnavailable("dataset declares no invariants");
  }
  for (const invariant of REQUIRED_FALSE_INVARIANTS) {
    if (raw.invariants[invariant] !== false) {
      throw new MasterOfferingDatasetUnavailable(
        `invariant ${invariant} is not false`,
      );
    }
  }
  const banned = findBannedKey(
    raw,
    new Set(MASTER_OFFERINGS_DATASET_BANNED_KEYS),
  );
  if (banned !== null) {
    throw new MasterOfferingDatasetUnavailable(
      `dataset carries the private key ${banned}`,
    );
  }
  if (!Array.isArray(raw.products) || raw.products.length === 0) {
    throw new MasterOfferingDatasetUnavailable("dataset carries no products");
  }

  const products = raw.products.map(readOffering);

  // Ambiguity is a refusal, not a pick. The detail route already refuses a
  // duplicate slug; catching it at load turns a silent 404 into a loud one.
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const product of products) {
    if (ids.has(product.id)) {
      throw new MasterOfferingDatasetUnavailable(
        `duplicate offering id ${product.id}`,
      );
    }
    if (slugs.has(product.slug)) {
      throw new MasterOfferingDatasetUnavailable(
        `duplicate offering slug ${product.slug}`,
      );
    }
    ids.add(product.id);
    slugs.add(product.slug);
  }

  const families: Record<string, number> = {};
  const displayStates: Record<string, number> = {};
  let variants = 0;
  for (const product of products) {
    families[product.family] = (families[product.family] ?? 0) + 1;
    displayStates[product.displayState] =
      (displayStates[product.displayState] ?? 0) + 1;
    variants += product.variants.length;
  }

  const declaredOfferings =
    typeof raw.canonicalProductCount === "number" ? raw.canonicalProductCount : -1;
  const declaredVariants =
    typeof raw.variantCount === "number" ? raw.variantCount : -1;

  return {
    products,
    bySlug: indexBySlug(products),
    summary: {
      generatedAt: nonBlank(raw.generatedAt) ? raw.generatedAt : "",
      sourceWorkbookSha256: nonBlank(raw.sourceWorkbookSha256)
        ? raw.sourceWorkbookSha256
        : "",
      offerings: products.length,
      variants,
      declaredOfferings,
      declaredVariants,
      countsAgree:
        declaredOfferings === products.length && declaredVariants === variants,
      families,
      displayStates,
    },
  };
}

export interface DatasetFileSystem {
  statMtimeMs(filePath: string): number;
  readText(filePath: string): string;
}

const nodeFileSystem: DatasetFileSystem = {
  statMtimeMs: (filePath) => fs.statSync(filePath).mtimeMs,
  readText: (filePath) => fs.readFileSync(filePath, "utf8"),
};

/**
 * Reads the generated dataset from disk, once, and again whenever the file
 * changes on disk. Parsing 1,121 offerings on every catalog request would make
 * paging slow for no reason, and never re-reading would make a regenerated
 * dataset invisible until a restart.
 */
export class GeneratedMasterOfferingCatalogReader
  implements MasterOfferingCatalogReader
{
  private cached: { mtimeMs: number; loaded: LoadedMasterOfferingDataset } | null =
    null;

  constructor(
    private readonly filePath: string,
    private readonly files: DatasetFileSystem = nodeFileSystem,
  ) {
    if (!filePath.trim()) {
      throw new MasterOfferingDatasetUnavailable("no dataset path configured");
    }
  }

  load(): LoadedMasterOfferingDataset {
    let mtimeMs: number;
    try {
      mtimeMs = this.files.statMtimeMs(this.filePath);
    } catch {
      throw new MasterOfferingDatasetUnavailable("dataset file is not readable");
    }
    if (this.cached !== null && this.cached.mtimeMs === mtimeMs) {
      return this.cached.loaded;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.files.readText(this.filePath));
    } catch {
      throw new MasterOfferingDatasetUnavailable("dataset is not valid JSON");
    }
    const loaded = loadMasterOfferingDataset(parsed);
    // Pay the search normalization cost here, once per dataset, rather than on
    // whichever member happens to type the first query.
    warmMasterOfferingSearch(loaded.products);
    this.cached = { mtimeMs, loaded };
    return loaded;
  }

  summary(): MasterOfferingDatasetSummary {
    return this.load().summary;
  }

  readCatalog(): readonly NormalizedMasterOffering[] {
    return this.load().products;
  }

  /**
   * One member-visible offering, by slug, without walking the catalog.
   *
   * The load is already cached per dataset mtime, so the previous cost was not
   * re-parsing, it was a linear scan of 1,121 offerings per detail request. The
   * index removes the scan and keeps the refusal: an unknown or ambiguous slug
   * is null, exactly as the scan's match count made it.
   */
  readBySlug(slug: string): NormalizedMasterOffering | null {
    return this.load().bySlug.get(slug) ?? null;
  }
}

const nodeLocationProbe: DatasetLocationProbe = {
  exists: (filePath) => fs.existsSync(filePath),
};

/**
 * Build the reader for this deployment.
 *
 * The environment variable is an override, not the only configuration. With
 * nothing set, this finds the COMMITTED artifact, which is what makes the
 * catalog work in a plain git clone with no operator setup and no path from
 * anybody's laptop. See dataset-location.ts for the resolution order and why
 * the working directory is the anchor.
 *
 * Null still means "no dataset anywhere", and the composition root still turns
 * that into an unavailable surface rather than an empty one. "We cannot reach
 * the catalog" and "there is nothing to sell" remain different answers.
 */
export function createMasterOfferingCatalogReaderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  files: DatasetFileSystem = nodeFileSystem,
  probe: DatasetLocationProbe = nodeLocationProbe,
  cwd: string = process.cwd(),
): GeneratedMasterOfferingCatalogReader | null {
  const location = resolveMasterOfferingDatasetLocation({ env, cwd, probe });
  if (location === null) return null;
  return new GeneratedMasterOfferingCatalogReader(location.filePath, files);
}

/**
 * The same resolution, reported rather than used. A deployment that answers 503
 * should be able to say which rule ran and which path it chose, without the
 * operator reading this file to work it out.
 */
export function describeMasterOfferingDatasetLocation(
  env: NodeJS.ProcessEnv = process.env,
  probe: DatasetLocationProbe = nodeLocationProbe,
  cwd: string = process.cwd(),
): MasterOfferingDatasetLocation | null {
  return resolveMasterOfferingDatasetLocation({ env, cwd, probe });
}
