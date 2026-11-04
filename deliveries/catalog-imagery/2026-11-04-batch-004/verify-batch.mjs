#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const batchRelativeRoot = "deliveries/catalog-imagery/2026-11-04-batch-004/";
const batch = JSON.parse(readFileSync(resolve(batchDir, "media-batch.v1.json"), "utf8"));
const evidence = JSON.parse(readFileSync(resolve(batchDir, "internal-evidence.v1.json"), "utf8"));
const exceptions = JSON.parse(readFileSync(resolve(batchDir, "print-spec-exceptions.v1.json"), "utf8"));
const datasetPath = resolve(repoRoot, batch.catalogDataset.path);
const bindingsPath = resolve(repoRoot, batch.bindingDataset.path);
const datasetCheckoutBytes = readFileSync(datasetPath);
const datasetCommittedBytes = Buffer.from(datasetCheckoutBytes.toString("utf8").replace(/\r\n/g, "\n"));
const bindingsCheckoutBytes = readFileSync(bindingsPath);
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
    const text = bytes.toString("utf8", 0, Math.min(bytes.length, 16384));
    return {
      width: Number(text.match(/<svg\b[^>]*\bwidth="([0-9]+)"/)?.[1]),
      height: Number(text.match(/<svg\b[^>]*\bheight="([0-9]+)"/)?.[1]),
    };
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

