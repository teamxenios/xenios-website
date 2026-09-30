import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASSET_BYTE_BUDGET,
  ASSET_TOTAL_BYTE_BUDGET,
  ARTIFACT_GENERATED_AT,
  BINDING_SOURCE_PATH,
  CATALOG_SOURCE_PATH,
  CATALOG_RECONCILIATION_SOURCE_PATH,
  CONTRACT_SCHEMA_VERSION,
  COVERAGE_STATUSES,
  CURRENT_DEMAND_TITLES,
  CUSTOMER_EXPOSURE_SOURCE_PATH,
  FALLBACK_ASSET_PROVENANCE,
  FALLBACK_ASSETS,
  FEATURED_IDENTITY_SOURCE_PATH,
  FORM_TO_TAXONOMY,
  JOURNEY_CLASSES,
  MASTER_CATALOG_SUMMARY_SOURCE_PATH,
  SOURCE_BASE_COMMIT,
  SOURCE_BASE_TREE,
  V3_ACCEPTANCE,
} from "./config.mjs";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const ASSET_BY_ID = new Map(FALLBACK_ASSETS.map((asset) => [asset.assetId, asset]));
const ASSET_BY_TAXONOMY = new Map(
  FALLBACK_ASSETS.map((asset) => [asset.taxonomyKey, asset]),
);

const PACKAGING_SENSITIVE_NAMES = [
  "pregnyl",
  "kyzatrex",
  "zofran",
  "versabase",
  "magtein",
  "ultrabiotic",
  "superpower",
  "mito health",
];

const CLAIM_BEARING_NAMES = [
  "anti-aging",
  "hair restoration",
  "libido cream",
];

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(relativePath) {
  return sha256Bytes(fs.readFileSync(path.join(REPO_ROOT, relativePath)));
}

const RUNTIME_REFERENCE_ROOTS = [
  "client/src",
  "server",
  "shared",
  "supabase/functions",
  "supabase/migrations",
];

const RUNTIME_SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
]);

function runtimeSourceFiles(relativeRoot) {
  const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (absoluteDirectory) => {
    for (const entry of fs.readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !RUNTIME_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }
      const relativePath = path
        .relative(REPO_ROOT, absolutePath)
        .split(path.sep)
        .join("/");
      if (
        /(?:^|\/)(?:__tests__|fixtures)(?:\/|$)/.test(relativePath) ||
        /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(relativePath)
      ) {
        continue;
      }
      files.push(relativePath);
    }
  };
  visit(absoluteRoot);
  return files.sort();
}

export function scanRuntimeCandidateReferences(assets = FALLBACK_ASSETS) {
  const references = [];
  for (const relativePath of RUNTIME_REFERENCE_ROOTS.flatMap(runtimeSourceFiles)) {
    const source = readText(relativePath);
    for (const asset of assets) {
      const matchedTokens = [
        asset.assetId,
        asset.publicPath,
        path.posix.basename(asset.publicPath),
      ].filter((token) => source.includes(token));
      if (matchedTokens.length > 0) {
        references.push({
          path: relativePath,
          assetId: asset.assetId,
          matchedTokens: [...new Set(matchedTokens)].sort(),
        });
      }
    }
  }
  const referencedAssetIds = [
    ...new Set(references.map((reference) => reference.assetId)),
  ].sort();
  return {
    roots: RUNTIME_REFERENCE_ROOTS,
    references,
    referencedAssetIds,
    publicAssetsWired: referencedAssetIds.length,
    customerSurfaceReferences: references.length,
  };
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );
}

