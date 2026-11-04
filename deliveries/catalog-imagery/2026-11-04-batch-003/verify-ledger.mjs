#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const ledgerPath = resolve(batchDir, "coverage-ledger.v1.json");
const receiptPath = resolve(batchDir, "verification-result.v1.json");
const datasetPath = resolve(repoRoot, "server/research/master-offerings/data/member-safe-master-offerings.generated.json");
const bindingsPath = resolve(repoRoot, "server/research/master-offerings/data/master-offering-bindings.generated.json");
const batch002ManifestPath = resolve(repoRoot, "deliveries/catalog-imagery/2026-11-04-batch-002/media-batch.v1.json");

const ledgerBytes = readFileSync(ledgerPath);
const ledger = JSON.parse(ledgerBytes.toString("utf8"));
const datasetCheckout = readFileSync(datasetPath);
const datasetCommitted = Buffer.from(datasetCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const dataset = JSON.parse(datasetCheckout.toString("utf8"));
const bindingsCheckout = readFileSync(bindingsPath);
const bindingsCommitted = Buffer.from(bindingsCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const bindings = JSON.parse(bindingsCheckout.toString("utf8"));
const batch002 = JSON.parse(readFileSync(batch002ManifestPath, "utf8"));
const errors = [];

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

function pairKey(offeringId, sourceVariantId) {
  return `${offeringId}/${sourceVariantId}`;
}

check(ledger.schemaVersion === 1, "ledger schemaVersion must be 1");
check(ledger.releaseBaseline === "5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b", "release baseline changed");
check(ledger.catalogDataset.gitBlobOid === gitBlobOid(datasetCommitted), "catalog Git blob pin differs");
check(ledger.catalogDataset.rawSha256 === sha256(datasetCommitted), "catalog raw SHA-256 differs");
check(ledger.catalogDataset.committedBytes === datasetCommitted.length, "catalog committed byte count differs");
check(ledger.bindingDataset.gitBlobOid === gitBlobOid(bindingsCommitted), "binding Git blob pin differs");
check(ledger.bindingDataset.rawSha256 === sha256(bindingsCommitted), "binding raw SHA-256 differs");
check(ledger.bindingDataset.committedBytes === bindingsCommitted.length, "binding committed byte count differs");

const canonicalPairs = new Map();
for (const product of dataset.products) {
  for (const variant of product.variants) {
    canonicalPairs.set(pairKey(product.id, variant.id), { product, variant });
  }
}
const bindingByPair = new Map(
  bindings.bindings.map((binding) => [pairKey(binding.offeringId, binding.offeringVariantId), binding]),
);
const unboundByPair = new Map(
  bindings.unbound.map((record) => [pairKey(record.offeringId, record.offeringVariantId), record]),
);

const ledgerPairs = new Set();
const preparedAssetPaths = new Set();
for (const record of ledger.records) {
  const pair = pairKey(record.offeringId, record.sourceVariantId);
  const canonical = canonicalPairs.get(pair);
  check(Boolean(canonical), `${pair}: ledger pair is not canonical`);
  check(!ledgerPairs.has(pair), `${pair}: duplicate ledger record`);
  ledgerPairs.add(pair);
  if (canonical) {
    check(record.canonicalName === canonical.product.canonicalName, `${pair}: canonical name differs`);
    check(record.variantLabel === canonical.variant.label, `${pair}: variant label differs`);
    check(record.family === canonical.product.family, `${pair}: family differs`);
    check(record.subcategory === canonical.product.subcategory, `${pair}: subcategory differs`);
  }
  const binding = bindingByPair.get(pair);
  const unbound = unboundByPair.get(pair);
  if (binding) {
    check(record.bindingDisposition.state === "bound", `${pair}: bound pair marked unbound`);
    check(record.bindingDisposition.productControlSku === binding.productControlSku, `${pair}: Product Control SKU differs`);
  } else {
    check(record.bindingDisposition.state === "unbound", `${pair}: unbound pair marked bound`);
    check(record.bindingDisposition.reason === unbound?.reason, `${pair}: unbound reason differs`);
  }
  check(record.countsAsFinalReviewedExactAsset === false, `${pair}: false completion was manufactured`);
  check(record.publicationAuthorized === false, `${pair}: publication was authorized without evidence`);
  check(Array.isArray(record.preciseExternalGaps) && record.preciseExternalGaps.length > 0, `${pair}: precise gaps missing`);
  for (const asset of record.preparedAssets) {
    check(!preparedAssetPaths.has(asset.relativeAssetPath), `${pair}: duplicate prepared-asset path`);
    preparedAssetPaths.add(asset.relativeAssetPath);
    const absolute = resolve(repoRoot, asset.relativeAssetPath);
    const bytes = readFileSync(absolute);
    check(statSync(absolute).size === asset.bytes, `${pair}: ${asset.relativeAssetPath} byte count differs`);
    check(sha256(bytes) === asset.sha256, `${pair}: ${asset.relativeAssetPath} hash differs`);
  }
}

check(canonicalPairs.size === 420, `canonical pair count is ${canonicalPairs.size}, expected 420`);
check(ledgerPairs.size === canonicalPairs.size, "ledger does not cover every canonical pair exactly once");
for (const pair of canonicalPairs.keys()) check(ledgerPairs.has(pair), `${pair}: missing from ledger`);

const statusCounts = Object.fromEntries(
  [...new Set(ledger.records.map((record) => record.mediaStatus))]
    .sort()
    .map((status) => [status, ledger.records.filter((record) => record.mediaStatus === status).length]),
);
check(statusCounts.private_design_concept_reviewed === 1, "private concept count is not one");
check(statusCounts.official_source_candidate_rights_pending === 10, "rights-pending source candidate count is not ten");
check(statusCounts.service_presentation_prepared_review_pending === 1, "prepared service presentation count is not one");
check(statusCounts.physical_supply_exact_sku_blocked === 1, "blocked physical supply count is not one");
check(statusCounts.product_specific_source_unresolved === 407, "unresolved exact-source count is not 407");
check(ledger.summary.baselinePairs === 420, "ledger summary baseline is not 420");
check(ledger.summary.physicalProductPairs === 419, "ledger summary physical-product count is not 419");
check(ledger.summary.finalReviewedExactProductAssets === 0, "ledger summary manufactured exact completion");
check(ledger.summary.publicationAuthorizedAssets === 0, "ledger summary manufactured publication authority");
check(ledger.summary.recordsWithPreciseExternalGaps === 420, "ledger summary omitted precise gaps");
check(JSON.stringify(ledger.summary.statusCounts) === JSON.stringify(statusCounts), "ledger summary status counts differ");

const bpc = ledger.records.find((record) => pairKey(record.offeringId, record.sourceVariantId) === "mo_af289f611c02b3fcef01/mov_ca3e45ae9712aee91430");
const fedex = ledger.records.find((record) => pairKey(record.offeringId, record.sourceVariantId) === "mo_003b0c272099eeb1f114/mov_9b65ad5bb184691e19e0");
const supplies = ledger.records.find((record) => pairKey(record.offeringId, record.sourceVariantId) === "mo_a7a7e307d58f24affb42/mov_512ed6b875c04eee4753");
check(bpc?.preparedAssets.length === 5, "BPC prepared-asset count is not five");
check(fedex?.physicalProductImageApplicable === false, "FedEx was treated as a physical product");
check(fedex?.bindingDisposition.state === "unbound", "FedEx was treated as Product Control bound");
check(fedex?.bindingDisposition.reason.startsWith("shipping service row"), "FedEx unbound reason differs");
check(fedex?.preparedAssets.length === 3, "FedEx prepared-asset count is not three");
const batch002Assets = [...batch002.records[0].media.images, ...batch002.records[0].media.sourceMasters];
check(
  JSON.stringify(fedex?.preparedAssets) ===
    JSON.stringify(
      batch002Assets.map((asset) => ({
        relativeAssetPath: asset.relativeAssetPath,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        sha256: asset.sha256,
      })),
    ),
  "FedEx prepared assets differ from Batch 002",
);
check(supplies?.physicalProductImageApplicable === true, "physical supplies were exempted from imagery");
check(supplies?.preparedAssets.length === 0, "unverified supply artwork was attached");
check(bindings.bindings.length === 417 && bindings.unbound.length === 3, "binding accounting changed");
check(batch002.records[0].media.kind === "service", "Batch 002 is not service media");
check(batch002.records[0].media.packagingState === "not_applicable", "Batch 002 has a physical packaging state");

const result = {
  ok: errors.length === 0,
  ledgerId: ledger.ledgerId,
  releaseBaseline: ledger.releaseBaseline,
  ledgerBytes: ledgerBytes.length,
  ledgerSha256: sha256(ledgerBytes),
  canonicalPairs: canonicalPairs.size,
  ledgerPairs: ledgerPairs.size,
  physicalProductPairs: ledger.records.filter((record) => record.physicalProductImageApplicable).length,
  finalReviewedExactProductAssets: ledger.records.filter((record) => record.countsAsFinalReviewedExactAsset).length,
  publicationAuthorizedAssets: ledger.records.filter((record) => record.publicationAuthorized).length,
  recordsWithPreciseExternalGaps: ledger.records.filter((record) => record.preciseExternalGaps.length > 0).length,
  statusCounts,
  errors,
};

const output = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv.includes("--write-receipt")) writeFileSync(receiptPath, output);
console.log(output.trimEnd());
if (errors.length > 0) process.exitCode = 1;
