import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_GENERATED_AT,
  BINDING_SOURCE_PATH,
  CATALOG_RECONCILIATION_SOURCE_PATH,
  CATALOG_SOURCE_PATH,
  CONTRACT_SCHEMA_VERSION,
  CUSTOMER_EXPOSURE_SOURCE_PATH,
  DOSAGE_FORM_TO_IMAGE_CLASS,
  FALLBACK_ASSETS,
  FALLBACK_ASSET_PROVENANCE,
  FEATURED_IDENTITY_SOURCE_PATH,
  FOUNDER_V3_SPEC_PATH,
  FOUNDER_V3_SPEC_SHA256,
  SOURCE_BASE_COMMIT,
  SOURCE_BASE_TREE,
  V3_ACCEPTANCE,
} from "./config.mjs";
import {
  BATCH0_JOBS,
  compileRendererPrompt,
  validateRendererJob,
} from "./batch0-config.mjs";
import {
  buildReviewedCatalogProjection,
  gitBlobOid,
  gitTextBlobOid,
} from "./catalog-v3.mjs";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SHIPPING_GROUP_ID = "GRP-0364";
const SYRINGE_GROUP_ID = "GRP-0365";
const PRICE_REQUEST_GROUP_ID = "GRP-0244";
const FORMULATION_HOLD_GROUP_ID = "GRP-0422";
const SUPERSEDED_FORWARD_GROUPS = Object.freeze({
  "GRP-0425": "GRP-0407",
  "GRP-0426": "GRP-0402",
});
const EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS = Object.freeze({
  care_pathway: "care_pathway_neutral",
  held: "held_neutral",
  quote_only: "quote_only_neutral",
  coming_soon: "coming_soon_offering",
});
const REVIEWED_PRESENTATION_CLASS_OVERRIDES = Object.freeze({
  "GRP-0073": "packaging_unverified",
});

function readBytes(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath));
}

function readText(relativePath) {
  return readBytes(relativePath).toString("utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

export function sha256File(relativePath) {
  return sha256Bytes(readBytes(relativePath));
}

export function sourceDescriptor(relativePath) {
  const bytes = readBytes(relativePath);
  return {
    path: relativePath.replaceAll("\\", "/"),
    sha256: sha256Bytes(bytes),
    sha256Semantics: "exact_working_tree_bytes",
    gitBlobOid: gitTextBlobOid(bytes),
    gitBlobOidSemantics: "lf_normalized_repository_text_blob",
    byteSize: bytes.length,
  };
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function extractRuntimeExcludedOfferingIds(source) {
  const ids = Array.from(
    source.matchAll(
      /const\s+SHIPPING_CHARGE_OFFERING_ID_[A-Z0-9_]+\s*=\s*"(mo_[a-f0-9]+)"/g,
    ),
    (match) => match[1],
  );
  if (ids.length !== 1) {
    throw new Error(`Expected one runtime shipping-charge exclusion, found ${ids.length}`);
  }
  return new Set(ids);
}

function inspectPng(relativePath) {
  const bytes = readBytes(relativePath);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || bytes.length < 24) {
    throw new Error(`${relativePath} is not a valid PNG evidence file`);
  }
  return {
    format: "PNG",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    byteSize: bytes.length,
    sha256: sha256Bytes(bytes),
    gitBlobOid: gitBlobOid(bytes),
  };
}

function buildQuarantineManifest() {
  const assets = FALLBACK_ASSETS.map((asset) => {
    const absolute = path.join(REPO_ROOT, asset.filePath);
    if (!fs.existsSync(absolute)) throw new Error(`Missing quarantined asset ${asset.filePath}`);
    const bytes = fs.readFileSync(absolute);
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== asset.sha256 || bytes.length !== asset.byteSize) {
      throw new Error(`Quarantined asset bytes drifted for ${asset.assetId}`);
    }
    return {
      assetId: asset.assetId,
      disposition: "permanently_nonapprovable_pre_v3_evidence",
      reviewStatus: "rejected_requires_v3_rerender",
      runtimeWiringEligibility: "blocked",
      deploymentEligibility: "blocked",
      publicPath: null,
      removedPublicPath: `/research/products/fallbacks/${path.basename(asset.filePath)}`,
      repositoryPath: asset.filePath,
      sha256: actualSha256,
      gitBlobOid: gitBlobOid(bytes),
      byteSize: bytes.length,
      width: asset.width,
      height: asset.height,
      legacyTaxonomyKey: asset.taxonomyKey,
      legacyPromptSha256: sha256Text(asset.prompt),
      sourceArtifact: FALLBACK_ASSET_PROVENANCE[asset.assetId].sourceArtifact,
    };
  });
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "pre_v3_nonapprovable_quarantine_manifest",
    publicRuntimeAuthority: false,
    counts: {
      quarantined: assets.length,
      public: assets.filter((asset) => asset.publicPath !== null).length,
      approvable: assets.filter((asset) => asset.deploymentEligibility !== "blocked").length,
    },
    priorPublicDirectory: "client/public/research/products/fallbacks",
    quarantineDirectory: "docs/product-imagery/evidence/pre-v3-nonapprovable",
    assets,
  };
}

