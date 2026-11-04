#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const batchPath = resolve(batchDir, "media-batch.v2.json");
const evidencePath = resolve(batchDir, "internal-evidence.v2.json");
const datasetPath = resolve(
  repoRoot,
  "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
);
const bindingsPath = resolve(
  repoRoot,
  "server/research/master-offerings/data/master-offering-bindings.generated.json",
);

const batch = JSON.parse(readFileSync(batchPath, "utf8"));
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const datasetCheckoutBytes = readFileSync(datasetPath);
const datasetCommittedBytes = Buffer.from(datasetCheckoutBytes.toString("utf8").replace(/\r\n/g, "\n"));
const dataset = JSON.parse(datasetCheckoutBytes.toString("utf8"));
const bindingsCheckoutBytes = readFileSync(bindingsPath);
const bindingsCommittedBytes = Buffer.from(bindingsCheckoutBytes.toString("utf8").replace(/\r\n/g, "\n"));
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
    const width = Number(text.match(/<svg\b[^>]*\bwidth="([0-9]+)"/)?.[1]);
    const height = Number(text.match(/<svg\b[^>]*\bheight="([0-9]+)"/)?.[1]);
    return { width, height };
  }
  if (extension !== ".webp") throw new Error(`${path}: unsupported image extension`);
  check(bytes.subarray(0, 4).toString("ascii") === "RIFF", `${path}: missing RIFF header`);
  check(bytes.subarray(8, 12).toString("ascii") === "WEBP", `${path}: missing WEBP header`);
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    return { width: 1 + readLe24(bytes, 24), height: 1 + readLe24(bytes, 27) };
  }
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
const reviewedConcept = evidence.records.find(
  (record) => record.offeringId === "mo_af289f611c02b3fcef01" && record.sourceVariantId === "mov_ca3e45ae9712aee91430",
);
check(
  reviewedConcept?.review?.status === "successor_accepted_private_design_and_source_lead_evidence_only",
  "successor private-review disposition is missing",
);
check(reviewedConcept?.review?.reviewer === "KAN-31/10612", "successor review receipt is not KAN-31/10612");
check(
  reviewedConcept?.review?.reviewedSourceSha === "e8705e0a34b0ab5bd357ccb24562dc89049aca1f",
  "successor review source SHA changed",
);
check(reviewedConcept?.review?.reviewedReferencedBytes === 6, "successor reviewed-byte count is not six");
check(
  reviewedConcept?.review?.approvedExactProductionImages === 0,
  "successor review cannot imply approved exact production imagery",
);
check(batch.batchId === evidence.batchId, "batch IDs differ");
check(batch.releaseBaseline === evidence.releaseBaseline, "release baselines differ");
check(batch.publicationState === "review_only_not_runtime", "batch must remain review-only");
check(dataset.canonicalProductCount === 420, "dataset product count is not 420");
check(dataset.variantCount === 420, "dataset variant count is not 420");
check(sha256(datasetCommittedBytes) === batch.catalogDataset.rawSha256, "committed dataset SHA-256 differs");
check(gitBlobOid(datasetCommittedBytes) === batch.catalogDataset.gitBlobOid, "committed dataset blob OID differs");
check(
  sha256(bindingsCommittedBytes) === "587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24",
  "committed binding SHA-256 differs",
);
check(
  gitBlobOid(bindingsCommittedBytes) === "7760d5d8fb559c9c9c6cfc7622827fb4977b61d5",
  "committed binding blob OID differs",
);

const contactSheetPath = resolve(repoRoot, batch.contactSheet.relativeAssetPath);
const contactSheetBytes = readFileSync(contactSheetPath);
const contactSheetDimensions = imageDimensions(batch.contactSheet.relativeAssetPath, contactSheetBytes);
check(contactSheetBytes.length === batch.contactSheet.bytes, "contact sheet byte count mismatch");
check(sha256(contactSheetBytes) === batch.contactSheet.sha256, "contact sheet SHA-256 mismatch");
check(contactSheetDimensions.width === batch.contactSheet.width, "contact sheet width mismatch");
check(contactSheetDimensions.height === batch.contactSheet.height, "contact sheet height mismatch");

const canonicalPairs = new Set();
for (const product of dataset.products) {
  for (const variant of product.variants) canonicalPairs.add(`${product.id}/${variant.id}`);
}

const seenPairs = new Set();
const seenPaths = new Set();
const seenHashes = new Map();
const kinds = new Set(["official_photo", "verified_render", "concept", "service"]);
const packagingStates = new Set(["design", "supplier_proof_approved", "printed_in_use", "not_applicable"]);
const roles = new Set(["primary", "label", "gallery"]);
let checkedAssets = 0;

