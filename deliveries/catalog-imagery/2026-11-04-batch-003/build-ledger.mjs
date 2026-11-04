#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const datasetPath = resolve(repoRoot, "server/research/master-offerings/data/member-safe-master-offerings.generated.json");
const bindingsPath = resolve(repoRoot, "server/research/master-offerings/data/master-offering-bindings.generated.json");
const batch001ManifestPath = resolve(repoRoot, "deliveries/catalog-imagery/2026-11-04-batch-001-r2/media-batch.v2.json");
const batch001EvidencePath = resolve(repoRoot, "deliveries/catalog-imagery/2026-11-04-batch-001-r2/internal-evidence.v2.json");
const batch002ManifestPath = resolve(repoRoot, "deliveries/catalog-imagery/2026-11-04-batch-002/media-batch.v1.json");
const outputPath = resolve(batchDir, "coverage-ledger.v1.json");

const datasetCheckout = readFileSync(datasetPath);
const datasetCommitted = Buffer.from(datasetCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const bindingsCheckout = readFileSync(bindingsPath);
const bindingsCommitted = Buffer.from(bindingsCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const dataset = JSON.parse(datasetCheckout.toString("utf8"));
const bindings = JSON.parse(bindingsCheckout.toString("utf8"));
const batch001Manifest = JSON.parse(readFileSync(batch001ManifestPath, "utf8"));
const batch001Evidence = JSON.parse(readFileSync(batch001EvidencePath, "utf8"));
const batch002Manifest = JSON.parse(readFileSync(batch002ManifestPath, "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest("hex");
}

function pairKey(offeringId, sourceVariantId) {
  return `${offeringId}/${sourceVariantId}`;
}

function preparedAssets(record) {
  return [...record.media.images, ...record.media.sourceMasters].map((asset) => ({
    relativeAssetPath: asset.relativeAssetPath,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    sha256: asset.sha256,
  }));
}

function unresolvedGaps(product) {
  const commonRights = "Authorized exact-product media source and release-specific publication rights are missing.";
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
        "Printed/in-use evidence and release-specific publication approval are missing.",
      ];
      if (product.subcategory === "Form not stated") {
        gaps.unshift("Exact physical form and package presentation are not stated in the committed member-safe catalog.");
      }
      return gaps;
    }
    case "research_capsules":
      return [
        "Exact selected Xenios white-label bottle, closure, capsule count and label dimensions are missing.",
        "Supplier-approved proof and actual manufacturer/distributor attribution are missing.",
        "Printed/in-use evidence and release-specific publication approval are missing.",
      ];
    case "supplements":
      return [
        "Exact current manufacturer product, formula, strength, count or package-size image has not been approved for this exact pair.",
        "Written reseller/media permission and Product Control approval are missing.",
        "Current package-version verification and release-specific publication approval are missing.",
      ];
    case "research_supplies":
      return [
        "Exact manufacturer, grade, concentration, container and volume/pack identity are missing from an approved media record.",
        "Official exact-package image and reuse rights are missing.",
        "Packaging-production state and release-specific publication approval are missing.",
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

const bpcPair = "mo_af289f611c02b3fcef01/mov_ca3e45ae9712aee91430";
const servicePair = "mo_003b0c272099eeb1f114/mov_9b65ad5bb184691e19e0";
const supplyPair = "mo_a7a7e307d58f24affb42/mov_512ed6b875c04eee4753";
const batch001Media = batch001Manifest.records[0];
const batch001MediaEvidence = batch001Evidence.records.find((record) => record.field === "media");
const supplierCandidates = new Map(
  batch001Evidence.records
    .filter((record) => record.field === "media_source_candidate")
    .map((record) => [pairKey(record.offeringId, record.sourceVariantId), record]),
);
const batch002Media = batch002Manifest.records[0];
const bindingByPair = new Map(
  bindings.bindings.map((binding) => [pairKey(binding.offeringId, binding.offeringVariantId), binding]),
);
const unboundByPair = new Map(
  bindings.unbound.map((record) => [pairKey(record.offeringId, record.offeringVariantId), record]),
);

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
      countsAsFinalReviewedExactAsset: false,
      publicationAuthorized: false,
      bindingDisposition: binding
        ? { state: "bound", productControlSku: binding.productControlSku }
        : { state: "unbound", reason: unbound?.reason ?? "unbound reason missing" },
    };

    if (key === bpcPair) {
      records.push({
        ...base,
        mediaStatus: "private_design_concept_reviewed",
        preparedAssets: preparedAssets(batch001Media),
        sourceSearchBasis: "Batch 001 r2, KAN-31/10607 and KAN-31/10612.",
        reviewDisposition: "Private design and source-lead evidence only; not exact production imagery.",
        preciseExternalGaps: batch001MediaEvidence.preciseGaps,
      });
      continue;
    }

    if (key === servicePair) {
      records.push({
        ...base,
        mediaStatus: "service_presentation_prepared_review_pending",
        preparedAssets: preparedAssets(batch002Media),
        sourceSearchBasis: "Batch 002 original Xenios-authored logo-free service presentation.",
        reviewDisposition: "Independent service-art and trademark review pending; no physical product image is applicable.",
        preciseExternalGaps: [
          "Independent review of the exact Batch 002 service-art bytes is pending.",
          "Nominative carrier-name and trademark review is pending.",
          "Release-specific publication approval and runtime integration are not established.",
        ],
      });
      continue;
    }

    if (key === supplyPair) {
      records.push({
        ...base,
        mediaStatus: "physical_supply_exact_sku_blocked",
        preparedAssets: [],
        sourceSearchBasis: "Committed catalog plus Batch 001/r2 service-versus-supply disposition.",
        reviewDisposition: "No image prepared; the entry is a physical supply and cannot use service artwork.",
        preciseExternalGaps: [
          "Exact manufacturer and model are missing.",
          "Exact syringe gauge, volume, count and swab count are missing.",
          "Exact package photograph or approved artwork is missing.",
          "Reuse and release-specific publication rights are missing.",
        ],
      });
      continue;
    }

    const candidate = supplierCandidates.get(key);
    if (candidate) {
      records.push({
        ...base,
        mediaStatus: "official_source_candidate_rights_pending",
        preparedAssets: [],
        sourceSearchBasis: "Batch 001 r2 exact official NutriDyn source candidate; no image bytes downloaded.",
        reviewDisposition: candidate.reviewStatus,
        officialSourceCandidate: {
          brand: candidate.brand,
          supplierItemCode: candidate.supplierItemCode,
          expectedPackage: candidate.expectedPackage,
          officialProductPage: candidate.officialProductPage,
          officialImageCandidate: candidate.officialImageCandidate,
          rightsState: candidate.rightsState,
          assetDownloaded: candidate.assetDownloaded,
        },
        preciseExternalGaps: candidate.preciseGaps,
      });
      continue;
    }

    records.push({
      ...base,
      mediaStatus: "product_specific_source_unresolved",
      preparedAssets: [],
      sourceSearchBasis:
        "Current release media resolver audit, prior imagery-history audit and committed source-evidence scan found no approved exact product-specific asset for this pair.",
      reviewDisposition: "Unfinished; generic or unknown illustrations do not count as exact product imagery.",
      preciseExternalGaps: unresolvedGaps(product),
    });
  }
}

