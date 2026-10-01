import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  CORE_SOURCE_SHA,
  CORE_SOURCE_TREE,
  EXPECTED_CANONICAL_ROWS,
  EXPECTED_CUSTOMER_ROWS,
  IMAGERY_REVIEWER_TIP_SHA,
  PROTOTYPE_REVIEW_SHA,
  REJECTED_BATCH0_JOB_IDS,
  SHIPPING_GROUP_ID,
  buildFounderPreviewData,
} from "./build-founder-preview.mjs";
import { startFounderPreviewServer } from "./serve-founder-preview.mjs";

const REPO_ROOT = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const PREVIEW_ROOT = join(REPO_ROOT, "docs/product-imagery/founder-preview");

test("builds the pinned 424-to-423 private preview without commerce authority", () => {
  const data = buildFounderPreviewData();
  assert.equal(data.sources.coreCatalog.commit, CORE_SOURCE_SHA);
  assert.equal(data.sources.coreCatalog.tree, CORE_SOURCE_TREE);
  assert.equal(data.counts.canonicalVariants, EXPECTED_CANONICAL_ROWS);
  assert.equal(data.counts.customerTargets, EXPECTED_CUSTOMER_ROWS);
  assert.equal(data.rows.length, EXPECTED_CUSTOMER_ROWS);
  assert.equal(data.runtimeAuthority, false);
  assert.equal(data.publicationAuthority, false);
  assert.equal(data.commerceAuthority, false);
  assert.equal(data.pricingAuthority, false);
  assert.equal(data.deploymentAuthorized, false);
  assert.equal(data.sources.coreCatalog.independentAcceptance, false);
  assert.equal(data.sources.imageryReviewTarget.exactPerAssetDecisionReceived, true);
  assert.equal(data.sources.imageryReviewTarget.publicApprovalReceived, false);
  assert.equal(data.sources.imageryReviewTarget.reviewerTipCommit, IMAGERY_REVIEWER_TIP_SHA);
  assert.equal(data.sources.imageryReviewTarget.prototypeReviewCommit, PROTOTYPE_REVIEW_SHA);
  assert.equal(data.sources.mediaCommerceCandidate.acceptedForIntegration, false);
  assert.ok(!data.rows.some((row) => row.canonicalId === SHIPPING_GROUP_ID));
  assert.equal(new Set(data.rows.map((row) => row.manifestKey)).size, 423);
});

test("applies the exact reviewer substitutions without exposing a rejected Batch 0 asset", () => {
  const data = buildFounderPreviewData();
  const care = data.rows.filter((row) => row.pathway.key === "care");
  const supplementRetail = data.rows.filter(
    (row) => row.imageClass === "supplement_retail_unit_neutral",
  );
  const aceticAcid = data.rows.find((row) => row.canonicalId === "GRP-0362");
  const lyophilizedGhkCu = data.rows.filter(
    (row) =>
      row.imageClass === "peptide_lyophilized_vial" &&
      /GHK[\s-]?Cu/i.test(`${row.name} ${row.specification}`),
  );

  assert.equal(care.length, 242);
  assert.equal(supplementRetail.length, 20);
  assert.equal(lyophilizedGhkCu.length, 6);
  assert.ok(care.every((row) => row.image.jobId === "calibration-04-care-state"));
  assert.ok(
    supplementRetail.every((row) => row.image.jobId === "calibration-06-unverified-identity"),
  );
  assert.equal(aceticAcid.image.jobId, "calibration-06-unverified-identity");
  assert.ok(
    lyophilizedGhkCu.every((row) => row.image.jobId === "calibration-06-unverified-identity"),
  );
  assert.equal(data.counts.reviewerDirectedNeutralSlots, 269);
  assert.equal(data.counts.rejectedBatch0AssetSlots, 0);
  assert.equal(data.counts.calibrationRenders, 6);
  assert.equal(data.counts.calibrationVisualSlots, 423);
  assert.equal(data.counts.batch0VisualSlots, 0);
  assert.equal(
    new Set(
      data.rows
        .filter((row) => row.image.sourceLane === "private_calibration")
        .map((row) => row.image.jobId),
    ).size,
    6,
  );
  assert.ok(data.rows.every((row) => !REJECTED_BATCH0_JOB_IDS.has(row.image.jobId)));
  assert.ok(data.rows.every((row) => row.image.sourceLane === "private_calibration"));
});