function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function nameIncludes(product, needles) {
  const names = [
    product.displayName,
    product.canonicalName,
    ...(product.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needles.some((needle) => names.includes(needle));
}

function visualRestrictionFor(product, resolvedVisualForm = product.subcategory) {
  if (resolvedVisualForm === "Form not stated") {
    return "form_neutral_no_container_or_packaging";
  }
  if (nameIncludes(product, PACKAGING_SENSITIVE_NAMES)) {
    return "form_only_no_brand_logo_or_fabricated_packaging";
  }
  if (nameIncludes(product, CLAIM_BEARING_NAMES)) {
    return "form_only_no_claim_bearing_visual_or_alt_extension";
  }
  return "generic_form_only_until_exact_evidence";
}

function isCurrentDemandOffering(product) {
  const candidateKeys = [
    product.displayName,
    product.canonicalName,
    ...(product.aliases ?? []),
  ].map(normalizeTitle);
  return CURRENT_DEMAND_TITLES.some((title) =>
    candidateKeys.includes(normalizeTitle(title)),
  );
}

export function extractRuntimeExcludedOfferingIds(source) {
  const ids = Array.from(
    source.matchAll(
      /const\s+SHIPPING_CHARGE_OFFERING_ID_[A-Z0-9_]+\s*=\s*"(mo_[a-f0-9]+)"/g,
    ),
    (match) => match[1],
  );
  if (ids.length !== 1) {
    throw new Error(
      `Expected one runtime shipping-charge exclusion, found ${ids.length}`,
    );
  }
  return new Set(ids);
}

export function journeyClassFor({ product, binding, excluded }) {
  if (excluded) return "shipping_service";
  if (!binding && product.family === "shipping_and_fulfillment") return "held";
  if (!binding) return "quote_required";

  switch (product.displayState) {
    case "care_pathway":
      return "care";
    case "request_access":
      return "request_access";
    case "approval_required":
    case "temporarily_unavailable":
      return "held";
    case "coming_soon":
    case "planned":
      return "coming";
    case "unavailable":
      return "unavailable";
    case "available_now":
    case "available_this_week":
      return "catalog_visible";
    default:
      throw new Error(`Unsupported display state ${product.displayState}`);
  }
}

function fallbackTaxonomyFor({
  product,
  binding,
  excluded,
  resolvedVisualForm = product.subcategory,
}) {
  if (excluded) return "shipping_service";
  if (!binding && product.family === "shipping_and_fulfillment") return "pending";
  if (!binding) return "request";
  if (product.displayState === "care_pathway") return "care";
  if (
    [
      "approval_required",
      "temporarily_unavailable",
      "coming_soon",
      "planned",
      "unavailable",
    ].includes(product.displayState)
  ) {
    return "pending";
  }
  if (resolvedVisualForm === "Form not stated") return "pending";
  return FORM_TO_TAXONOMY.get(resolvedVisualForm) ?? "pending";
}

function recommendedAltText(asset, product) {
  return `${product.displayName}: ${asset.altDescription} Illustrative.`;
}

function exactRenderPrompt(product, variant, coverageRow) {
  const form = coverageRow.resolvedVisualForm ?? "form not stated";
  const restriction = coverageRow.visualRestriction;
  const formEvidence = coverageRow.visualFormEvidence
    ? ` Form evidence: ${coverageRow.visualFormEvidence.canonicalSourceRow} is the reviewed kept identity; ${coverageRow.visualFormEvidence.supersededSourceRow} is provenance only.`
    : "";
  const formInstruction =
    form === "Form not stated"
      ? "The form is not stated. Show no product, container, package, vial, bottle, tablet, spray, topical vessel, or dosage-form clue. Use a form-neutral non-product review composition only."
      : `The reviewed visual form classification is ${form}.${formEvidence} Use only a generic unbranded form treatment unless exact packaging evidence is later approved.`;
  return [
    "Pre-v3 draft planning prompt for internal review only. Do not render until the founder-supplied v3 prompt is attached and reconciled.",
    `Canonical offering ${product.id}; canonical variant ${variant.id}.`,
    `Member-safe identity reference: ${product.displayName}; ${variant.label}.`,
    formInstruction,
    `Visual restriction: ${restriction}.`,
    "Use the Xenios warm off-white, cool-gray, brushed-silver, and muted deep-green studio system.",
    "Do not invent or render label artwork, brand marks, partner logos, dosage text, strength text, lot data, expiry, purity, availability, pricing, certification, fill volume, concentration, unit count, or purchase cues.",
    "Never imitate third-party packaging. Leave any permitted generic surface blank.",
    "Any future output remains provisional until exact identity, rights, checksum, named approval, packaging evidence, and the v3 prompt record are present.",
    "Square 1:1 with generous crop-safe margins.",
  ].join(" ");
}

function exactRenderFilenameTemplate(variant) {
  return `xenios-${variant.id}-primary-v1-{sha12}.webp`;
}

function firstPageOfferingIds(products, excludedIds) {
  return new Set(
    products
      .filter((product) => !excludedIds.has(product.id))
      .slice()
      .sort((left, right) => {
        const leftKey = `${left.displayName}|${left.slug}|${left.id}`;
        const rightKey = `${right.displayName}|${right.slug}|${right.id}`;
        return leftKey.localeCompare(rightKey);
      })
      .slice(0, 24)
      .map((product) => product.id),
  );
}

function assignQueuePriorities(rows, productById, firstPageIds) {
  const formRepresentativeKeys = new Set();
  return rows.map((row) => {
    const product = productById.get(row.offeringId);
    let priority = "P3";
    let priorityBasis = "remaining_exposed_catalog";

    if (isCurrentDemandOffering(product)) {
      priority = "P0";
      priorityBasis = "current_demand_exact_member_safe_name_match";
    } else if (firstPageIds.has(product.id)) {
      priority = "P1";
      priorityBasis = "default_catalog_first_page_24";
    } else if (!formRepresentativeKeys.has(row.fallback.assetId)) {
      formRepresentativeKeys.add(row.fallback.assetId);
      priority = "P2";
      priorityBasis = "first_remaining_fallback_taxonomy_representative";
    }

    return { row, product, priority, priorityBasis };
  });
}

function stableSortQueue(left, right) {
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return (
    rank[left.priority] - rank[right.priority] ||
    left.product.displayName.localeCompare(right.product.displayName) ||
    left.row.offeringVariantId.localeCompare(right.row.offeringVariantId)
  );
}

export function buildArtifacts() {
  const catalog = readJson(CATALOG_SOURCE_PATH);
  const bindings = readJson(BINDING_SOURCE_PATH);
  const featuredIdentityEvidence = readJson(FEATURED_IDENTITY_SOURCE_PATH);
  const catalogReconciliation = readJson(CATALOG_RECONCILIATION_SOURCE_PATH);
  const masterCatalogSummary = readJson(MASTER_CATALOG_SUMMARY_SOURCE_PATH);
  const exposureSource = readText(CUSTOMER_EXPOSURE_SOURCE_PATH);
  const runtimeReferenceScan = scanRuntimeCandidateReferences();
  const excludedIds = extractRuntimeExcludedOfferingIds(exposureSource);
  const bindingByOfferingVariant = new Map(
    bindings.bindings.map((binding) => [binding.offeringVariantId, binding]),
  );
  const productById = new Map(catalog.products.map((product) => [product.id, product]));
  const firstPageIds = firstPageOfferingIds(catalog.products, excludedIds);
  const featuredAliasesByVariant = new Map();
  const masterRowByGroupId = new Map(
    masterCatalogSummary.rows.map((row) => [row["Group ID"], row]),
  );
  const visualFormOverrideByProductControlSku = new Map();

  for (const merge of catalogReconciliation.merges) {
    if (merge.supersedes.length !== 1) {
      throw new Error(`Unsupported reconciliation shape ${merge.id}`);
    }
    const supersededSourceRow = merge.supersedes[0];
    const kept = masterRowByGroupId.get(merge.keeps);
    if (!kept) {
      throw new Error(`Missing kept catalog row ${merge.keeps}`);
    }
    visualFormOverrideByProductControlSku.set(`GEN-${supersededSourceRow}`, {
      resolvedVisualForm: kept["Dosage Form"],
      evidence: {
        decisionId: merge.id,
        canonicalSourceRow: merge.keeps,
        supersededSourceRow,
        decisionDate: catalogReconciliation.decidedOn,
        decisionBy: catalogReconciliation.decidedBy,
        sourcePath: CATALOG_RECONCILIATION_SOURCE_PATH,
      },
    });
  }

  if (
    featuredIdentityEvidence.mappingAuthority !==
    "evidence_only_not_merge_or_deactivation_authority"
  ) {
    throw new Error("Featured identity evidence authority changed");
  }
  for (const alias of featuredIdentityEvidence.aliases) {
    const binding = bindingByOfferingVariant.get(alias.canonicalVariantId);
    if (!binding) {
      throw new Error(
        `Featured alias ${alias.liveVariantSku} has no canonical binding`,
      );
    }
    if (
      binding.offeringId !== alias.canonicalOfferingId ||
      binding.productId !== alias.canonicalProductControlProductId ||
      binding.variantId !== alias.canonicalProductControlVariantId ||
      binding.productControlSku !== alias.canonicalProductControlSku
    ) {
      throw new Error(
        `Featured alias ${alias.liveVariantSku} drifted from canonical binding`,
      );
    }
    const current = featuredAliasesByVariant.get(alias.canonicalVariantId) ?? [];
    current.push({
      productId: alias.liveProductId,
      variantId: alias.liveVariantId,
      productSku: alias.liveProductSku,
      variantSku: alias.liveVariantSku,
    });
    featuredAliasesByVariant.set(alias.canonicalVariantId, current);
  }

  const coverageRows = [];
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      const binding = bindingByOfferingVariant.get(variant.id) ?? null;
      const excluded = excludedIds.has(product.id);
      const visualFormOverride = binding
        ? visualFormOverrideByProductControlSku.get(binding.productControlSku) ??
          null
        : null;
      const resolvedVisualForm =
        visualFormOverride?.resolvedVisualForm ?? product.subcategory;
      const formTaxonomy =
        FORM_TO_TAXONOMY.get(resolvedVisualForm) ?? "pending";
      const formFallback = ASSET_BY_TAXONOMY.get(formTaxonomy);
      if (!formFallback) {
        throw new Error(
          `No form fallback for ${product.id}/${variant.id} taxonomy ${formTaxonomy}`,
        );
      }
      const taxonomyKey = fallbackTaxonomyFor({
        product,
        binding,
        excluded,
        resolvedVisualForm,
      });
      const fallback = ASSET_BY_TAXONOMY.get(taxonomyKey);
      if (!fallback) {
        throw new Error(
          `No fallback asset for ${product.id}/${variant.id} taxonomy ${taxonomyKey}`,
        );
      }
      const journeyClass = journeyClassFor({ product, binding, excluded });
      const legacyFeaturedAliases = (
        featuredAliasesByVariant.get(variant.id) ?? []
      ).sort((left, right) =>
        left.variantSku.localeCompare(right.variantSku),
      );

      coverageRows.push({
        coverageKey: variant.id,
        manifestKey: variant.id,
        offeringId: product.id,
        offeringVariantId: variant.id,
        slug: product.slug,
        displayName: product.displayName,
        variantLabel: variant.label,
        family: product.family,
        category: product.category,
        sourceForm: product.subcategory,
        resolvedVisualForm,
        visualFormEvidence: visualFormOverride?.evidence ?? null,
        formTaxonomy,
        visualRestriction: visualRestrictionFor(product, resolvedVisualForm),
        sourceDisplayState: product.displayState,
        journeyClass,
        exposure: excluded
          ? "excluded_shipping_service"
          : "customer_catalog",
        assetRequired: !excluded,
        productControl: binding
          ? {
              productId: binding.productId,
              variantId: binding.variantId,
              sku: binding.productControlSku,
            }
          : null,
        legacyFeaturedAliases,
        imageState: "none",
        coverageStatus: "fallback",
        formFallback: {
          assetId: formFallback.assetId,
          taxonomyKey: formFallback.taxonomyKey,
          href: formFallback.publicPath,
          identityScope: "form_fallback_not_exact_variant",
          useRestriction: formFallback.useRestriction,
          reviewStatus: "provisional",
        },
        fallback: {
          assetId: fallback.assetId,
          taxonomyKey: fallback.taxonomyKey,
          semanticClass: fallback.semanticClass,
          href: fallback.publicPath,
          width: fallback.width,
          height: fallback.height,
          recommendedAltText: recommendedAltText(fallback, product),
          identityScope: "family_or_form_fallback",
          useRestriction: fallback.useRestriction,
          reviewStatus: "provisional",
          approvalEligibility:
            "blocked_permanent_rerender_under_v3_required",
          runtimeWiringEligibility: "blocked",
          deploymentEligibility: "blocked",
          illustrativeNotice:
            "Illustrative fallback. Exact product packaging is not shown.",
        },
        purchaseImplication: "none",
        authorityBoundary:
          "Imagery carries no price, availability, action, inventory, Care, payment, or Product Control authority.",
      });
    }
  }

  coverageRows.sort((left, right) =>
    left.offeringVariantId.localeCompare(right.offeringVariantId),
  );

  const prioritized = assignQueuePriorities(
    coverageRows.filter((row) => row.exposure === "customer_catalog"),
    productById,
    firstPageIds,
  ).sort(stableSortQueue);

  const exactRenderQueue = prioritized.map(
    ({ row, product, priority, priorityBasis }, index) => {
      const variant = product.variants.find(
        (candidate) => candidate.id === row.offeringVariantId,
      );
      if (!variant) throw new Error(`Missing variant ${row.offeringVariantId}`);
      return {
        sequence: index + 1,
        priority,
        priorityBasis,
        offeringId: product.id,
        offeringVariantId: variant.id,
        productControl: row.productControl,
        displayName: product.displayName,
        variantLabel: variant.label,
        sourceForm: product.subcategory,
        resolvedVisualForm: row.resolvedVisualForm,
        visualFormEvidence: row.visualFormEvidence,
        journeyClass: row.journeyClass,
        visualRestriction: row.visualRestriction,
        queueStatus: "pending",
        promptStatus: "draft_blocked_missing_founder_v3_prompt",
        mayRenderNow: false,
        blockedBy: [
          "founder-supplied v3 prompt attachment and reconciliation",
          "approved exact packaging or label artwork",
          "exact-variant identity review",
          "named publication approval",
        ],
        targetFilenameTemplate: exactRenderFilenameTemplate(variant),
        rerenderPolicy:
          "Never overwrite. Increment the version, include the first 12 checksum characters in the filename, record the full checksum, and preserve the superseded review asset.",
        prompt: exactRenderPrompt(product, variant, row),
      };
    },
  );

  const identityCrosswalk = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    manifestGeneratedAt: ARTIFACT_GENERATED_AT,
    manifestKeyKind: "offering_variant_id",
    authorityBoundary:
      "Presentation-only identity convergence. This crosswalk grants no merge, deactivation, product, price, action, inventory, or commerce authority.",
    sources: {
      canonicalCatalog: {
        path: CATALOG_SOURCE_PATH,
        sha256: sha256File(CATALOG_SOURCE_PATH),
      },
      productControlBindings: {
        path: BINDING_SOURCE_PATH,
        sha256: sha256File(BINDING_SOURCE_PATH),
      },
      featuredLegacyEvidence: {
        path: FEATURED_IDENTITY_SOURCE_PATH,
        sha256: sha256File(FEATURED_IDENTITY_SOURCE_PATH),
        mappingAuthority: featuredIdentityEvidence.mappingAuthority,
      },
    },
    invariants: {
      canonicalManifestEntries: coverageRows.length,
      productControlBoundEntries: coverageRows.filter(
        (row) => row.productControl !== null,
      ).length,
      legacyFeaturedAliasRows: featuredIdentityEvidence.aliases.length,
      legacyFeaturedProducts: new Set(
        featuredIdentityEvidence.aliases.map((alias) => alias.liveProductId),
      ).size,
      canonicalProductControlSkusForAliases: new Set(
        featuredIdentityEvidence.aliases.map(
          (alias) => alias.canonicalProductControlSku,
        ),
      ).size,
    },
    entries: coverageRows.map((row) => ({
      manifestKey: row.manifestKey,
      offeringId: row.offeringId,
      offeringVariantId: row.offeringVariantId,
      productControl: row.productControl,
      legacyFeaturedAliases: row.legacyFeaturedAliases,
      resolvedCandidate: {
        assetId: row.fallback.assetId,
        href: row.fallback.href,
        recommendedAltText: row.fallback.recommendedAltText,
        width: row.fallback.width,
        height: row.fallback.height,
        illustrativeNotice: row.fallback.illustrativeNotice,
        reviewStatus: row.fallback.reviewStatus,
        approvalEligibility: row.fallback.approvalEligibility,
        runtimeWiringEligibility: row.fallback.runtimeWiringEligibility,
        deploymentEligibility: row.fallback.deploymentEligibility,
      },
    })),
  };

  const assetManifest = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    manifestGeneratedAt: ARTIFACT_GENERATED_AT,
    acceptanceBaseline: V3_ACCEPTANCE,
    promptContract: {
      status: "pre_v3_candidates_quarantined",
      founderV3PromptStatus: V3_ACCEPTANCE.founderPromptStatus,
      consequence:
        "Do not generate further pixels, approve, wire, or publish these candidates until the founder-supplied v3 prompt is attached and reconciled.",
    },
    generationMode: "openai_imagegen_then_ffmpeg_webp",
    reviewDisposition:
      "All ten assets are unreviewed AI-generated fallback candidates created before the founder v3 prompt was available. None is approved, published, wired, an exact product image, official packaging, or a supplier photograph.",
    branchDeploymentDisposition: {
      status: "blocked_nonapprovable_public_bytes",
      reason:
        "These candidate files live in the deployable public tree for source review, but their original PNG evidence is not repository-durable. These exact bytes are permanently ineligible for approval. This branch and any commit containing them must not be deployed until they are removed or replaced by v3 rerenders whose durable evidence and every publication prerequisite pass.",
      enforcement:
        "source_lane_contract_and_release_handoff_block_not_a_runtime_access_control",
    },
    provenancePolicy: {
      sourceType: "ai_generated_candidate",
      provenanceTag: "generated_catalog_fallback_candidate",
      generator: "OpenAI ImageGen through Codex imagegen",
      rightsStatus: "publication_rights_review_pending",
      ownershipClaim: "none_until_review",
      identityStatus: "form_or_pathway_only_not_exact_variant",
      reviewStatus: "provisional",
      approvalEligibility: "blocked_permanent_rerender_under_v3_required",
      runtimeWiringEligibility: "blocked",
      deploymentEligibility: "blocked",
      sourceDurabilityDisposition:
        "original_png_is_local_not_repository_durable_so_these_exact_bytes_cannot_be_approved",
    },
    deliveryBudget: {
      perAssetBytes: ASSET_BYTE_BUDGET,
      totalBytes: ASSET_TOTAL_BYTE_BUDGET,
      actualTotalBytes: FALLBACK_ASSETS.reduce(
        (total, asset) => total + asset.byteSize,
        0,
      ),
    },
    optimization: {
      sourceFormat: "PNG",
      sourceDimensions: { width: 1254, height: 1254 },
      deliveryFormat: "WebP",
      deliveryDimensions: { width: 1024, height: 1024 },
      encoder:
        "ffmpeg 8.1.1 libwebp scale=1024:1024:flags=lanczos quality 82 compression_level 6 metadata stripped",
      lineageVerification:
        "Each recorded source PNG reproduced its committed WebP byte-for-byte with the documented pipeline on 2026-09-30. Source filesystem times are observational, mutable evidence; opaque exec filenames are local artifact identifiers, not ImageGen run IDs.",
    },
    assets: FALLBACK_ASSETS.map((asset, index) => {
      const provenance = FALLBACK_ASSET_PROVENANCE[asset.assetId];
      if (!provenance) {
        throw new Error(`Missing source provenance for ${asset.assetId}`);
      }
      return {
        sequence: index + 1,
        ...asset,
        sourceType: "ai_generated_candidate",
        provenanceTag: "generated_catalog_fallback_candidate",
        generator: "OpenAI ImageGen through Codex imagegen",
        pixelGeneratedAt: provenance.pixelGeneratedAt,
        encodedAt: provenance.encodedAt,
        sourceArtifact: {
          ...provenance.sourceArtifact,
          timestampEvidence:
            "observed_local_filesystem_utc_not_cryptographic_generation_evidence",
        },
        transformation: {
          inputFormat: "PNG",
          inputDimensions: { width: 1254, height: 1254 },
          operation:
            "ffmpeg 8.1.1 -vf scale=1024:1024:flags=lanczos -c:v libwebp -quality 82 -compression_level 6 -map_metadata -1",
          outputSha256: asset.sha256,
          verification:
            "byte_identical_reproduction_from_recorded_source_png",
        },
        promptContractVersion: "pre_v3_candidate_quarantined",
        rightsStatus: "publication_rights_review_pending",
        ownershipClaim: "none_until_review",
        identityStatus: "form_or_pathway_only_not_exact_variant",
        coverageStatus: "fallback",
        reviewStatus: "provisional",
        approvalEligibility:
          "blocked_permanent_rerender_under_v3_required",
        runtimeWiringEligibility: "blocked",
        deploymentEligibility: "blocked",
        illustrativeNotice:
          "Illustrative fallback candidate. Exact product packaging is not shown.",
        reviewRecord: {
          disposition: "unreviewed",
          reviewer: null,
          reviewedAt: null,
          evidenceRef: null,
        },
        forbiddenUses: [
          "supplier_or_brand_photograph_claim",
          "official_or_xenios_packaging_claim",
          "exact_product_or_variant_claim",
          "Product_Control_primary_image_approval",
          "availability_or_purchase_evidence",
          "cart_or_payment_authority",
        ],
      };
    }),
  };

  const coverageLedger = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    manifestGeneratedAt: ARTIFACT_GENERATED_AT,
    baseCommit: SOURCE_BASE_COMMIT,
    baseTree: SOURCE_BASE_TREE,
    acceptanceBaseline: V3_ACCEPTANCE,
    sources: {
      catalog: {
        path: CATALOG_SOURCE_PATH,
        sha256: sha256File(CATALOG_SOURCE_PATH),
        workbookSha256: catalog.sourceWorkbookSha256,
      },
      productControlBindings: {
        path: BINDING_SOURCE_PATH,
        sha256: sha256File(BINDING_SOURCE_PATH),
      },
      featuredIdentityEvidence: {
        path: FEATURED_IDENTITY_SOURCE_PATH,
        sha256: sha256File(FEATURED_IDENTITY_SOURCE_PATH),
        mappingAuthority: featuredIdentityEvidence.mappingAuthority,
      },
      visualFormReconciliation: {
        decisionPath: CATALOG_RECONCILIATION_SOURCE_PATH,
        decisionSha256: sha256File(CATALOG_RECONCILIATION_SOURCE_PATH),
        sourceRowsPath: MASTER_CATALOG_SUMMARY_SOURCE_PATH,
        sourceRowsSha256: sha256File(MASTER_CATALOG_SUMMARY_SOURCE_PATH),
      },
      customerExposure: {
        path: CUSTOMER_EXPOSURE_SOURCE_PATH,
        sha256: sha256File(CUSTOMER_EXPOSURE_SOURCE_PATH),
        excludedOfferingIds: Array.from(excludedIds).sort(),
      },
      runtimeReferenceScan: {
        roots: runtimeReferenceScan.roots,
        references: runtimeReferenceScan.references,
      },
    },
    vocabularies: {
      coverageStatuses: COVERAGE_STATUSES,
      imageState: ["approved", "pending", "none"],
      journeyClasses: JOURNEY_CLASSES,
      exposure: ["customer_catalog", "excluded_shipping_service"],
    },
    invariants: {
      canonicalRows: coverageRows.length,
      exposedRows: coverageRows.filter(
        (row) => row.exposure === "customer_catalog",
      ).length,
      excludedShippingRows: coverageRows.filter(
        (row) => row.exposure === "excluded_shipping_service",
      ).length,
      boundRows: coverageRows.filter((row) => row.productControl !== null).length,
      exposedUnboundRows: coverageRows.filter(
        (row) =>
          row.exposure === "customer_catalog" && row.productControl === null,
      ).length,
      final: coverageRows.filter((row) => row.coverageStatus === "final").length,
      provisional: coverageRows.filter(
        (row) => row.coverageStatus === "provisional",
      ).length,
      fallback: coverageRows.filter((row) => row.coverageStatus === "fallback")
        .length,
      pending: coverageRows.filter((row) => row.coverageStatus === "pending")
        .length,
      assetReviewStatus: "all_provisional",
      approvedExactAssets: 0,
      publicAssetsWired: runtimeReferenceScan.publicAssetsWired,
      customerSurfaceReferences:
        runtimeReferenceScan.customerSurfaceReferences,
      legacyFeaturedAliasRows: featuredIdentityEvidence.aliases.length,
      manifestKeyKind: "offering_variant_id",
      founderV3PromptStatus: V3_ACCEPTANCE.founderPromptStatus,
      reviewedVisualFormOverrides: coverageRows.filter(
        (row) => row.visualFormEvidence !== null,
      ).length,
    },
    counts: {
      byExposure: countBy(coverageRows, (row) => row.exposure),
      byJourneyClass: countBy(coverageRows, (row) => row.journeyClass),
      byFallbackTaxonomy: countBy(
        coverageRows,
        (row) => row.fallback.taxonomyKey,
      ),
      byFormTaxonomy: countBy(coverageRows, (row) => row.formTaxonomy),
      bySourceDisplayState: countBy(
        coverageRows,
        (row) => row.sourceDisplayState,
      ),
      byImageState: countBy(coverageRows, (row) => row.imageState),
    },
    rows: coverageRows,
  };

  const renderQueue = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    manifestGeneratedAt: ARTIFACT_GENERATED_AT,
    acceptanceBaseline: V3_ACCEPTANCE,
    stableFilenameRule:
      "xenios-{offeringVariantId}-primary-v{n}-{sha12}.webp; never overwrite an existing version and never publish an unhashed URL",
    batches: [
      {
        batchId: "fallback-batch-001",
        purpose:
          "Ten action-neutral form, pathway, pending, and shipping-service fallback candidates",
        generationMode: "openai_imagegen",
        status: "generated_pre_v3_quarantined",
        items: assetManifest.assets.map((asset) => ({
          sequence: asset.sequence,
          assetId: asset.assetId,
          taxonomyKey: asset.taxonomyKey,
          status: "generated_pre_v3_quarantined",
          filePath: asset.filePath,
          sha256: asset.sha256,
          prompt: asset.prompt,
        })),
      },
      {
        batchId: "exact-variant-queue-001",
        purpose:
          "Exact canonical Product Control-aware draft queue; blocked until the founder v3 prompt, packaging evidence, and named approval exist",
        generationMode:
          "imagegen_or_commissioned_photography_only_after_v3_and_evidence",
        status: "blocked_missing_founder_v3_prompt_and_evidence",
        items: exactRenderQueue,
      },
    ],
    counts: {
      fallbackPrompts: assetManifest.assets.length,
      exactVariantQueue: exactRenderQueue.length,
      exactQueueByPriority: countBy(exactRenderQueue, (item) => item.priority),
      exactQueueByStatus: countBy(exactRenderQueue, (item) => item.queueStatus),
    },
  };

  return {
    catalog,
    bindings,
    featuredIdentityEvidence,
    identityCrosswalk,
    assetManifest,
    coverageLedger,
    renderQueue,
  };
}

