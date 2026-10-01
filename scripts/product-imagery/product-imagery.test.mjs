import assert from "node:assert/strict";
import test from "node:test";

import { BATCH0_JOBS, compileRendererPrompt, validateRendererJob } from "./batch0-config.mjs";
import { buildReviewedCatalogProjection, gitTextBlobOid } from "./catalog-v3.mjs";
import {
  assertIdentityCrosswalkConsistency,
  buildArtifacts,
  listPublicFallbackWebps,
  listPublicProductImages,
  listRuntimeEvidenceReferences,
  resolveCrosswalkManifestKey,
  resolveProductImage,
  validateBatch0FixtureJoin,
} from "./lib.mjs";
import { verifyRepository } from "./verify.mjs";

const FORBIDDEN_COVERAGE_FIELDS = new Set([
  "displayState",
  "workflowMode",
  "action",
  "price",
  "priceCents",
  "cartEligible",
  "sellable",
  "inventory",
  "formulationHold",
]);

test("projects the reviewed 426 rows to 424 identity-and-form-only rows", () => {
  const projection = buildReviewedCatalogProjection();
  assert.equal(projection.sourceRowCount, 426);
  assert.equal(projection.canonicalRowCount, 424);
  assert.equal(projection.runtimeCatalogAuthority, false);
  for (const row of projection.rows) {
    for (const field of FORBIDDEN_COVERAGE_FIELDS) {
      assert.equal(Object.hasOwn(row, field), false, `${row.groupId} owns ${field}`);
    }
  }

  const oxytocin = projection.rows.find((row) => row.groupId === "GRP-0425");
  const hexarelin = projection.rows.find((row) => row.groupId === "GRP-0426");
  assert.deepEqual(
    [oxytocin.offeringVariantId, oxytocin.sourceGroupIds],
    ["mov_c26ef47dfbbe46f7e090", ["GRP-0425", "GRP-0407"]],
  );
  assert.deepEqual(
    [hexarelin.offeringVariantId, hexarelin.sourceGroupIds],
    ["mov_3c8ca424d78153fd931a", ["GRP-0426", "GRP-0402"]],
  );
  assert.equal(projection.rows.some((row) => row.groupId === "GRP-0402"), false);
  assert.equal(projection.rows.some((row) => row.groupId === "GRP-0407"), false);
});

test("separates mounted 420/419 truth from the reviewed 424/423 target", () => {
  const { stateAuthorityAudit } = buildArtifacts();
  assert.deepEqual(
    [
      stateAuthorityAudit.currentlyMounted.canonicalRows,
      stateAuthorityAudit.currentlyMounted.exposedRows,
      stateAuthorityAudit.reviewedTarget.canonicalRows,
      stateAuthorityAudit.reviewedTarget.exposedRows,
    ],
    [420, 419, 424, 423],
  );
  assert.equal(stateAuthorityAudit.authority.imageSystemOwnsBusinessState, false);
  assert.equal(stateAuthorityAudit.reviewedTarget.exactCurrentIdentityRows, 418);
  assert.equal(stateAuthorityAudit.reviewedTarget.reviewedIdentityReplacementRows, 2);
  assert.equal(stateAuthorityAudit.reviewedTarget.genuineNewIdentityRows, 4);
  assert.equal(stateAuthorityAudit.reviewedTarget.careRows, 242);
  assert.deepEqual(
    stateAuthorityAudit.reviewedTarget.structuredFormulationHoldGroupIds,
    ["GRP-0422"],
  );
  assert.equal(stateAuthorityAudit.reviewedTarget.priceOnRequestRows, 2);
  assert.equal(stateAuthorityAudit.reviewedTarget.catalogComingSoonRows, 0);
  assert.equal(stateAuthorityAudit.reviewedTarget.separateComingSoonOffersIntended, 2);
  assert.equal(stateAuthorityAudit.materializationGap.targetMaterialized, false);
});