test("gives every customer target a safe, non-public provisional slot", () => {
  const data = buildFounderPreviewData();
  assert.equal(data.counts.finalExactAssets, 0);
  assert.equal(data.counts.provisionalVisualSlots, 423);
  assert.equal(data.counts.fallbackOnlySlots, 0);
  assert.equal(data.counts.missingExactRenders, 423);
  for (const row of data.rows) {
    assert.equal(row.finality, "provisional");
    assert.equal(row.exactRenderMissing, true);
    assert.equal(row.image.visualState, "provisional");
    assert.equal(row.image.reviewStatus, "awaiting_independent_named_approval");
    assert.equal(row.image.publicationStatus, "private_preview_only_not_publication_approved");
    assert.match(row.image.repositoryPath, /^docs\/product-imagery\/evidence\//);
    assert.doesNotMatch(row.image.repositoryPath, /^client\/public\//);
    assert.ok(existsSync(join(REPO_ROOT, row.image.repositoryPath)));
    assert.ok(row.name.length > 0);
    assert.ok(row.specification.length > 0);
    assert.ok(row.pathway.price.length > 0);
    assert.ok(row.pathway.cta.length > 0);
  }
});

test("preserves special pathways and honest non-transaction states", () => {
  const data = buildFounderPreviewData();
  assert.deepEqual(
    {
      care: data.counts.care,
      research: data.counts.research,
      held: data.counts.held,
      quote: data.counts.quoteOnly,
      pending: data.counts.bindingPending,
    },
    { care: 242, research: 173, held: 1, quote: 2, pending: 5 },
  );
  const held = data.rows.find((row) => row.canonicalId === "GRP-0422");
  const quoteOne = data.rows.find((row) => row.canonicalId === "GRP-0244");
  const quoteTwo = data.rows.find((row) => row.canonicalId === "GRP-0365");
  assert.equal(held.pathway.key, "held");
  assert.equal(held.image.assetImageClass, "held_neutral");
  assert.equal(quoteOne.pathway.key, "quote");
  assert.equal(quoteTwo.pathway.key, "quote");
  assert.equal(quoteOne.pathway.price, "Price on request");
  assert.equal(quoteTwo.pathway.price, "Price on request");
  assert.deepEqual(
    data.comingSoon.map((item) => ({ name: item.name, price: item.price, checkout: item.checkout })),
    [
      { name: "Superpower", price: null, checkout: false },
      { name: "Mito Health", price: null, checkout: false },
    ],
  );
});

test("prepares exactly 22 Featured owners plus three deterministic diversity jobs", () => {
  const data = buildFounderPreviewData();
  assert.equal(data.batch1.length, 25);
  assert.equal(new Set(data.batch1.map((job) => job.manifestKey)).size, 25);
  assert.ok(data.batch1.slice(0, 22).every((job) => /Featured/.test(job.priorityReason)));
  assert.deepEqual(
    data.batch1.slice(22).map((job) => job.canonicalId),
    ["GRP-0243", "GRP-0362", "GRP-0366"],
  );
  assert.ok(data.batch1.every((job) => job.renderAuthorization === false));
  assert.ok(data.batch1.every((job) => job.publicationAuthorization === false));
  assert.ok(data.batch1.every((job) => job.status === "prepared_not_authorized_to_render"));
});

test("keeps the six-study calibration private and blocked from publication or Batch 1", () => {
  const plan = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "docs/product-imagery/manifests/global-art-direction-calibration-prepared.json",
      ),
      "utf8",
    ),
  );
  assert.equal(plan.count, 6);
  assert.equal(plan.requiredBeforeBatch1, true);
  assert.equal(plan.privateInternalRenderAuthorization, true);
  assert.equal(plan.calibrationRendered, true);
  assert.equal(plan.calibrationApproved, false);
  assert.equal(plan.batch1RenderAuthorization, false);
  assert.equal(plan.publicationAuthorization, false);
  assert.equal(plan.runtimeIntegrationAuthorization, false);
  assert.deepEqual(
    plan.studies.map((study) => study.archetype),
    [
      "lyophilized_vial_form_study",
      "capsule_tablet_bottle_form_study",
      "topical_form_study",
      "care_pathway_state_study",
      "held_or_quote_only_state_study",
      "unknown_unverified_packaging_state_study",
    ],
  );
  assert.ok(plan.studies.every((study) => study.useInPrivatePrototypeAuthorized === true));
  assert.ok(plan.studies.every((study) => study.publicationAuthorization === false));
  assert.ok(plan.studies.every((study) => study.runtimeIntegrationAuthorization === false));
  assert.ok(plan.studies.every((study) => study.promptStatus === "rendered_from_frozen_prompt"));
  assert.ok(plan.sharedDirection.globalAvoid.includes("botanical or spa cues"));
});

