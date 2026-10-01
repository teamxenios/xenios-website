import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const PREVIEW_ROOT = join(REPO_ROOT, "docs/product-imagery/founder-preview");
const MANIFEST_ROOT = join(REPO_ROOT, "docs/product-imagery/manifests");

export const CORE_SOURCE_SHA = "4cba24af1d42ad59fe44856859cc1721846e6df5";
export const CORE_SOURCE_TREE = "6395273fc4370b7df713a2b72b019785f547d1fb";
export const CORE_TEST_SHA = "f634e8630b92818ea494aa96f5f68c921441455b";
export const CORE_RECORDS_SHA = "c73da35cc223a2253ce8074948ed9ff063012748";
export const IMAGERY_REVIEW_TARGET_SHA = "184d820a2a20152649b67892ec0a5467857d5290";
export const IMAGERY_REVIEWER_TIP_SHA = "76607458e30a64746d227150ff1dbab3475dd64a";
export const PROTOTYPE_REVIEW_SHA = "023e9ec8899ded7f66f52ef3c21a799501d98084";
export const MEDIA_COMMERCE_SHA = "b38db0ae2ee0c679ec2eeb31b324f6204669dfb7";
export const SHIPPING_GROUP_ID = "GRP-0364";
export const HELD_GROUP_IDS = new Set(["GRP-0422"]);
export const QUOTE_ONLY_GROUP_IDS = new Set(["GRP-0244", "GRP-0365"]);
export const EXPECTED_CUSTOMER_ROWS = 423;
export const EXPECTED_CANONICAL_ROWS = 424;
export const PREVIEW_GENERATED_AT = "2026-10-01T15:24:00.000Z";
export const REJECTED_BATCH0_JOB_IDS = new Set([
  "batch0-06-oral_liquid_neutral",
  "batch0-09-odt_container",
  "batch0-16-supplement_retail_unit_neutral",
  "batch0-19-packaging_unverified",
  "batch0-21-care_pathway_neutral",
  "batch0-24-coming_soon_offering",
]);

const CORE_CATALOG_PATH =
  "server/research/master-offerings/data/member-safe-master-offerings.generated.json";
const CORE_BINDINGS_PATH =
  "server/research/master-offerings/data/master-offering-bindings.generated.json";

const readJson = (path) => JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (...args) =>
  execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    .trim();
const gitJson = (sha, path) => JSON.parse(git("show", `${sha}:${path}`));

function previewAssetPath(repositoryPath) {
  assert.match(
    repositoryPath,
    /^docs\/product-imagery\/evidence\/batch0-render-candidates\/[a-z0-9_-]+-sha256-[a-f0-9]{12}\.png$/,
    `Unexpected Batch 0 evidence path: ${repositoryPath}`,
  );
  return `/${repositoryPath.replace(/^docs\/product-imagery\//, "")}`;
}

function classifyPathway({ groupId, family, unbound }) {
  if (HELD_GROUP_IDS.has(groupId)) {
    return {
      key: "held",
      label: "Formulation held",
      price: "Pricing not released",
      cta: "View hold details",
      explanation: "This identity remains visible for review but is not transaction-ready.",
    };
  }
  if (QUOTE_ONLY_GROUP_IDS.has(groupId)) {
    return {
      key: "quote",
      label: "Quote only",
      price: "Price on request",
      cta: "Request a quote",
      explanation: "A reviewed quote is required before any order pathway is available.",
    };
  }
  if (unbound) {
    return {
      key: "pending",
      label: "Binding pending",
      price: "Pricing not released",
      cta: "Request availability review",
      explanation: "The canonical identity is retained without borrowing a price or Product Control binding.",
    };
  }
  if (family === "clinical_formulations_503a") {
    return {
      key: "care",
      label: "Care pathway",
      price: "Care pricing withheld",
      cta: "Review Care pathway",
      explanation: "Provider review and applicable state and pharmacy requirements govern this pathway.",
    };
  }
  return {
    key: "research",
    label: "Research access",
    price: "Price omitted from static preview",
    cta: "View product",
    explanation: "Runtime Product Control remains the only price and purchase authority.",
  };
}