function markdownCountRows(record) {
  return Object.entries(record)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
}

export function renderCoverageSummary({ coverageLedger, renderQueue }) {
  return `# Product imagery coverage checkpoint

Generated from the canonical master-offerings artifact and the runtime customer-exposure exclusion at base \`${coverageLedger.baseCommit}\`.

## Headline

| Measure | Count |
| --- | ---: |
| Canonical source rows accounted for | ${coverageLedger.invariants.canonicalRows} |
| Customer-exposed rows | ${coverageLedger.invariants.exposedRows} |
| Excluded shipping-service rows | ${coverageLedger.invariants.excludedShippingRows} |
| Product Control-bound rows | ${coverageLedger.invariants.boundRows} |
| Exposed unbound rows | ${coverageLedger.invariants.exposedUnboundRows} |
| Featured legacy aliases converged to \`mov_*\` keys | ${coverageLedger.invariants.legacyFeaturedAliasRows} |
| Reviewed kept-identity form overrides | ${coverageLedger.invariants.reviewedVisualFormOverrides} |
| Remaining form-neutral unknowns | ${coverageLedger.rows.filter((row) => row.sourceForm === "Form not stated" && row.visualFormEvidence === null).length} |
| Approved exact assets | ${coverageLedger.invariants.approvedExactAssets} |
| Quarantined pre-v3 generated fallback candidates | ${renderQueue.counts.fallbackPrompts} |
| Exact-variant render queue | ${renderQueue.counts.exactVariantQueue} |

Every canonical row has a nonblank candidate fallback reference and truthful alt-text recommendation. Featured PEX/R360 aliases and canonical GEN-GRP bindings resolve through one \`mov_*\` manifest key. The ten files are unreviewed pre-v3 candidates, are not wired to customer surfaces, and do not satisfy Product Control or Early Access media approval. Their source PNGs are local rather than repository-durable, so these exact bytes are permanently non-approvable and make this branch non-deployable while they remain in the public tree. The founder v3 prompt is not attached, so no additional render is authorized. FedEx Standard Overnight remains explicitly accounted for as a shipping service rather than merchandise.

## Journey classes

| Journey class | Rows |
| --- | ---: |
${markdownCountRows(coverageLedger.counts.byJourneyClass)}

## Fallback taxonomy

| Taxonomy | Rows |
| --- | ---: |
${markdownCountRows(coverageLedger.counts.byFallbackTaxonomy)}

The selected fallback is journey-safe. Care, held, quote, coming, and shipping rows can therefore use a non-product visual. Source form and resolved visual form are tracked separately. The only overrides are the founder-reviewed kept identities GRP-0425 and GRP-0426; all other form-not-stated rows stay form-neutral.

## Resolved visual form taxonomy

| Form taxonomy | Rows |
| --- | ---: |
${markdownCountRows(coverageLedger.counts.byFormTaxonomy)}

## Exact render queue priorities

| Priority | Rows |
| --- | ---: |
${markdownCountRows(renderQueue.counts.exactQueueByPriority)}

Priority order is current-demand exact name matches, default first-page rows, first remaining representative of each fallback taxonomy, then the remainder. Every queue row is blocked on the founder v3 prompt and evidence. Queue priority never changes price, availability, action, or purchase authority.
`;
}