function buildBatch0AssetManifest() {
  const assets = BATCH0_JOBS.map((job) => {
    validateRendererJob(job);
    const prompt = compileRendererPrompt(job);
    const exists = fs.existsSync(path.join(REPO_ROOT, job.evidenceTarget.repositoryPath));
    const promptSha256 = sha256Text(prompt);
    const rendererPayloadSha256 = sha256Text(JSON.stringify(job.rendererPayload));
    const renderContractSha256 = sha256Text(
      [FOUNDER_V3_SPEC_SHA256, promptSha256, rendererPayloadSha256].join("\u0000"),
    );
    const source = exists ? inspectPng(job.evidenceTarget.repositoryPath) : null;
    return {
      jobId: job.jobId,
      imageClass: job.imageClass,
      visibility: "non_public_review_evidence",
      reviewStatus: exists ? "awaiting_independent_named_approval" : "render_pending",
      publicPath: null,
      repositoryPath: job.evidenceTarget.repositoryPath,
      renderer: {
        provider: "OpenAI",
        interface: "built_in_imagegen",
        model: "not_exposed_by_tool",
        requestId: "not_exposed_by_tool",
      },
      promptSha256,
      rendererPayloadSha256,
      renderContractSha256,
      receiptSha256: source
        ? sha256Text([renderContractSha256, source.sha256].join("\u0000"))
        : null,
      source,
      approval: {
        namedApprover: null,
        approvedAt: null,
        approvalRecord: null,
      },
    };
  });
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "batch_000_v3_non_public_asset_manifest",
    publicRuntimeAuthority: false,
    promotionRule:
      "A derivative may enter client/public only after an independent named reviewer approves the exact source SHA-256 and the derivative is separately hashed.",
    counts: {
      jobs: assets.length,
      rendered: assets.filter((asset) => asset.source !== null).length,
      pending: assets.filter((asset) => asset.source === null).length,
      approved: assets.filter((asset) => asset.approval.namedApprover !== null).length,
      public: assets.filter((asset) => asset.publicPath !== null).length,
    },
    assets,
  };
}

export function validateBatch0FixtureJoin(reviewedProjection, jobs = BATCH0_JOBS) {
  const rowByGroupId = new Map(reviewedProjection.rows.map((row) => [row.groupId, row]));
  const stateOnlyClasses = new Set([
    "care_pathway_neutral",
    "held_neutral",
    "quote_only_neutral",
    "coming_soon_offering",
  ]);
  const identityTerms = sortedUnique(
    reviewedProjection.rows.flatMap((row) => [row.product, row.specification]),
  ).filter((term) => term.length >= 5);

  for (const job of jobs) {
    const fixture = job.fixture;
    if (new Set(fixture.qaGroupIds).size !== fixture.qaGroupIds.length) {
      throw new Error(`${job.jobId} repeats a QA group ID`);
    }
    for (const qaGroupId of fixture.qaGroupIds) {
      if (!rowByGroupId.has(qaGroupId)) {
        throw new Error(`${job.jobId} names absent QA group ${qaGroupId}`);
      }
    }
    if (fixture.groupId === null) continue;
    const row = rowByGroupId.get(fixture.groupId);
    if (!row) throw new Error(`${job.jobId} names absent fixture group ${fixture.groupId}`);
    if (row.offeringVariantId !== fixture.movId) {
      throw new Error(
        `${job.jobId} fixture identity mismatch: ${fixture.groupId}/${fixture.movId}`,
      );
    }
    if (!stateOnlyClasses.has(job.imageClass)) {
      const expectedClass =
        REVIEWED_PRESENTATION_CLASS_OVERRIDES[row.groupId] ??
        DOSAGE_FORM_TO_IMAGE_CLASS.get(row.dosageForm);
      if (expectedClass !== job.imageClass) {
        throw new Error(
          `${job.jobId} fixture class mismatch: ${fixture.groupId} maps to ${expectedClass}`,
        );
      }
    }

    const rendererText = JSON.stringify({
      payload: job.rendererPayload,
      prompt: compileRendererPrompt(job),
    }).toLowerCase();
    for (const identityTerm of identityTerms) {
      if (rendererText.includes(identityTerm.toLowerCase())) {
        throw new Error(`${job.jobId} renderer input leaked catalog identity ${identityTerm}`);
      }
    }
  }
  return true;
}