test("leads the founder home with calibration while retaining Batch 0 as evidence", () => {
  const data = buildFounderPreviewData();
  const previewSource = readFileSync(join(PREVIEW_ROOT, "preview.js"), "utf8");
  assert.equal(
    data.calibration.contactSheet.src,
    "/evidence/calibration-contact-sheet-sha256-017cffad1438.png",
  );
  assert.equal(
    data.batch0ContactSheet.src,
    "/evidence/batch0-contact-sheet-sha256-02bcd3fa1fb3.png",
  );
  assert.match(previewSource, /data\.calibration\.contactSheet\.src/);
  assert.doesNotMatch(previewSource, /src="\$\{esc\(data\.batch0ContactSheet\.src\)\}"/);
  assert.match(previewSource, /private visual source job/);
});

test("records structural C2PA provenance for all six private calibration PNGs", () => {
  const provenance = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "docs/product-imagery/manifests/global-art-direction-calibration-c2pa-provenance.json",
      ),
      "utf8",
    ),
  );
  const receipts = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "docs/product-imagery/evidence/calibration-render-receipts.json",
      ),
      "utf8",
    ),
  );
  const receiptShaByJob = new Map(
    receipts.observations.map((observation) => [observation.jobId, observation.outputSha256]),
  );
  assert.equal(provenance.extraction.officialC2paValidatorUsed, false);
  assert.match(provenance.extraction.authority, /not_cryptographic_validation/);
  assert.equal(provenance.summary.assets, 6);
  assert.equal(provenance.summary.caBxPresent, 6);
  assert.equal(provenance.summary.sha256MatchesReceipts, 6);
  assert.equal(provenance.summary.uniqueInstanceIds, 6);
  assert.equal(provenance.summary.publicOrPublicationApproval, false);
  assert.ok(
    provenance.assets.every(
      (asset) =>
        asset.outputSha256 === receiptShaByJob.get(asset.jobId) &&
        asset.generator.name === "ChatGPT" &&
        asset.generator.model === "gpt-image",
    ),
  );
});