function pdfPageCount(bytes) {
  return (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

check(batch.schemaVersion === 1, "media batch schemaVersion must be 1");
check(evidence.schemaVersion === 1, "evidence schemaVersion must be 1");
check(exceptions.schemaVersion === 1, "exception schemaVersion must be 1");
check(batch.batchId === evidence.batchId && batch.batchId === exceptions.batchId, "batch IDs differ");
check(batch.releaseBaseline === evidence.releaseBaseline, "release baselines differ");
check(batch.publicationState === "review_only_candidate_not_runtime", "batch must remain review-only");
check(batch.supplierSendPerformed === false, "supplier send must remain false");
check(batch.authority.founderWebsiteUseAuthorized === true, "founder website-use authority is missing");
check(batch.authority.references.includes("KAN-59/10615"), "KAN-59/10615 authority is missing");
check(batch.authority.references.includes("KAN-225/10616"), "KAN-225/10616 authority is missing");
check(batch.authority.releasePublicationApproved === false, "release publication cannot be pre-approved");
check(batch.authority.physicalProductionApproved === false, "physical production cannot be pre-approved");

check(dataset.canonicalProductCount === 420, "dataset product count is not 420");
check(dataset.variantCount === 420, "dataset variant count is not 420");
check(sha256(datasetCommittedBytes) === batch.catalogDataset.rawSha256, "committed dataset SHA-256 differs");
check(gitBlobOid(datasetCommittedBytes) === batch.catalogDataset.gitBlobOid, "committed dataset blob OID differs");
check(sha256(bindingsCommittedBytes) === batch.bindingDataset.rawSha256, "committed binding SHA-256 differs");
check(gitBlobOid(bindingsCommittedBytes) === batch.bindingDataset.gitBlobOid, "committed binding blob OID differs");

check(batch.records.length === 1, "batch must contain one exact media record");
check(evidence.records.length === 1, "evidence must contain one exact media record");
const record = batch.records[0];
const evidenceRecord = evidence.records[0];
const exactOfferingId = "mo_af289f611c02b3fcef01";
const exactSourceVariantId = "mov_ca3e45ae9712aee91430";
check(record.offeringId === exactOfferingId, "offering ID changed");
check(record.sourceVariantId === exactSourceVariantId, "source-variant ID changed");
check(evidenceRecord.offeringId === exactOfferingId, "evidence offering ID changed");
check(evidenceRecord.sourceVariantId === exactSourceVariantId, "evidence source-variant ID changed");
check(exceptions.offeringId === exactOfferingId, "exception offering ID changed");
check(exceptions.sourceVariantId === exactSourceVariantId, "exception source-variant ID changed");

const catalogProduct = dataset.products.find((product) => product.id === exactOfferingId);
const catalogVariant = catalogProduct?.variants.find((variant) => variant.id === exactSourceVariantId);
check(catalogProduct?.canonicalName === "BPC-157", "canonical product is not BPC-157");
check(catalogVariant?.label === "BPC-157 10 mg", "canonical variant is not BPC-157 10 mg");
const binding = bindings.bindings.find(
  (item) => item.offeringId === exactOfferingId && item.offeringVariantId === exactSourceVariantId,
);
check(binding?.productControlSku === "GEN-GRP-0262", "current Quick Order binding is not GEN-GRP-0262");
check(record.quickOrderSku === binding?.productControlSku, "record Quick Order SKU differs from binding");
check(record.exactDepictedFacts.quickOrderSku === binding?.productControlSku, "depicted SKU differs from binding");

check(
  record.websiteArtworkState === "finished_candidate_pending_independent_review",
  "website artwork state is not the pending-review candidate state",
);
check(record.physicalPackagingState === "design", "physical packaging state must remain design");
check(record.publicationAuthorized === false, "record cannot be publication-authorized");
check(record.runtimeLinked === false, "record cannot be runtime-linked");
check(
  evidenceRecord.stateSeparation.websiteArtworkState === record.websiteArtworkState,
  "evidence website state differs from media record",
);
check(
  evidenceRecord.stateSeparation.physicalPackagingState === record.physicalPackagingState,
  "evidence physical state differs from media record",
);
check(evidenceRecord.stateSeparation.printedOrInUsePackagingEstablished === false, "printed packaging cannot be established");
check(evidenceRecord.stateSeparation.supplierProofApprovalEstablished === false, "supplier proof approval cannot be established");
check(evidenceRecord.stateSeparation.supplierSendPerformed === false, "evidence cannot imply supplier send");
check(evidenceRecord.review.status === "pending_independent_review", "independent review must remain pending");
check(evidenceRecord.review.approvedExactProductionImages === 0, "no exact production image is approved yet");
check(evidenceRecord.review.publicationAuthorizedAssets === 0, "no asset is publication-authorized yet");
check(exceptions.websiteArtworkState === record.websiteArtworkState, "exception website state differs");
check(exceptions.physicalPackagingState === record.physicalPackagingState, "exception physical state differs");
check(evidence.approvalGate.outboundSent === false, "outbound approval gate cannot show a send");

const seenPaths = new Set();
let checkedArtifacts = 0;
let checkedPdfPages = 0;
for (const artifact of batch.artifacts) {
  checkedArtifacts += 1;
  check(artifact.relativeAssetPath.startsWith(batchRelativeRoot), `${artifact.role}: escaped batch delivery tree`);
  check(!artifact.relativeAssetPath.includes("/client/public/"), `${artifact.role}: public runtime path is forbidden`);
  check(!seenPaths.has(artifact.relativeAssetPath), `${artifact.role}: duplicate artifact path`);
  seenPaths.add(artifact.relativeAssetPath);
  const absolute = resolve(repoRoot, artifact.relativeAssetPath);
  check(absolute.startsWith(resolve(repoRoot, batchRelativeRoot)), `${artifact.role}: unsafe resolved path`);
  const bytes = readFileSync(absolute);
  check(statSync(absolute).size === artifact.bytes, `${artifact.relativeAssetPath}: byte count mismatch`);
  check(sha256(bytes) === artifact.sha256, `${artifact.relativeAssetPath}: SHA-256 mismatch`);
  if (artifact.width || artifact.height) {
    const dimensions = imageDimensions(artifact.relativeAssetPath, bytes);
    check(dimensions.width === artifact.width, `${artifact.relativeAssetPath}: width mismatch`);
    check(dimensions.height === artifact.height, `${artifact.relativeAssetPath}: height mismatch`);
  }
  if (artifact.format === "pdf") {
    check(bytes.subarray(0, 5).toString("ascii") === "%PDF-", `${artifact.relativeAssetPath}: PDF header missing`);
    check(bytes.toString("latin1").trimEnd().endsWith("%%EOF"), `${artifact.relativeAssetPath}: PDF EOF missing`);
    const pages = pdfPageCount(bytes);
    checkedPdfPages += pages;
    check(pages === artifact.pages, `${artifact.relativeAssetPath}: PDF page count mismatch`);
  }
}
check(checkedArtifacts === 14, "expected fourteen declared artifacts");
check(checkedPdfPages === 4, "expected four checked PDF pages");

const referencedPaths = [
  ...record.websiteImages,
  ...record.editableLabelMasters,
  ...record.labelPreviews,
  ...record.supplierProofs,
  record.printSpecExceptionSheet,
];
for (const path of referencedPaths) check(seenPaths.has(path), `${path}: record reference is not a declared artifact`);
check(seenPaths.has(batch.contactSheet.relativeAssetPath), "contact sheet is not a declared artifact");
const contactArtifact = batch.artifacts.find((artifact) => artifact.role === "contact_sheet");
check(contactArtifact?.sha256 === batch.contactSheet.sha256, "contact-sheet hashes differ");
check(contactArtifact?.bytes === batch.contactSheet.bytes, "contact-sheet byte counts differ");
check(contactArtifact?.width === 1800 && contactArtifact?.height === 1200, "contact sheet is not 1800 by 1200");

const frontSvg = readFileSync(resolve(batchDir, "labels/bpc-157-10mg-front-artwork-v3.svg"), "utf8");
const wrapSvg = readFileSync(resolve(batchDir, "labels/bpc-157-10mg-wrap-proof-v3.svg"), "utf8");
for (const required of ["XENIOS", "BPC-157", "10 mg", "LYOPHILIZED VIAL", "RESEARCH USE ONLY", "NONCLINICAL USE ONLY"]) {
  check(frontSvg.includes(required), `front SVG missing ${required}`);
  check(wrapSvg.includes(required), `wrap SVG missing ${required}`);
}
check(!frontSvg.includes("GEN-GRP-0262"), "front-facing website label must not present the Quick Order SKU as package traceability");
check(wrapSvg.includes("GEN-GRP-0262"), "wrap proof is missing the current Quick Order SKU reconciliation");
check(wrapSvg.includes("Catalog identifier only."), "wrap proof must label the Quick Order SKU as catalog-only");
check(wrapSvg.includes("LOT: [SUPPLIER APPLIED]"), "wrap proof is missing the supplier-applied lot placeholder");
check(wrapSvg.includes("EXP/BUD: [SUPPLIER APPLIED]"), "wrap proof is missing the supplier-applied expiry placeholder");
check(wrapSvg.includes("NOT PRESS READY"), "wrap proof is missing the not-press-ready boundary");
const svgForValueAudit = `${frontSvg}\n${wrapSvg}`
  .replace("LOT: [SUPPLIER APPLIED]", "")
  .replace("EXP/BUD: [SUPPLIER APPLIED]", "");
const svgVisibleTextForValueAudit = svgForValueAudit.replace(/<[^>]+>/g, " ");
check(!/\bLOT\s*[:#]\s*[A-Z0-9]/i.test(svgVisibleTextForValueAudit), "invented lot value found in artwork");
check(!/\b(?:EXP|BUD)\s*[:#]\s*[A-Z0-9]/i.test(svgVisibleTextForValueAudit), "invented expiry/BUD value found in artwork");
check(!/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(svgVisibleTextForValueAudit), "date-like traceability value found in artwork");
check(!/\b\d{2,7}-\d{2}-\d\b/.test(svgVisibleTextForValueAudit), "CAS-like identifier found in artwork");
check(!/\b\d+(?:\.\d+)?\s*%/.test(svgVisibleTextForValueAudit), "purity-like percentage found in artwork");
check(!/<image\b/i.test(wrapSvg), "embedded image or QR payload found in wrap proof");

const result = {
  ok: errors.length === 0,
  batchId: batch.batchId,
  releaseBaseline: batch.releaseBaseline,
  canonicalPairs: 420,
  exactPair: `${exactOfferingId}/${exactSourceVariantId}`,
  quickOrderSku: "GEN-GRP-0262",
  checkedArtifacts,
  checkedPdfPages,
  contactSheetChecked: true,
  websiteArtworkState: record.websiteArtworkState,
  physicalPackagingState: record.physicalPackagingState,
  founderWebsiteUseAuthorized: batch.authority.founderWebsiteUseAuthorized,
  independentReviewPending: evidenceRecord.review.status === "pending_independent_review",
  supplierSendPerformed: batch.supplierSendPerformed,
  runtimeLinkedAssets: 0,
  publicationAuthorizedAssets: 0,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--write-receipt")) {
  writeFileSync(resolve(batchDir, "verification-result.v1.json"), `${JSON.stringify(result, null, 2)}\n`);
}
if (errors.length > 0) process.exitCode = 1;