for (const record of batch.records) {
  const pair = `${record.offeringId}/${record.sourceVariantId}`;
  check(canonicalPairs.has(pair), `${pair}: not found in canonical dataset`);
  check(!seenPairs.has(pair), `${pair}: duplicate media record`);
  seenPairs.add(pair);
  check(kinds.has(record.media.kind), `${pair}: invalid media kind ${record.media.kind}`);
  check(
    packagingStates.has(record.media.packagingState),
    `${pair}: invalid packaging state ${record.media.packagingState}`,
  );
  const binding = bindings.bindings.find(
    (item) => item.offeringId === record.offeringId && item.offeringVariantId === record.sourceVariantId,
  );
  check(Boolean(binding), `${pair}: committed Quick Order binding is missing`);
  check(
    record.media.exactDepictedFacts.quickOrderSku === binding?.productControlSku,
    `${pair}: displayed Quick Order SKU differs from committed binding`,
  );
  check(
    record.media.catalogCodeReconciliation.historicalCommerceVariantCode !== binding?.productControlSku,
    `${pair}: historical code was not kept separate`,
  );
  check(
    record.media.catalogCodeReconciliation.historicalCodeDisposition ===
      "not displayed on the v2 label; retained in internal evidence and the internal contact-sheet note only",
    `${pair}: historical-code display disposition is ambiguous`,
  );

  const assets = [
    ...record.media.images.map((asset) => ({ ...asset, imageRole: asset.role })),
    ...record.media.sourceMasters.map((asset) => ({ ...asset, imageRole: "source_master" })),
  ];
  for (const asset of assets) {
    checkedAssets += 1;
    check(asset.imageRole === "source_master" || roles.has(asset.imageRole), `${pair}: invalid role`);
    check(asset.relativeAssetPath.startsWith("deliveries/catalog-imagery/"), `${pair}: asset escaped delivery tree`);
    check(!seenPaths.has(asset.relativeAssetPath), `${pair}: duplicate asset path ${asset.relativeAssetPath}`);
    seenPaths.add(asset.relativeAssetPath);
    const absolute = resolve(repoRoot, asset.relativeAssetPath);
    check(absolute.startsWith(resolve(repoRoot, "deliveries")), `${pair}: unsafe resolved asset path`);
    const bytes = readFileSync(absolute);
    check(statSync(absolute).size === asset.bytes, `${asset.relativeAssetPath}: byte count mismatch`);
    const hash = sha256(bytes);
    check(hash === asset.sha256, `${asset.relativeAssetPath}: SHA-256 mismatch`);
    const dimensions = imageDimensions(asset.relativeAssetPath, bytes);
    check(dimensions.width === asset.width, `${asset.relativeAssetPath}: width mismatch`);
    check(dimensions.height === asset.height, `${asset.relativeAssetPath}: height mismatch`);
    const priorPath = seenHashes.get(hash);
    check(!priorPath, `${asset.relativeAssetPath}: duplicate bytes already used by ${priorPath}`);
    seenHashes.set(hash, asset.relativeAssetPath);
  }
}

const mediaEvidence = evidence.records.filter((record) => record.field === "media");
const sourceCandidates = evidence.records.filter((record) => record.field === "media_source_candidate");
check(mediaEvidence.length === batch.records.length, "media evidence count differs from batch record count");
check(sourceCandidates.length === 10, "expected ten NutriDyn source candidates");

for (const record of evidence.records) {
  const pair = `${record.offeringId}/${record.sourceVariantId}`;
  check(canonicalPairs.has(pair), `${pair}: evidence pair not found in canonical dataset`);
  if (record.field === "media_source_candidate") {
    check(record.rightsState === "OFFICIAL_SOURCE_RIGHTS_PENDING", `${pair}: supplier rights must remain pending`);
    check(record.assetDownloaded === false, `${pair}: pending-rights asset must not be downloaded`);
    check(record.publicationAuthorized === false, `${pair}: pending-rights asset cannot be publication-authorized`);
    check(/^https:\/\/nutridyn\.com\//.test(record.officialProductPage), `${pair}: non-official product page`);
    check(/^https:\/\/nutridyn\.com\/media\/catalog\/product\//.test(record.officialImageCandidate), `${pair}: non-official image candidate`);
  }
}

const candidatesByCode = new Map(sourceCandidates.map((record) => [record.supplierItemCode, record]));
check(
  candidatesByCode.get("R271L")?.officialImageCandidate.endsWith("/r/2/r271l-Small-98707.png"),
  "R271L does not use the exact child gallery image",
);
check(
  candidatesByCode.get("R848")?.officialImageCandidate.endsWith("/r/8/r848-Small-12877_1.png"),
  "R848 does not use the exact child gallery image",
);
check(
  candidatesByCode.get("R123L")?.officialImageCandidate.endsWith("/r/1/r123l-Small-10201.png"),
  "R123L does not use the exact child gallery image",
);
check(candidatesByCode.get("R191")?.expectedPackage.includes("2.65 oz"), "R191 package basis is not 2.65 oz");
check(
  candidatesByCode.get("R227")?.preciseGaps.some((gap) => gap.includes("current selected R227")),
  "R227 current-label hold is missing",
);

for (const record of evidence.nonAssetDispositions) {
  check(canonicalPairs.has(`${record.offeringId}/${record.sourceVariantId}`), "non-asset disposition pair is not canonical");
}

const result = {
  ok: errors.length === 0,
  batchId: batch.batchId,
  releaseBaseline: batch.releaseBaseline,
  canonicalPairs: canonicalPairs.size,
  mediaRecords: batch.records.length,
  checkedAssets,
  contactSheetChecked: true,
  supplierSourceCandidates: sourceCandidates.length,
  nonAssetDispositions: evidence.nonAssetDispositions.length,
  privateConceptsAcceptedOnPredecessor: 1,
  privateSuccessorReviewsAccepted: 1,
  independentlyReviewedReferencedBytes: 6,
  independentlyApprovedExactProductionImages: 0,
  publicationAuthorizedAssets: 0,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
