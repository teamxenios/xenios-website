#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const batchRelativeRoot = "deliveries/catalog-imagery/2026-11-04-batch-005/";
const batch = JSON.parse(readFileSync(resolve(batchDir, "media-batch.v1.json"), "utf8"));
const evidence = JSON.parse(readFileSync(resolve(batchDir, "internal-evidence.v1.json"), "utf8"));
const datasetCheckoutBytes = readFileSync(resolve(repoRoot, batch.catalogDataset.path));
const datasetCommittedBytes = Buffer.from(datasetCheckoutBytes.toString("utf8").replace(/\r\n/g, "\n"));
const bindingsCheckoutBytes = readFileSync(resolve(repoRoot, batch.bindingDataset.path));
const bindingsCommittedBytes = Buffer.from(bindingsCheckoutBytes.toString("utf8").replace(/\r\n/g, "\n"));
const dataset = JSON.parse(datasetCheckoutBytes.toString("utf8"));
const bindings = JSON.parse(bindingsCheckoutBytes.toString("utf8"));
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

function pngDimensions(path, bytes) {
  check(bytes.length >= 24, `${path}: PNG is too short`);
  check(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${path}: invalid PNG signature`);
  check(bytes.subarray(12, 16).toString("ascii") === "IHDR", `${path}: PNG IHDR missing`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const expectedByCode = new Map(
  [
    ["R271L", "mo_b126ee9235f0a810dc95", "mov_9813dabbc127f6b382fb", "GEN-GRP-0366", "r271l-annatto-pro-125.png", 258, 420, 62587, "e8e72f0278bd3b9f35ab98c53cb5f80c47600d008dfcbf917cb557262e0f9c8c"],
    ["R152", "mo_81f2af5cc04167a47413", "mov_845dc69ae9dd6cd6ba34", "GEN-GRP-0367", "r152-brain-restore.png", 158, 265, 102322, "884cfd91fb88f73af7db9c15f2b0672bdacf21d2f94423290bbe7077fe46b06f"],
    ["R190", "mo_db61126250f5fa3a3324", "mov_7c6e65b041ae3bfe5262", "GEN-GRP-0369", "r190-collagen-renew.png", 181, 265, 215163, "696d56cdddeeddd2ceb9f9bec9cdde4b89788c75d39960bd66bbd0e90fcb527d"],
    ["R191", "mo_474aba04fff9d244c37b", "mov_6f2d07f881d861bf3991", "GEN-GRP-0371", "r191-gi-defend.png", 265, 265, 109999, "388b64fa4ceaa04bd4dd847875f6a8252df513cd7258a439016584cebee8bbcf"],
    ["R227", "mo_d82610b6fe7ebf3b4d63", "mov_f5d63d95caa3d6d0a7a0", "GEN-GRP-0375", "r227-magtein.png", 160, 265, 108029, "9fc76eecdb1d12011d94e4aa48e79534de9c64c817e19168f0fcb8e45b34e9fb"],
    ["R167", "mo_5050cf525ec249ebf0bf", "mov_199a0126b086cc43cb1b", "GEN-GRP-0376", "r167-mito-recharge.png", 160, 265, 121672, "2be03e010ef7991b239011280afe41f5855ff1491f352d64a6b96b07be48e766"],
    ["R817E", "mo_381d77419fba80336299", "mov_b90f51978a7223e9fc58", "GEN-GRP-0377", "r817e-omega-pure-epa-dha-2400.png", 114, 265, 107104, "7c5d16b355f00be93f7f00f3255444efec01b3f684be3b41aa9140d44fff0ba3"],
    ["R848", "mo_453f612e1a8a3021d41c", "mov_ce2fc5bcfb622d8de591", "GEN-GRP-0378", "r848-prm-resolve.png", 254, 420, 53202, "6f9db7081848008b8baabfbfe932da68f7ad0eddf4d3769423df6af319a6c6ea"],
    ["R199", "mo_c875679cdaafb9cf7336", "mov_80916d9782f415a13ad3", "GEN-GRP-0379", "r199-perimenopause-support.png", 166, 265, 106015, "a2e42f03590d433a64f4a6553f7df5f269041e8d94bc2059674448c99dc148be"],
    ["R123L", "mo_62754736300e3e130eb5", "mov_8af22768144442c60424", "GEN-GRP-0381", "r123l-stress-essentials-balance.png", 244, 420, 64039, "dd245630a36dd41da7563a1270d30bce49c7800e916a0efbf013a1b57c327668"],
  ].map(([code, offeringId, sourceVariantId, sku, filename, width, height, bytes, hash]) => [
    code,
    { offeringId, sourceVariantId, sku, filename, width, height, bytes, hash },
  ]),
);

check(batch.schemaVersion === 1, "media batch schemaVersion must be 1");
check(evidence.schemaVersion === 1, "evidence schemaVersion must be 1");
check(batch.batchId === evidence.batchId, "batch IDs differ");
check(batch.createdAt === evidence.createdAt, "creation timestamps differ");
check(batch.releaseBaseline === evidence.releaseBaseline, "release baselines differ");
check(batch.publicationState === "quarantined_downloads_pending_independent_review", "batch must remain quarantined");
check(batch.sourceBytesPreserved === true, "source-byte preservation is not asserted");
check(batch.runtimeLinked === false, "batch cannot be runtime-linked");
check(batch.supplierSendPerformed === false, "supplier send must remain false");
check(batch.authority.founderWebsiteUseAuthorized === true, "founder website-use authority is missing");
check(batch.authority.references.includes("KAN-59/10615"), "KAN-59/10615 authority is missing");
check(batch.authority.references.includes("KAN-225/10616"), "KAN-225/10616 authority is missing");
check(batch.authority.separateImageUseAgreementRequired === false, "stale image-use-agreement prerequisite returned");
check(batch.authority.releasePublicationApproved === false, "release publication cannot be pre-approved");
check(evidence.authorityReconciliation.separateImageUseAgreementRequired === false, "evidence retained stale rights hold");

check(dataset.canonicalProductCount === 420, "dataset product count is not 420");
check(dataset.variantCount === 420, "dataset variant count is not 420");
check(sha256(datasetCommittedBytes) === batch.catalogDataset.rawSha256, "committed dataset SHA-256 differs");
check(gitBlobOid(datasetCommittedBytes) === batch.catalogDataset.gitBlobOid, "committed dataset blob OID differs");
check(sha256(bindingsCommittedBytes) === batch.bindingDataset.rawSha256, "committed binding SHA-256 differs");
check(gitBlobOid(bindingsCommittedBytes) === batch.bindingDataset.gitBlobOid, "committed binding blob OID differs");

check(batch.records.length === 10, "expected ten exact supplier records");
const seenCodes = new Set();
const seenPairs = new Set();
const seenPaths = new Set();
const seenHashes = new Set();
let pendingReviewCount = 0;
let versionHoldCount = 0;
for (const record of batch.records) {
  const expected = expectedByCode.get(record.supplierItemCode);
  check(Boolean(expected), `${record.supplierItemCode}: unexpected supplier item code`);
  if (!expected) continue;
  check(!seenCodes.has(record.supplierItemCode), `${record.supplierItemCode}: duplicate supplier item code`);
  seenCodes.add(record.supplierItemCode);
  const pair = `${record.offeringId}/${record.sourceVariantId}`;
  check(!seenPairs.has(pair), `${pair}: duplicate exact pair`);
  seenPairs.add(pair);
  check(record.offeringId === expected.offeringId, `${record.supplierItemCode}: offering ID changed`);
  check(record.sourceVariantId === expected.sourceVariantId, `${record.supplierItemCode}: source-variant ID changed`);
  check(record.quickOrderSku === expected.sku, `${record.supplierItemCode}: Quick Order SKU changed`);
  check(record.brand === "NutriDyn", `${record.supplierItemCode}: actual brand was not preserved`);
  check(record.sourceBytesTransformed === false, `${record.supplierItemCode}: source bytes cannot be transformed`);
  check(record.publicationAuthorized === false, `${record.supplierItemCode}: publication cannot be pre-authorized`);
  check(/^https:\/\/nutridyn\.com\//.test(record.officialProductPage), `${record.supplierItemCode}: product page is not official NutriDyn`);
  check(
    /^https:\/\/nutridyn\.com\/media\/catalog\/product\//.test(record.officialImageUrl),
    `${record.supplierItemCode}: image URL is not official NutriDyn product media`,
  );
  check(record.asset.relativeAssetPath.endsWith(`/${expected.filename}`), `${record.supplierItemCode}: asset filename changed`);
  check(record.asset.relativeAssetPath.startsWith(`${batchRelativeRoot}assets/official-nutridyn/`), `${record.supplierItemCode}: asset escaped official download folder`);
  check(!seenPaths.has(record.asset.relativeAssetPath), `${record.supplierItemCode}: duplicate asset path`);
  seenPaths.add(record.asset.relativeAssetPath);
  check(!seenHashes.has(record.asset.sha256), `${record.supplierItemCode}: duplicate asset bytes`);
  seenHashes.add(record.asset.sha256);
  const absolute = resolve(repoRoot, record.asset.relativeAssetPath);
  check(absolute.startsWith(resolve(batchDir, "assets/official-nutridyn")), `${record.supplierItemCode}: unsafe resolved path`);
  const bytes = readFileSync(absolute);
  check(statSync(absolute).size === expected.bytes, `${record.supplierItemCode}: byte count differs from receipt`);
  check(record.asset.bytes === expected.bytes, `${record.supplierItemCode}: declared byte count changed`);
  check(sha256(bytes) === expected.hash, `${record.supplierItemCode}: downloaded SHA-256 differs`);
  check(record.asset.sha256 === expected.hash, `${record.supplierItemCode}: declared SHA-256 differs`);
  const dimensions = pngDimensions(record.asset.relativeAssetPath, bytes);
  check(dimensions.width === expected.width && dimensions.height === expected.height, `${record.supplierItemCode}: PNG dimensions differ`);
  check(record.asset.width === expected.width && record.asset.height === expected.height, `${record.supplierItemCode}: declared dimensions differ`);
  check(record.asset.altTextCandidate.length >= 30, `${record.supplierItemCode}: alt-text candidate is too short`);

  const catalogProduct = dataset.products.find((product) => product.id === record.offeringId);
  const catalogVariant = catalogProduct?.variants.find((variant) => variant.id === record.sourceVariantId);
  check(catalogProduct?.canonicalName === record.canonicalName, `${record.supplierItemCode}: canonical name differs from catalog`);
  check(catalogVariant?.label === "Retail unit / package", `${record.supplierItemCode}: canonical variant label changed`);
  const binding = bindings.bindings.find(
    (item) => item.offeringId === record.offeringId && item.offeringVariantId === record.sourceVariantId,
  );
  check(binding?.productControlSku === record.quickOrderSku, `${record.supplierItemCode}: binding SKU differs`);

  if (record.reviewStatus === "official_export_downloaded_pending_independent_review") pendingReviewCount += 1;
  if (record.reviewStatus === "held_current_label_version_conflict") versionHoldCount += 1;
}

check(seenCodes.size === 10, "ten unique supplier codes were not verified");
check(seenPairs.size === 10, "ten unique exact pairs were not verified");
check(pendingReviewCount === 9, "expected nine pending-review package matches");
check(versionHoldCount === 1, "expected one factual version hold");
const r227 = batch.records.find((record) => record.supplierItemCode === "R227");
check(r227?.reviewStatus === "held_current_label_version_conflict", "R227 version hold is missing");
check(r227?.preciseGaps?.some((gap) => gap.includes("current selected R227")), "R227 current-selected-label gap is missing");
check(batch.records.find((record) => record.supplierItemCode === "R191")?.expectedPackage.includes("2.65 oz"), "R191 corrected package basis is missing");
check(batch.records.find((record) => record.supplierItemCode === "R271L")?.officialImageUrl.endsWith("/r/2/r271l-Small-98707.png"), "R271L exact child URL changed");
check(batch.records.find((record) => record.supplierItemCode === "R848")?.officialImageUrl.endsWith("/r/8/r848-Small-12877_1.png"), "R848 exact child URL changed");
check(batch.records.find((record) => record.supplierItemCode === "R123L")?.officialImageUrl.endsWith("/r/1/r123l-Small-10201.png"), "R123L exact child URL changed");

const contactSheetPath = resolve(repoRoot, batch.contactSheet.relativeAssetPath);
const contactSheetBytes = readFileSync(contactSheetPath);
const contactDimensions = pngDimensions(batch.contactSheet.relativeAssetPath, contactSheetBytes);
check(contactSheetBytes.length === batch.contactSheet.bytes, "contact-sheet byte count mismatch");
check(sha256(contactSheetBytes) === batch.contactSheet.sha256, "contact-sheet SHA-256 mismatch");
check(contactDimensions.width === 1800 && contactDimensions.height === 1200, "contact sheet is not 1800 by 1200");
const contactSourcePath = resolve(repoRoot, batch.contactSheetSource.relativeAssetPath);
const contactSourceBytes = readFileSync(contactSourcePath);
const contactSourceText = contactSourceBytes.toString("utf8");
check(contactSourceBytes.length === batch.contactSheetSource.bytes, "contact-sheet source byte count mismatch");
check(sha256(contactSourceBytes) === batch.contactSheetSource.sha256, "contact-sheet source SHA-256 mismatch");
check((contactSourceText.match(/<article\b/g) || []).length === 10, "contact sheet does not contain ten product cards");
for (const expected of expectedByCode.values()) check(contactSourceText.includes(expected.filename), `${expected.filename}: missing from contact sheet`);

check(evidence.acquisition.downloadedAssets === 10, "evidence download count is not ten");
check(evidence.acquisition.transformedAssets === 0, "evidence cannot claim transformed assets");
check(evidence.review.candidatePackageMatches === 9, "evidence candidate count is not nine");
check(evidence.review.factualVersionHolds === 1, "evidence hold count is not one");
check(evidence.review.publicationAuthorizedAssets === 0, "evidence cannot claim publication-authorized assets");
check(evidence.review.runtimeLinkedAssets === 0, "evidence cannot claim runtime-linked assets");
check(evidence.review.fullyReadyCatalogPairs === 0, "no catalog pair is fully ready in this batch");
check(evidence.preservedHold.supplierItemCode === "R227", "preserved hold is not R227");

const result = {
  ok: errors.length === 0,
  batchId: batch.batchId,
  releaseBaseline: batch.releaseBaseline,
  canonicalPairs: 420,
  exactSupplierRecords: batch.records.length,
  checkedOriginalPngs: seenPaths.size,
  candidatePackageMatchesPendingReview: pendingReviewCount,
  factualVersionHolds: versionHoldCount,
  contactSheetChecked: true,
  sourceBytesTransformed: false,
  runtimeLinkedAssets: 0,
  publicationAuthorizedAssets: 0,
  supplierSendPerformed: false,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--write-receipt")) {
  writeFileSync(resolve(batchDir, "verification-result.v1.json"), `${JSON.stringify(result, null, 2)}\n`);
}
if (errors.length > 0) process.exitCode = 1;
