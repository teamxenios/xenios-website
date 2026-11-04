#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const batch = JSON.parse(readFileSync(resolve(batchDir, "media-batch.v1.json"), "utf8"));
const evidence = JSON.parse(readFileSync(resolve(batchDir, "internal-evidence.v1.json"), "utf8"));
const datasetPath = resolve(repoRoot, batch.catalogDataset.path);
const bindingsPath = resolve(repoRoot, batch.bindingDataset.path);
const pathwayPath = resolve(repoRoot, batch.pathwayAuthority.path);
const datasetCheckoutBytes = readFileSync(datasetPath);
const bindingsCheckoutBytes = readFileSync(bindingsPath);
const pathwayCheckoutBytes = readFileSync(pathwayPath);
const datasetCommittedBytes = normalizeCommittedBytes(datasetCheckoutBytes);
const bindingsCommittedBytes = normalizeCommittedBytes(bindingsCheckoutBytes);
const pathwayCommittedBytes = normalizeCommittedBytes(pathwayCheckoutBytes);
const dataset = JSON.parse(datasetCheckoutBytes.toString("utf8"));
const bindings = JSON.parse(bindingsCheckoutBytes.toString("utf8"));
const pathwayText = pathwayCheckoutBytes.toString("utf8");
const errors = [];

function normalizeCommittedBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest("hex");
}