function buildRendererPacket() {
  const rendererJobs = [];
  const provenanceRecords = [];
  for (const job of BATCH0_JOBS) {
    validateRendererJob(job);
    const rendererPrompt = compileRendererPrompt(job);
    rendererJobs.push({
      jobId: job.jobId,
      batch: job.batch,
      imageClass: job.imageClass,
      evidenceTarget: job.evidenceTarget,
      rendererPayload: job.rendererPayload,
      rendererPrompt,
      rendererPromptSha256: sha256Text(rendererPrompt),
    });
    provenanceRecords.push({
      jobId: job.jobId,
      fixture: job.fixture,
      boundary: "excluded_from_renderer_payload_and_compiled_prompt",
    });
  }
  return {
    rendererPacket: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      generatedAt: ARTIFACT_GENERATED_AT,
      kind: "v3_batch_000_request_only_renderer_packet",
      founderSpec: sourceDescriptor(FOUNDER_V3_SPEC_PATH),
      policy: {
        rendererPayloadContainsCanonicalIdentity: false,
        visibleText: "none",
        labels: "none",
        trademarks: "none",
        claims: "none",
        use: "non_public_review_evidence_only",
      },
      counts: {
        rendererJobs: rendererJobs.length,
        namedProductPrompts: 0,
      },
      rendererJobs,
    },
    batch0Provenance: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      generatedAt: ARTIFACT_GENERATED_AT,
      kind: "v3_batch_000_fixture_provenance_not_renderer_input",
      rendererPacketPath: "docs/product-imagery/manifests/renderer-packet-v3.json",
      warning: "Do not send this provenance artifact to the renderer.",
      counts: { provenanceRecords: provenanceRecords.length },
      provenanceRecords,
    },
  };
}

function buildRenderQueue(batch0AssetManifest) {
  const assetByJob = new Map(batch0AssetManifest.assets.map((asset) => [asset.jobId, asset]));
  const items = BATCH0_JOBS.map((job, index) => {
    const asset = assetByJob.get(job.jobId);
    return {
      sequence: index + 1,
      jobId: job.jobId,
      imageClass: job.imageClass,
      target: job.evidenceTarget.repositoryPath,
      queueStatus: asset.source ? "rendered_awaiting_review" : "ready_to_render",
      mayPublish: false,
    };
  });
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_sanitized_render_queue",
    exactNamedVariantQueueRemoved: true,
    counts: {
      batches: 1,
      items: items.length,
      readyToRender: items.filter((item) => item.queueStatus === "ready_to_render").length,
      renderedAwaitingReview: items.filter(
        (item) => item.queueStatus === "rendered_awaiting_review",
      ).length,
      publishable: 0,
    },
    batches: [
      {
        batchId: "batch-000-v3-class-taxonomy",
        purpose: "prove the renderer-neutral visual grammar before exact-product expansion",
        items,
      },
    ],
  };
}

function buildCoverageLedger(reviewedProjection, batch0AssetManifest) {
  const candidateByClass = new Map(
    batch0AssetManifest.assets.map((asset) => [asset.imageClass, asset]),
  );
  const rows = reviewedProjection.rows.map((row) => {
    const imageClass =
      REVIEWED_PRESENTATION_CLASS_OVERRIDES[row.groupId] ??
      DOSAGE_FORM_TO_IMAGE_CLASS.get(row.dosageForm);
    if (!imageClass) throw new Error(`No presentation image class for ${row.dosageForm}`);
    const candidate = candidateByClass.get(imageClass);
    if (!candidate) throw new Error(`No Batch 0 candidate for image class ${imageClass}`);
    return {
      manifestKey: row.offeringVariantId,
      groupId: row.groupId,
      offeringId: row.offeringId,
      offeringVariantId: row.offeringVariantId,
      family: row.family,
      category: row.category,
      product: row.product,
      specification: row.specification,
      dosageForm: row.dosageForm,
      sourceGroupIds: row.sourceGroupIds,
      imageClass,
      exactAsset: null,
      classCandidate: {
        jobId: candidate.jobId,
        repositoryPath: candidate.repositoryPath,
        reviewStatus: candidate.reviewStatus,
        publicPath: null,
      },
      coverageStatus: candidate.source
        ? "non_public_class_candidate_rendered"
        : "non_public_class_candidate_pending",
    };
  });
  const rowKeys = new Set(rows.map((row) => row.manifestKey));
  if (rowKeys.size !== rows.length) throw new Error("Coverage manifest keys are not unique");
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_reviewed_catalog_image_coverage",
    runtimeCatalogAuthority: false,
    businessStateAuthority: false,
    forbiddenOwnedFields: [
      "displayState",
      "workflowMode",
      "action",
      "price",
      "priceCents",
      "cartEligible",
      "sellable",
      "inventory",
      "formulationHold",
    ],
    sources: reviewedProjection.sources,
    invariants: {
      reviewedSourceRows: reviewedProjection.sourceRowCount,
      canonicalRows: rows.length,
      supersededSourceRows: reviewedProjection.sourceRowCount - rows.length,
      exactAssetsApproved: 0,
      publicAssetsWired: 0,
      rowsWithBusinessStateFields: 0,
      rowsWithPriceFields: 0,
    },
    byImageClass: countBy(rows, (row) => row.imageClass),
    rows,
  };
}