function chooseAsset({ coverage, pathway, assetsByClass, productName, specification }) {
  let selectedClass = coverage.imageClass;
  let mode = "provisional_class_render";
  let reviewerDirective = null;
  const isLyophilizedGhkCu =
    coverage.imageClass === "peptide_lyophilized_vial" &&
    /GHK[\s-]?Cu/i.test(`${productName} ${specification}`);
  if (pathway.key === "held") {
    selectedClass = "held_neutral";
    mode = "provisional_state_safe_render";
  } else if (pathway.key === "quote") {
    selectedClass = "quote_only_neutral";
    mode = "provisional_state_safe_render";
  } else if (pathway.key === "care") {
    selectedClass = "neutral_product_identity";
    mode = "provisional_reviewer_directed_neutral_render";
    reviewerDirective = "replace_rejected_care_lounge";
  } else if (pathway.key === "pending") {
    selectedClass = "neutral_product_identity";
    mode = "provisional_identity_neutral_render";
  } else if (coverage.imageClass === "supplement_retail_unit_neutral") {
    selectedClass = "neutral_product_identity";
    mode = "provisional_reviewer_directed_neutral_render";
    reviewerDirective = "replace_rejected_fabricated_supplement_packaging";
  } else if (coverage.groupId === "GRP-0362") {
    selectedClass = "neutral_product_identity";
    mode = "provisional_reviewer_directed_neutral_render";
    reviewerDirective = "replace_rejected_acetic_acid_tincture";
  } else if (coverage.imageClass === "packaging_unverified") {
    selectedClass = "neutral_product_identity";
    mode = "provisional_reviewer_directed_neutral_render";
    reviewerDirective = "replace_rejected_unverified_packaging";
  } else if (isLyophilizedGhkCu) {
    selectedClass = "neutral_product_identity";
    mode = "provisional_reviewer_directed_neutral_render";
    reviewerDirective = "avoid_false_white_powder_cue_for_ghk_cu";
  }
  const asset = assetsByClass.get(selectedClass) ?? assetsByClass.get(coverage.imageClass);
  assert.ok(asset, `No safe provisional asset for ${coverage.groupId} / ${selectedClass}`);
  assert.ok(
    !REJECTED_BATCH0_JOB_IDS.has(asset.jobId),
    `Rejected Batch 0 asset selected for ${coverage.groupId}: ${asset.jobId}`,
  );
  assert.equal(asset.visibility, "non_public_review_evidence");
  assert.equal(asset.reviewStatus, "awaiting_independent_named_approval");
  assert.equal(asset.publicPath, null);
  return {
    jobId: asset.jobId,
    assetImageClass: asset.imageClass,
    repositoryPath: asset.repositoryPath,
    src: previewAssetPath(asset.repositoryPath),
    outputSha256: asset.source.sha256,
    width: asset.source.width,
    height: asset.source.height,
    visualState: "provisional",
    visualMode: mode,
    reviewerDirective,
    reviewStatus: asset.reviewStatus,
    publicationStatus: "private_preview_only_not_publication_approved",
  };
}

function chooseFeatured(rows) {
  const wishes = [
    /BPC-157/i,
    /Tesamorelin/i,
    /NAD\+/i,
    /Oxytocin/i,
    /Hexarelin/i,
    /CJC-1295/i,
    /Ipamorelin/i,
    /GHK[- ]?Cu/i,
  ];
  const selected = [];
  for (const pattern of wishes) {
    const match = rows.find(
      (row) => !selected.includes(row) && pattern.test(`${row.name} ${row.specification}`),
    );
    if (match) selected.push(match);
  }
  for (const row of rows) {
    if (selected.length >= 8) break;
    if (!selected.includes(row) && row.pathway.key !== "held") selected.push(row);
  }
  return selected.slice(0, 8).map((row) => row.canonicalId);
}

