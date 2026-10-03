import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  CORE_SOURCE_SHA,
  CORE_SOURCE_TREE,
  CORE_UI_REFERENCE_SHA,
  CORE_UI_REFERENCE_TREE,
  EXPECTED_CANONICAL_ROWS,
  EXPECTED_CUSTOMER_ROWS,
  IMAGERY_REVIEWER_TIP_SHA,
  PACKAGING_UNVERIFIED_WITNESS_ID,
  PROTOTYPE_REVIEW_SHA,
  REVIEWED_PREVIEW_RECORDS_SHA,
  REVIEWED_PREVIEW_SHA,
  REVIEWED_PREVIEW_TREE,
  REJECTED_BATCH0_JOB_IDS,
  SHIPPING_GROUP_ID,
  UI_FIDELITY_REVIEW_SHA,
  UI_FIDELITY_REVIEW_TREE,
  buildFounderPreviewData,
} from "./build-founder-preview.mjs";
import { startFounderPreviewServer } from "./serve-founder-preview.mjs";
import { buildThreeWayMatrix } from "./build-ui-convergence-matrix.mjs";

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
  const packagingUnverified = care.filter(
    (row) => row.imageClass === "packaging_unverified",
  );
  const ordinaryCare = care.filter(
    (row) => row.imageClass !== "packaging_unverified",
  );
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
  assert.equal(packagingUnverified.length, 4);
  assert.equal(ordinaryCare.length, 238);
  assert.equal(supplementRetail.length, 20);
  assert.equal(lyophilizedGhkCu.length, 6);
  assert.ok(ordinaryCare.every((row) => row.image.jobId === "calibration-04-care-state"));
  assert.ok(
    packagingUnverified.every(
      (row) => row.image.jobId === "calibration-06-unverified-identity",
    ),
  );
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

test("leads the founder home with frozen calibration while retaining Batch 0 as evidence", () => {
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
  assert.match(previewSource, /Six studies preserved exactly/);
  assert.match(previewSource, /0 Batch 1 render authorizations/);
});

test("records Core UI and review provenance without treating proposals as approval", () => {
  const record = JSON.parse(
    readFileSync(join(PREVIEW_ROOT, "build-record.json"), "utf8"),
  );
  assert.equal(record.schemaVersion, 3);
  assert.equal(record.uiReference.commit, CORE_UI_REFERENCE_SHA);
  assert.equal(record.uiReference.tree, CORE_UI_REFERENCE_TREE);
  assert.equal(record.uiFidelityReview.commit, UI_FIDELITY_REVIEW_SHA);
  assert.equal(record.uiFidelityReview.tree, UI_FIDELITY_REVIEW_TREE);
  assert.equal(record.uiFidelityReview.reviewedSourceCommit, REVIEWED_PREVIEW_SHA);
  assert.equal(record.uiFidelityReview.reviewedSourceTree, REVIEWED_PREVIEW_TREE);
  assert.equal(record.uiFidelityReview.reviewedRecordsCommit, REVIEWED_PREVIEW_RECORDS_SHA);
  assert.equal(record.uiFidelityReview.verdictOnPriorPrototype, "FAIL_NARROW");
  assert.equal(record.uiFidelityReview.automaticSuccessorReviewRequested, false);
  assert.ok(Object.values(record.proposalState).every((approved) => approved === false));
  assert.deepEqual(record.imagePresentation, {
    proposedCanonicalAspectRatio: "1:1",
    objectFit: "contain",
    cssColorManipulation: false,
    cssVignette: false,
    hiddenCrop: false,
    cardDetailSourceIdentityRequired: true,
    safeFallbackRequired: true,
  });
  assert.equal(record.publicTreeTouched, false);
  assert.equal(record.deploymentAuthorized, false);
});

test("shows explicit current-versus-proposed decisions and all five no-image states", () => {
  const source = readFileSync(join(PREVIEW_ROOT, "preview.js"), "utf8");
  for (const marker of [
    "Current Core",
    "Proposed Xenios Health",
    "A. Header brand",
    "B. Primary action language",
    "C. Purple-to-teal accent",
    "D. Public product imagery",
    "E. Canonical media shape",
    '"Research", representatives.research',
    '"Care", representatives.care',
    '"Held", representatives.held',
    '"Quote only", representatives.quote',
    '"Binding pending", representatives.pending',
    '"Packaging unverified", representatives.packagingUnverified',
  ]) {
    assert.ok(source.includes(marker), `Missing founder comparison marker: ${marker}`);
  }
  assert.match(source, /Synthetic member catalog/);
  assert.match(source, /Synthetic member detail/);
});