function buildIdentityCrosswalk(reviewedProjection, coverageLedger) {
  const bindingSource = readJson(BINDING_SOURCE_PATH);
  const featuredSource = readJson(FEATURED_IDENTITY_SOURCE_PATH);
  const directByVariant = new Map(
    bindingSource.bindings.map((binding) => [binding.offeringVariantId, binding]),
  );
  const bindingBySku = new Map(
    bindingSource.bindings.map((binding) => [binding.productControlSku, binding]),
  );
  const aliasesByCanonicalVariant = new Map();
  for (const alias of featuredSource.aliases) {
    const values = aliasesByCanonicalVariant.get(alias.canonicalVariantId) ?? [];
    values.push(alias);
    aliasesByCanonicalVariant.set(alias.canonicalVariantId, values);
  }
  const coverageByKey = new Map(coverageLedger.rows.map((row) => [row.manifestKey, row]));

  const entries = reviewedProjection.rows.map((row) => {
    const direct = directByVariant.get(row.offeringVariantId) ?? null;
    const supersededGroupId = SUPERSEDED_FORWARD_GROUPS[row.groupId] ?? null;
    const forwardBinding = supersededGroupId
      ? bindingBySku.get(`GEN-${supersededGroupId}`) ?? null
      : null;
    const featuredAliases = (aliasesByCanonicalVariant.get(row.offeringVariantId) ?? []).map(
      (alias) => ({
        productId: alias.liveProductId,
        variantId: alias.liveVariantId,
        productSku: alias.liveProductSku,
        variantSku: alias.liveVariantSku,
        evidenceAction: alias.action,
      }),
    );
    const historicalForwardAliases = forwardBinding
      ? [
          {
            sourceGroupId: supersededGroupId,
            offeringId: forwardBinding.offeringId,
            offeringVariantId: forwardBinding.offeringVariantId,
            productControlSku: forwardBinding.productControlSku,
            productControlProductId: forwardBinding.productId,
            productControlVariantId: forwardBinding.variantId,
            disposition: "forward_only_to_reviewed_kept_identity",
          },
        ]
      : [];
    return {
      manifestKey: row.offeringVariantId,
      canonical: {
        groupId: row.groupId,
        offeringId: row.offeringId,
        offeringVariantId: row.offeringVariantId,
        targetProductControlSku: `GEN-${row.groupId}`,
        sourceGroupIds: row.sourceGroupIds,
      },
      currentProductControlBinding: direct
        ? {
            status: "exact_current_binding",
            productControlSku: direct.productControlSku,
            productId: direct.productId,
            variantId: direct.variantId,
          }
        : {
            status: "target_binding_not_materialized",
            productControlSku: `GEN-${row.groupId}`,
            productId: null,
            variantId: null,
          },
      aliases: {
        historicalForwardAliases,
        legacyFeaturedAliases: featuredAliases,
      },
      resolvedCandidate: coverageByKey.get(row.offeringVariantId).classCandidate,
    };
  });

  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_product_image_identity_crosswalk",
    runtimeCatalogAuthority: false,
    sources: {
      bindings: sourceDescriptor(BINDING_SOURCE_PATH),
      legacyFeaturedIdentityClosure: sourceDescriptor(FEATURED_IDENTITY_SOURCE_PATH),
    },
    invariants: {
      canonicalEntries: entries.length,
      exactCurrentBindings: entries.filter(
        (entry) => entry.currentProductControlBinding.status === "exact_current_binding",
      ).length,
      targetBindingsNotMaterialized: entries.filter(
        (entry) => entry.currentProductControlBinding.status === "target_binding_not_materialized",
      ).length,
      historicalForwardAliases: entries.reduce(
        (sum, entry) => sum + entry.aliases.historicalForwardAliases.length,
        0,
      ),
      legacyFeaturedAliases: entries.reduce(
        (sum, entry) => sum + entry.aliases.legacyFeaturedAliases.length,
        0,
      ),
      supersededManifestOwners: entries.filter((entry) =>
        ["GRP-0402", "GRP-0407"].includes(entry.canonical.groupId),
      ).length,
    },
    entries,
  };
}

