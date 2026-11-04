#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const batchRelativeRoot = "deliveries/catalog-imagery/2026-11-04-batch-006/";
const batch = JSON.parse(readFileSync(resolve(batchDir, "source-leads.v1.json"), "utf8"));
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

const expectedByStem = new Map(
  [
    ["R149C", "mo_7bc91b37c8c041f166dd", "mov_2de19f71e09e8bc3febb", "GEN-GRP-0368", "r149c-chondro-jointaide-lead.png", 211, 265, 186420, "7da59970af71609cfd248722e2bfdae4d44e4475d28b8fe4da60be178b661e71"],
    ["8WFG", "mo_79376f449760149d1030", "mov_cdfb19499637f274f271", "GEN-GRP-0370", "8wfg-fruits-greens-lead.png", 165, 265, 169105, "f633be7d1b7c4e1250d84cd73feac567d889353e11ed33d58e1798a12b7f896a"],
    ["DHYD", "mo_a4cfc5396d714f879944", "mov_d6a8b2cd129bda39d8fa", "GEN-GRP-0372", "dhyd-hydrate-lead.png", 265, 265, 136752, "50399172e07267e4256e58a6fd456865de43ba21da2e755f342d4700a73dee7c"],
    ["DIN", "mo_eca326cdaae5d36cfae6", "mov_0f3fa003c76aadef763c", "GEN-GRP-0373", "din-inflam-eze-lead.png", 192, 265, 213928, "3b973fa1d79ec490b99fca2369500500df8abf4bf32d4bcf442fe5753c4b1271"],
    ["R288", "mo_edefaf4799bd53853d01", "mov_e74adec4c45f9c9db404", "GEN-GRP-0374", "r288-longevity-nad-plus-lead.png", 160, 265, 127842, "a3d952560f7d5ae17629d75d186147034fd934f1993781f0dcaa5ef640a394ee"],
    ["R289", "mo_b48e883b4ada1469f824", "mov_904af0a54faddfe2f21f", "GEN-GRP-0380", "r289-rejuvenate-plus-lead.png", 161, 265, 190020, "4c2d7182a952a421b25a02eaf3287e0d418a488bde2580e6653755b8422fe12e"],
    ["R405", "mo_5b122372a6ecdea51c52", "mov_ffe0eef7766200ac8c53", "GEN-GRP-0382", "r405-stress-essentials-calm-lead.png", 163, 265, 108332, "0f6e06b87eccb03849f674a7f3efe71ee39bd7f545d9c20013cf29ebb81e6a53"],
    ["UBA", "mo_2d42f72361aac15b6d5d", "mov_dbb59b83827a556051da", "GEN-GRP-0383", "uba-akkermansia-plus-lead.png", 265, 265, 116100, "2b7491867ceae8aaf788eec30b21aa1f7373ce4cdf288d1eb84e2164d449ae04"],
    ["R222", "mo_ad9795d751913350bdea", "mov_d91d7248ed06d7280a2d", "GEN-GRP-0384", "r222-ultrabiotic-prebiotic-lead.png", 197, 265, 142021, "73d283b284beea4c7996121075e9c14fda6753b203c4e100e6a030ce2d83b700"],
    ["R290", "mo_85898714d8df5a3d2f10", "mov_4a105b161858064229f3", "GEN-GRP-0385", "r290-uplift-plus-lead.png", 168, 265, 192902, "0b0f380271fdbde829ca62d44d119726294d09d1cef5a74a3b204171adb65808"],
  ].map(([stem, offeringId, sourceVariantId, sku, filename, width, height, bytes, hash]) => [
    stem,
    { offeringId, sourceVariantId, sku, filename, width, height, bytes, hash },
  ]),
);

check(batch.schemaVersion === 1, "source-lead schemaVersion must be 1");
check(evidence.schemaVersion === 1, "evidence schemaVersion must be 1");
check(batch.batchId === evidence.batchId, "batch IDs differ");
check(batch.createdAt === evidence.createdAt, "creation timestamps differ");
check(batch.releaseBaseline === evidence.releaseBaseline, "release baselines differ");
check(batch.disposition === "internal_source_leads_only_not_exact_assets", "batch disposition overclaims exact assets");
check(batch.sourceBytesPreserved === true, "source-byte preservation is missing");
check(batch.runtimeLinked === false, "source leads cannot be runtime-linked");
check(batch.publicationAuthorized === false, "source leads cannot be publication-authorized");
check(batch.supplierSendPerformed === false, "supplier send must remain false");