test("pins the real packaging-unverified witness to the neutral calibration asset", () => {
  const data = buildFounderPreviewData();
  const packaging = data.rows
    .filter((row) => row.imageClass === "packaging_unverified")
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  assert.deepEqual(
    packaging.map((row) => row.canonicalId),
    ["GRP-0066", "GRP-0068", "GRP-0073", "GRP-0079"],
  );
  assert.equal(data.representativeCanonicalIds.packagingUnverified, PACKAGING_UNVERIFIED_WITNESS_ID);
  for (const row of packaging) {
    assert.equal(row.bindingState.state, "retained_binding");
    assert.equal(row.image.jobId, "calibration-06-unverified-identity");
    assert.equal(row.image.assetImageClass, "neutral_product_identity");
    assert.equal(
      row.image.outputSha256,
      "77069db7b8324baf4780b37c585926a92b432e2fef24cbcdf019d38782cd7d8b",
    );
    assert.equal(row.image.reviewerDirective, "replace_rejected_unverified_packaging");
    assert.notEqual(row.image.jobId, "batch0-19-packaging_unverified");
    assert.notEqual(row.image.jobId, "calibration-04-care-state");
  }
  const source = readFileSync(join(PREVIEW_ROOT, "preview.js"), "utf8");
  assert.match(source, /representatives\.packagingUnverified/);
  assert.match(source, /proposedProductCard\(row\)/);
  assert.doesNotMatch(source, /fallback:\s*label === "Packaging unverified"/);
});

test("keeps both Decision D Care witnesses on Core's assisted-order pathway", () => {
  const data = buildFounderPreviewData();
  const rowsById = new Map(data.rows.map((row) => [row.canonicalId, row]));
  const care = rowsById.get("GRP-0001");
  const packaging = rowsById.get("GRP-0073");
  assert.equal(data.representativeCanonicalIds.care, "GRP-0001");
  assert.equal(data.representativeCanonicalIds.packagingUnverified, "GRP-0073");
  assert.equal(care.pathway.key, "care");
  assert.equal(packaging.pathway.key, "care");
  assert.equal(packaging.imageClass, "packaging_unverified");
  assert.equal(packaging.image.jobId, "calibration-06-unverified-identity");

  const source = readFileSync(join(PREVIEW_ROOT, "preview.js"), "utf8");
  assert.match(source, /surface: "assisted-order-care"/);
  assert.match(source, /workflowMode: "provider_request"/);
  assert.match(source, /actionHref: "\/care"/);
  assert.match(source, /actionLabel: "Continue through Care"/);
  assert.match(source, /quantityVisible: false/);
  assert.match(source, /return row\.pathway\.key === "care" \? coreCareCardBody\(row\) : coreCardBody\(row\)/);
});

