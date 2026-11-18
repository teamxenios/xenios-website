import { createHash } from "node:crypto";
import type { ReviewedProductContent, ReviewedProductContentRecord } from "@shared/research/master-offerings/approved-content";
import { memberSafeMasterCatalogProduct, normalizeMasterCatalog } from "./normalize-catalog";

/** Source admission only. This module grants no commerce, price, stock or image rights. */
export const SUPPLEMENT_FOUNDATION_SHA256 = "76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5";
export const SUPPLEMENT_SOURCE_MANIFEST = "content/research-products/supplement-candidates/reviewed-60-manifest.json";
export const SUPPLEMENT_SOURCE_EXCLUSIONS = {
  "pure-encapsulations-optiferin-c": "hidden_conditional",
  "momentous-05": "publication_block",
  "momentous-18": "publication_block",
  "momentous-30": "publication_block",
} as const;

export interface ReviewedSupplementSourceRecord {
  candidateKey: string;
  brand: "Pure Encapsulations" | "Momentous";
  productName: string;
  catalogType: "dietary_supplement" | "sports_nutrition";
  package: string;
  manufacturerForm: string;
  officialVariantId: string;
  brandSku: string | null;
  officialProductUrl: string;
  officialVariantUrl: string;
  verifiedAt: string;
  listingState: "request_only" | "publication_block" | "hidden_conditional";
  exclusionReason: string | null;
  evidenceOwner: string | null;
  content: ReviewedProductContent;
}

interface ReviewedSupplementManifest {
  schemaVersion: 1;
  reviewState: "draft_source_integration_pending_independent_review";
  selectionBasis: string;
  preparedAt: string;
  sourcePacketSha256: string;
  foundationDatasetSha256: string;
  foundationOfferings: 420;
  requestOnly: true;
  commercialEvidence: Record<string, null>;
  records: readonly ReviewedSupplementSourceRecord[];
}