function batchOneCandidates(rows, crosswalk) {
  const rowsByManifestKey = new Map(rows.map((row) => [row.manifestKey, row]));
  const selected = crosswalk.entries
    .filter((entry) => entry.aliases.legacyFeaturedAliases.length > 0)
    .map((entry) => rowsByManifestKey.get(entry.manifestKey))
    .filter(Boolean);
  assert.equal(selected.length, 22, "Batch 1 expects the 22 canonical legacy Featured identities");
  for (const groupId of ["GRP-0243", "GRP-0362", "GRP-0366"]) {
    const row = rows.find((candidate) => candidate.canonicalId === groupId);
    assert.ok(row, `Batch 1 diversity fill missing ${groupId}`);
    if (!selected.includes(row)) selected.push(row);
  }
  assert.equal(selected.length, 25);
  return selected.map((row, index) => ({
    sequence: index + 1,
    jobId: `batch1-${String(index + 1).padStart(2, "0")}-${row.canonicalId.toLowerCase()}`,
    canonicalId: row.canonicalId,
    manifestKey: row.manifestKey,
    offeringId: row.offeringId,
    offeringVariantId: row.offeringVariantId,
    productName: row.name,
    authorizedSpecification: row.specification,
    imageClass: row.imageClass,
    pathway: row.pathway.key,
    priorityReason:
      index < 22
        ? "canonical owner of a current legacy Featured identity"
        : "first-page catalog and image-class diversity candidate",
    status: "prepared_not_authorized_to_render",
    promptStatus: "deferred_pending_global_style_and_asset_policy_review",
    renderAuthorization: false,
    publicationAuthorization: false,
  }));
}