const statusCounts = Object.fromEntries(
  [...new Set(records.map((record) => record.mediaStatus))]
    .sort()
    .map((status) => [status, records.filter((record) => record.mediaStatus === status).length]),
);

const ledger = {
  schemaVersion: 1,
  ledgerId: "catalog-imagery-coverage-2026-11-04-v1",
  createdAt: "2026-11-04T19:45:00.000Z",
  releaseBaseline: "5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b",
  catalogDataset: {
    path: "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    gitBlobOid: gitBlobOid(datasetCommitted),
    rawSha256: sha256(datasetCommitted),
    committedBytes: datasetCommitted.length,
    offeringCount: dataset.products.length,
    sourceVariantCount: dataset.products.reduce((total, product) => total + product.variants.length, 0),
  },
  bindingDataset: {
    path: "server/research/master-offerings/data/master-offering-bindings.generated.json",
    gitBlobOid: gitBlobOid(bindingsCommitted),
    rawSha256: sha256(bindingsCommitted),
    committedBytes: bindingsCommitted.length,
    boundPairCount: bindings.bindings.length,
    unboundPairCount: bindings.unbound.length,
  },
  accountingRule:
    "Only independently approved exact production product assets count complete. Private concepts, rights-pending source URLs, generic icons and unreviewed service art remain incomplete.",
  summary: {
    baselinePairs: records.length,
    physicalProductPairs: records.filter((record) => record.physicalProductImageApplicable).length,
    finalReviewedExactProductAssets: records.filter((record) => record.countsAsFinalReviewedExactAsset).length,
    publicationAuthorizedAssets: records.filter((record) => record.publicationAuthorized).length,
    recordsWithPreciseExternalGaps: records.filter((record) => record.preciseExternalGaps.length > 0).length,
    statusCounts,
  },
  records,
};

writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify(ledger.summary, null, 2));
