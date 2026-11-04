#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const outputPath = resolve(batchDir, "coverage-ledger.v2.json");
const releaseBaseline = "5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b";

const datasetPath = resolve(
  repoRoot,
  "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
);
const bindingsPath = resolve(
  repoRoot,
  "server/research/master-offerings/data/master-offering-bindings.generated.json",
);
const batch002ManifestPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-002/media-batch.v1.json",
);
const batch004ManifestPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-004/media-batch.v1.json",
);
const batch004EvidencePath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-004/internal-evidence.v1.json",
);
const batch005ManifestPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-005/media-batch.v1.json",
);
const batch006LeadsPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-006/source-leads.v1.json",
);

const predecessorDefinitions = [
  {
    batchId: "catalog-imagery-2026-11-04-batch-002",
    sourceCommit: "dd71617ec04ec231646296a3ae0eafcf62cffee5",
    sourceTree: "85e744221dbeb33f3bde660a450e06f6e55f9a1c",
    metadataCommit: null,
    reviewReference: "KAN-31/10623",
    disposition: "internal_service_presentation_accepted_only",
    files: [
      ["deliveries/catalog-imagery/2026-11-04-batch-002/media-batch.v1.json", "183013503511c88e1daf0c2e0fc0ecfdac186a9ba3020fdddd3e2873873d2fea"],
      ["deliveries/catalog-imagery/2026-11-04-batch-002/internal-evidence.v1.json", "818fa79d57f03cfdb9b7abf07c89fea718a50b48f434ceecaea13459fbbe21a1"],
      ["deliveries/catalog-imagery/2026-11-04-batch-002/verification-result.v1.json", "2129e56a9855340c66a0f3c6ae0b15b5e58ecb8fb6e025fbfa8ce0ba730e4cd4"],
    ],
  },
  {
    batchId: "catalog-imagery-2026-11-04-batch-003",
    sourceCommit: "5588d312ff52d5bffa00b81fb1779161a5e5aa09",
    sourceTree: "48c2082572b2563c6b44a494e9573c218d0638e5",
    metadataCommit: null,
    reviewReference: "KAN-31/10623",
    disposition: "denominator_and_pair_dispositions_accepted",
    files: [
      ["deliveries/catalog-imagery/2026-11-04-batch-003/coverage-ledger.v1.json", "47ff857c47db345f5b487a050f619c3510749529ddb93d36a803306e7787a2f9"],
      ["deliveries/catalog-imagery/2026-11-04-batch-003/verification-result.v1.json", "f402a6aac332c73075e71a07938ce1f691e29269882a1eaa9a4159a8177389e3"],
    ],
  },
  {
    batchId: "catalog-imagery-2026-11-04-batch-004",
    sourceCommit: "f72de21651e4bc921c148e7290de79f1a4ea2ea4",
    sourceTree: "3dfc6ca68773fd27d14638efc6d1c6aa9200f931",
    metadataCommit: "cc981957235e018930ac1b43f87bd9d11daef512",
    reviewReference: "KAN-31/10627",
    disposition: "one_exact_website_render_file_level_accepted",
    files: [
      ["deliveries/catalog-imagery/2026-11-04-batch-004/media-batch.v1.json", "fe5d2c601c5593f281a0fcf578c33992023e9783b53c7edde7fbf2e37164b5a6"],
      ["deliveries/catalog-imagery/2026-11-04-batch-004/internal-evidence.v1.json", "d9c7d96a05e08efda8a51b48ee355bc5aa9d311da7faf5b6be72c6bacefeca4e"],
      ["deliveries/catalog-imagery/2026-11-04-batch-004/verification-result.v1.json", "1bd7483ed0290d96e7f8f5926bdc7623ba82d05e1bba75f35c620a58ecb67bbf"],
    ],
  },
  {
    batchId: "catalog-imagery-2026-11-04-batch-005",
    sourceCommit: "8eda87dba4098d656c45651294138f62d8972673",
    sourceTree: "e2a3fb497b316ce24570e14ef7e3022e6d1140e2",
    metadataCommit: "c68b8ad7f161b6bdc1a8fa4b67d3398a6268b1ed",
    reviewReference: "KAN-31/10631",
    disposition: "nine_exact_supplier_images_file_level_accepted_one_version_hold",
    files: [
      ["deliveries/catalog-imagery/2026-11-04-batch-005/media-batch.v1.json", "a8f76e03677f4b7738f1d78c14ca9be29fac14e2c65a96f307c7e6fe73c0e9b9"],
      ["deliveries/catalog-imagery/2026-11-04-batch-005/internal-evidence.v1.json", "32cd3535eca97536ecf14a91162cebe3d4aabaed32e3608923ebee18f45bc3c6"],
      ["deliveries/catalog-imagery/2026-11-04-batch-005/verification-result.v1.json", "39e7700b18574744ad2b42e0b4f731b58f4cb31e1f95f9a5deaae340171e797e"],
    ],
  },
  {
    batchId: "catalog-imagery-2026-11-04-batch-006",
    sourceCommit: "6bb6e16ddc144ec100f5cf8062d52c7f4a5e3357",
    sourceTree: "c70783ed577bd983c29820af3108822f0714202e",
    metadataCommit: null,
    reviewReference: null,
    disposition: "ten_exact_pair_source_leads_held_not_exact",
    files: [
      ["deliveries/catalog-imagery/2026-11-04-batch-006/source-leads.v1.json", "7a06fbdd54bc1b6cd5071ecd536db26d3d2dbf1742ce3accd28d0dcdb3e3dfcb"],
      ["deliveries/catalog-imagery/2026-11-04-batch-006/internal-evidence.v1.json", "7cd5d2e29194478d6deeb1240da2fcfc498059cb9e68e788ac566726c939829a"],
      ["deliveries/catalog-imagery/2026-11-04-batch-006/verification-result.v1.json", "977c1e16d95c2e2fdfe492c87c653a144a30c15fe852711aa8318c3245e5fcf1"],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(Buffer.from("blob " + bytes.length + "\0"))
    .update(bytes)
    .digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizedTextBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
}

function pairKey(offeringId, sourceVariantId) {
  return offeringId + "/" + sourceVariantId;
}

function validatePredecessors() {
  return predecessorDefinitions.map((predecessor) => {
    const files = predecessor.files.map(([path, expectedSha256]) => {
      const checkoutBytes = readFileSync(resolve(repoRoot, path));
      const bytes = normalizedTextBytes(checkoutBytes);
      const actualSha256 = sha256(bytes);
      if (actualSha256 !== expectedSha256) {
        throw new Error(path + ": predecessor SHA-256 changed");
      }
      if (path.includes("verification-result")) {
        const receipt = JSON.parse(bytes.toString("utf8"));
        if (receipt.ok !== true || receipt.errors?.length !== 0) {
          throw new Error(path + ": predecessor receipt is not green");
        }
      }
      return {
        path,
        bytes: bytes.length,
        sha256: actualSha256,
      };
    });
    return {
      batchId: predecessor.batchId,
      sourceCommit: predecessor.sourceCommit,
      sourceTree: predecessor.sourceTree,
      metadataCommit: predecessor.metadataCommit,
      reviewReference: predecessor.reviewReference,
      disposition: predecessor.disposition,
      files,
    };
  });
}

function normalizeAsset(asset, role, extra = {}) {
  return {
    role,
    relativeAssetPath: asset.relativeAssetPath,
    format: asset.format || extname(asset.relativeAssetPath).slice(1).toLowerCase(),
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    sha256: asset.sha256,
    ...extra,
  };
}

function unresolvedGaps(product) {
  const commonRights =
    "Authorized exact-product media source and release-specific publication approval are missing.";
  switch (product.family) {
    case "clinical_formulations_503a":
      return [
        "Exact dispensing pharmacy/manufacturer and strength-specific package presentation are not established in an approved media record.",
        "Approved current container/label proof and packaging-production state are missing.",
        commonRights,
      ];
    case "research_peptides_materials": {
      const gaps = [
        "Exact selected Xenios white-label container, cap, label dimensions and physical specification are missing.",
        "Supplier-approved proof and actual manufacturer/distributor attribution are missing.",
        "Printed/in-use evidence, exact runtime media, and release publication approval are missing.",
      ];
      if (product.subcategory === "Form not stated") {
        gaps.unshift(
          "Exact physical form and package presentation are not stated in the committed member-safe catalog.",
        );
      }
      return gaps;
    }
    case "research_capsules":
      return [
        "Exact selected Xenios white-label bottle, closure, capsule count and label dimensions are missing.",
        "Supplier-approved proof and actual manufacturer/distributor attribution are missing.",
        "Printed/in-use evidence, exact runtime media, and release publication approval are missing.",
      ];
    case "supplements":
      return [
        "No file-level accepted exact current manufacturer product image exists for this exact pair.",
        "Current formula, strength, count or package version still requires exact-product reconciliation.",
        "Exact runtime media, mounted paint, and release publication approval are missing.",
      ];
    case "research_supplies":
      return [
        "Exact manufacturer, grade, concentration, container and volume/pack identity are missing from an approved media record.",
        "Official exact-package image and reuse basis are missing.",
        "Packaging-production state, exact runtime media, and release publication approval are missing.",
      ];
    case "topicals_regenerative":
      return [
        "Exact manufacturer/compounding source and strength-specific container presentation are missing from an approved media record.",
        "Approved current label proof and packaging-production state are missing.",
        commonRights,
      ];
    default:
      return [
        "Exact product-specific physical package identity is not established in an approved media record.",
        commonRights,
      ];
  }
}

const datasetCheckout = readFileSync(datasetPath);
const datasetCommitted = Buffer.from(datasetCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const bindingsCheckout = readFileSync(bindingsPath);
const bindingsCommitted = Buffer.from(bindingsCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const dataset = JSON.parse(datasetCheckout.toString("utf8"));
const bindings = JSON.parse(bindingsCheckout.toString("utf8"));
const batch002 = readJson(batch002ManifestPath);
const batch004 = readJson(batch004ManifestPath);
const batch004Evidence = readJson(batch004EvidencePath);
const batch005 = readJson(batch005ManifestPath);
const batch006 = readJson(batch006LeadsPath);
const predecessors = validatePredecessors();

const bpcPair = pairKey(
  batch004.records[0].offeringId,
  batch004.records[0].sourceVariantId,
);
const servicePair = "mo_003b0c272099eeb1f114/mov_9b65ad5bb184691e19e0";
const supplyPair = "mo_a7a7e307d58f24affb42/mov_512ed6b875c04eee4753";
const batch005ByPair = new Map(
  batch005.records.map((record) => [pairKey(record.offeringId, record.sourceVariantId), record]),
);
const batch006ByPair = new Map(
  batch006.records.map((record) => [pairKey(record.offeringId, record.sourceVariantId), record]),
);
const bindingByPair = new Map(
  bindings.bindings.map((binding) => [
    pairKey(binding.offeringId, binding.offeringVariantId),
    binding,
  ]),
);
const unboundByPair = new Map(
  bindings.unbound.map((record) => [
    pairKey(record.offeringId, record.offeringVariantId),
    record,
  ]),
);

const overlayPairs = [
  bpcPair,
  ...batch005ByPair.keys(),
  ...batch006ByPair.keys(),
  servicePair,
  supplyPair,
];
if (new Set(overlayPairs).size !== overlayPairs.length) {
  throw new Error("overlay pair sets are not mutually disjoint");
}

const bpcRecord = batch004.records[0];
const bpcEvidence = batch004Evidence.records[0];
const bpcArtifactsByPath = new Map(
  batch004.artifacts.map((artifact) => [artifact.relativeAssetPath, artifact]),
);
const bpcPreparedAssets = bpcRecord.integrationHandoff.eligibleAssets.map((eligible) => {
  const artifact = bpcArtifactsByPath.get(eligible.relativeAssetPath);
  if (!artifact) throw new Error(eligible.relativeAssetPath + ": BPC artifact is missing");
  return normalizeAsset(artifact, eligible.role, {
    altText: eligible.altText,
    caption: eligible.caption,
  });
});

const batch002Record = batch002.records[0];
const servicePreparedAssets = [
  ...batch002Record.media.images.map((asset) =>
    normalizeAsset(asset, asset.role || "primary", { altText: asset.altText }),
  ),
  ...batch002Record.media.sourceMasters.map((asset) =>
    normalizeAsset(asset, "source_master"),
  ),
];

const records = [];
for (const product of dataset.products) {
  for (const variant of product.variants) {
    const key = pairKey(product.id, variant.id);
    const binding = bindingByPair.get(key);
    const unbound = unboundByPair.get(key);
    const base = {
      offeringId: product.id,
      sourceVariantId: variant.id,
      canonicalName: product.canonicalName,
      variantLabel: variant.label,
      family: product.family,
      category: product.category,
      subcategory: product.subcategory,
      canonicalBrand: product.brand,
      displayState: product.displayState,
      physicalProductImageApplicable: key !== servicePair,
      countsAsFileLevelAcceptedExactAsset: false,
      countsAsFinalReviewedExactAsset: false,
      runtimeLinked: false,
      mountedOnCustomerSurface: false,
      publicationAuthorized: false,
      fullyVerifiedReady: false,
      bindingDisposition: binding
        ? { state: "bound", productControlSku: binding.productControlSku }
        : { state: "unbound", reason: unbound?.reason || "unbound reason missing" },
      preparedAssets: [],
      heldSourceLeadAssets: [],
    };

    if (key === bpcPair) {
      records.push({
        ...base,
        countsAsFileLevelAcceptedExactAsset: true,
        mediaStatus: "exact_website_render_file_level_accepted_pending_runtime_integration",
        assetType: "original_xenios_website_render",
        packagingProductionState: "design",
        artworkVersion: bpcRecord.artworkVersion,
        quickOrderSku: bpcRecord.quickOrderSku,
        preparedAssets: bpcPreparedAssets,
        sourceSearchBasis: bpcEvidence.sourceAndReuseBasis,
        reviewDisposition:
          "KAN-31/10627 accepted the exact-pair website render and label-detail bytes at file level only.",
        reviewReference: "KAN-31/10627",
        reviewedSourceCommit: "f72de21651e4bc921c148e7290de79f1a4ea2ea4",
        preciseExternalGaps: bpcEvidence.preciseGaps,
      });
      continue;
    }

    const batch005Record = batch005ByPair.get(key);
    if (batch005Record) {
      const asset = normalizeAsset(
        batch005Record.asset,
        batch005Record.reviewStatus ===
          "file_level_review_accepted_pending_runtime_integration"
          ? "official_product_photo"
          : "held_official_source_lead",
        { altText: batch005Record.asset.altTextCandidate },
      );
      if (
        batch005Record.reviewStatus ===
        "file_level_review_accepted_pending_runtime_integration"
      ) {
        records.push({
          ...base,
          countsAsFileLevelAcceptedExactAsset: true,
          mediaStatus:
            "official_exact_product_image_file_level_accepted_pending_runtime_integration",
          assetType: "official_manufacturer_photo",
          packagingProductionState: "current_supplier_export_file_level_match",
          quickOrderSku: batch005Record.quickOrderSku,
          supplierItemCode: batch005Record.supplierItemCode,
          expectedPackage: batch005Record.expectedPackage,
          officialProductPage: batch005Record.officialProductPage,
          officialImageUrl: batch005Record.officialImageUrl,
          preparedAssets: [asset],
          sourceSearchBasis:
            "Official NutriDyn product-media export acquired under founder website authority; supplier brand and original bytes preserved.",
          reviewDisposition:
            "KAN-31/10631 accepted this exact product/package export at file level only.",
          reviewReference: "KAN-31/10631",
          reviewedSourceCommit: "8eda87dba4098d656c45651294138f62d8972673",
          preciseExternalGaps: [
            "Exact runtime media mapping and Root integration are pending.",
            "Mounted customer-surface paint and responsive containment verification are pending.",
            "Release publication approval and production-served verification are pending.",
          ],
        });
      } else {
        records.push({
          ...base,
          mediaStatus: "official_image_current_label_version_conflict_hold",
          assetType: "official_manufacturer_source_lead",
          packagingProductionState: "current_selected_label_version_unresolved",
          quickOrderSku: batch005Record.quickOrderSku,
          supplierItemCode: batch005Record.supplierItemCode,
          expectedPackage: batch005Record.expectedPackage,
          officialProductPage: batch005Record.officialProductPage,
          officialImageUrl: batch005Record.officialImageUrl,
          heldSourceLeadAssets: [asset],
          sourceSearchBasis:
            "Official NutriDyn export retained as a source lead; KAN-31/10631 preserved the current-label-version hold.",
          reviewDisposition:
            "Held. The file is not an integration-eligible exact asset until the selected R227 label revision is confirmed.",
          reviewReference: "KAN-31/10631",
          reviewedSourceCommit: "8eda87dba4098d656c45651294138f62d8972673",
          preciseExternalGaps: [
            ...batch005Record.preciseGaps,
            "Exact runtime media, mounted paint, and release publication approval remain prohibited while the conflict is open.",
          ],
        });
      }
      continue;
    }

    const batch006Record = batch006ByPair.get(key);
    if (batch006Record) {
      records.push({
        ...base,
        mediaStatus: "official_source_lead_exact_pair_conflict_hold",
        assetType: "official_manufacturer_source_lead_not_exact",
        packagingProductionState: "selected_catalog_match_unresolved",
        quickOrderSku: batch006Record.quickOrderSku,
        workbookSourceItemCode: batch006Record.workbookSourceItemCode,
        officialMediaStem: batch006Record.officialMediaStem,
        officialProductPage: batch006Record.officialProductPage,
        officialImageUrl: batch006Record.officialImageUrl,
        heldSourceLeadAssets: [
          normalizeAsset(batch006Record.asset, "held_official_source_lead"),
        ],
        sourceSearchBasis:
          "Current official NutriDyn page and front export retained only as a bounded source lead.",
        reviewDisposition:
          "Held and explicitly not exact because the official export conflicts with the selected catalog record.",
        preciseExternalGaps: [
          batch006Record.preciseMissingInput,
          "A successor exact-asset batch must reconcile the selected identity and pass independent file-level review.",
          "Exact runtime media, mounted paint, and release publication approval are not authorized.",
        ],
      });
      continue;
    }

    if (key === servicePair) {
      records.push({
        ...base,
        mediaStatus:
          "internal_service_presentation_file_level_accepted_not_publication_authorized",
        assetType: "original_xenios_service_presentation",
        packagingProductionState: "not_applicable",
        artworkVersion: batch002Record.media.artworkVersion,
        preparedAssets: servicePreparedAssets,
        sourceSearchBasis:
          "Batch 002 original logo-free Xenios service presentation for the exact intentionally unbound catalog row.",
        reviewDisposition:
          "KAN-31/10623 accepted the service art only as an internal presentation; it is not a physical-product image or publication authority.",
        reviewReference: "KAN-31/10623",
        reviewedSourceCommit: "dd71617ec04ec231646296a3ae0eafcf62cffee5",
        preciseExternalGaps: [
          "Nominative carrier-name trademark/legal review remains pending.",
          "Root runtime integration and customer-surface presentation decisions remain pending.",
          "Release publication approval and production-served verification remain pending.",
        ],
      });
      continue;
    }

    if (key === supplyPair) {
      records.push({
        ...base,
        mediaStatus: "physical_supply_exact_sku_blocked",
        assetType: "physical_supply_image_required",
        sourceSearchBasis:
          "Committed catalog plus the accepted Batch 003 service-versus-supply disposition.",
        reviewDisposition:
          "No image prepared; the entry is a physical supply and cannot reuse the FedEx service presentation.",
        reviewReference: "KAN-31/10623",
        preciseExternalGaps: [
          "Exact manufacturer and model are missing.",
          "Exact syringe gauge, volume, count and swab count are missing.",
          "Exact package photograph or approved artwork is missing.",
          "Reuse basis, exact runtime media, and release publication approval are missing.",
        ],
      });
      continue;
    }

    records.push({
      ...base,
      mediaStatus: "unresolved_no_approved_product_specific_source",
      assetType: "exact_product_asset_unresolved",
      sourceSearchBasis:
        "Current release media resolver audit, prior imagery-history audit, and Batches 004-006 did not establish a file-level accepted exact asset for this pair.",
      reviewDisposition:
        "Unfinished; generic or unknown illustrations do not count as exact product imagery.",
      preciseExternalGaps: unresolvedGaps(product),
    });
  }
}

const statusCounts = Object.fromEntries(
  [...new Set(records.map((record) => record.mediaStatus))]
    .sort()
    .map((status) => [
      status,
      records.filter((record) => record.mediaStatus === status).length,
    ]),
);

const ledger = {
  schemaVersion: 2,
  ledgerId: "catalog-imagery-coverage-2026-11-04-v2",
  createdAt: "2026-11-04T20:26:10.495Z",
  releaseBaseline,
  catalogDataset: {
    path: "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    gitBlobOid: gitBlobOid(datasetCommitted),
    rawSha256: sha256(datasetCommitted),
    committedBytes: datasetCommitted.length,
    offeringCount: dataset.products.length,
    sourceVariantCount: dataset.products.reduce(
      (total, product) => total + product.variants.length,
      0,
    ),
  },
  bindingDataset: {
    path: "server/research/master-offerings/data/master-offering-bindings.generated.json",
    gitBlobOid: gitBlobOid(bindingsCommitted),
    rawSha256: sha256(bindingsCommitted),
    committedBytes: bindingsCommitted.length,
    boundPairCount: bindings.bindings.length,
    unboundPairCount: bindings.unbound.length,
  },
  predecessorBatches: predecessors,
  accountingRule:
    "File-level accepted exact assets are counted separately from final readiness. A pair is fully ready only after exact-ID runtime linkage, mounted customer-surface verification, release publication approval, and production-served verification; no pair in this delivery branch satisfies that intersection.",
  summary: {
    baselinePairs: records.length,
    physicalProductPairs: records.filter(
      (record) => record.physicalProductImageApplicable,
    ).length,
    fileLevelAcceptedExactProductAssets: records.filter(
      (record) => record.countsAsFileLevelAcceptedExactAsset,
    ).length,
    heldVersionConflictsOrNonExactSourceLeads: records.filter((record) =>
      [
        "official_image_current_label_version_conflict_hold",
        "official_source_lead_exact_pair_conflict_hold",
      ].includes(record.mediaStatus),
    ).length,
    internalOnlyAcceptedServicePresentations: records.filter(
      (record) =>
        record.mediaStatus ===
        "internal_service_presentation_file_level_accepted_not_publication_authorized",
    ).length,
    physicalSuppliesBlocked: records.filter(
      (record) => record.mediaStatus === "physical_supply_exact_sku_blocked",
    ).length,
    unresolvedNoApprovedSpecificSource: records.filter(
      (record) =>
        record.mediaStatus === "unresolved_no_approved_product_specific_source",
    ).length,
    finalReviewedExactProductionAssets: records.filter(
      (record) => record.countsAsFinalReviewedExactAsset,
    ).length,
    runtimeLinkedAssets: records.filter((record) => record.runtimeLinked).length,
    mountedOnCustomerSurfaces: records.filter(
      (record) => record.mountedOnCustomerSurface,
    ).length,
    publicationAuthorizedAssets: records.filter(
      (record) => record.publicationAuthorized,
    ).length,
    fullyVerifiedReadyPairs: records.filter(
      (record) => record.fullyVerifiedReady,
    ).length,
    recordsWithPreciseExternalGaps: records.filter(
      (record) => record.preciseExternalGaps.length > 0,
    ).length,
    preparedAssetFiles: records.reduce(
      (total, record) => total + record.preparedAssets.length,
      0,
    ),
    heldSourceLeadFiles: records.reduce(
      (total, record) => total + record.heldSourceLeadAssets.length,
      0,
    ),
    statusCounts,
  },
  records,
};

writeFileSync(outputPath, JSON.stringify(ledger, null, 2) + "\n");
console.log(JSON.stringify(ledger.summary, null, 2));