export function assertIdentityCrosswalkConsistency(
  identityCrosswalk,
  coverageLedger,
) {
  if (identityCrosswalk.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    throw new Error("Identity crosswalk schema version mismatch");
  }
  if (identityCrosswalk.manifestKeyKind !== "offering_variant_id") {
    throw new Error("Identity crosswalk must use offering_variant_id keys");
  }
  if (identityCrosswalk.entries.length !== coverageLedger.rows.length) {
    throw new Error("Identity crosswalk does not account for every ledger row");
  }

  const coverageByKey = new Map(
    coverageLedger.rows.map((row) => [row.offeringVariantId, row]),
  );
  const seenManifestKeys = new Set();
  const seenLegacyVariantIds = new Set();
  const seenLegacyVariantSkus = new Set();
  const seenCanonicalVariantIdsForAliases = new Set();
  const seenCanonicalSkusForAliases = new Set();
  let aliasCount = 0;

  for (const entry of identityCrosswalk.entries) {
    if (seenManifestKeys.has(entry.manifestKey)) {
      throw new Error(`Duplicate manifest key ${entry.manifestKey}`);
    }
    seenManifestKeys.add(entry.manifestKey);
    if (entry.manifestKey !== entry.offeringVariantId) {
      throw new Error(
        `Manifest key ${entry.manifestKey} does not match ${entry.offeringVariantId}`,
      );
    }
    const coverage = coverageByKey.get(entry.manifestKey);
    if (!coverage || coverage.offeringId !== entry.offeringId) {
      throw new Error(`No canonical coverage for ${entry.manifestKey}`);
    }
    if (
      JSON.stringify(coverage.productControl) !==
      JSON.stringify(entry.productControl)
    ) {
      throw new Error(`Product Control mismatch for ${entry.manifestKey}`);
    }
    const expectedResolvedCandidate = {
      assetId: coverage.fallback.assetId,
      href: coverage.fallback.href,
      recommendedAltText: coverage.fallback.recommendedAltText,
      width: coverage.fallback.width,
      height: coverage.fallback.height,
      illustrativeNotice: coverage.fallback.illustrativeNotice,
      reviewStatus: coverage.fallback.reviewStatus,
      approvalEligibility: coverage.fallback.approvalEligibility,
      runtimeWiringEligibility: coverage.fallback.runtimeWiringEligibility,
      deploymentEligibility: coverage.fallback.deploymentEligibility,
    };
    if (
      JSON.stringify(expectedResolvedCandidate) !==
      JSON.stringify(entry.resolvedCandidate)
    ) {
      throw new Error(`Image resolution mismatch for ${entry.manifestKey}`);
    }
    if (
      JSON.stringify(coverage.legacyFeaturedAliases) !==
      JSON.stringify(entry.legacyFeaturedAliases)
    ) {
      throw new Error(`Featured alias mismatch for ${entry.manifestKey}`);
    }
    for (const alias of entry.legacyFeaturedAliases) {
      if (seenLegacyVariantIds.has(alias.variantId)) {
        throw new Error(`Duplicate legacy featured variant ${alias.variantId}`);
      }
      seenLegacyVariantIds.add(alias.variantId);
      if (seenLegacyVariantSkus.has(alias.variantSku)) {
        throw new Error(`Duplicate legacy featured SKU ${alias.variantSku}`);
      }
      seenLegacyVariantSkus.add(alias.variantSku);
      if (!entry.productControl) {
        throw new Error(`Featured alias lacks canonical binding ${alias.variantId}`);
      }
      if (seenCanonicalVariantIdsForAliases.has(entry.productControl.variantId)) {
        throw new Error(
          `Duplicate canonical featured variant ${entry.productControl.variantId}`,
        );
      }
      seenCanonicalVariantIdsForAliases.add(entry.productControl.variantId);
      if (seenCanonicalSkusForAliases.has(entry.productControl.sku)) {
        throw new Error(`Duplicate canonical featured SKU ${entry.productControl.sku}`);
      }
      seenCanonicalSkusForAliases.add(entry.productControl.sku);
      aliasCount += 1;
    }
  }

  if (aliasCount !== identityCrosswalk.invariants.legacyFeaturedAliasRows) {
    throw new Error("Featured alias count mismatch");
  }
  return true;
}