test("builds a 424-row coverage ledger with no business-state authority", () => {
  const { coverageLedger } = buildArtifacts();
  assert.equal(coverageLedger.rows.length, 424);
  assert.equal(coverageLedger.invariants.reviewedSourceRows, 426);
  assert.equal(coverageLedger.invariants.rowsWithBusinessStateFields, 0);
  assert.equal(coverageLedger.invariants.rowsWithPriceFields, 0);
  assert.equal(coverageLedger.invariants.publicAssetsWired, 0);
  assert.equal(
    coverageLedger.rows.filter((row) => row.dosageForm === "Form not stated").length,
    27,
  );
  for (const row of coverageLedger.rows) {
    assert.equal(row.manifestKey, row.offeringVariantId);
    assert.equal(row.exactAsset, null);
    assert.equal(row.classCandidate.publicPath, null);
    for (const field of FORBIDDEN_COVERAGE_FIELDS) {
      assert.equal(Object.hasOwn(row, field), false, `${row.groupId} owns ${field}`);
    }
  }
});

test("converges canonical, Product Control, legacy, and Hex/Oxy forward identities", () => {
  const { coverageLedger, identityCrosswalk } = buildArtifacts();
  assert.equal(identityCrosswalk.invariants.canonicalEntries, 424);
  assert.equal(identityCrosswalk.invariants.exactCurrentBindings, 415);
  assert.equal(identityCrosswalk.invariants.targetBindingsNotMaterialized, 9);
  assert.equal(identityCrosswalk.invariants.historicalForwardAliases, 2);
  assert.equal(identityCrosswalk.invariants.legacyFeaturedAliases, 22);
  assert.equal(identityCrosswalk.invariants.supersededManifestOwners, 0);
  assert.equal(assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger), true);

  const cases = [
    {
      kept: "mov_3c8ca424d78153fd931a",
      old: {
        groupId: "GRP-0402",
        offeringVariantId: "mov_7c55d415a9574e9ebda7",
        productControlVariantId: "5c705967-53dc-4fd0-9a35-c3c51abf937a",
      },
    },
    {
      kept: "mov_c26ef47dfbbe46f7e090",
      old: {
        groupId: "GRP-0407",
        offeringVariantId: "mov_256cb0423eb6d2a77f65",
        productControlVariantId: "ed16b4d7-7a0e-4f34-a01f-b81966aac0b0",
      },
    },
  ];
  for (const value of cases) {
    assert.equal(
      resolveCrosswalkManifestKey(identityCrosswalk, value.old),
      value.kept,
    );
    assert.equal(
      resolveCrosswalkManifestKey(identityCrosswalk, { offeringVariantId: value.kept }),
      value.kept,
    );
  }
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      offeringVariantId: cases[0].kept,
      productControlVariantId: cases[1].old.productControlVariantId,
    }),
    null,
  );
});

test("keeps all 25 renderer payloads generic and fixture identity physically separate", () => {
  const { rendererPacket, batch0Provenance, renderQueue } = buildArtifacts();
  assert.equal(BATCH0_JOBS.length, 25);
  assert.equal(rendererPacket.rendererJobs.length, 25);
  assert.equal(Object.hasOwn(rendererPacket, "provenanceRecords"), false);
  assert.equal(batch0Provenance.provenanceRecords.length, 25);
  assert.equal(rendererPacket.counts.namedProductPrompts, 0);
  assert.equal(renderQueue.exactNamedVariantQueueRemoved, true);
  assert.equal(renderQueue.counts.items, 25);

  const fixtureNames = BATCH0_JOBS.map((job) => job.fixture.displayIdentity.toLowerCase());
  for (const job of BATCH0_JOBS) {
    assert.equal(validateRendererJob(job), true);
    const prompt = compileRendererPrompt(job).toLowerCase();
    for (const fixtureName of fixtureNames) {
      assert.equal(prompt.includes(fixtureName), false, `${job.jobId} leaked ${fixtureName}`);
    }
    const packetJob = rendererPacket.rendererJobs.find((item) => item.jobId === job.jobId);
    assert.equal(Object.hasOwn(packetJob, "fixture"), false);
    assert.equal(JSON.stringify(packetJob).includes(job.fixture.displayIdentity), false);
  }
});