function buildStateAuthorityAudit(reviewedProjection) {
  const currentCatalog = readJson(CATALOG_SOURCE_PATH);
  const currentBindings = readJson(BINDING_SOURCE_PATH);
  const reconciliation = readJson(CATALOG_RECONCILIATION_SOURCE_PATH);
  const serviceSource = readText(CUSTOMER_EXPOSURE_SOURCE_PATH);
  const excludedOfferingIds = extractRuntimeExcludedOfferingIds(serviceSource);
  const currentRows = currentCatalog.products.flatMap((product) =>
    product.variants.map((variant) => ({ ...variant, product })),
  );
  const currentExposed = currentRows.filter(
    (row) => !excludedOfferingIds.has(row.product.id),
  );
  const reviewedTargetExposed = reviewedProjection.rows.filter(
    (row) => row.groupId !== SHIPPING_GROUP_ID,
  );
  const targetChannelCounts = countBy(reviewedProjection.rows, (row) => row.channel);
  const currentDisplayStateCounts = countBy(currentRows, (row) => row.product.displayState);
  const structuredHoldGroups = reconciliation.commerceHolds.map((hold) => hold.sourceRow);
  const currentVariantIds = new Set(currentRows.map((row) => row.id));
  const exactCurrentIdentityRows = reviewedProjection.rows.filter((row) =>
    currentVariantIds.has(row.offeringVariantId),
  );
  const reviewedReplacementRows = reviewedProjection.rows.filter((row) =>
    Object.hasOwn(SUPERSEDED_FORWARD_GROUPS, row.groupId),
  );
  const genuineNewRows = reviewedProjection.rows.filter(
    (row) =>
      !currentVariantIds.has(row.offeringVariantId) &&
      !Object.hasOwn(SUPERSEDED_FORWARD_GROUPS, row.groupId),
  );

  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "catalog_state_observation_not_image_authority",
    authority: {
      imageSystemOwnsBusinessState: false,
      imageSystemOwnsPrice: false,
      imageSystemOwnsWorkflowOrAction: false,
      rule:
        "Runtime commerce and Product Control supply state. Imagery may select a presentation for an externally supplied state but may not derive, persist, or override that state.",
    },
    sources: {
      currentlyMountedCatalog: sourceDescriptor(CATALOG_SOURCE_PATH),
      currentlyMountedBindings: sourceDescriptor(BINDING_SOURCE_PATH),
      currentExposureCode: sourceDescriptor(CUSTOMER_EXPOSURE_SOURCE_PATH),
      reviewedCatalog: reviewedProjection.sources.catalogCsv,
      reviewedReconciliation: sourceDescriptor(CATALOG_RECONCILIATION_SOURCE_PATH),
    },
    currentlyMounted: {
      status: "materialized_runtime_truth",
      canonicalRows: currentRows.length,
      exposedRows: currentExposed.length,
      bindingRows: currentBindings.bindings.length,
      unboundRows: currentBindings.unboundCount,
      displayStateCounts: currentDisplayStateCounts,
      commerceWorkflowCounts: {
        provider_request: 242,
        direct_order_request: 131,
        request_activation: 44,
        availability_review: 1,
        request_pricing: 1,
      },
      careRows: 242,
      structuredFormulationHoldRowsRepresented: 0,
      priceOnRequestRows: 2,
      catalogComingSoonRows: 0,
      excludedShippingGroupIds: [SHIPPING_GROUP_ID],
    },
    reviewedTarget: {
      status: "reviewed_source_truth_not_yet_materialized",
      canonicalRows: reviewedProjection.canonicalRowCount,
      exposedRows: reviewedTargetExposed.length,
      exactCurrentIdentityRows: exactCurrentIdentityRows.length,
      reviewedIdentityReplacementRows: reviewedReplacementRows.length,
      reviewedIdentityReplacementGroupIds: reviewedReplacementRows.map((row) => row.groupId),
      genuineNewIdentityRows: genuineNewRows.length,
      genuineNewIdentityGroupIds: genuineNewRows.map((row) => row.groupId),
      currentProductControlResolvableAfterForwardAliases: 417,
      currentExposedUnboundAfterForwardAliases: 6,
      expectedBindingRowsAfterRegeneration: 421,
      expectedUnboundRowsAfterRegeneration: 3,
      sourceChannelCounts: targetChannelCounts,
      commerceWorkflowCountsAfterRegenerationAndPriceBinding: {
        provider_request: 242,
        direct_order_request: 136,
        request_activation: 42,
        availability_review: 2,
        request_pricing: 1,
      },
      careRows: 242,
      structuredFormulationHoldRows: structuredHoldGroups.length,
      structuredFormulationHoldGroupIds: structuredHoldGroups,
      priceOnRequestRows: 2,
      priceOnRequestGroupIds: [PRICE_REQUEST_GROUP_ID, SYRINGE_GROUP_ID],
      catalogComingSoonRows: 0,
      separateComingSoonOffersIntended: 2,
      separateComingSoonOfferNames: ["Superpower", "Mito Health"],
      excludedShippingGroupIds: [SHIPPING_GROUP_ID],
    },
    materializationGap: {
      catalogRows: reviewedProjection.canonicalRowCount - currentRows.length,
      exposedRows: reviewedTargetExposed.length - currentExposed.length,
      targetMaterialized: false,
      blocksRuntimeImageWiring: true,
    },
  };
}

function indexAdd(index, key, manifestKey) {
  if (key === null || key === undefined || key === "") return;
  const normalized = String(key);
  const values = index.get(normalized) ?? new Set();
  values.add(manifestKey);
  index.set(normalized, values);
}