export function buildFounderPreviewData() {
  assert.equal(git("rev-parse", `${CORE_SOURCE_SHA}^{tree}`), CORE_SOURCE_TREE);
  const coverage = readJson("docs/product-imagery/manifests/product-image-coverage.json");
  const crosswalk = readJson("docs/product-imagery/manifests/product-image-identity-crosswalk.json");
  const batch0 = readJson("docs/product-imagery/manifests/batch-000-assets.json");
  const stateAudit = readJson("docs/product-imagery/manifests/state-authority-audit.json");
  const coreCatalogText = git("show", `${CORE_SOURCE_SHA}:${CORE_CATALOG_PATH}`);
  const coreBindingsText = git("show", `${CORE_SOURCE_SHA}:${CORE_BINDINGS_PATH}`);
  const coreCatalog = JSON.parse(coreCatalogText);
  const coreBindings = JSON.parse(coreBindingsText);

  assert.equal(coverage.rows.length, EXPECTED_CANONICAL_ROWS);
  assert.equal(crosswalk.entries.length, EXPECTED_CANONICAL_ROWS);
  assert.equal(coreCatalog.variantCount, EXPECTED_CANONICAL_ROWS);
  assert.equal(coreCatalog.products.length, EXPECTED_CANONICAL_ROWS);
  assert.equal(batch0.assets.length, 25);
  assert.equal(batch0.counts.approved, 0);
  assert.equal(batch0.counts.public, 0);
  assert.equal(stateAudit.observedCoreCandidate.sourceCommit, CORE_SOURCE_SHA);
  assert.equal(stateAudit.observedCoreCandidate.customerRows, EXPECTED_CUSTOMER_ROWS);
  assert.equal(stateAudit.observedCoreCandidate.independentReview, "pending_not_claude_accepted");

  const productsByVariant = new Map();
  for (const product of coreCatalog.products) {
    assert.equal(product.variants.length, 1, `Preview expects one variant for ${product.id}`);
    productsByVariant.set(product.variants[0].id, { product, variant: product.variants[0] });
  }
  const unboundByVariant = new Map(
    coreBindings.unbound.map((entry) => [entry.offeringVariantId, entry]),
  );
  const assetsByClass = new Map(batch0.assets.map((asset) => [asset.imageClass, asset]));
  const crosswalkByKey = new Map(crosswalk.entries.map((entry) => [entry.manifestKey, entry]));

  const rows = coverage.rows
    .filter((row) => row.groupId !== SHIPPING_GROUP_ID)
    .map((coverageRow) => {
      const core = productsByVariant.get(coverageRow.offeringVariantId);
      assert.ok(core, `Core product missing for ${coverageRow.offeringVariantId}`);
      const identity = crosswalkByKey.get(coverageRow.manifestKey);
      assert.ok(identity, `Identity crosswalk missing for ${coverageRow.manifestKey}`);
      const unbound = unboundByVariant.get(coverageRow.offeringVariantId) ?? null;
      const pathway = classifyPathway({
        groupId: coverageRow.groupId,
        family: core.product.family,
        unbound,
      });
      const image = chooseAsset({
        coverage: coverageRow,
        pathway,
        assetsByClass,
        productName: core.product.displayName,
        specification: core.variant.label,
      });
      return {
        canonicalId: coverageRow.groupId,
        manifestKey: coverageRow.manifestKey,
        offeringId: coverageRow.offeringId,
        offeringVariantId: coverageRow.offeringVariantId,
        slug: core.product.slug,
        name: core.product.displayName,
        canonicalName: core.product.canonicalName,
        family: core.product.family,
        category: core.product.category,
        subcategory: core.product.subcategory,
        specification: core.variant.label,
        dosageForm: coverageRow.dosageForm,
        imageClass: coverageRow.imageClass,
        sourceGroupIds: coverageRow.sourceGroupIds,
        pathway,
        bindingState: unbound
          ? { state: "unbound", reasonCode: unbound.reasonCode, reason: unbound.reason }
          : { state: "retained_binding", reasonCode: null, reason: null },
        image,
        exactRenderMissing: true,
        finality: "provisional",
        availabilityClaim: "not_asserted_by_private_preview",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.canonicalId.localeCompare(b.canonicalId));

  assert.equal(rows.length, EXPECTED_CUSTOMER_ROWS);
  assert.ok(!rows.some((row) => row.canonicalId === SHIPPING_GROUP_ID));
  assert.equal(rows.filter((row) => row.pathway.key === "care").length, 242);
  assert.equal(rows.filter((row) => row.pathway.key === "quote").length, 2);
  assert.equal(rows.filter((row) => row.pathway.key === "held").length, 1);
  assert.equal(rows.filter((row) => row.bindingState.state === "unbound").length, 8);
  assert.equal(rows.filter((row) => row.finality === "provisional").length, 423);
  assert.equal(new Set(rows.map((row) => row.manifestKey)).size, 423);
  assert.equal(
    rows.filter((row) => REJECTED_BATCH0_JOB_IDS.has(row.image.jobId)).length,
    0,
    "Reviewed-rejected Batch 0 assets must not appear in the private prototype",
  );

  const featuredCanonicalIds = chooseFeatured(rows);
  const batch1 = batchOneCandidates(rows, crosswalk);
  const counts = {
    reviewedSourceRows: 426,
    canonicalVariants: 424,
    customerTargets: rows.length,
    finalExactAssets: 0,
    provisionalVisualSlots: rows.filter((row) => row.finality === "provisional").length,
    fallbackOnlySlots: rows.filter((row) => row.finality === "fallback").length,
    missingExactRenders: rows.filter((row) => row.exactRenderMissing).length,
    batch0Renders: batch0.assets.length,
    batch0Approved: batch0.counts.approved,
    care: rows.filter((row) => row.pathway.key === "care").length,
    research: rows.filter((row) => row.pathway.key === "research").length,
    held: rows.filter((row) => row.pathway.key === "held").length,
    quoteOnly: rows.filter((row) => row.pathway.key === "quote").length,
    bindingPending: rows.filter((row) => row.pathway.key === "pending").length,
    reviewerDirectedNeutralSlots: rows.filter((row) => row.image.reviewerDirective !== null).length,
    rejectedBatch0AssetSlots: rows.filter((row) => REJECTED_BATCH0_JOB_IDS.has(row.image.jobId)).length,
  };

  const data = {
    schemaVersion: 1,
    kind: "private_founder_visual_prototype",
    generatedAt: PREVIEW_GENERATED_AT,
    privatePrototype: true,
    runtimeAuthority: false,
    publicationAuthority: false,
    commerceAuthority: false,
    pricingAuthority: false,
    deploymentAuthorized: false,
    sources: {
      coreCatalog: {
        commit: CORE_SOURCE_SHA,
        tree: CORE_SOURCE_TREE,
        testCommit: CORE_TEST_SHA,
        recordsCommit: CORE_RECORDS_SHA,
        path: CORE_CATALOG_PATH,
        contentSha256: sha256(coreCatalogText),
        independentAcceptance: false,
      },
      coreBindings: {
        commit: CORE_SOURCE_SHA,
        path: CORE_BINDINGS_PATH,
        contentSha256: sha256(coreBindingsText),
      },
      imageryReviewTarget: {
        commit: IMAGERY_REVIEW_TARGET_SHA,
        reviewerTipCommit: IMAGERY_REVIEWER_TIP_SHA,
        prototypeReviewCommit: PROTOTYPE_REVIEW_SHA,
        exactPerAssetDecisionReceived: true,
        publicApprovalReceived: false,
        disposition: "private_prototype_only_with_reviewer_directed_substitutions",
      },
      mediaCommerceCandidate: {
        commit: MEDIA_COMMERCE_SHA,
        acceptedForIntegration: false,
      },
    },
    warnings: [
      "PRIVATE FOUNDER PROTOTYPE - NOT A PRODUCTION OR PUBLICATION BUILD",
      "Every displayed Batch 0 image remains provisional and non-public; exact-SHA review is not publication approval.",
      "Reviewed-rejected Batch 0 assets are excluded; reviewer-directed rows use the neutral identity study.",
      "Prices are intentionally withheld in this static preview; Product Control remains the runtime authority.",
      "Image state never changes catalog, price, availability, workflow, quote, cart, or fulfillment authority.",
    ],
    counts,
    featuredCanonicalIds,
    representativeCanonicalIds: {
      research: rows.find((row) => row.pathway.key === "research")?.canonicalId,
      care: rows.find((row) => row.pathway.key === "care")?.canonicalId,
      held: rows.find((row) => row.pathway.key === "held")?.canonicalId,
      quote: rows.find((row) => row.pathway.key === "quote")?.canonicalId,
      pending: rows.find((row) => row.pathway.key === "pending")?.canonicalId,
    },
    comingSoon: [
      {
        id: "superpower",
        name: "Superpower",
        status: "Coming soon",
        imageMode: "intentional_non_image_panel",
        price: null,
        checkout: false,
        logoUsed: false,
        partnershipClaimed: false,
      },
      {
        id: "mito-health",
        name: "Mito Health",
        status: "Coming soon",
        imageMode: "intentional_non_image_panel",
        price: null,
        checkout: false,
        logoUsed: false,
        partnershipClaimed: false,
      },
    ],
    batch0ContactSheet: {
      repositoryPath:
        "docs/product-imagery/evidence/batch0-contact-sheet-sha256-02bcd3fa1fb3.png",
      src: "/evidence/batch0-contact-sheet-sha256-02bcd3fa1fb3.png",
      status: "provisional_non_public_review_evidence",
    },
    rows,
    batch1,
  };
  return data;
}

export function writeFounderPreviewArtifacts(data = buildFounderPreviewData()) {
  mkdirSync(PREVIEW_ROOT, { recursive: true });
  const dataJson = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(join(PREVIEW_ROOT, "catalog-data.json"), dataJson);
  writeFileSync(
    join(PREVIEW_ROOT, "catalog-data.js"),
    `window.XENIOS_FOUNDER_PREVIEW_DATA = ${JSON.stringify(data)};\n`,
  );
  const batch1 = {
    schemaVersion: 1,
    kind: "batch_001_exact_identity_jobs_prepared_not_authorized",
    generatedAt: data.generatedAt,
    runtimeAuthority: false,
    renderAuthorization: false,
    publicationAuthorization: false,
    sourceCoreCommit: CORE_SOURCE_SHA,
    imageryReviewTargetCommit: IMAGERY_REVIEW_TARGET_SHA,
    imageryReviewCommit: PROTOTYPE_REVIEW_SHA,
    calibrationSetRequired: true,
    calibrationSetRendered: false,
    calibrationSetApproved: false,
    gate:
      "Do not render Batch 1 until a separate five-to-six-image calibration set locks the global art direction, then independent HL-11 catalog acceptance, media-commerce integration acceptance, and exact repository ownership gates all clear.",
    count: data.batch1.length,
    jobs: data.batch1,
  };
  writeFileSync(
    join(MANIFEST_ROOT, "batch-001-prepared.json"),
    `${JSON.stringify(batch1, null, 2)}\n`,
  );
  const calibrationPlan = {
    schemaVersion: 1,
    kind: "global_art_direction_calibration_plan_prepared_not_authorized",
    generatedAt: data.generatedAt,
    sourceReviewCommit: PROTOTYPE_REVIEW_SHA,
    requiredBeforeBatch1: true,
    renderAuthorization: false,
    publicationAuthorization: false,
    approvalStatus: "awaiting_explicit_render_authority_and_named_calibration_review",
    sharedDirection: {
      palette: "near-black, taupe, ivory, restrained purple-to-teal accent",
      camera: "one fixed three-quarter camera height and focal treatment across object studies",
      scale: "one fixed subject-height band with consistent negative space",
      lighting: "one controlled studio lighting plan aligned to the brand system",
      props: "no botanicals, spa props, invented packaging, logos, or manufacturer cues",
      truthRule: "the subject form and visible contents must match the authorized class evidence",
    },
    count: 5,
    studies: [
      {
        id: "calibration-01-vial",
        archetype: "vial",
        truthBoundary: "unlabeled vial; contents and color remain unspecified until identity evidence exists",
      },
      {
        id: "calibration-02-bottle",
        archetype: "bottle",
        truthBoundary: "unlabeled form-appropriate bottle; no retail carton, Rx mimic, or brand cue",
      },
      {
        id: "calibration-03-topical",
        archetype: "topical",
        truthBoundary: "neutral tube or pump matched to the authorized dosage form",
      },
      {
        id: "calibration-04-care-state",
        archetype: "care_treatment",
        truthBoundary: "abstract pathway treatment; no clinic, room, provider, device, or eligibility claim",
      },
      {
        id: "calibration-05-restrictive-state",
        archetype: "held_or_coming_soon",
        truthBoundary: "text-led state treatment; no product, package, partner, or availability cue",
      },
    ].map((study) => ({
      ...study,
      promptStatus: "deferred_pending_explicit_render_authority",
      renderAuthorization: false,
      publicationAuthorization: false,
    })),
  };
  writeFileSync(
    join(MANIFEST_ROOT, "global-art-direction-calibration-prepared.json"),
    `${JSON.stringify(calibrationPlan, null, 2)}\n`,
  );
  const buildRecord = {
    schemaVersion: 1,
    kind: "founder_preview_build_record",
    generatedAt: data.generatedAt,
    dataSha256: sha256(dataJson),
    customerTargets: data.rows.length,
    finalExactAssets: data.counts.finalExactAssets,
    provisionalVisualSlots: data.counts.provisionalVisualSlots,
    missingExactRenders: data.counts.missingExactRenders,
    reviewerTipCommit: IMAGERY_REVIEWER_TIP_SHA,
    prototypeReviewCommit: PROTOTYPE_REVIEW_SHA,
    reviewerDirectedNeutralSlots: data.counts.reviewerDirectedNeutralSlots,
    rejectedBatch0AssetSlots: data.counts.rejectedBatch0AssetSlots,
    c2paProvenancePath: "docs/product-imagery/manifests/batch-000-c2pa-provenance.json",
    outputRoot: relative(REPO_ROOT, PREVIEW_ROOT).replaceAll("\\", "/"),
    publicTreeTouched: false,
    deploymentAuthorized: false,
  };
  writeFileSync(
    join(PREVIEW_ROOT, "build-record.json"),
    `${JSON.stringify(buildRecord, null, 2)}\n`,
  );
  return { data, batch1, calibrationPlan, buildRecord };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = writeFounderPreviewArtifacts();
  console.log(
    `Founder preview built: ${result.data.counts.customerTargets} customer targets, ` +
      `${result.data.counts.provisionalVisualSlots} provisional slots, ` +
      `${result.batch1.count} Batch 1 jobs prepared (render authorization false).`,
  );
}
