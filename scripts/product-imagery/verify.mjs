import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASSET_BYTE_BUDGET,
  ASSET_TOTAL_BYTE_BUDGET,
  CONTRACT_SCHEMA_VERSION,
  COVERAGE_LEDGER_PATH,
  COVERAGE_SUMMARY_PATH,
  FALLBACK_ASSET_MANIFEST_PATH,
  IDENTITY_CROSSWALK_PATH,
  RENDER_QUEUE_PATH,
} from "./config.mjs";
import {
  assertIdentityCrosswalkConsistency,
  assetById,
  buildArtifacts,
  renderCoverageSummary,
  REPO_ROOT,
  scanRuntimeCandidateReferences,
  sha256File,
} from "./lib.mjs";

const FILE_PATH_ALLOWLIST =
  /^client\/public\/research\/products\/fallbacks\/[a-z0-9][a-z0-9-]*-[a-f0-9]{12}\.webp$/;
const PUBLIC_PATH_ALLOWLIST =
  /^\/research\/products\/fallbacks\/[a-z0-9][a-z0-9-]*-[a-f0-9]{12}\.webp$/;

function normalizedClaimText(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FORBIDDEN_ALT_CLAIM =
  /\b(?:buy|purchas(?:e|ed|ing)?|in stock|available now|add to cart|dos(?:e|es|ed|ing|age)|treat(?:s|ed|ing|ment|ments)?|cur(?:e|es|ed|ing)|purity|lot|expir(?:y|ation|ations|es|ed)|coa|certif(?:y|ies|ied|ication|ications)|pharmaceutical grade|clinical result(?:s)?|before after|(?:us|u s) sourc(?:e|ed|ing)|pharmacy)\b/;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function readWebpDimensions(buffer) {
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");
  const kind = buffer.subarray(12, 16).toString("ascii");
  if (kind === "VP8 ") {
    assert.deepEqual([...buffer.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (kind === "VP8L") {
    assert.equal(buffer[20], 0x2f);
    const bits = buffer.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  throw new Error(`Unsupported WebP chunk ${kind}`);
}

function webpChunkNames(buffer) {
  const names = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const name = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    names.push(name);
    offset += 8 + size + (size % 2);
  }
  return names;
}

function assertSameArtifact(relativePath, actual, expected) {
  assert.deepEqual(
    actual,
    expected,
    `${relativePath} has drifted; run node scripts/product-imagery/build.mjs`,
  );
}

export function verifyRepository() {
  for (const forbiddenVariant of [
    "expiration",
    "certified",
    "clinical-results",
    "before/after",
    "US-sourced",
    "U.S. sourced",
    "US sourcing",
    "U.S.-sourcing",
  ]) {
    assert(
      FORBIDDEN_ALT_CLAIM.test(normalizedClaimText(forbiddenVariant)),
      `forbidden alt variant escaped normalization: ${forbiddenVariant}`,
    );
  }
  const expected = buildArtifacts();
  const assetManifest = readJson(FALLBACK_ASSET_MANIFEST_PATH);
  const coverageLedger = readJson(COVERAGE_LEDGER_PATH);
  const identityCrosswalk = readJson(IDENTITY_CROSSWALK_PATH);
  const renderQueue = readJson(RENDER_QUEUE_PATH);

  assertSameArtifact(
    FALLBACK_ASSET_MANIFEST_PATH,
    assetManifest,
    expected.assetManifest,
  );
  assertSameArtifact(
    COVERAGE_LEDGER_PATH,
    coverageLedger,
    expected.coverageLedger,
  );
  assertSameArtifact(
    IDENTITY_CROSSWALK_PATH,
    identityCrosswalk,
    expected.identityCrosswalk,
  );
  assertSameArtifact(RENDER_QUEUE_PATH, renderQueue, expected.renderQueue);
  assert.equal(
    fs.readFileSync(path.join(REPO_ROOT, COVERAGE_SUMMARY_PATH), "utf8"),
    renderCoverageSummary(expected),
    `${COVERAGE_SUMMARY_PATH} has drifted`,
  );

  assert.equal(assetManifest.schemaVersion, CONTRACT_SCHEMA_VERSION);
  assert.equal(coverageLedger.schemaVersion, CONTRACT_SCHEMA_VERSION);
  assert.equal(identityCrosswalk.schemaVersion, CONTRACT_SCHEMA_VERSION);
  assert.equal(renderQueue.schemaVersion, CONTRACT_SCHEMA_VERSION);
  assert.equal(assetManifest.assets.length, 10);
  assert.equal(
    assetManifest.branchDeploymentDisposition.status,
    "blocked_nonapprovable_public_bytes",
  );
  assert.match(assetManifest.reviewDisposition, /unreviewed/i);
  const assetIds = new Set();
  const assetHashes = new Set();
  let totalAssetBytes = 0;
  for (const asset of assetManifest.assets) {
    assert(!assetIds.has(asset.assetId), `duplicate assetId ${asset.assetId}`);
    assetIds.add(asset.assetId);
    assert(!assetHashes.has(asset.sha256), `duplicate asset bytes ${asset.assetId}`);
    assetHashes.add(asset.sha256);
    assert.equal(asset.coverageStatus, "fallback");
    assert.equal(asset.reviewStatus, "provisional");
    assert.equal(
      asset.approvalEligibility,
      "blocked_permanent_rerender_under_v3_required",
    );
    assert.equal(asset.runtimeWiringEligibility, "blocked");
    assert.equal(asset.deploymentEligibility, "blocked");
    assert.equal(asset.sourceType, "ai_generated_candidate");
    assert.equal(asset.provenanceTag, "generated_catalog_fallback_candidate");
    assert.equal(asset.rightsStatus, "publication_rights_review_pending");
    assert.equal(asset.ownershipClaim, "none_until_review");
    assert.equal(asset.reviewRecord.disposition, "unreviewed");
    assert.equal(asset.reviewRecord.reviewer, null);
    assert.equal(asset.reviewRecord.reviewedAt, null);
    assert.equal(asset.promptContractVersion, "pre_v3_candidate_quarantined");
    assert.equal(typeof asset.generator, "string");
    assert(
      asset.pixelGeneratedAt === "unknown" ||
        /^\d{4}-\d{2}-\d{2}T/.test(asset.pixelGeneratedAt),
    );
    assert(
      asset.encodedAt === "unknown" ||
        /^\d{4}-\d{2}-\d{2}T/.test(asset.encodedAt),
    );
    assert.equal(typeof asset.sourceArtifact.status, "string");
    assert.equal(
      asset.sourceArtifact.status,
      "local_original_retained_outside_repository",
    );
    if (asset.sourceArtifact.sha256 !== null) {
      assert.match(asset.sourceArtifact.sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(asset.transformation.outputSha256, asset.sha256);
    assert.match(asset.illustrativeNotice, /Illustrative/);
    assert.equal(typeof asset.useRestriction, "string");
    assert(asset.useRestriction.length > 20);
    assert(asset.prompt.length > 200, `prompt too short for ${asset.assetId}`);
    assert(FILE_PATH_ALLOWLIST.test(asset.filePath));
    assert(!asset.filePath.includes("%"));
    assert.equal(path.extname(asset.filePath), ".webp");
    assert.equal(
      asset.publicPath,
      `/${asset.filePath.replace(/^client\/public\//, "")}`,
    );
    assert(PUBLIC_PATH_ALLOWLIST.test(asset.publicPath));
    assert(!asset.publicPath.includes("%"));
    assert(
      path.basename(asset.filePath).endsWith(`-${asset.sha256.slice(0, 12)}.webp`),
      `${asset.assetId} filename is not content addressed`,
    );

    const absolute = path.join(REPO_ROOT, asset.filePath);
    assert(fs.existsSync(absolute), `missing ${asset.filePath}`);
    const bytes = fs.readFileSync(absolute);
    assert.equal(bytes.length, asset.byteSize);
    assert.equal(sha256File(asset.filePath), asset.sha256);
    totalAssetBytes += bytes.length;
    assert(
      bytes.length <= ASSET_BYTE_BUDGET,
      `${asset.assetId} exceeds ${ASSET_BYTE_BUDGET} bytes`,
    );
    assert.deepEqual(readWebpDimensions(bytes), {
      width: asset.width,
      height: asset.height,
    });
    const chunks = webpChunkNames(bytes);
    assert(!chunks.includes("EXIF"), `${asset.assetId} carries EXIF`);
    assert(!chunks.includes("XMP "), `${asset.assetId} carries XMP`);
  }
  assert.equal(totalAssetBytes, assetManifest.deliveryBudget.actualTotalBytes);
  assert(totalAssetBytes <= ASSET_TOTAL_BYTE_BUDGET);

  const assetDirectory = path.join(
    REPO_ROOT,
    "client/public/research/products/fallbacks",
  );
  const actualAssetFiles = fs
    .readdirSync(assetDirectory)
    .filter((name) => fs.statSync(path.join(assetDirectory, name)).isFile())
    .sort();
  const declaredAssetFiles = assetManifest.assets
    .map((asset) => path.basename(asset.filePath))
    .sort();
  assert.deepEqual(actualAssetFiles, declaredAssetFiles, "unmanifested fallback file");
  assert.equal(
    fs.readFileSync(
      path.join(REPO_ROOT, "client/public/research/products/.gitattributes"),
      "utf8",
    ).replace(/\r\n/g, "\n"),
    "*.webp binary\n",
  );

  assert.equal(coverageLedger.rows.length, 420);
  assert.equal(coverageLedger.invariants.exposedRows, 419);
  assert.equal(coverageLedger.invariants.excludedShippingRows, 1);
  assert.equal(coverageLedger.invariants.boundRows, 417);
  assert.equal(coverageLedger.invariants.exposedUnboundRows, 2);
  assert.equal(coverageLedger.invariants.approvedExactAssets, 0);
  const runtimeReferenceScan = scanRuntimeCandidateReferences(
    assetManifest.assets,
  );
  assert.deepEqual(
    coverageLedger.sources.runtimeReferenceScan,
    {
      roots: runtimeReferenceScan.roots,
      references: runtimeReferenceScan.references,
    },
  );
  assert.equal(
    coverageLedger.invariants.publicAssetsWired,
    runtimeReferenceScan.publicAssetsWired,
  );
  assert.equal(
    coverageLedger.invariants.customerSurfaceReferences,
    runtimeReferenceScan.customerSurfaceReferences,
  );
  assert.equal(runtimeReferenceScan.publicAssetsWired, 0);
  assert.equal(runtimeReferenceScan.customerSurfaceReferences, 0);
  assert.equal(coverageLedger.invariants.legacyFeaturedAliasRows, 22);
  assert.equal(coverageLedger.invariants.reviewedVisualFormOverrides, 2);
  assert.equal(coverageLedger.invariants.founderV3PromptStatus, "missing_founder_attachment_required");
  assert.equal(identityCrosswalk.invariants.legacyFeaturedAliasRows, 22);
  assert.equal(identityCrosswalk.invariants.legacyFeaturedProducts, 19);
  assert.equal(identityCrosswalk.invariants.canonicalProductControlSkusForAliases, 22);
  assert.equal(
    assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger),
    true,
  );

  const coverageKeys = new Set();
  for (const row of coverageLedger.rows) {
    assert(!coverageKeys.has(row.coverageKey), `duplicate ${row.coverageKey}`);
    coverageKeys.add(row.coverageKey);
    assert.equal(row.coverageKey, row.offeringVariantId);
    assert.equal(row.manifestKey, row.offeringVariantId);
    assert.equal(row.imageState, "none");
    assert.equal(row.coverageStatus, "fallback");
    assert.equal(row.purchaseImplication, "none");
    assert(assetById(row.fallback.assetId), `unknown asset ${row.fallback.assetId}`);
    assert(
      assetById(row.formFallback.assetId),
      `unknown form asset ${row.formFallback.assetId}`,
    );
    assert.equal(row.formFallback.taxonomyKey, row.formTaxonomy);
    assert(row.fallback.recommendedAltText.length > 0);
    assert(row.fallback.recommendedAltText.length <= 300);
    assert(
      row.fallback.recommendedAltText.startsWith(`${row.displayName}: `),
      `${row.coverageKey} alt text must begin with canonical display identity`,
    );
    const visibleSceneText = row.fallback.recommendedAltText.slice(
      `${row.displayName}: `.length,
    );
    assert(
      !FORBIDDEN_ALT_CLAIM.test(normalizedClaimText(visibleSceneText)),
      `${row.coverageKey} has forbidden alt text: ${row.fallback.recommendedAltText}`,
    );
    assert.match(row.fallback.recommendedAltText, /Illustrative\./);
    assert.equal(row.fallback.reviewStatus, "provisional");
    assert.equal(
      row.fallback.approvalEligibility,
      "blocked_permanent_rerender_under_v3_required",
    );
    assert.equal(row.fallback.runtimeWiringEligibility, "blocked");
    assert.equal(row.fallback.deploymentEligibility, "blocked");
    if (
      ["quote_required", "care", "held", "coming", "shipping_service"].includes(
        row.journeyClass,
      )
    ) {
      assert.equal(row.purchaseImplication, "none");
    }
  }

  const unknownForms = coverageLedger.rows.filter(
    (row) => row.sourceForm === "Form not stated",
  );
  assert.equal(unknownForms.length, 29);
  const reviewedUnknownOverrides = unknownForms.filter(
    (row) => row.visualFormEvidence !== null,
  );
  assert.equal(reviewedUnknownOverrides.length, 2);
  assert.deepEqual(
    reviewedUnknownOverrides
      .map((row) => row.visualFormEvidence.canonicalSourceRow)
      .sort(),
    ["GRP-0425", "GRP-0426"],
  );
  assert(
    reviewedUnknownOverrides.every(
      (row) =>
        row.resolvedVisualForm === "Lyophilized Vial" &&
        row.formTaxonomy === "pending" &&
        row.fallback.taxonomyKey === "pending",
    ),
  );
  assert(
    unknownForms
      .filter((row) => row.visualFormEvidence === null)
      .every(
      (row) =>
        row.formTaxonomy === "pending" &&
        row.formFallback.taxonomyKey === "pending" &&
        ["pending", "care", "request"].includes(row.fallback.taxonomyKey) &&
        row.fallback.semanticClass.startsWith("non_product_") &&
        row.visualRestriction === "form_neutral_no_container_or_packaging",
      ),
  );

  const lyophilized = coverageLedger.rows.filter(
    (row) => row.resolvedVisualForm === "Lyophilized Vial",
  );
  assert(lyophilized.length > 0);
  assert(
    lyophilized.every(
      (row) =>
        row.formTaxonomy === "pending" &&
        row.formFallback.taxonomyKey === "pending" &&
        row.fallback.taxonomyKey !== "vial",
    ),
  );

  const containerAmbiguousLiquids = coverageLedger.rows.filter((row) =>
    ["Liquid", "Solution"].includes(row.resolvedVisualForm),
  );
  assert(containerAmbiguousLiquids.length > 0);
  assert(
    containerAmbiguousLiquids.every(
      (row) =>
        row.formTaxonomy === "pending" &&
        row.formFallback.taxonomyKey === "pending" &&
        row.fallback.taxonomyKey !== "liquid",
    ),
  );

  const excluded = coverageLedger.rows.filter(
    (row) => row.exposure === "excluded_shipping_service",
  );
  assert.deepEqual(
    excluded.map((row) => row.offeringId),
    ["mo_003b0c272099eeb1f114"],
  );
  assert.equal(excluded[0].assetRequired, false);
  assert.equal(excluded[0].journeyClass, "shipping_service");

  const fallbackBatch = renderQueue.batches.find(
    (batch) => batch.batchId === "fallback-batch-001",
  );
  const exactBatch = renderQueue.batches.find(
    (batch) => batch.batchId === "exact-variant-queue-001",
  );
  assert.equal(fallbackBatch.items.length, 10);
  assert.equal(exactBatch.items.length, 419);
  const targetFilenames = new Set();
  for (const item of exactBatch.items) {
    assert.equal(item.queueStatus, "pending");
    assert.equal(item.promptStatus, "draft_blocked_missing_founder_v3_prompt");
    assert.equal(item.mayRenderNow, false);
    assert(item.prompt.includes(item.offeringId));
    assert(item.prompt.includes(item.offeringVariantId));
    assert(!targetFilenames.has(item.targetFilenameTemplate));
    targetFilenames.add(item.targetFilenameTemplate);
    assert(
      /^xenios-mov_[a-f0-9]+-primary-v1-\{sha12\}\.webp$/.test(
        item.targetFilenameTemplate,
      ),
    );
  }

  return {
    ok: true,
    fallbackAssets: assetManifest.assets.length,
    canonicalRows: coverageLedger.rows.length,
    exposedRows: coverageLedger.invariants.exposedRows,
    exactRenderQueue: exactBatch.items.length,
    legacyFeaturedAliases: identityCrosswalk.invariants.legacyFeaturedAliasRows,
    exactQueueByPriority: renderQueue.counts.exactQueueByPriority,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  console.log(JSON.stringify(verifyRepository(), null, 2));
}