function buildIdentityIndexes(identityCrosswalk) {
  const indexes = {
    groupId: new Map(),
    offeringId: new Map(),
    offeringVariantId: new Map(),
    productControlSku: new Map(),
    productControlProductId: new Map(),
    productControlVariantId: new Map(),
    legacyProductId: new Map(),
    legacyVariantId: new Map(),
    legacyProductSku: new Map(),
    legacyVariantSku: new Map(),
  };
  for (const entry of identityCrosswalk.entries) {
    const key = entry.manifestKey;
    indexAdd(indexes.groupId, entry.canonical.groupId, key);
    indexAdd(indexes.offeringId, entry.canonical.offeringId, key);
    indexAdd(indexes.offeringVariantId, entry.canonical.offeringVariantId, key);
    indexAdd(indexes.productControlSku, entry.canonical.targetProductControlSku, key);
    const binding = entry.currentProductControlBinding;
    indexAdd(indexes.productControlSku, binding.productControlSku, key);
    indexAdd(indexes.productControlProductId, binding.productId, key);
    indexAdd(indexes.productControlVariantId, binding.variantId, key);
    for (const alias of entry.aliases.historicalForwardAliases) {
      indexAdd(indexes.groupId, alias.sourceGroupId, key);
      indexAdd(indexes.offeringId, alias.offeringId, key);
      indexAdd(indexes.offeringVariantId, alias.offeringVariantId, key);
      indexAdd(indexes.productControlSku, alias.productControlSku, key);
      indexAdd(indexes.productControlProductId, alias.productControlProductId, key);
      indexAdd(indexes.productControlVariantId, alias.productControlVariantId, key);
    }
    for (const alias of entry.aliases.legacyFeaturedAliases) {
      indexAdd(indexes.legacyProductId, alias.productId, key);
      indexAdd(indexes.legacyVariantId, alias.variantId, key);
      indexAdd(indexes.legacyProductSku, alias.productSku, key);
      indexAdd(indexes.legacyVariantSku, alias.variantSku, key);
    }
  }
  return indexes;
}

export function resolveCrosswalkManifestKey(identityCrosswalk, identity = {}) {
  const indexes = buildIdentityIndexes(identityCrosswalk);
  const signals = [];
  for (const [field, index] of Object.entries(indexes)) {
    const value = identity[field];
    if (value === null || value === undefined || value === "") continue;
    const matches = index.get(String(value));
    if (!matches || matches.size === 0) return null;
    signals.push(matches);
  }
  if (signals.length === 0) return null;
  let candidates = new Set(signals[0]);
  for (const signal of signals.slice(1)) {
    candidates = new Set([...candidates].filter((value) => signal.has(value)));
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

export function assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger) {
  const coverageKeys = new Set(coverageLedger.rows.map((row) => row.manifestKey));
  if (identityCrosswalk.entries.length !== coverageKeys.size) {
    throw new Error("Identity crosswalk and coverage cardinalities differ");
  }
  for (const entry of identityCrosswalk.entries) {
    if (!coverageKeys.has(entry.manifestKey)) {
      throw new Error(`Crosswalk entry ${entry.manifestKey} has no coverage row`);
    }
    const resolved = resolveCrosswalkManifestKey(identityCrosswalk, {
      groupId: entry.canonical.groupId,
      offeringId: entry.canonical.offeringId,
      offeringVariantId: entry.canonical.offeringVariantId,
    });
    if (resolved !== entry.manifestKey) {
      throw new Error(`Canonical identities do not converge for ${entry.manifestKey}`);
    }
  }
  return true;
}

function isApprovedPublicAsset(asset) {
  if (!asset || asset.reviewStatus !== "approved") return false;
  if (typeof asset.assetId !== "string" || !asset.assetId) return false;
  if (typeof asset.alt !== "string" || !asset.alt.trim()) return false;
  if (!Number.isInteger(asset.width) || asset.width <= 0) return false;
  if (!Number.isInteger(asset.height) || asset.height <= 0) return false;
  if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) return false;
  if (
    typeof asset.publicPath !== "string" ||
    !/^\/research\/products\/[a-z0-9/_-]+-[a-f0-9]{12}\.(?:avif|png|webp)$/.test(
      asset.publicPath,
    ) ||
    !path.basename(asset.publicPath).includes(asset.sha256.slice(0, 12))
  ) {
    return false;
  }
  const approval = asset.approval;
  if (!approval || typeof approval !== "object") return false;
  if (typeof approval.namedApprover !== "string" || !approval.namedApprover.trim()) return false;
  if (typeof approval.approvalRecord !== "string" || !approval.approvalRecord.trim()) return false;
  if (approval.exactSha256 !== asset.sha256) return false;
  if (
    typeof approval.approvedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(approval.approvedAt)
  ) {
    return false;
  }
  return true;
}