test("mirrors the Core mark, responsive header, card anatomy, and evidence labels", () => {
  const css = readFileSync(join(PREVIEW_ROOT, "preview.css"), "utf8");
  const source = readFileSync(join(PREVIEW_ROOT, "preview.js"), "utf8");
  const htmlFiles = ["index.html", "product-detail.html", "catalog-review.html", "wireframe.html"]
    .map((file) => readFileSync(join(PREVIEW_ROOT, file), "utf8"));
  assert.match(css, /\.wordmark-mark\s*\{[^}]*background-color:\s*currentColor[^}]*mask:/s);
  assert.ok(htmlFiles.every((html) => !/<img[^>]+class="wordmark-mark"/i.test(html)));
  assert.ok(htmlFiles.every((html) => /<span class="wordmark-mark" aria-hidden="true"><\/span>/.test(html)));
  assert.match(css, /@media \(max-width: 519px\)[^{]*\{[\s\S]*?\.clarity-brand-name,[\s\S]*?clip: rect\(0 0 0 0\)/);
  assert.match(css, /@media \(min-width: 1024px\)[^{]*\{[\s\S]*?\.clarity-condensed-nav\s*\{\s*display: flex/);
  assert.doesNotMatch(css, /@media \(min-width: 1160px\)/);
  assert.doesNotMatch(css, /\.clarity-header-link\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.clarity-header-care\.btn\s*\{\s*display:\s*none/);
  for (const marker of [
    "Research use only: not for human or veterinary use.",
    "Available to order",
    "Temporarily unavailable",
    "Request availability",
    "Care pathway",
    "Ask the Care team about pricing",
    "Continue through Care",
    "Core does not render Care products through this Research product-card surface",
    "No action is rendered for this restrictive state.",
    "CURRENT PUBLIC CORE CATALOG",
    "SIGNED-IN MEMBER CATALOG / DETAIL",
    "SOURCE-VERIFIED",
    "NOT LIVE/OBSERVED RENDER",
    'data-approved="false"',
  ]) {
    assert.ok(source.includes(marker), `Missing fidelity marker: ${marker}`);
  }
  assert.doesNotMatch(source, /Legacy green pill/);
  assert.doesNotMatch(source, /Core-converged|source-faithful shell/);
  const carePresentation = source.match(
    /if \(row\.pathway\.key === "care"\) \{([\s\S]*?)\n    \}\n    return \{/,
  )?.[1];
  assert.ok(carePresentation, "Care presentation branch must remain explicit");
  assert.match(carePresentation, /workflowMode: "provider_request"/);
  assert.match(carePresentation, /actionLabel: "Continue through Care"/);
  assert.match(carePresentation, /quantityVisible: false/);
  assert.doesNotMatch(carePresentation, /AVAILABILITY_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(carePresentation, /Request availability/);
});

test("removes preview-only image filters, vignettes, and forced crops", () => {
  for (const file of ["preview.css", "calibration.css"]) {
    const source = readFileSync(join(PREVIEW_ROOT, file), "utf8");
    assert.doesNotMatch(source, /\bfilter\s*:/i);
    assert.doesNotMatch(source, /object-fit\s*:\s*cover/i);
  }
  const previewCss = readFileSync(join(PREVIEW_ROOT, "preview.css"), "utf8");
  assert.match(previewCss, /\.product-media img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(previewCss, /\.detail-media img\s*\{[^}]*object-fit:\s*contain/s);
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
        "docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-preview-browser-evidence.json",
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
  assert.equal(evidence.schemaVersion, 3);
  assert.equal(evidence.reviewedSource.commit, REVIEWED_PREVIEW_SHA);
  assert.equal(evidence.reviewedSource.tree, REVIEWED_PREVIEW_TREE);
  assert.equal(evidence.reviewedSource.recordsCommit, REVIEWED_PREVIEW_RECORDS_SHA);
  assert.equal(evidence.fidelityReview.commit, UI_FIDELITY_REVIEW_SHA);
  assert.equal(evidence.fidelityReview.tree, UI_FIDELITY_REVIEW_TREE);
  assert.equal(evidence.fidelityReview.verdict, "FAIL_NARROW");
  assert.match(evidence.implementationSource.commit, /^[0-9a-f]{40}$/);
  assert.match(evidence.implementationSource.tree, /^[0-9a-f]{40}$/);
  assert.equal(
    execFileSync(
      "git",
      ["show", "-s", "--format=%T", evidence.implementationSource.commit],
      { cwd: REPO_ROOT, encoding: "utf8" },
    ).trim(),
    evidence.implementationSource.tree,
  );
  assert.equal(evidence.partialDebugCapture, false);
  assert.equal(evidence.counts.captures, 144);
  assert.equal(evidence.counts.responsiveMatrixCaptures, 130);
  assert.deepEqual(evidence.counts.responsiveWidths, [
    1440, 1280, 1024, 834, 768, 430, 390, 375, 360, 320,
  ]);
  assert.deepEqual(evidence.counts.responsiveSurfaces, [
    "home",
    "products",
    "featured",
    "product-card-comparison",
    "product-detail-comparison",
    "care",
    "held",
    "quote-only",
    "coming-soon",
    "account-status",
    "three-way-comparison",
    "founder-decisions",
    "catalog-qa-grid",
  ]);
  assert.equal(evidence.counts.gridCanonicalIdsCovered, 423);
  assert.equal(evidence.counts.brokenImages, 0);
  assert.equal(evidence.counts.severeConsoleMessages, 0);
  assert.equal(evidence.counts.failedResponses, 0);
  assert.equal(evidence.counts.networkBoundaryViolations, 0);
  assert.equal(evidence.counts.truncatedScreenshots, 0);
  assert.equal(evidence.counts.unstableLayouts, 0);
  assert.equal(evidence.counts.decisionCaptures, 10);
  assert.equal(evidence.counts.cardComparisonCaptures, 10);
  assert.equal(evidence.counts.geometryComparisonCaptures, 20);
  assert.equal(evidence.counts.threeWayTriptychCaptures, 10);
  assert.ok(evidence.counts.proposalAuthorityCaptures >= 30);
  assert.ok(evidence.captures.every((capture) => capture.assertions.horizontalOverflow === false));
  assert.ok(evidence.captures.every((capture) => capture.assertions.failedResponses === 0));
  assert.ok(evidence.captures.every((capture) => capture.assertions.screenshotTruncated === false));
  assert.ok(evidence.captures.every((capture) => capture.assertions.layoutStable === true));
  for (const capture of evidence.captures) {
    const width = capture.viewport.width;
    const header = capture.fidelity.header;
    assert.equal(header.mark.tag, "SPAN");
    assert.equal(header.mark.visible, true);
    assert.equal(header.mark.rect.width, 34);
    assert.equal(header.mark.rect.height, 15);
    assert.match(header.mark.maskImage, /xenios-mark-transparent\.png/);
    assert.equal(header.elements.signIn.visible, true);
    assert.equal(header.elements.startCare.visible, true);
    assert.equal(header.elements.brandName.visible, width >= 520);
    assert.equal(header.elements.condensedNav.visible, width >= 1024 && width < 1280);
    assert.equal(header.elements.desktopNav.visible, width >= 1280);
    assert.equal(header.elements.menu.visible, width < 1280);
    assert.deepEqual(header.overlapPairs, []);
  }
  for (const capture of evidence.captures.filter((record) => record.surface === "founder-decisions")) {
    assert.deepEqual(capture.fidelity.decisions.sections.map((decision) => decision.id), ["A", "B", "C", "D", "E"]);
    assert.ok(capture.fidelity.decisions.sections.every((decision) => decision.approved === "false"));
    assert.equal(capture.fidelity.decisions.approvedTrueCount, 0);
    assert.equal(capture.fidelity.decisions.legacyLabelCount, 0);
    assert.equal(capture.fidelity.decisions.accentRules.length, 1);
    assert.equal(capture.fidelity.decisions.accentRules[0].role, "proposed");
    assert.equal(capture.fidelity.decisions.bButton.backgroundColor, "rgb(24, 61, 45)");
    assert.equal(capture.fidelity.decisions.bButton.height, 44);
    assert.equal(capture.fidelity.decisions.bButton.borderRadius, "999px");
    assert.equal(capture.fidelity.decisions.bButton.fontWeight, "750");
    assert.equal(capture.fidelity.decisions.dCoreContentMatches, true);
    assert.equal(capture.fidelity.decisions.marks.length, 2);
    assert.ok(capture.fidelity.decisions.marks.every((mark) => mark.visible));
    assert.ok(capture.fidelity.decisions.marks.every(
      (mark) => mark.backgroundColor !== "rgba(0, 0, 0, 0)",
    ));
  }
  for (const capture of evidence.captures.filter((record) => record.surface === "product-card-comparison")) {
    const pairs = capture.fidelity.cards.pairs;
    assert.equal(pairs.length, 6);
    assert.ok(pairs.every((pair) => pair.coreContentMatches));
    for (const pair of pairs) {
      const carePair = ["care", "packaging-unverified"].includes(pair.kind);
      for (const card of [pair.current, pair.proposed]) {
        assert.equal(card.anatomy.gap, carePair ? "16px" : "6px");
        assert.deepEqual(
          [
            card.anatomy.paddingTop,
            card.anatomy.paddingRight,
            card.anatomy.paddingBottom,
            card.anatomy.paddingLeft,
          ],
          carePair
            ? ["20px", "20px", "20px", "20px"]
            : ["16px", "16px", "16px", "16px"],
        );
        assert.equal(card.anatomy.titleFontWeight, carePair ? "700" : "500");
        if (!carePair) {
          assert.match(card.anatomy.categoryFontFamily, /JetBrains Mono/);
          assert.match(card.anatomy.specificationFontFamily, /JetBrains Mono/);
        }
        for (const action of card.actionStyles) {
          assert.equal(action.backgroundColor, carePair ? "rgb(24, 61, 45)" : "rgb(14, 14, 14)");
          assert.equal(action.color, "rgb(255, 255, 255)");
          assert.equal(action.borderRadius, carePair ? "999px" : "4px");
          assert.equal(action.fontWeight, carePair ? "750" : "700");
          if (carePair) {
            assert.equal(action.alignSelf, "flex-start");
          } else {
            assert.ok(Math.abs(action.width - card.anatomy.contentWidth) <= 0.5);
          }
        }
      }
    }
    for (const key of ["held", "quote-only", "binding-pending"]) {
      const pair = pairs.find((candidate) => candidate.kind === key);
      assert.ok(pair);
      assert.equal(pair.current.actionCount, 0);
      assert.equal(pair.proposed.actionCount, 0);
      assert.equal(pair.current.quantityCount, 0);
      assert.equal(pair.proposed.quantityCount, 0);
    }
    const packaging = pairs.find((candidate) => candidate.kind === "packaging-unverified");
    assert.equal(packaging.canonicalId, "GRP-0073");
    assert.equal(packaging.pathway, "care");
    assert.equal(capture.fidelity.cards.packagingRow.imageClass, "packaging_unverified");
    assert.equal(capture.fidelity.cards.packagingRow.pathway, "care");
    assert.equal(capture.fidelity.cards.packagingRow.assetJob, "calibration-06-unverified-identity");
    for (const key of ["care", "packaging-unverified"]) {
      const pair = pairs.find((candidate) => candidate.kind === key);
      assert.match(pair.disclosure, /Core does not render Care products through this Research product-card surface/);
      assert.equal(pair.pathway, "care");
      for (const card of [pair.current, pair.proposed]) {
        assert.equal(card.availability, "PROVIDER_REVIEW_REQUIRED");
        assert.equal(card.cardSurface, "assisted-order-care");
        assert.equal(card.workflowMode, "provider_request");
        assert.equal(card.actionAllowed, "true");
        assert.deepEqual(card.actionTexts, ["Continue through Care"]);
        assert.deepEqual(card.actionHrefs, ["/care"]);
        assert.equal(card.actionCount, 1);
        assert.equal(card.quantityCount, 0);
        assert.equal(card.researchBundleCopyCount, 0);
        assert.equal(card.requestAvailabilityCopyCount, 0);
        assert.equal(card.carePathwayLabelCount, 1);
        assert.deepEqual(card.carePriceTexts, ["Ask the Care team about pricing"]);
        assert.deepEqual(card.careNoticeTexts, [
          "This product requires provider review through Xenios Care and cannot be added to a research order request.",
        ]);
      }
    }
    const care = pairs.find((candidate) => candidate.kind === "care");
    assert.equal(care.canonicalId, "GRP-0001");
    assert.equal(capture.fidelity.cards.careRow.canonicalId, "GRP-0001");
    assert.equal(capture.fidelity.cards.careRow.pathway, "care");
    assert.equal(care.current.contentText, care.proposed.contentText);
    assert.equal(packaging.current.contentText, packaging.proposed.contentText);
  }
  for (const capture of evidence.captures.filter(
    (record) => ["product-detail-comparison", "founder-decisions"].includes(record.surface),
  )) {
    const roles = capture.fidelity.geometry.roles;
    assert.deepEqual(roles.map((role) => role.role), ["public-no-image", "member-4x3", "proposed-1x1"]);
    assert.equal(roles[0].imageCount, 0);
    assert.equal(roles[0].mediaCount, 0);
    assert.equal(roles[1].src, roles[2].src);
    assert.equal(roles[1].assetSha256, roles[2].assetSha256);
    assert.equal(roles[1].objectFit, "contain");
    assert.equal(roles[2].objectFit, "contain");
    assert.match(roles[1].bodyText, /NOT LIVE\/OBSERVED RENDER/);
  }
  for (const surface of ["home", "care", "account-status"]) {
    const captures = evidence.captures.filter((record) => record.surface === surface);
    assert.equal(captures.length, 10);
    assert.ok(captures.every((capture) => capture.fidelity.authorityCopy.proposalLabel));
    assert.ok(captures.every((capture) => capture.fidelity.authorityCopy.actualCoreDenial));
    assert.ok(captures.every((capture) => capture.fidelity.authorityCopy.actualCoreEvidenceLink));
  }
  for (const capture of evidence.captures.filter((record) => record.surface === "three-way-comparison")) {
    assert.equal(capture.fidelity.triptychs.length, 6);
    for (const group of capture.fidelity.triptychs) {
      assert.deepEqual(
        group.cards.map((card) => card.label),
        ["A · ACTUAL CORE", "B · CURRENT / OLD PREVIEW", "C · PROPOSED XENIOS HEALTH"],
      );
      assert.match(group.cards[0].source, /^\/evidence\/ui-convergence\/(core-reference|core-synthetic-c0e25c73|core-account-synthetic-c0e25c73)\//);
      assert.match(group.cards[1].source, /^\/evidence\/founder-preview\//);
      assert.match(group.cards[2].source, /^\/evidence\/ui-convergence\/corrected-preview\//);
    }
  }
  for (const [name, canonicalId] of expected) {
    const capture = capturesByName.get(name);
    assert.ok(capture, `Missing reviewer-fix capture ${name}`);
    assert.equal(capture.detailCanonicalId, canonicalId);
    assert.equal(capture.detailAssetJob, "calibration-06-unverified-identity");
    assert.equal(capture.assertions.horizontalOverflow, false);
  }
});

test("materializes every Claude drift row as an explicit A/B/C decision record", () => {
  const matrix = buildThreeWayMatrix();
  assert.equal(matrix.counts.rows, 207);
  assert.equal(matrix.counts.materialMismatches, 111);
  assert.deepEqual(matrix.counts.byClassification, {
    "allowed-exploration": 25,
    "core-internal-inconsistency": 33,
    "material-drift": 111,
    "minor-drift": 38,
  });
  assert.equal(new Set(matrix.rows.map((row) => row.rowKey)).size, 207);
  assert.ok(matrix.rows.every((row) =>
    row.surface &&
    row.actualCoreBehavior &&
    row.currentOldPreviewBehavior &&
    row.proposedXeniosHealthDelta &&
    row.accidentalOrIntentional &&
    row.actionRequired &&
    row.exactSuccessorVerificationRequired === true &&
    row.approved === false
  ));
  assert.ok(
    matrix.rows
      .filter((row) => row.baselineClassification === "material-drift")
      .every((row) => row.accidentalOrIntentional === "accidental_preview_drift"),
  );
  assert.ok(Object.values(matrix.authority).every((value) => value === false));
});

test("records exact-Core synthetic account and order UI without expanding its authority", () => {
  const evidenceRoot = join(
    REPO_ROOT,
    "docs/product-imagery/evidence/ui-convergence/core-account-synthetic-c0e25c73",
  );
  const receipt = JSON.parse(
    readFileSync(join(evidenceRoot, "synthetic-account-order-evidence.json"), "utf8"),
  );
  const pii = JSON.parse(readFileSync(join(evidenceRoot, "pii-scan.json"), "utf8"));
  const manual = JSON.parse(
    readFileSync(join(evidenceRoot, "manual-visual-review.json"), "utf8"),
  );
  assert.equal(receipt.source.commit, CORE_UI_REFERENCE_SHA);
  assert.equal(receipt.source.tree, CORE_UI_REFERENCE_TREE);
  assert.equal(receipt.claimScope, "UI_PRESENTATION_ONLY");
  assert.deepEqual(receipt.counts, {
    screens: 3,
    viewports: 2,
    captures: 6,
    horizontalOverflow: 0,
    severeConsoleMessages: 0,
    failedResponses: 0,
    networkBoundaryViolations: 0,
  });
  assert.equal(receipt.execution.loopbackOnly, true);
  assert.equal(receipt.execution.realCredentialsUsed, false);
  assert.equal(receipt.execution.realCustomerDataUsed, false);
  assert.equal(receipt.limitations.provesAuthentication, false);
  assert.equal(receipt.limitations.provesLiveApiAdapters, false);
  assert.equal(receipt.limitations.provesPricingAvailabilityOrCommerce, false);
  assert.equal(pii.summary.result, "CLEAN");
  assert.equal(pii.summary.total, 0);
  assert.equal(manual.result, "PASS_SYNTHETIC_PRESENTATION_ONLY");
  assert.equal(manual.observations.realCustomerDataObserved, false);
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
  assert.match(page.headers.get("content-security-policy"), /font-src 'self'/);
  assert.match(page.headers.get("x-robots-tag"), /noindex/);
  assert.match(await page.text(), /Private founder decision preview/);
  const font = await fetch(
    `${preview.origin}/founder-preview/fonts/inter-tight-latin-700-normal.woff2`,
  );
  assert.equal(font.status, 200);
  assert.match(font.headers.get("content-type"), /font\/woff2/);
  const dataResponse = await fetch(`${preview.origin}/founder-preview/catalog-data.json`);
  assert.equal(dataResponse.status, 200);
  assert.equal((await dataResponse.json()).rows.length, 423);
  const traversal = await fetch(`${preview.origin}/%2e%2e%2fpackage.json`);
  assert.equal(traversal.status, 404);
  const post = await fetch(`${preview.origin}/founder-preview/index.html`, { method: "POST" });
  assert.equal(post.status, 405);
});