check(dataset.canonicalProductCount === 420, "dataset product count is not 420");
check(dataset.variantCount === 420, "dataset variant count is not 420");
check(sha256(datasetCommittedBytes) === batch.catalogDataset.rawSha256, "committed dataset SHA-256 differs");
check(gitBlobOid(datasetCommittedBytes) === batch.catalogDataset.gitBlobOid, "committed dataset blob OID differs");
check(sha256(bindingsCommittedBytes) === batch.bindingDataset.rawSha256, "committed binding SHA-256 differs");
check(gitBlobOid(bindingsCommittedBytes) === batch.bindingDataset.gitBlobOid, "committed binding blob OID differs");

check(batch.records.length === 10, "expected ten held source-lead records");
const seenStems = new Set();
const seenPairs = new Set();
const seenPaths = new Set();
const seenHashes = new Set();
let heldCount = 0;
for (const record of batch.records) {
  const expected = expectedByStem.get(record.officialMediaStem);
  check(Boolean(expected), `${record.officialMediaStem}: unexpected official media stem`);
  if (!expected) continue;
  check(!seenStems.has(record.officialMediaStem), `${record.officialMediaStem}: duplicate media stem`);
  seenStems.add(record.officialMediaStem);
  const pair = `${record.offeringId}/${record.sourceVariantId}`;
  check(!seenPairs.has(pair), `${pair}: duplicate exact pair`);
  seenPairs.add(pair);
  check(record.offeringId === expected.offeringId, `${record.officialMediaStem}: offering ID changed`);
  check(record.sourceVariantId === expected.sourceVariantId, `${record.officialMediaStem}: source-variant ID changed`);
  check(record.quickOrderSku === expected.sku, `${record.officialMediaStem}: Quick Order SKU changed`);
  check(record.status === "held_not_exact_asset", `${record.officialMediaStem}: source lead was promoted without evidence`);
  heldCount += record.status === "held_not_exact_asset" ? 1 : 0;
  check(record.preciseMissingInput.length >= 100, `${record.officialMediaStem}: precise missing input is too short`);
  check(/^https:\/\/nutridyn\.com\//.test(record.officialProductPage), `${record.officialMediaStem}: product page is not official NutriDyn`);
  check(
    /^https:\/\/nutridyn\.com\/media\/catalog\/product\//.test(record.officialImageUrl),
    `${record.officialMediaStem}: image URL is not official NutriDyn product media`,
  );
  check(record.asset.relativeAssetPath.endsWith(`/${expected.filename}`), `${record.officialMediaStem}: filename changed`);
  check(
    record.asset.relativeAssetPath.startsWith(`${batchRelativeRoot}source-leads/official-nutridyn/`),
    `${record.officialMediaStem}: asset escaped source-lead folder`,
  );
  check(!seenPaths.has(record.asset.relativeAssetPath), `${record.officialMediaStem}: duplicate asset path`);
  seenPaths.add(record.asset.relativeAssetPath);
  check(!seenHashes.has(record.asset.sha256), `${record.officialMediaStem}: duplicate asset bytes`);
  seenHashes.add(record.asset.sha256);
  const absolute = resolve(repoRoot, record.asset.relativeAssetPath);
  check(absolute.startsWith(resolve(batchDir, "source-leads/official-nutridyn")), `${record.officialMediaStem}: unsafe resolved path`);
  const bytes = readFileSync(absolute);
  check(statSync(absolute).size === expected.bytes, `${record.officialMediaStem}: byte count differs from receipt`);
  check(record.asset.bytes === expected.bytes, `${record.officialMediaStem}: declared byte count changed`);
  check(sha256(bytes) === expected.hash, `${record.officialMediaStem}: downloaded SHA-256 differs`);
  check(record.asset.sha256 === expected.hash, `${record.officialMediaStem}: declared SHA-256 differs`);
  const dimensions = pngDimensions(record.asset.relativeAssetPath, bytes);
  check(dimensions.width === expected.width && dimensions.height === expected.height, `${record.officialMediaStem}: PNG dimensions differ`);
  check(record.asset.width === expected.width && record.asset.height === expected.height, `${record.officialMediaStem}: declared dimensions differ`);

  const catalogProduct = dataset.products.find((product) => product.id === record.offeringId);
  const catalogVariant = catalogProduct?.variants.find((variant) => variant.id === record.sourceVariantId);
  check(catalogProduct?.canonicalName === record.canonicalName, `${record.officialMediaStem}: canonical name differs from catalog`);
  check(catalogVariant?.label === "Retail unit / package", `${record.officialMediaStem}: canonical variant label changed`);
  const binding = bindings.bindings.find(
    (item) => item.offeringId === record.offeringId && item.offeringVariantId === record.sourceVariantId,
  );
  check(binding?.productControlSku === record.quickOrderSku, `${record.officialMediaStem}: binding SKU differs`);
}

check(seenStems.size === 10, "ten unique official media stems were not verified");
check(seenPairs.size === 10, "ten unique held exact pairs were not verified");
check(heldCount === 10, "every source lead must remain held");
check(batch.records.filter((record) => record.workbookSourceItemCode === null).length === 3, "expected three missing workbook item codes");
const calm = batch.records.find((record) => record.officialMediaStem === "R405");
check(calm?.workbookSourceItemCode === "R123C", "Stress Essentials code mismatch evidence is missing");
check(calm?.preciseMissingInput.includes("do not substitute R405"), "Stress Essentials no-substitution boundary is missing");

const contactSheetBytes = readFileSync(resolve(repoRoot, batch.contactSheet.relativeAssetPath));
const contactDimensions = pngDimensions(batch.contactSheet.relativeAssetPath, contactSheetBytes);
check(contactSheetBytes.length === batch.contactSheet.bytes, "contact-sheet byte count mismatch");
check(sha256(contactSheetBytes) === batch.contactSheet.sha256, "contact-sheet SHA-256 mismatch");
check(contactDimensions.width === 1800 && contactDimensions.height === 1200, "contact sheet is not 1800 by 1200");
const contactSourceBytes = readFileSync(resolve(repoRoot, batch.contactSheetSource.relativeAssetPath));
const contactSourceText = contactSourceBytes.toString("utf8");
check(contactSourceBytes.length === batch.contactSheetSource.bytes, "contact-sheet source byte count mismatch");
check(sha256(contactSourceBytes) === batch.contactSheetSource.sha256, "contact-sheet source SHA-256 mismatch");
check((contactSourceText.match(/<article\b/g) || []).length === 10, "contact sheet does not contain ten cards");
check((contactSourceText.match(/SOURCE LEAD ONLY · NOT EXACT/g) || []).length === 10, "contact sheet does not mark every lead non-exact");
for (const expected of expectedByStem.values()) check(contactSourceText.includes(expected.filename), `${expected.filename}: missing from contact sheet`);

check(evidence.recovery.officialProductPagesChecked === 10, "evidence page-check count is not ten");
check(evidence.recovery.officialPageStatus200 === 10, "evidence HTTP-200 count is not ten");
check(evidence.recovery.officialFrontExportsDownloaded === 10, "evidence download count is not ten");
check(evidence.recovery.sourceBytesTransformed === 0, "evidence cannot claim transformations");
check(evidence.disposition.heldSourceLeads === 10, "evidence held count is not ten");
check(evidence.disposition.exactProductAssets === 0, "evidence cannot claim exact assets");
check(evidence.disposition.publicationAuthorizedAssets === 0, "evidence cannot claim publication authorization");
check(evidence.disposition.runtimeLinkedAssets === 0, "evidence cannot claim runtime links");

const result = {
  ok: errors.length === 0,
  batchId: batch.batchId,
  releaseBaseline: batch.releaseBaseline,
  canonicalPairs: 420,
  exactHeldPairs: seenPairs.size,
  checkedOfficialSourceLeadPngs: seenPaths.size,
  heldSourceLeads: heldCount,
  exactProductAssets: 0,
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