function validatedApprovedAssets(assets) {
  const approved = assets.filter(isApprovedPublicAsset);
  const assetIds = new Set();
  const publicPaths = new Set();
  for (const asset of approved) {
    if (assetIds.has(asset.assetId) || publicPaths.has(asset.publicPath)) return [];
    assetIds.add(asset.assetId);
    publicPaths.add(asset.publicPath);
  }
  return approved;
}

/**
 * Pure presentation resolver. `runtimePresentationState` is supplied by the
 * caller's business authority; this function never derives or changes it.
 */
export function resolveProductImage({
  identityCrosswalk,
  coverageLedger,
  approvedAssets = [],
  identity,
  runtimePresentationState = null,
}) {
  const manifestKey = resolveCrosswalkManifestKey(identityCrosswalk, identity);
  if (!manifestKey) return { status: "identity_not_resolved", image: null };
  const coverage = coverageLedger.rows.find((row) => row.manifestKey === manifestKey);
  if (!coverage) return { status: "coverage_not_found", image: null };
  const knownPresentationStates = new Set([
    null,
    "normal",
    ...Object.keys(EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS),
  ]);
  if (!knownPresentationStates.has(runtimePresentationState)) {
    return {
      status: "invalid_external_presentation_state",
      manifestKey,
      image: null,
    };
  }
  const approved = validatedApprovedAssets(approvedAssets);
  const stateClass = EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS[runtimePresentationState] ?? null;
  const candidates = [
    stateClass ? approved.find((asset) => asset.imageClass === stateClass) : null,
    approved.find((asset) => asset.manifestKey === manifestKey),
    approved.find((asset) => asset.imageClass === coverage.imageClass),
  ].filter(Boolean);
  if (candidates.length === 0) {
    return {
      status: "intentional_no_image_until_named_approval",
      manifestKey,
      image: null,
    };
  }
  const asset = candidates[0];
  return {
    status: "approved_image",
    manifestKey,
    image: {
      src: asset.publicPath,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
      assetId: asset.assetId,
    },
  };
}

export function buildArtifacts() {
  const founderSpec = sourceDescriptor(FOUNDER_V3_SPEC_PATH);
  if (founderSpec.sha256 !== FOUNDER_V3_SPEC_SHA256) {
    throw new Error(`Founder v3 spec checksum mismatch: ${founderSpec.sha256}`);
  }
  const reviewedProjection = buildReviewedCatalogProjection();
  validateBatch0FixtureJoin(reviewedProjection);
  const assetManifest = buildQuarantineManifest();
  const batch0AssetManifest = buildBatch0AssetManifest();
  const { rendererPacket, batch0Provenance } = buildRendererPacket();
  const renderQueue = buildRenderQueue(batch0AssetManifest);
  const coverageLedger = buildCoverageLedger(reviewedProjection, batch0AssetManifest);
  const identityCrosswalk = buildIdentityCrosswalk(reviewedProjection, coverageLedger);
  const stateAuthorityAudit = buildStateAuthorityAudit(reviewedProjection);
  assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger);

  return {
    metadata: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      generatedAt: ARTIFACT_GENERATED_AT,
      sourceBaseCommit: SOURCE_BASE_COMMIT,
      sourceBaseTree: SOURCE_BASE_TREE,
      founderSpec,
      acceptance: V3_ACCEPTANCE,
    },
    reviewedProjection,
    assetManifest,
    batch0AssetManifest,
    rendererPacket,
    batch0Provenance,
    renderQueue,
    coverageLedger,
    identityCrosswalk,
    stateAuthorityAudit,
  };
}

function markdownCounts(record) {
  return Object.entries(record)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
}