test("records structural C2PA provenance for all 25 Batch 0 PNGs", () => {
  const provenance = JSON.parse(
    readFileSync(
      join(REPO_ROOT, "docs/product-imagery/manifests/batch-000-c2pa-provenance.json"),
      "utf8",
    ),
  );
  const receipts = JSON.parse(
    readFileSync(
      join(REPO_ROOT, "docs/product-imagery/evidence/batch0-render-receipts.json"),
      "utf8",
    ),
  );
  const receiptShaByJob = new Map(
    receipts.observations.map((observation) => [observation.jobId, observation.outputSha256]),
  );
  assert.equal(provenance.extraction.officialC2paValidatorUsed, false);
  assert.match(provenance.extraction.authority, /not_cryptographic_validation/);
  assert.equal(provenance.summary.assets, 25);
  assert.equal(provenance.summary.caBxPresent, 25);
  assert.equal(provenance.summary.sha256MatchesReceipts, 25);
  assert.equal(provenance.summary.uniqueInstanceIds, 25);
  assert.equal(provenance.summary.generatorName, "ChatGPT");
  assert.equal(provenance.summary.generatorModel, "gpt-image");
  assert.equal(provenance.summary.publicOrPublicationApproval, false);
  assert.equal(new Set(provenance.assets.map((asset) => asset.instanceId)).size, 25);
  assert.ok(
    provenance.assets.every(
      (asset) =>
        asset.outputSha256 === receiptShaByJob.get(asset.jobId) &&
        asset.generator.name === "ChatGPT" &&
        asset.generator.model === "gpt-image" &&
        asset.embeddedRfc3161Timestamp.iso.startsWith("2026-10-01T"),
    ),
  );
  assert.equal(provenance.job19Observation.receiptMinusCreatedMs, "592529.415118");
});

test("records responsive browser proof for each reviewer-directed substitution class", () => {
  const evidence = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "docs/product-imagery/evidence/founder-preview/founder-preview-browser-evidence.json",
      ),
      "utf8",
    ),
  );
  const capturesByName = new Map(evidence.captures.map((capture) => [capture.name, capture]));
  const expected = [
    ["review-fix-acetic-acid-detail-desktop", "GRP-0362"],
    ["review-fix-ghk-cu-detail-desktop", "GRP-0287"],
    ["review-fix-supplement-detail-desktop", "GRP-0366"],
  ];
  assert.equal(evidence.counts.captures, 45);
  assert.equal(evidence.counts.gridCanonicalIdsCovered, 423);
  assert.equal(evidence.counts.brokenImages, 0);
  assert.equal(evidence.counts.severeConsoleMessages, 0);
  assert.equal(evidence.counts.networkBoundaryViolations, 0);
  for (const [name, canonicalId] of expected) {
    const capture = capturesByName.get(name);
    assert.ok(capture, `Missing reviewer-fix capture ${name}`);
    assert.equal(capture.detailCanonicalId, canonicalId);
    assert.equal(capture.detailAssetJob, "calibration-06-unverified-identity");
    assert.equal(capture.assertions.horizontalOverflow, false);
  }
});

test("keeps the preview static, local, noindex, and free of live forms", () => {
  for (const file of [
    "index.html",
    "wireframe.html",
    "catalog-review.html",
    "product-detail.html",
    "calibration.html",
  ]) {
    const source = readFileSync(join(PREVIEW_ROOT, file), "utf8");
    assert.match(source, /noindex/);
    assert.doesNotMatch(source, /<form\b/i);
    assert.doesNotMatch(source, /https?:\/\//i);
    assert.doesNotMatch(source, /[\u2014\u2013]/);
  }
  for (const file of ["preview.css", "preview.js"]) {
    const source = readFileSync(join(PREVIEW_ROOT, file), "utf8");
    assert.doesNotMatch(source, /https?:\/\//i);
    assert.doesNotMatch(source, /[\u2014\u2013]/);
  }
});

test("serves only the product-imagery tree with a deny-by-default browser policy", async (context) => {
  const preview = await startFounderPreviewServer({ port: 0 });
  context.after(() => preview.close());
  const page = await fetch(`${preview.origin}/founder-preview/index.html`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /connect-src 'none'/);
  assert.match(page.headers.get("x-robots-tag"), /noindex/);
  assert.match(await page.text(), /Private founder prototype/);
  const dataResponse = await fetch(`${preview.origin}/founder-preview/catalog-data.json`);
  assert.equal(dataResponse.status, 200);
  assert.equal((await dataResponse.json()).rows.length, 423);
  const traversal = await fetch(`${preview.origin}/%2e%2e%2fpackage.json`);
  assert.equal(traversal.status, 404);
  const post = await fetch(`${preview.origin}/founder-preview/index.html`, { method: "POST" });
  assert.equal(post.status, 405);
});