function readLe24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function imageDimensions(path, bytes) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") {
    check(bytes.subarray(1, 4).toString("ascii") === "PNG", `${path}: invalid PNG signature`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (extension === ".svg") {
    const text = bytes.toString("utf8", 0, Math.min(bytes.length, 8192));
    return {
      width: Number(text.match(/<svg\b[^>]*\bwidth="([0-9]+)"/)?.[1]),
      height: Number(text.match(/<svg\b[^>]*\bheight="([0-9]+)"/)?.[1]),
    };
  }
  if (extension !== ".webp") throw new Error(`${path}: unsupported image extension`);
  check(bytes.subarray(0, 4).toString("ascii") === "RIFF", `${path}: missing RIFF header`);
  check(bytes.subarray(8, 12).toString("ascii") === "WEBP", `${path}: missing WEBP header`);
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") return { width: 1 + readLe24(bytes, 24), height: 1 + readLe24(bytes, 27) };
  if (chunk === "VP8L") {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  if (chunk === "VP8 ") {
    const marker = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    check(marker >= 0, `${path}: missing VP8 frame marker`);
    return {
      width: bytes.readUInt16LE(marker + 3) & 0x3fff,
      height: bytes.readUInt16LE(marker + 5) & 0x3fff,
    };
  }
  throw new Error(`${path}: unsupported WEBP chunk ${JSON.stringify(chunk)}`);
}

check(batch.schemaVersion === 1, "media batch schemaVersion must be 1");
check(evidence.schemaVersion === 1, "evidence schemaVersion must be 1");
check(batch.batchId === evidence.batchId, "batch IDs differ");
check(batch.releaseBaseline === evidence.releaseBaseline, "release baselines differ");
check(batch.publicationState === "review_only_not_runtime", "batch must remain review-only");

check(dataset.canonicalProductCount === 420, "dataset product count is not 420");
check(dataset.variantCount === 420, "dataset variant count is not 420");
check(datasetCommittedBytes.length === batch.catalogDataset.committedBytes, "committed dataset byte count differs");
check(sha256(datasetCommittedBytes) === batch.catalogDataset.rawSha256, "committed dataset SHA-256 differs");
check(gitBlobOid(datasetCommittedBytes) === batch.catalogDataset.gitBlobOid, "committed dataset blob OID differs");
check(bindingsCommittedBytes.length === batch.bindingDataset.committedBytes, "committed binding byte count differs");
check(sha256(bindingsCommittedBytes) === batch.bindingDataset.rawSha256, "committed binding SHA-256 differs");
check(gitBlobOid(bindingsCommittedBytes) === batch.bindingDataset.gitBlobOid, "committed binding blob OID differs");
check(pathwayCommittedBytes.length === batch.pathwayAuthority.committedBytes, "pathway authority byte count differs");
check(sha256(pathwayCommittedBytes) === batch.pathwayAuthority.rawSha256, "pathway authority SHA-256 differs");
check(gitBlobOid(pathwayCommittedBytes) === batch.pathwayAuthority.gitBlobOid, "pathway authority blob OID differs");
check(
  pathwayText.includes('new Set<MasterOfferingFamily>(["shipping_and_fulfillment"])'),
  "shipping_and_fulfillment is not pinned as non-merchandise",
);
check(
  pathwayText.includes('if (NON_MERCHANDISE_FAMILIES.has(subject.family)) return "non_merchandise_family";'),
  "non-merchandise refusal is not authoritative",
);
check(batch.pathwayAuthority.requiresProviderPathway === false, "shipping service cannot require a provider pathway");

const canonicalPairs = new Set();
for (const product of dataset.products) {
  for (const variant of product.variants) canonicalPairs.add(`${product.id}/${variant.id}`);
}
check(canonicalPairs.size === 420, "canonical pair count is not 420");

const offeringId = "mo_003b0c272099eeb1f114";
const sourceVariantId = "mov_9b65ad5bb184691e19e0";
const pair = `${offeringId}/${sourceVariantId}`;
const offering = dataset.products.find((product) => product.id === offeringId);
const variant = offering?.variants.find((item) => item.id === sourceVariantId);
check(Boolean(offering), "FedEx service offering is missing");
check(Boolean(variant), "FedEx service source variant is missing");
check(offering?.canonicalName === "FedEx Standard Overnight", "canonical service name changed");
check(variant?.label === "FedEx Standard Overnight", "canonical variant label changed");
check(offering?.family === "shipping_and_fulfillment", "service family changed");
check(offering?.category === "Shipping & Fulfillment", "service category changed");
check(offering?.subcategory === "Shipping Service", "service subcategory changed");

const bound = bindings.bindings.find(
  (item) => item.offeringId === offeringId && item.offeringVariantId === sourceVariantId,
);
const unbound = bindings.unbound.find(
  (item) => item.offeringId === offeringId && item.offeringVariantId === sourceVariantId,
);
check(!bound, "shipping service must not have a Product Control binding");
check(Boolean(unbound), "shipping service unbound receipt is missing");
check(unbound?.reason.startsWith("shipping service row:"), "shipping service unbound reason changed");

check(batch.records.length === 1, "Batch 002 must contain exactly one media record");
const record = batch.records[0];
check(`${record.offeringId}/${record.sourceVariantId}` === pair, "media record pair differs from exact service pair");
check(record.media.kind === "service", "media kind must be service");
check(record.media.packagingState === "not_applicable", "service packaging state must be not_applicable");
check(record.media.bindingDisposition.state === "intentionally_unbound", "service must stay intentionally unbound");
check(record.media.bindingDisposition.reason === unbound?.reason, "manifest unbound reason differs from binding artifact");
check(record.media.presentationBoundaries.carrierLogoUsed === false, "carrier logo cannot be used");
check(record.media.presentationBoundaries.carrierTradeDressUsed === false, "carrier trade dress cannot be used");
check(record.media.presentationBoundaries.supplierPhotoUsed === false, "supplier photo cannot be used");
check(record.media.presentationBoundaries.physicalProductDepicted === false, "physical product cannot be depicted");
check(record.media.presentationBoundaries.providerOrCareActionRepresented === false, "provider or care action cannot be represented");
check(record.media.presentationBoundaries.publicationAuthorized === false, "publication cannot be authorized");
check(record.media.presentationBoundaries.trademarkReview === "pending", "trademark review must remain pending");

const evidenceRecord = evidence.records.find(
  (item) => item.offeringId === offeringId && item.sourceVariantId === sourceVariantId && item.field === "media",
);
check(Boolean(evidenceRecord), "exact service evidence record is missing");
check(evidenceRecord?.authorityResolution?.directPurchaseRefusal === "non_merchandise_family", "wrong refusal authority");
check(evidenceRecord?.authorityResolution?.requiresProviderPathway === false, "evidence cannot require provider pathway");
check(evidenceRecord?.rights?.publicationAuthorized === false, "evidence cannot authorize publication");
check(evidenceRecord?.rights?.trademarkReview === "pending", "evidence trademark review must remain pending");
check(evidence.externalAssets.length === 0, "service artwork must not import external assets");

const contactSheetPath = resolve(repoRoot, batch.contactSheet.relativeAssetPath);
const contactSheetBytes = readFileSync(contactSheetPath);
const contactSheetDimensions = imageDimensions(batch.contactSheet.relativeAssetPath, contactSheetBytes);
check(contactSheetBytes.length === batch.contactSheet.bytes, "contact sheet byte count mismatch");
check(sha256(contactSheetBytes) === batch.contactSheet.sha256, "contact sheet SHA-256 mismatch");
check(contactSheetDimensions.width === batch.contactSheet.width, "contact sheet width mismatch");
check(contactSheetDimensions.height === batch.contactSheet.height, "contact sheet height mismatch");

const contactSourcePath = resolve(repoRoot, batch.contactSheet.sourceRelativePath);
const contactSourceBytes = readFileSync(contactSourcePath);
check(contactSourceBytes.length === batch.contactSheet.sourceBytes, "contact source byte count mismatch");
check(sha256(contactSourceBytes) === batch.contactSheet.sourceSha256, "contact source SHA-256 mismatch");

const seenPaths = new Set();
const seenHashes = new Map();
const assets = [
  ...record.media.images.map((asset) => ({ ...asset, imageRole: asset.role })),
  ...record.media.sourceMasters.map((asset) => ({ ...asset, imageRole: "source_master" })),
];
let checkedAssets = 0;
for (const asset of assets) {
  checkedAssets += 1;
  check(asset.imageRole === "primary" || asset.imageRole === "source_master", `${pair}: invalid asset role`);
  check(
    asset.relativeAssetPath.startsWith("deliveries/catalog-imagery/2026-11-04-batch-002/"),
    `${pair}: asset escaped Batch 002`,
  );
  check(!seenPaths.has(asset.relativeAssetPath), `${pair}: duplicate asset path`);
  seenPaths.add(asset.relativeAssetPath);
  const absolute = resolve(repoRoot, asset.relativeAssetPath);
  check(absolute.startsWith(batchDir), `${pair}: unsafe resolved asset path`);
  const bytes = readFileSync(absolute);
  check(statSync(absolute).size === asset.bytes, `${asset.relativeAssetPath}: byte count mismatch`);
  const hash = sha256(bytes);
  check(hash === asset.sha256, `${asset.relativeAssetPath}: SHA-256 mismatch`);
  const dimensions = imageDimensions(asset.relativeAssetPath, bytes);
  check(dimensions.width === asset.width, `${asset.relativeAssetPath}: width mismatch`);
  check(dimensions.height === asset.height, `${asset.relativeAssetPath}: height mismatch`);
  check(!seenHashes.has(hash), `${asset.relativeAssetPath}: duplicate bytes used by ${seenHashes.get(hash)}`);
  seenHashes.set(hash, asset.relativeAssetPath);
}

const svgPath = record.media.sourceMasters.find((asset) => asset.format === "svg")?.relativeAssetPath;
const svgText = readFileSync(resolve(repoRoot, svgPath), "utf8");
const contactText = contactSourceBytes.toString("utf8");
for (const disclosure of [
  "SERVICE PRESENTATION",
  "SHIPPING &amp; FULFILLMENT SERVICE",
  "NOT PHYSICAL PRODUCT PACKAGING",
  "INTERNAL REVIEW — TRADEMARK REVIEW PENDING",
]) {
  check(svgText.includes(disclosure), `service artwork disclosure is missing: ${disclosure}`);
}
check(!/<image\b/i.test(svgText), "service SVG cannot embed raster or external imagery");
check(!/<foreignObject\b/i.test(svgText), "service SVG cannot embed foreign content");
check(!/\b(?:href|src)\s*=\s*["'](?:https?:|data:)/i.test(svgText), "service SVG cannot reference external media");
check(!/[®™]/u.test(svgText), "service artwork cannot add trademark symbols");
check(!/#4d148c|#ff6600/i.test(svgText), "service artwork cannot use the carrier signature color pair");

const customerFacingText = `${svgText}\n${contactText}`
  .replaceAll("NOT PHYSICAL PRODUCT PACKAGING", "")
  .replaceAll("not physical product packaging", "")
  .toLowerCase();
const forbiddenArtworkPatterns = [
  [/\b(?:provider|care[- ]pathway|pharmacy|intake)\b/, "provider/care routing"],
  [/\$\s*37\.50|\$\s*\d|\b(?:usd|rate|price)\b/, "rate or price"],
  [/\b(?:guarantee|cutoff|tracking|barcode)\b/, "carrier operational claim"],
  [/\b(?:zip|postal|geograph|territor|destination)\b/, "geography or destination claim"],
  [/\bproduct control\b|\bsku\b/, "Product Control or SKU"],
  [/\b(?:parcel|package|packshot)\b/, "physical parcel or package"],
  [/\b(?:at|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/, "exact delivery time"],
];
for (const [pattern, label] of forbiddenArtworkPatterns) {
  check(!pattern.test(customerFacingText), `customer-facing service artwork contains forbidden ${label} language`);
}

const result = {
  ok: errors.length === 0,
  batchId: batch.batchId,
  releaseBaseline: batch.releaseBaseline,
  canonicalPairs: canonicalPairs.size,
  mediaRecords: batch.records.length,
  serviceRecords: batch.records.filter((item) => item.media.kind === "service").length,
  checkedAssets,
  contactSheetChecked: true,
  intentionallyUnboundServices: 1,
  providerPathwayServices: 0,
  independentlyReviewedAssets: 0,
  publicationAuthorizedAssets: 0,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