export function renderCoverageSummary({
  metadata,
  coverageLedger,
  identityCrosswalk,
  stateAuthorityAudit,
  batch0AssetManifest,
  renderQueue,
  assetManifest,
}) {
  return `# Xenios product imagery v3 correction status

Generated from primary base \`${metadata.sourceBaseCommit}\` (tree \`${metadata.sourceBaseTree}\`). This is evidence and source-only imagery work; it is not a production deployment or a commerce-state authority.

## Corrected catalog accounting

| Measure | Count |
| --- | ---: |
| Reviewed workbook rows | ${coverageLedger.invariants.reviewedSourceRows} |
| Canonical variants after reviewed merges | ${coverageLedger.invariants.canonicalRows} |
| Customer-exposed target after shipping exclusion | ${stateAuthorityAudit.reviewedTarget.exposedRows} |
| Currently mounted canonical / exposed | ${stateAuthorityAudit.currentlyMounted.canonicalRows} / ${stateAuthorityAudit.currentlyMounted.exposedRows} |
| Care rows | ${stateAuthorityAudit.reviewedTarget.careRows} |
| Structured formulation holds | ${stateAuthorityAudit.reviewedTarget.structuredFormulationHoldRows} |
| Price-on-request rows | ${stateAuthorityAudit.reviewedTarget.priceOnRequestRows} |
| Catalog coming-soon rows | ${stateAuthorityAudit.reviewedTarget.catalogComingSoonRows} |
| Separate coming-soon offers intended | ${stateAuthorityAudit.reviewedTarget.separateComingSoonOffersIntended} |

The reviewed 424-row target is **not materialized** in the runtime catalog yet. Runtime image wiring remains blocked until catalog/binding regeneration and independent image approval.

## Identity correction

- GRP-0425 / \`mov_c26ef47dfbbe46f7e090\` is the reviewed Oxytocin owner. GRP-0407 and its current Product Control identity are forward aliases only.
- GRP-0426 / \`mov_3c8ca424d78153fd931a\` is the reviewed Hexarelin owner. GRP-0402 and its current Product Control identity are forward aliases only.
- Superseded manifest owners: ${identityCrosswalk.invariants.supersededManifestOwners}.
- Exact current Product Control bindings on reviewed identities: ${identityCrosswalk.invariants.exactCurrentBindings}; target bindings not yet materialized: ${identityCrosswalk.invariants.targetBindingsNotMaterialized}.

## Batch 0

| Measure | Count |
| --- | ---: |
| Sanitized class jobs | ${batch0AssetManifest.counts.jobs} |
| Rendered, non-public | ${batch0AssetManifest.counts.rendered} |
| Pending renders | ${batch0AssetManifest.counts.pending} |
| Independently approved | ${batch0AssetManifest.counts.approved} |
| Public | ${batch0AssetManifest.counts.public} |

Renderer payloads contain no canonical product name, mark, strength, quantity, price, label, claim, or visible text. Fixture identity is stored in a physically separate provenance section. The old 423/419-style named prompt queue has been removed; the only queue is the ${renderQueue.counts.items}-item Batch 0 class packet.

## Image classes represented by the 424 reviewed variants

| Class | Rows |
| --- | ---: |
${markdownCounts(coverageLedger.byImageClass)}

## Quarantine and public status

All ${assetManifest.counts.quarantined} pre-v3 WebPs were removed from \`client/public\` and retained under non-public evidence paths. They remain permanently nonapprovable. No Batch 0 candidate is publishable without exact-hash, named independent approval.

## Runtime integration status

The pure resolver accepts exact canonical, Product Control, forward, and legacy Featured identities, then chooses only among separately supplied approved public assets. Business state is an external input; the resolver does not derive price, action, workflow, availability, Care, hold, or purchase eligibility. With zero approved public assets, its expected result is intentional no-image.
`;
}

export function supersededForwardGroups() {
  return { ...SUPERSEDED_FORWARD_GROUPS };
}

export function externallySuppliedStateImageClasses() {
  return { ...EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS };
}

export function reviewedSpecialGroupIds() {
  return {
    shipping: SHIPPING_GROUP_ID,
    syringe: SYRINGE_GROUP_ID,
    priceRequest: PRICE_REQUEST_GROUP_ID,
    formulationHold: FORMULATION_HOLD_GROUP_ID,
  };
}

export function listPublicFallbackWebps() {
  const directory = path.join(REPO_ROOT, "client/public/research/products/fallbacks");
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) {
        files.push(path.relative(directory, absolute).replaceAll("\\", "/"));
      }
    }
  };
  walk(directory);
  return files.sort((a, b) => a.localeCompare(b));
}

export function listPublicProductImages() {
  const directory = path.join(REPO_ROOT, "client/public/research/products");
  if (!fs.existsSync(directory)) return [];
  const images = [];
  const extensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        images.push(path.relative(directory, absolute).replaceAll("\\", "/"));
      }
    }
  };
  walk(directory);
  return images.sort((a, b) => a.localeCompare(b));
}

export function listRuntimeEvidenceReferences() {
  const roots = ["client/src", "server", "shared"];
  const extensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".ts", ".tsx"]);
  const forbidden = [
    "/research/products/fallbacks/",
    "batch0-render-candidates",
    "pre-v3-nonapprovable",
  ];
  const matches = [];
  const walk = (absoluteRoot) => {
    for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
      const absolute = path.join(absoluteRoot, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        const content = fs.readFileSync(absolute, "utf8");
        const hit = forbidden.find((value) => content.includes(value));
        if (hit) {
          matches.push({
            path: path.relative(REPO_ROOT, absolute).replaceAll("\\", "/"),
            reference: hit,
          });
        }
      }
    }
  };
  for (const root of roots) {
    const absoluteRoot = path.join(REPO_ROOT, root);
    if (fs.existsSync(absoluteRoot)) walk(absoluteRoot);
  }
  return matches.sort((a, b) => a.path.localeCompare(b.path));
}

export function knownQuarantinedPaths() {
  return sortedUnique(FALLBACK_ASSETS.map((asset) => asset.filePath));
}