test("rejects sanitizer extension, duplicate QA IDs, and mismatched fixture identities", () => {
  const extended = structuredClone(BATCH0_JOBS[0]);
  extended.rendererPayload.forbiddenObjects.push("Hexarelin");
  assert.throws(() => validateRendererJob(extended));

  const duplicateQa = structuredClone(BATCH0_JOBS[21]);
  duplicateQa.fixture.qaGroupIds.push("GRP-0422");
  assert.throws(() => validateRendererJob(duplicateQa));

  const mismatched = structuredClone(BATCH0_JOBS);
  mismatched[0].fixture.movId = "mov_c26ef47dfbbe46f7e090";
  assert.throws(() =>
    validateBatch0FixtureJoin(buildReviewedCatalogProjection(), mismatched),
  );
});

test("normalizes Git text identity across LF and CRLF checkouts", () => {
  assert.equal(gitTextBlobOid(Buffer.from("one\ntwo\n")), gitTextBlobOid(Buffer.from("one\r\ntwo\r\n")));
});

test("quarantines all ten pre-v3 WebPs outside public and preserves exact hashes", () => {
  const { assetManifest } = buildArtifacts();
  assert.equal(assetManifest.counts.quarantined, 10);
  assert.equal(assetManifest.counts.public, 0);
  assert.equal(assetManifest.counts.approvable, 0);
  assert.deepEqual(listPublicFallbackWebps(), []);
  assert.deepEqual(listPublicProductImages(), []);
  assert.deepEqual(listRuntimeEvidenceReferences(), []);
  assert(
    assetManifest.assets.every(
      (asset) =>
        asset.publicPath === null &&
        asset.repositoryPath.startsWith("docs/product-imagery/evidence/pre-v3-nonapprovable/") &&
        asset.sha256.length === 64 &&
        asset.deploymentEligibility === "blocked",
    ),
  );
});

test("resolver remains presentation-only and returns no image before named approval", () => {
  const { coverageLedger, identityCrosswalk } = buildArtifacts();
  const row = coverageLedger.rows[0];
  const none = resolveProductImage({
    identityCrosswalk,
    coverageLedger,
    identity: { offeringVariantId: row.offeringVariantId },
    runtimePresentationState: "care_pathway",
  });
  assert.deepEqual(none, {
    status: "intentional_no_image_until_named_approval",
    manifestKey: row.manifestKey,
    image: null,
  });

  const approved = {
    assetId: "approved-care",
    imageClass: "care_pathway_neutral",
    reviewStatus: "approved",
    sha256: "a".repeat(64),
    publicPath: "/research/products/approved-care-aaaaaaaaaaaa.webp",
    alt: "Abstract Care pathway visual.",
    width: 1024,
    height: 1024,
    approval: {
      namedApprover: "independent-reviewer",
      approvedAt: "2026-10-01T03:00:00.000Z",
      approvalRecord: "docs/review/exact-sha-review.md",
      exactSha256: "a".repeat(64),
    },
  };
  const exact = {
    ...approved,
    assetId: "approved-exact",
    imageClass: row.imageClass,
    manifestKey: row.manifestKey,
    sha256: "b".repeat(64),
    publicPath: "/research/products/approved-exact-bbbbbbbbbbbb.webp",
    approval: { ...approved.approval, exactSha256: "b".repeat(64) },
  };
  const resolved = resolveProductImage({
    identityCrosswalk,
    coverageLedger,
    approvedAssets: [exact, approved],
    identity: { groupId: row.groupId },
    runtimePresentationState: "care_pathway",
  });
  assert.equal(resolved.status, "approved_image");
  assert.equal(resolved.image.src, approved.publicPath);
  assert.equal(Object.hasOwn(resolved, "action"), false);
  assert.equal(Object.hasOwn(resolved, "workflowMode"), false);

  const invalidState = resolveProductImage({
    identityCrosswalk,
    coverageLedger,
    approvedAssets: [approved],
    identity: { groupId: row.groupId },
    runtimePresentationState: "buy_now",
  });
  assert.equal(invalidState.status, "invalid_external_presentation_state");

  const forged = resolveProductImage({
    identityCrosswalk,
    coverageLedger,
    approvedAssets: [{ ...approved, publicPath: "https://evil.example/image.webp" }],
    identity: { groupId: row.groupId },
    runtimePresentationState: "care_pathway",
  });
  assert.equal(forged.status, "intentional_no_image_until_named_approval");
});

test("checked-in v3 manifests and evidence are deterministic", () => {
  assert.equal(verifyRepository().ok, true);
});