export class SupplementSourceError extends Error {}
function fail(message: string): never { throw new SupplementSourceError(message); }
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0;
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("Unexpected supplement source field");
}
function https(value: unknown): boolean {
  if (!text(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
const RECORD_KEYS = ["candidateKey", "brand", "productName", "catalogType", "package", "manufacturerForm",
  "officialVariantId", "brandSku", "officialProductUrl", "officialVariantUrl", "verifiedAt", "listingState",
  "exclusionReason", "evidenceOwner", "content"];
function content(value: unknown): value is ReviewedProductContent {
  if (!object(value)) return false;
  const strings = ["brand", "summary", "overview", "purpose", "ingredients", "label", "cautions", "storage"];
  exactKeys(value, [...strings, "specifications", "documentation"]);
  if (!text(value.summary) || !text(value.overview)) return false;
  if (strings.some(key => value[key] !== undefined && !text(value[key]))) return false;
  for (const key of ["specifications", "documentation"]) {
    const entries = value[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) return false;
    for (const entry of entries) {
      if (!object(entry)) return false;
      exactKeys(entry, key === "specifications" ? ["label", "value"] : ["label", "href"]);
      if (!text(entry.label) || (key === "specifications" ? !text(entry.value) : !https(entry.href))) return false;
    }
  }
  return true;
}

export function readReviewedSupplementManifest(value: unknown): ReviewedSupplementManifest {
  if (!object(value)) fail("Supplement source is not an object");
  exactKeys(value, ["schemaVersion", "reviewState", "selectionBasis", "preparedAt", "sourcePacketSha256", "foundationDatasetSha256",
    "foundationOfferings", "requestOnly", "commercialEvidence", "records"]);
  if (value.schemaVersion !== 1 || value.reviewState !== "draft_source_integration_pending_independent_review"
    || !text(value.selectionBasis) || !text(value.preparedAt) || !Number.isFinite(Date.parse(value.preparedAt))
    || !text(value.sourcePacketSha256) || !/^[0-9a-f]{64}$/.test(value.sourcePacketSha256)
    || value.foundationDatasetSha256 !== SUPPLEMENT_FOUNDATION_SHA256 || value.foundationOfferings !== 420
    || value.requestOnly !== true || !object(value.commercialEvidence)) fail("Supplement source contract mismatch");
  const commerceKeys = ["resellerAuthorization", "xeniosPrice", "xeniosInventory", "imageReuseRights", "independentCertification"];
  exactKeys(value.commercialEvidence, commerceKeys);
  const commerce = value.commercialEvidence;
  if (commerceKeys.some(key => commerce[key] !== null)) fail("Unconfirmed supplement commerce must remain null");
  if (!Array.isArray(value.records) || value.records.length !== 60) fail("Expected exactly sixty curated packages");
  const candidates = new Set<string>(), identities = new Set<string>(), names = new Set<string>();
  const brands = new Map<string, number>();
  let momentousDietary = 0, fuel = 0;
  for (const row of value.records) {
    if (!object(row)) fail("Malformed supplement package");
    exactKeys(row, RECORD_KEYS);
    for (const key of ["candidateKey", "brand", "productName", "package", "manufacturerForm", "officialVariantId", "verifiedAt"]) {
      if (!text(row[key])) fail("Missing supplement package identity");
    }
    if (row.brand !== "Pure Encapsulations" && row.brand !== "Momentous") fail("Unreviewed supplement brand");
    if (row.catalogType !== "dietary_supplement" && row.catalogType !== "sports_nutrition") fail("Unknown label classification");
    if (!(row.brandSku === null || text(row.brandSku)) || !https(row.officialProductUrl) || !https(row.officialVariantUrl)
      || !content(row.content) || row.content.brand !== row.brand
      || !row.content.specifications?.some(spec => spec.label === "Package" && spec.value === row.package)) fail("Invalid exact-package evidence");
    const expected = SUPPLEMENT_SOURCE_EXCLUSIONS[row.candidateKey as keyof typeof SUPPLEMENT_SOURCE_EXCLUSIONS] ?? "request_only";
    if (row.listingState !== expected || (expected === "request_only"
      ? row.exclusionReason !== null || row.evidenceOwner !== null
      : !text(row.exclusionReason) || !text(row.evidenceOwner))) fail("A source publication or hidden hold was changed");
    const identity = JSON.stringify([row.brand, row.officialVariantId]);
    const name = JSON.stringify([row.brand, String(row.productName).toLowerCase()]);
    if (candidates.has(row.candidateKey as string) || identities.has(identity) || names.has(name)) fail("Duplicate curated package or product");
    candidates.add(row.candidateKey as string); identities.add(identity); names.add(name);
    brands.set(row.brand, (brands.get(row.brand) ?? 0) + 1);
    if (row.brand === "Pure Encapsulations" && row.catalogType !== "dietary_supplement") fail("Pure label classification changed");
    if (row.brand === "Momentous" && row.catalogType === "dietary_supplement") momentousDietary++;
    if (row.candidateKey === "momentous-31" && row.productName === "Fuel" && row.catalogType === "sports_nutrition") fuel++;
  }
  if (brands.get("Pure Encapsulations") !== 30 || brands.get("Momentous") !== 30 || momentousDietary !== 29 || fuel !== 1
    || Object.keys(SUPPLEMENT_SOURCE_EXCLUSIONS).some(key => !candidates.has(key))) fail("Curated brand, Fuel or excluded-source census changed");
  return value as unknown as ReviewedSupplementManifest;
}

type PublicProduct = ReturnType<typeof memberSafeMasterCatalogProduct>;
export function appendReviewedSupplementSource(foundationText: string, source: unknown) {
  const manifest = readReviewedSupplementManifest(source);
  const normalizedText = foundationText.replaceAll("\r\n", "\n");
  if (createHash("sha256").update(normalizedText).digest("hex") !== manifest.foundationDatasetSha256) fail("Foundation bytes have not been reviewed");
  const foundation = JSON.parse(normalizedText) as {
    schemaVersion: number; sourceRowCount: number; canonicalProductCount: number; variantCount: number;
    products: PublicProduct[]; [key: string]: unknown;
  };
  if (foundation.schemaVersion !== 1 || foundation.products.length !== 420 || foundation.canonicalProductCount !== 420
    || foundation.variantCount !== 420 || foundation.products.some(row => row.variants.length !== 1)) fail("Foundation topology changed");
  const admitted = manifest.records.filter(row => row.listingState === "request_only");
  const products = admitted.map((record, index) => {
    // Brand is part of deterministic source identity and printed name. No workbook lineage is invented.
    const normalized = normalizeMasterCatalog([{
      sheetRow: index + 1, "Group ID": `reviewed-supplement:${record.brand}:${record.officialVariantId}`,
      Family: "Supplements", Channel: "Supplement", Product: `${record.brand} ${record.productName}`,
      "Normalized Specification": record.package, "Dosage Form": "Supplement Unit",
    }]).products[0];
    return memberSafeMasterCatalogProduct({ ...normalized, brand: record.brand,
      aliases: [normalized.displayName, record.productName, record.brand, record.package],
      stateExplanation: "Submit a request for team review. Price, availability and next steps require confirmation; no purchase or shipment is promised.",
      copyState: "draft",
    });
  });
  const all = [...foundation.products, ...products];
  if (admitted.length !== 56 || new Set(all.map(row => row.id)).size !== all.length
    || new Set(all.map(row => row.slug)).size !== all.length
    || new Set(all.flatMap(row => row.variants.map(variant => variant.id))).size !== all.length) fail("Supplement identity collision or admission drift");
  const contentRecords: ReviewedProductContentRecord[] = products.map((product, index) => ({
    offeringId: product.id, sourceVariantId: product.variants[0].id, content: admitted[index].content,
  }));
  const excluded = manifest.records.filter(row => row.listingState !== "request_only").map(row => ({
    candidateKey: row.candidateKey, state: row.listingState, reason: row.exclusionReason, owner: row.evidenceOwner,
  }));
  const counts = (key: "family" | "displayState") => Object.fromEntries(
    [...new Set(all.map(row => row[key]))].map(value => [value, all.filter(row => row[key] === value).length]));
  return {
    catalog: { ...foundation, foundationGeneratedAt: foundation.generatedAt, generatedAt: manifest.preparedAt,
      canonicalProductCount: all.length, variantCount: all.length,
      additionalSourceRowCount: manifest.records.length, additionalListingCount: products.length,
      products: all },
    contentRecords, excluded, familyCounts: counts("family"), displayStateCounts: counts("displayState"),
  };
}
