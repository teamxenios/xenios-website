#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const batchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(batchDir, "../../..");
const ledgerPath = resolve(batchDir, "coverage-ledger.v2.json");
const receiptPath = resolve(batchDir, "verification-result.v2.json");
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
const batch002ReceiptPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-002/verification-result.v1.json",
);
const batch003ReceiptPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-003/verification-result.v1.json",
);
const batch004ManifestPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-004/media-batch.v1.json",
);
const batch004EvidencePath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-004/internal-evidence.v1.json",
);
const batch004ReceiptPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-004/verification-result.v1.json",
);
const batch005ManifestPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-005/media-batch.v1.json",
);
const batch005EvidencePath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-005/internal-evidence.v1.json",
);
const batch005ReceiptPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-005/verification-result.v1.json",
);
const batch006LeadsPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-006/source-leads.v1.json",
);
const batch006ReceiptPath = resolve(
  repoRoot,
  "deliveries/catalog-imagery/2026-11-04-batch-006/verification-result.v1.json",
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

const ledgerCheckoutBytes = readFileSync(ledgerPath);
const ledgerBytes = Buffer.from(
  ledgerCheckoutBytes.toString("utf8").replace(/\r\n/g, "\n"),
);
const ledger = JSON.parse(ledgerCheckoutBytes.toString("utf8"));
const datasetCheckout = readFileSync(datasetPath);
const datasetCommitted = Buffer.from(datasetCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const dataset = JSON.parse(datasetCheckout.toString("utf8"));
const bindingsCheckout = readFileSync(bindingsPath);
const bindingsCommitted = Buffer.from(bindingsCheckout.toString("utf8").replace(/\r\n/g, "\n"));
const bindings = JSON.parse(bindingsCheckout.toString("utf8"));
const batch002 = JSON.parse(readFileSync(batch002ManifestPath, "utf8"));
const batch002Receipt = JSON.parse(readFileSync(batch002ReceiptPath, "utf8"));
const batch003Receipt = JSON.parse(readFileSync(batch003ReceiptPath, "utf8"));
const batch004 = JSON.parse(readFileSync(batch004ManifestPath, "utf8"));
const batch004Evidence = JSON.parse(readFileSync(batch004EvidencePath, "utf8"));
const batch004Receipt = JSON.parse(readFileSync(batch004ReceiptPath, "utf8"));
const batch005 = JSON.parse(readFileSync(batch005ManifestPath, "utf8"));
const batch005Evidence = JSON.parse(readFileSync(batch005EvidencePath, "utf8"));
const batch005Receipt = JSON.parse(readFileSync(batch005ReceiptPath, "utf8"));
const batch006 = JSON.parse(readFileSync(batch006LeadsPath, "utf8"));
const batch006Receipt = JSON.parse(readFileSync(batch006ReceiptPath, "utf8"));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(Buffer.from("blob " + bytes.length + "\0"))
    .update(bytes)
    .digest("hex");
}

function pairKey(offeringId, sourceVariantId) {
  return offeringId + "/" + sourceVariantId;
}

function normalizedTextBytes(bytes) {
  return Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
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

function currentPredecessorState() {
  return predecessorDefinitions.map((predecessor) => {
    const files = predecessor.files.map(([path, expectedSha256]) => {
      const checkoutBytes = readFileSync(resolve(repoRoot, path));
      const bytes = normalizedTextBytes(checkoutBytes);
      const actualSha256 = sha256(bytes);
      check(actualSha256 === expectedSha256, path + ": pinned predecessor SHA-256 changed");
      if (path.includes("verification-result")) {
        const receipt = JSON.parse(bytes.toString("utf8"));
        check(receipt.ok === true, path + ": predecessor receipt is not green");
        check(receipt.errors?.length === 0, path + ": predecessor receipt has errors");
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

check(ledger.schemaVersion === 2, "ledger schemaVersion must be 2");
check(
  ledger.ledgerId === "catalog-imagery-coverage-2026-11-04-v2",
  "ledger ID changed",
);
check(ledger.releaseBaseline === releaseBaseline, "release baseline changed");
check(
  ledger.catalogDataset.gitBlobOid === gitBlobOid(datasetCommitted),
  "catalog Git blob pin differs",
);
check(
  ledger.catalogDataset.rawSha256 === sha256(datasetCommitted),
  "catalog raw SHA-256 differs",
);
check(
  ledger.catalogDataset.committedBytes === datasetCommitted.length,
  "catalog committed byte count differs",
);
check(
  ledger.bindingDataset.gitBlobOid === gitBlobOid(bindingsCommitted),
  "binding Git blob pin differs",
);
check(
  ledger.bindingDataset.rawSha256 === sha256(bindingsCommitted),
  "binding raw SHA-256 differs",
);
check(
  ledger.bindingDataset.committedBytes === bindingsCommitted.length,
  "binding committed byte count differs",
);
check(
  ledger.accountingRule.includes("File-level accepted exact assets are counted separately"),
  "file-level versus readiness accounting rule is missing",
);
check(
  JSON.stringify(ledger.predecessorBatches) ===
    JSON.stringify(currentPredecessorState()),
  "predecessor batch pins differ",
);

check(batch002Receipt.ok === true, "Batch 002 receipt is not green");
check(
  batch002Receipt.independentlyReviewedAssets === 0,
  "Batch 002 receipt was rewritten to imply external review",
);
check(batch003Receipt.ok === true, "Batch 003 receipt is not green");
check(batch003Receipt.canonicalPairs === 420, "Batch 003 denominator changed");
check(batch004Receipt.ok === true, "Batch 004 receipt is not green");
check(
  batch004Receipt.fileLevelReviewAccepted === true,
  "Batch 004 file-level acceptance is missing",
);
check(batch004Receipt.runtimeLinkedAssets === 0, "Batch 004 now implies runtime linkage");
check(
  batch004Receipt.publicationAuthorizedAssets === 0,
  "Batch 004 now implies publication authority",
);
check(
  batch004Evidence.records[0].review.reviewer === "KAN-31/10627",
  "Batch 004 review reference changed",
);
check(batch005Receipt.ok === true, "Batch 005 receipt is not green");
check(
  batch005Receipt.fileLevelAcceptedAssets === 9 &&
    batch005Receipt.factualVersionHolds === 1,
  "Batch 005 nine-pass/one-hold split changed",
);
check(batch005Receipt.runtimeLinkedAssets === 0, "Batch 005 now implies runtime linkage");
check(
  batch005Receipt.publicationAuthorizedAssets === 0,
  "Batch 005 now implies publication authority",
);
check(
  batch005Evidence.review.reviewer === "KAN-31/10631",
  "Batch 005 review reference changed",
);
check(batch006Receipt.ok === true, "Batch 006 receipt is not green");
check(
  batch006Receipt.heldSourceLeads === 10 && batch006Receipt.exactProductAssets === 0,
  "Batch 006 source-lead boundary changed",
);
check(batch006Receipt.runtimeLinkedAssets === 0, "Batch 006 now implies runtime linkage");
check(
  batch006Receipt.publicationAuthorizedAssets === 0,
  "Batch 006 now implies publication authority",
);

const canonicalPairs = new Map();
for (const product of dataset.products) {
  for (const variant of product.variants) {
    canonicalPairs.set(pairKey(product.id, variant.id), { product, variant });
  }
}
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
const fileLevelAcceptedProductStatuses = new Set([
  "exact_website_render_file_level_accepted_pending_runtime_integration",
  "official_exact_product_image_file_level_accepted_pending_runtime_integration",
]);

const ledgerPairs = new Set();
const allAssetPaths = new Set();
for (const record of ledger.records) {
  const pair = pairKey(record.offeringId, record.sourceVariantId);
  const canonical = canonicalPairs.get(pair);
  check(Boolean(canonical), pair + ": ledger pair is not canonical");
  check(!ledgerPairs.has(pair), pair + ": duplicate ledger record");
  ledgerPairs.add(pair);
  if (canonical) {
    check(record.canonicalName === canonical.product.canonicalName, pair + ": canonical name differs");
    check(record.variantLabel === canonical.variant.label, pair + ": variant label differs");
    check(record.family === canonical.product.family, pair + ": family differs");
    check(record.category === canonical.product.category, pair + ": category differs");
    check(record.subcategory === canonical.product.subcategory, pair + ": subcategory differs");
    check(record.canonicalBrand === canonical.product.brand, pair + ": canonical brand differs");
    check(record.displayState === canonical.product.displayState, pair + ": display state differs");
  }
  const binding = bindingByPair.get(pair);
  const unbound = unboundByPair.get(pair);
  if (binding) {
    check(record.bindingDisposition.state === "bound", pair + ": bound pair marked unbound");
    check(
      record.bindingDisposition.productControlSku === binding.productControlSku,
      pair + ": Product Control SKU differs",
    );
  } else {
    check(record.bindingDisposition.state === "unbound", pair + ": unbound pair marked bound");
    check(
      record.bindingDisposition.reason === unbound?.reason,
      pair + ": unbound reason differs",
    );
  }
  check(
    record.countsAsFinalReviewedExactAsset === false,
    pair + ": final reviewed completion was manufactured",
  );
  check(
    record.countsAsFileLevelAcceptedExactAsset ===
      fileLevelAcceptedProductStatuses.has(record.mediaStatus),
    pair + ": file-level acceptance flag does not match the exact accepted statuses",
  );
  check(record.runtimeLinked === false, pair + ": runtime linkage was manufactured");
  check(
    record.mountedOnCustomerSurface === false,
    pair + ": mounted customer paint was manufactured",
  );
  check(
    record.publicationAuthorized === false,
    pair + ": publication authority was manufactured",
  );
  check(record.fullyVerifiedReady === false, pair + ": full readiness was manufactured");
  check(Array.isArray(record.preparedAssets), pair + ": prepared asset list is missing");
  check(Array.isArray(record.heldSourceLeadAssets), pair + ": held-source list is missing");
  check(
    Array.isArray(record.preciseExternalGaps) && record.preciseExternalGaps.length > 0,
    pair + ": precise remaining gaps are missing",
  );
  for (const asset of [...record.preparedAssets, ...record.heldSourceLeadAssets]) {
    check(
      !allAssetPaths.has(asset.relativeAssetPath),
      pair + ": duplicate attached asset path " + asset.relativeAssetPath,
    );
    allAssetPaths.add(asset.relativeAssetPath);
    const absolute = resolve(repoRoot, asset.relativeAssetPath);
    const bytes = readFileSync(absolute);
    check(statSync(absolute).size === asset.bytes, pair + ": asset byte count differs");
    check(sha256(bytes) === asset.sha256, pair + ": asset SHA-256 differs");
    check(Number.isInteger(asset.width) && asset.width > 0, pair + ": asset width is invalid");
    check(Number.isInteger(asset.height) && asset.height > 0, pair + ": asset height is invalid");
  }
}

check(canonicalPairs.size === 420, "canonical pair count is not 420");
check(ledgerPairs.size === 420, "ledger pair count is not 420");
for (const pair of canonicalPairs.keys()) {
  check(ledgerPairs.has(pair), pair + ": missing from ledger");
}
check(bindings.bindings.length === 417, "bound-pair count changed");
check(bindings.unbound.length === 3, "unbound-pair count changed");

const statusCounts = Object.fromEntries(
  [...new Set(ledger.records.map((record) => record.mediaStatus))]
    .sort()
    .map((status) => [
      status,
      ledger.records.filter((record) => record.mediaStatus === status).length,
    ]),
);
const expectedStatusCounts = {
  exact_website_render_file_level_accepted_pending_runtime_integration: 1,
  internal_service_presentation_file_level_accepted_not_publication_authorized: 1,
  official_exact_product_image_file_level_accepted_pending_runtime_integration: 9,
  official_image_current_label_version_conflict_hold: 1,
  official_source_lead_exact_pair_conflict_hold: 10,
  physical_supply_exact_sku_blocked: 1,
  unresolved_no_approved_product_specific_source: 397,
};
check(
  JSON.stringify(statusCounts) === JSON.stringify(expectedStatusCounts),
  "status totals differ from the 420-pair reconciliation",
);

const bpcRecord = batch004.records[0];
const bpcPair = pairKey(bpcRecord.offeringId, bpcRecord.sourceVariantId);
const batch005ByPair = new Map(
  batch005.records.map((record) => [pairKey(record.offeringId, record.sourceVariantId), record]),
);
const batch006ByPair = new Map(
  batch006.records.map((record) => [pairKey(record.offeringId, record.sourceVariantId), record]),
);
const servicePair = "mo_003b0c272099eeb1f114/mov_9b65ad5bb184691e19e0";
const supplyPair = "mo_a7a7e307d58f24affb42/mov_512ed6b875c04eee4753";
const overlayPairs = [
  bpcPair,
  ...batch005ByPair.keys(),
  ...batch006ByPair.keys(),
  servicePair,
  supplyPair,
];
const overlayPairSet = new Set(overlayPairs);
check(overlayPairSet.size === 23, "overlay sets are not 23 unique pairs");
for (const pair of overlayPairs) {
  check(canonicalPairs.has(pair), pair + ": overlay pair is not canonical");
}

const recordsByPair = new Map(
  ledger.records.map((record) => [
    pairKey(record.offeringId, record.sourceVariantId),
    record,
  ]),
);
const bpc = recordsByPair.get(bpcPair);
const bpcArtifactsByPath = new Map(
  batch004.artifacts.map((artifact) => [artifact.relativeAssetPath, artifact]),
);
const expectedBpcAssets = bpcRecord.integrationHandoff.eligibleAssets.map((eligible) => {
  const artifact = bpcArtifactsByPath.get(eligible.relativeAssetPath);
  return normalizeAsset(artifact, eligible.role, {
    altText: eligible.altText,
    caption: eligible.caption,
  });
});
check(
  bpc?.mediaStatus ===
    "exact_website_render_file_level_accepted_pending_runtime_integration",
  "BPC status differs",
);
check(bpc?.countsAsFileLevelAcceptedExactAsset === true, "BPC file-level flag is missing");
check(bpc?.packagingProductionState === "design", "BPC packaging state is not design");
check(bpc?.reviewReference === "KAN-31/10627", "BPC review reference differs");
check(
  JSON.stringify(bpc?.preparedAssets) === JSON.stringify(expectedBpcAssets),
  "BPC integration-eligible assets differ from Batch 004",
);
check(bpc?.heldSourceLeadAssets.length === 0, "BPC was put in the held-source bucket");

let acceptedNutriDyn = 0;
let versionHolds = 0;
for (const [pair, source] of batch005ByPair) {
  const record = recordsByPair.get(pair);
  const expectedAsset = normalizeAsset(
    source.asset,
    source.reviewStatus === "file_level_review_accepted_pending_runtime_integration"
      ? "official_product_photo"
      : "held_official_source_lead",
    { altText: source.asset.altTextCandidate },
  );
  if (source.reviewStatus === "file_level_review_accepted_pending_runtime_integration") {
    acceptedNutriDyn += 1;
    check(
      record?.mediaStatus ===
        "official_exact_product_image_file_level_accepted_pending_runtime_integration",
      pair + ": accepted NutriDyn status differs",
    );
    check(
      record?.countsAsFileLevelAcceptedExactAsset === true,
      pair + ": accepted NutriDyn file-level flag is missing",
    );
    check(
      JSON.stringify(record?.preparedAssets) === JSON.stringify([expectedAsset]),
      pair + ": accepted NutriDyn asset differs",
    );
    check(record?.heldSourceLeadAssets.length === 0, pair + ": accepted asset is also held");
  } else {
    versionHolds += 1;
    check(
      record?.mediaStatus === "official_image_current_label_version_conflict_hold",
      pair + ": R227 hold status differs",
    );
    check(
      record?.countsAsFileLevelAcceptedExactAsset === false,
      pair + ": R227 incorrectly counts as accepted",
    );
    check(record?.preparedAssets.length === 0, pair + ": R227 was made integration-eligible");
    check(
      JSON.stringify(record?.heldSourceLeadAssets) === JSON.stringify([expectedAsset]),
      pair + ": R227 held source bytes differ",
    );
  }
  check(record?.reviewReference === "KAN-31/10631", pair + ": Batch 005 review differs");
}
check(acceptedNutriDyn === 9, "accepted NutriDyn overlay count is not nine");
check(versionHolds === 1, "R227 hold count is not one");

for (const [pair, source] of batch006ByPair) {
  const record = recordsByPair.get(pair);
  const expectedAsset = normalizeAsset(source.asset, "held_official_source_lead");
  check(
    record?.mediaStatus === "official_source_lead_exact_pair_conflict_hold",
    pair + ": Batch 006 hold status differs",
  );
  check(
    record?.countsAsFileLevelAcceptedExactAsset === false,
    pair + ": non-exact source lead counts as accepted",
  );
  check(record?.preparedAssets.length === 0, pair + ": source lead became prepared media");
  check(
    JSON.stringify(record?.heldSourceLeadAssets) === JSON.stringify([expectedAsset]),
    pair + ": held source-lead bytes differ",
  );
  check(
    record?.preciseExternalGaps.includes(source.preciseMissingInput),
    pair + ": source-specific missing input was lost",
  );
}

const service = recordsByPair.get(servicePair);
const batch002Record = batch002.records[0];
const expectedServiceAssets = [
  ...batch002Record.media.images.map((asset) =>
    normalizeAsset(asset, asset.role || "primary", { altText: asset.altText }),
  ),
  ...batch002Record.media.sourceMasters.map((asset) =>
    normalizeAsset(asset, "source_master"),
  ),
];
check(
  service?.mediaStatus ===
    "internal_service_presentation_file_level_accepted_not_publication_authorized",
  "FedEx internal-only service status differs",
);
check(service?.physicalProductImageApplicable === false, "FedEx was treated as physical");
check(
  service?.countsAsFileLevelAcceptedExactAsset === false,
  "FedEx was counted as an exact physical-product asset",
);
check(service?.bindingDisposition.state === "unbound", "FedEx was marked bound");
check(
  service?.bindingDisposition.reason.startsWith("shipping service row"),
  "FedEx unbound reason differs",
);
check(service?.reviewReference === "KAN-31/10623", "FedEx external review reference differs");
check(
  service?.reviewDisposition.includes("internal presentation"),
  "FedEx acceptance was not limited to internal presentation",
);
check(
  JSON.stringify(service?.preparedAssets) === JSON.stringify(expectedServiceAssets),
  "FedEx prepared assets differ from Batch 002",
);

const supplies = recordsByPair.get(supplyPair);
check(
  supplies?.mediaStatus === "physical_supply_exact_sku_blocked",
  "physical-supply status differs",
);
check(
  supplies?.physicalProductImageApplicable === true,
  "physical supplies were exempted from imagery",
);
check(supplies?.preparedAssets.length === 0, "unverified supply artwork was attached");
check(
  supplies?.heldSourceLeadAssets.length === 0,
  "unverified supply source lead was attached",
);

for (const [pair, record] of recordsByPair) {
  if (!overlayPairSet.has(pair)) {
    check(
      record.mediaStatus === "unresolved_no_approved_product_specific_source",
      pair + ": non-overlay pair is not unresolved",
    );
    check(
      record.countsAsFileLevelAcceptedExactAsset === false,
      pair + ": unresolved pair was counted as file-level accepted",
    );
    check(record.preparedAssets.length === 0, pair + ": unresolved pair has prepared media");
    check(
      record.heldSourceLeadAssets.length === 0,
      pair + ": unresolved pair has a held source attachment",
    );
  }
}

const recomputedSummary = {
  baselinePairs: ledger.records.length,
  physicalProductPairs: ledger.records.filter(
    (record) => record.physicalProductImageApplicable,
  ).length,
  fileLevelAcceptedExactProductAssets: ledger.records.filter(
    (record) => record.countsAsFileLevelAcceptedExactAsset,
  ).length,
  heldVersionConflictsOrNonExactSourceLeads: ledger.records.filter((record) =>
    [
      "official_image_current_label_version_conflict_hold",
      "official_source_lead_exact_pair_conflict_hold",
    ].includes(record.mediaStatus),
  ).length,
  internalOnlyAcceptedServicePresentations: ledger.records.filter(
    (record) =>
      record.mediaStatus ===
      "internal_service_presentation_file_level_accepted_not_publication_authorized",
  ).length,
  physicalSuppliesBlocked: ledger.records.filter(
    (record) => record.mediaStatus === "physical_supply_exact_sku_blocked",
  ).length,
  unresolvedNoApprovedSpecificSource: ledger.records.filter(
    (record) =>
      record.mediaStatus === "unresolved_no_approved_product_specific_source",
  ).length,
  finalReviewedExactProductionAssets: ledger.records.filter(
    (record) => record.countsAsFinalReviewedExactAsset,
  ).length,
  runtimeLinkedAssets: ledger.records.filter((record) => record.runtimeLinked).length,
  mountedOnCustomerSurfaces: ledger.records.filter(
    (record) => record.mountedOnCustomerSurface,
  ).length,
  publicationAuthorizedAssets: ledger.records.filter(
    (record) => record.publicationAuthorized,
  ).length,
  fullyVerifiedReadyPairs: ledger.records.filter(
    (record) => record.fullyVerifiedReady,
  ).length,
  recordsWithPreciseExternalGaps: ledger.records.filter(
    (record) => record.preciseExternalGaps.length > 0,
  ).length,
  preparedAssetFiles: ledger.records.reduce(
    (total, record) => total + record.preparedAssets.length,
    0,
  ),
  heldSourceLeadFiles: ledger.records.reduce(
    (total, record) => total + record.heldSourceLeadAssets.length,
    0,
  ),
  statusCounts,
};
check(
  JSON.stringify(ledger.summary) === JSON.stringify(recomputedSummary),
  "ledger summary differs from recomputed exact accounting",
);
check(recomputedSummary.baselinePairs === 420, "summary pair count is not 420");
check(recomputedSummary.physicalProductPairs === 419, "summary physical count is not 419");
check(
  recomputedSummary.fileLevelAcceptedExactProductAssets === 10,
  "summary file-level accepted count is not ten",
);
check(
  recomputedSummary.heldVersionConflictsOrNonExactSourceLeads === 11,
  "summary held version/source-lead count is not eleven",
);
check(recomputedSummary.preparedAssetFiles === 14, "summary prepared-file count is not fourteen");
check(recomputedSummary.heldSourceLeadFiles === 11, "summary held-file count is not eleven");

const result = {
  ok: errors.length === 0,
  ledgerId: ledger.ledgerId,
  releaseBaseline: ledger.releaseBaseline,
  ledgerBytes: ledgerBytes.length,
  ledgerSha256: sha256(ledgerBytes),
  canonicalPairs: canonicalPairs.size,
  ledgerPairs: ledgerPairs.size,
  predecessorReceiptsGreen: predecessorDefinitions.length,
  physicalProductPairs: ledger.summary.physicalProductPairs,
  fileLevelAcceptedExactProductAssets:
    ledger.summary.fileLevelAcceptedExactProductAssets,
  heldVersionConflictsOrNonExactSourceLeads:
    ledger.summary.heldVersionConflictsOrNonExactSourceLeads,
  internalOnlyAcceptedServicePresentations:
    ledger.summary.internalOnlyAcceptedServicePresentations,
  physicalSuppliesBlocked: ledger.summary.physicalSuppliesBlocked,
  unresolvedNoApprovedSpecificSource:
    ledger.summary.unresolvedNoApprovedSpecificSource,
  finalReviewedExactProductionAssets:
    ledger.summary.finalReviewedExactProductionAssets,
  runtimeLinkedAssets: ledger.summary.runtimeLinkedAssets,
  mountedOnCustomerSurfaces: ledger.summary.mountedOnCustomerSurfaces,
  publicationAuthorizedAssets: ledger.summary.publicationAuthorizedAssets,
  fullyVerifiedReadyPairs: ledger.summary.fullyVerifiedReadyPairs,
  recordsWithPreciseExternalGaps:
    ledger.summary.recordsWithPreciseExternalGaps,
  preparedAssetFiles: ledger.summary.preparedAssetFiles,
  heldSourceLeadFiles: ledger.summary.heldSourceLeadFiles,
  statusCounts,
  errors,
};

const output = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--write-receipt")) writeFileSync(receiptPath, output);
console.log(output.trimEnd());
if (errors.length > 0) process.exitCode = 1;