export function resolveCrosswalkManifestKey(identityCrosswalk, identity = {}) {
  const resolvedManifestKeys = [];
  const resolveUnique = (predicate) => {
    const matches = identityCrosswalk.entries.filter(predicate);
    if (matches.length !== 1) return false;
    resolvedManifestKeys.push(matches[0].manifestKey);
    return true;
  };

  const hasCanonicalPart = Boolean(
    identity.offeringId || identity.offeringVariantId,
  );
  if (hasCanonicalPart) {
    if (!identity.offeringVariantId) return null;
    if (
      !resolveUnique(
        (entry) =>
          entry.offeringVariantId === identity.offeringVariantId &&
          (!identity.offeringId || entry.offeringId === identity.offeringId),
      )
    ) {
      return null;
    }
  }

  const hasProductControlPart = Boolean(
    identity.productControlProductId || identity.productControlVariantId,
  );
  if (hasProductControlPart) {
    if (!identity.productControlVariantId) return null;
    if (
      !resolveUnique(
        (entry) =>
          entry.productControl?.variantId ===
            identity.productControlVariantId &&
          (!identity.productControlProductId ||
            entry.productControl?.productId ===
              identity.productControlProductId),
      )
    ) {
      return null;
    }
  }

  const hasLegacyUuidPart = Boolean(
    identity.legacyProductId || identity.legacyVariantId,
  );
  const hasLegacySkuPart = Boolean(
    identity.legacyProductSku || identity.legacyVariantSku,
  );
  if (
    (hasLegacyUuidPart &&
      !(identity.legacyProductId && identity.legacyVariantId)) ||
    (hasLegacySkuPart &&
      !(identity.legacyProductSku && identity.legacyVariantSku))
  ) {
    return null;
  }
  if (hasLegacyUuidPart) {
    if (
      !resolveUnique((entry) =>
        entry.legacyFeaturedAliases.some(
          (alias) =>
            alias.productId === identity.legacyProductId &&
            alias.variantId === identity.legacyVariantId,
        ),
      )
    ) {
      return null;
    }
  }
  if (hasLegacySkuPart) {
    if (
      !resolveUnique((entry) =>
        entry.legacyFeaturedAliases.some(
          (alias) =>
            alias.productSku === identity.legacyProductSku &&
            alias.variantSku === identity.legacyVariantSku,
        ),
      )
    ) {
      return null;
    }
  }

  if (resolvedManifestKeys.length === 0) return null;
  return new Set(resolvedManifestKeys).size === 1
    ? resolvedManifestKeys[0]
    : null;
}

export function assetById(assetId) {
  return ASSET_BY_ID.get(assetId) ?? null;
}
