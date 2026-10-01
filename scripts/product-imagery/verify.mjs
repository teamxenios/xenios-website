import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BATCH0_ASSET_MANIFEST_PATH,
  BATCH0_BROWSER_REVIEW_PAGE_PATH,
  BATCH0_BROWSER_REVIEW_RECORD_PATH,
  BATCH0_BROWSER_REVIEW_SCREENSHOT_PATH,
  BATCH0_CONTACT_SHEET_PATH,
  BATCH0_CONTACT_SHEET_RECORD_PATH,
  BATCH0_PROVENANCE_PATH,
  COVERAGE_LEDGER_PATH,
  COVERAGE_SUMMARY_PATH,
  FALLBACK_ASSET_MANIFEST_PATH,
  FOUNDER_V3_SPEC_SHA256,
  IDENTITY_CROSSWALK_PATH,
  RENDERER_PACKET_PATH,
  RENDER_QUEUE_PATH,
  STATE_AUTHORITY_AUDIT_PATH,
} from "./config.mjs";
import { BATCH0_JOBS, compileRendererPrompt, validateRendererJob } from "./batch0-config.mjs";
import {
  assertIdentityCrosswalkConsistency,
  buildArtifacts,
  inspectPngBytes,
  listForbiddenEvidenceCopiesInPublic,
  listPublicFallbackWebps,
  listPublicProductImages,
  listRuntimeEvidenceReferences,
  renderCoverageSummary,
  resolveCrosswalkManifestKey,
  sha256Bytes,
  sha256Text,
} from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FORBIDDEN_ROW_FIELDS = [
  "displayState",
  "workflowMode",
  "action",
  "price",
  "priceCents",
  "cartEligible",
  "sellable",
  "inventory",
  "formulationHold",
];

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function readBytes(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function expectedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertGeneratedFile(relativePath, expected) {
  assert.equal(read(relativePath), expected, `${relativePath} is stale; run build.mjs`);
}

function assertNoIdentityLeak(rendererPacket) {
  const identities = BATCH0_JOBS.map((job) => job.fixture.displayIdentity.toLowerCase());
  for (const packetJob of rendererPacket.rendererJobs) {
    const serialized = JSON.stringify(packetJob).toLowerCase();
    assert.equal(Object.hasOwn(packetJob, "fixture"), false);
    for (const identity of identities) {
      assert.equal(
        serialized.includes(identity),
        false,
        `${packetJob.jobId} renderer payload leaked fixture identity ${identity}`,
      );
    }
  }
}

function assertReviewEvidence(batch0AssetManifest) {
  const expectedInputs = batch0AssetManifest.assets.map((asset) => ({
    jobId: asset.jobId,
    outputSha256: asset.source.sha256,
    receiptSha256: asset.receiptSha256,
  }));
  const contactRecord = readJson(BATCH0_CONTACT_SHEET_RECORD_PATH);
  const contactBytes = readBytes(BATCH0_CONTACT_SHEET_PATH);
  const contactPng = inspectPngBytes(contactBytes, BATCH0_CONTACT_SHEET_PATH);
  assert.equal(contactRecord.repositoryPath, BATCH0_CONTACT_SHEET_PATH);
  assert.equal(contactRecord.sha256, sha256Bytes(contactBytes));
  assert.equal(contactRecord.byteSize, contactBytes.length);
  assert.deepEqual([contactPng.width, contactPng.height], [1200, 1200]);
  assert.deepEqual(
    contactRecord.inputs.map((input) => ({
      jobId: input.jobId,
      outputSha256: input.outputSha256,
      receiptSha256: input.receiptSha256,
    })),
    expectedInputs,
  );
  assert.equal(contactRecord.reviewState.independentNamedApproval, "pending");
  assert.equal(contactRecord.reviewState.publicRuntimeEligibility, "blocked");

  const browserRecord = readJson(BATCH0_BROWSER_REVIEW_RECORD_PATH);
  const pageBytes = readBytes(BATCH0_BROWSER_REVIEW_PAGE_PATH);
  const pageText = pageBytes.toString("utf8");
  const screenshotBytes = readBytes(BATCH0_BROWSER_REVIEW_SCREENSHOT_PATH);
  const screenshot = inspectPngBytes(
    screenshotBytes,
    BATCH0_BROWSER_REVIEW_SCREENSHOT_PATH,
  );
  assert.equal(browserRecord.reviewPage.repositoryPath, BATCH0_BROWSER_REVIEW_PAGE_PATH);
  assert.equal(browserRecord.reviewPage.sha256, sha256Bytes(pageBytes));
  assert.equal(browserRecord.screenshot.repositoryPath, BATCH0_BROWSER_REVIEW_SCREENSHOT_PATH);
  assert.equal(browserRecord.screenshot.sha256, sha256Bytes(screenshotBytes));
  assert.equal(browserRecord.screenshot.byteSize, screenshotBytes.length);
  assert.deepEqual([screenshot.width, screenshot.height], [1440, 3200]);
  assert.equal(browserRecord.result.passed, true);
  assert.equal(browserRecord.result.observedCount, 25);
  assert.equal(browserRecord.result.decodeFailures, 0);
  assert.equal(browserRecord.result.independentNamedApproval, "pending");
  assert.equal(browserRecord.result.publicRuntimeEligibility, "blocked");
  assert.deepEqual(
    browserRecord.observations.map((observation) => ({
      jobId: observation.jobId,
      outputSha256: observation.outputSha256,
      naturalWidth: observation.naturalWidth,
      naturalHeight: observation.naturalHeight,
      complete: observation.complete,
    })),
    expectedInputs.map((input) => ({
      jobId: input.jobId,
      outputSha256: input.outputSha256,
      naturalWidth: 1254,
      naturalHeight: 1254,
      complete: true,
    })),
  );
  for (const asset of batch0AssetManifest.assets) {
    assert(pageText.includes(path.basename(asset.repositoryPath)));
    assert(pageText.includes(asset.source.sha256));
  }
}

export function verifyRepository() {
  const artifacts = buildArtifacts();
  const {
    metadata,
    assetManifest,
    batch0AssetManifest,
    batch0Provenance,
    rendererPacket,
    renderQueue,
    coverageLedger,
    identityCrosswalk,
    stateAuthorityAudit,
  } = artifacts;

  assert.equal(metadata.founderSpec.sha256, FOUNDER_V3_SPEC_SHA256);
  assert.equal(coverageLedger.rows.length, 424);
  assert.equal(coverageLedger.invariants.reviewedSourceRows, 426);
  assert.equal(coverageLedger.invariants.supersededSourceRows, 2);
  assert.equal(coverageLedger.invariants.publicAssetsWired, 0);
  assert.equal(stateAuthorityAudit.currentlyMounted.canonicalRows, 420);
  assert.equal(stateAuthorityAudit.currentlyMounted.exposedRows, 419);
  assert.equal(stateAuthorityAudit.reviewedTarget.canonicalRows, 424);
  assert.equal(stateAuthorityAudit.reviewedTarget.exposedRows, 423);
  assert.equal(stateAuthorityAudit.reviewedTarget.exactCurrentIdentityRows, 418);
  assert.equal(stateAuthorityAudit.reviewedTarget.reviewedIdentityReplacementRows, 2);
  assert.equal(stateAuthorityAudit.reviewedTarget.genuineNewIdentityRows, 4);
  assert.equal(stateAuthorityAudit.reviewedTarget.careRows, 242);
  assert.equal(stateAuthorityAudit.reviewedTarget.structuredFormulationHoldRows, 1);
  assert.deepEqual(
    stateAuthorityAudit.reviewedTarget.structuredFormulationHoldGroupIds,
    ["GRP-0422"],
  );
  assert.equal(stateAuthorityAudit.reviewedTarget.priceOnRequestRows, 2);
  assert.equal(stateAuthorityAudit.reviewedTarget.catalogComingSoonRows, 0);
  assert.equal(stateAuthorityAudit.reviewedTarget.separateComingSoonOffersIntended, 2);
  assert.equal(stateAuthorityAudit.materializationGap.targetMaterialized, false);

  for (const row of coverageLedger.rows) {
    for (const field of FORBIDDEN_ROW_FIELDS) {
      assert.equal(Object.hasOwn(row, field), false, `${row.groupId} owns ${field}`);
    }
    assert.equal(row.exactAsset, null);
    assert.equal(row.classCandidate.publicPath, null);
  }

  assert.equal(identityCrosswalk.invariants.canonicalEntries, 424);
  assert.equal(identityCrosswalk.invariants.exactCurrentBindings, 415);
  assert.equal(identityCrosswalk.invariants.targetBindingsNotMaterialized, 9);
  assert.equal(identityCrosswalk.invariants.historicalForwardAliases, 2);
  assert.equal(identityCrosswalk.invariants.legacyFeaturedAliases, 22);
  assert.equal(identityCrosswalk.invariants.supersededManifestOwners, 0);
  assert.equal(assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger), true);

  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      groupId: "GRP-0402",
      offeringVariantId: "mov_7c55d415a9574e9ebda7",
      productControlVariantId: "5c705967-53dc-4fd0-9a35-c3c51abf937a",
    }),
    "mov_3c8ca424d78153fd931a",
  );
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      groupId: "GRP-0407",
      offeringVariantId: "mov_256cb0423eb6d2a77f65",
      productControlVariantId: "ed16b4d7-7a0e-4f34-a01f-b81966aac0b0",
    }),
    "mov_c26ef47dfbbe46f7e090",
  );

  assert.deepEqual(listPublicFallbackWebps(), []);
  assert.deepEqual(listPublicProductImages(), []);
  assert.deepEqual(listForbiddenEvidenceCopiesInPublic(), []);
  assert.deepEqual(listRuntimeEvidenceReferences(), []);
  assert.equal(assetManifest.counts.quarantined, 10);
  assert.equal(assetManifest.counts.public, 0);
  assert.equal(assetManifest.counts.approvable, 0);
  assert(
    assetManifest.assets.every(
      (asset) =>
        asset.publicPath === null &&
        asset.reviewStatus === "rejected_requires_v3_rerender" &&
        asset.runtimeWiringEligibility === "blocked" &&
        asset.deploymentEligibility === "blocked",
    ),
  );

  assert.equal(BATCH0_JOBS.length, 25);
  assert.equal(rendererPacket.rendererJobs.length, 25);
  assert.equal(Object.hasOwn(rendererPacket, "provenanceRecords"), false);
  assert.equal(batch0Provenance.provenanceRecords.length, 25);
  assert.equal(batch0Provenance.rendererJobSetSha256, rendererPacket.rendererJobSetSha256);
  assert.equal(
    batch0Provenance.rendererPacketSemanticSha256,
    sha256Text(JSON.stringify(rendererPacket)),
  );
  assert.deepEqual(
    batch0Provenance.provenanceRecords.map((record) => record.jobId),
    rendererPacket.rendererJobs.map((job) => job.jobId),
  );
  assert.equal(rendererPacket.counts.namedProductPrompts, 0);
  assert.equal(renderQueue.exactNamedVariantQueueRemoved, true);
  assert.equal(renderQueue.counts.items, 25);
  assert.equal(batch0AssetManifest.counts.jobs, 25);
  assert.equal(batch0AssetManifest.counts.rendered, 25);
  assert.equal(batch0AssetManifest.counts.attributed, 25);
  assert.equal(batch0AssetManifest.counts.renderedMissingReceipt, 0);
  assert.equal(batch0AssetManifest.counts.pending, 0);
  assert.equal(batch0AssetManifest.counts.public, 0);
  assert.equal(batch0AssetManifest.counts.approved, 0);
  assert.equal(
    batch0AssetManifest.counts.rendered + batch0AssetManifest.counts.pending,
    25,
  );
  for (const job of BATCH0_JOBS) {
    assert.equal(validateRendererJob(job), true);
    assert.equal(typeof compileRendererPrompt(job), "string");
  }
  assertNoIdentityLeak(rendererPacket);
  for (const asset of batch0AssetManifest.assets.filter((value) => value.source)) {
    assert.equal(asset.source.format, "PNG");
    assert.equal(asset.source.width, asset.source.height);
    assert(asset.source.width >= 1024);
    assert.equal(asset.source.sha256.length, 64);
    assert.equal(asset.receipt.outputSha256, asset.source.sha256);
    assert.equal(asset.receipt.byteSize, asset.source.byteSize);
    assert.equal(asset.receipt.repositoryPath, asset.repositoryPath);
    assert(
      asset.repositoryPath.endsWith(`-sha256-${asset.source.sha256.slice(0, 12)}.png`),
    );
    assert.equal(asset.receipt.publicationStatus, "not_authorized_pending_independent_review");
    assert.equal(asset.publicPath, null);
    assert.equal(asset.reviewStatus, "awaiting_independent_named_approval");
  }
  assertReviewEvidence(batch0AssetManifest);

  assertGeneratedFile(FALLBACK_ASSET_MANIFEST_PATH, expectedJson(assetManifest));
  assertGeneratedFile(COVERAGE_LEDGER_PATH, expectedJson(coverageLedger));
  assertGeneratedFile(IDENTITY_CROSSWALK_PATH, expectedJson(identityCrosswalk));
  assertGeneratedFile(RENDER_QUEUE_PATH, expectedJson(renderQueue));
  assertGeneratedFile(RENDERER_PACKET_PATH, expectedJson(rendererPacket));
  assertGeneratedFile(BATCH0_PROVENANCE_PATH, expectedJson(batch0Provenance));
  assertGeneratedFile(STATE_AUTHORITY_AUDIT_PATH, expectedJson(stateAuthorityAudit));
  assertGeneratedFile(BATCH0_ASSET_MANIFEST_PATH, expectedJson(batch0AssetManifest));
  assertGeneratedFile(COVERAGE_SUMMARY_PATH, renderCoverageSummary(artifacts));

  return {
    ok: true,
    reviewedSourceRows: coverageLedger.invariants.reviewedSourceRows,
    canonicalRows: coverageLedger.invariants.canonicalRows,
    mountedRows: stateAuthorityAudit.currentlyMounted.canonicalRows,
    targetExposedRows: stateAuthorityAudit.reviewedTarget.exposedRows,
    quarantinedPreV3Assets: assetManifest.counts.quarantined,
    batch0Jobs: batch0AssetManifest.counts.jobs,
    batch0Rendered: batch0AssetManifest.counts.rendered,
    batch0Pending: batch0AssetManifest.counts.pending,
    publicAssets: batch0AssetManifest.counts.public,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) console.log(JSON.stringify(verifyRepository(), null, 2));
