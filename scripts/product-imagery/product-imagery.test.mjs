import assert from "node:assert/strict";
import test from "node:test";

import {
  assertIdentityCrosswalkConsistency,
  buildArtifacts,
  extractRuntimeExcludedOfferingIds,
  journeyClassFor,
  resolveCrosswalkManifestKey,
} from "./lib.mjs";
import { verifyRepository } from "./verify.mjs";

test("builds complete canonical coverage without treating the shipping fee as merchandise", () => {
  const { coverageLedger } = buildArtifacts();
  assert.equal(coverageLedger.rows.length, 420);
  assert.equal(coverageLedger.invariants.exposedRows, 419);
  assert.equal(coverageLedger.invariants.boundRows, 417);
  assert.equal(coverageLedger.invariants.exposedUnboundRows, 2);
  const shipping = coverageLedger.rows.find(
    (row) => row.offeringId === "mo_003b0c272099eeb1f114",
  );
  assert.equal(shipping.exposure, "excluded_shipping_service");
  assert.equal(shipping.assetRequired, false);
  assert.equal(shipping.purchaseImplication, "none");
});

test("keeps image journey language closed and action neutral", () => {
  const bound = { productId: "p", variantId: "v" };
  const product = (displayState, family = "supplements") => ({
    displayState,
    family,
  });
  assert.equal(
    journeyClassFor({ product: product("care_pathway"), binding: bound, excluded: false }),
    "care",
  );
  assert.equal(
    journeyClassFor({ product: product("request_access"), binding: null, excluded: false }),
    "quote_required",
  );
  assert.equal(
    journeyClassFor({ product: product("approval_required"), binding: bound, excluded: false }),
    "held",
  );
  assert.equal(
    journeyClassFor({ product: product("coming_soon"), binding: bound, excluded: false }),
    "coming",
  );
  assert.equal(
    journeyClassFor({ product: product("available_now"), binding: bound, excluded: false }),
    "catalog_visible",
  );
  assert.equal(
    journeyClassFor({ product: product("care_pathway"), binding: null, excluded: true }),
    "shipping_service",
  );
});

test("derives the runtime exclusion instead of accepting a second hand-maintained list", () => {
  assert.deepEqual(
    [...extractRuntimeExcludedOfferingIds(
      'const SHIPPING_CHARGE_OFFERING_ID_GRP_0364 = "mo_003b0c272099eeb1f114";',
    )],
    ["mo_003b0c272099eeb1f114"],
  );
  assert.throws(() => extractRuntimeExcludedOfferingIds(""));
  assert.throws(() =>
    extractRuntimeExcludedOfferingIds(
      'const SHIPPING_CHARGE_OFFERING_ID_A = "mo_1"; const SHIPPING_CHARGE_OFFERING_ID_B = "mo_2";',
    ),
  );
});

test("quarantines ten pre-v3 candidates and blocks every exact render", () => {
  const { assetManifest, renderQueue } = buildArtifacts();
  assert.equal(assetManifest.assets.length, 10);
  assert(assetManifest.assets.every((asset) => asset.reviewStatus === "provisional"));
  assert(
    assetManifest.assets.every(
      (asset) =>
        asset.reviewRecord.disposition === "unreviewed" &&
        asset.approvalEligibility ===
          "blocked_permanent_rerender_under_v3_required" &&
        asset.runtimeWiringEligibility === "blocked" &&
        asset.deploymentEligibility === "blocked",
    ),
  );
  assert.equal(
    assetManifest.branchDeploymentDisposition.status,
    "blocked_nonapprovable_public_bytes",
  );
  assert.equal(
    assetManifest.promptContract.founderV3PromptStatus,
    "missing_founder_attachment_required",
  );
  const exact = renderQueue.batches.find(
    (batch) => batch.batchId === "exact-variant-queue-001",
  );
  assert.equal(exact.items.length, 419);
  assert(exact.items.every((item) => item.queueStatus === "pending"));
  assert(
    exact.items.every(
      (item) =>
        item.promptStatus === "draft_blocked_missing_founder_v3_prompt",
    ),
  );
  assert(exact.items.every((item) => item.mayRenderNow === false));
});

test("converges Featured PEX and R360 aliases with canonical GEN-GRP rows", () => {
  const { coverageLedger, identityCrosswalk } = buildArtifacts();
  assert.equal(identityCrosswalk.invariants.legacyFeaturedAliasRows, 22);
  assert.equal(identityCrosswalk.invariants.legacyFeaturedProducts, 19);
  assert.equal(
    assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger),
    true,
  );

  const aliasEntries = identityCrosswalk.entries.filter(
    (entry) => entry.legacyFeaturedAliases.length > 0,
  );
  assert.equal(aliasEntries.length, 22);
  for (const entry of aliasEntries) {
    assert.match(entry.productControl.sku, /^GEN-GRP-/);
    const alias = entry.legacyFeaturedAliases[0];
    assert.match(alias.variantSku, /^R360-/);
    assert.equal(
      resolveCrosswalkManifestKey(identityCrosswalk, {
        legacyProductId: alias.productId,
        legacyVariantId: alias.variantId,
      }),
      entry.manifestKey,
    );
    assert.equal(
      resolveCrosswalkManifestKey(identityCrosswalk, {
        legacyProductSku: alias.productSku,
        legacyVariantSku: alias.variantSku,
      }),
      entry.manifestKey,
    );
    assert.equal(
      resolveCrosswalkManifestKey(identityCrosswalk, {
        productControlVariantId: entry.productControl.variantId,
      }),
      entry.manifestKey,
    );
    assert.equal(
      resolveCrosswalkManifestKey(identityCrosswalk, {
        offeringId: entry.offeringId,
        offeringVariantId: entry.offeringVariantId,
        productControlProductId: entry.productControl.productId,
        productControlVariantId: entry.productControl.variantId,
        legacyProductId: alias.productId,
        legacyVariantId: alias.variantId,
        legacyProductSku: alias.productSku,
        legacyVariantSku: alias.variantSku,
      }),
      entry.manifestKey,
    );
    const coverage = coverageLedger.rows.find(
      (row) => row.manifestKey === entry.manifestKey,
    );
    assert.deepEqual(entry.resolvedCandidate, {
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
    });
  }

  const first = aliasEntries[0].legacyFeaturedAliases[0];
  const second = aliasEntries
    .map((entry) => entry.legacyFeaturedAliases[0])
    .find(
      (alias) =>
        alias.productId !== first.productId &&
        alias.productSku !== first.productSku,
    );
  assert(second);
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      legacyProductId: first.productId,
      legacyVariantId: second.variantId,
    }),
    null,
  );

  const firstEntry = aliasEntries.find((entry) =>
    entry.legacyFeaturedAliases.some(
      (alias) => alias.variantId === first.variantId,
    ),
  );
  const secondEntry = aliasEntries.find((entry) =>
    entry.legacyFeaturedAliases.some(
      (alias) => alias.variantId === second.variantId,
    ),
  );
  assert(firstEntry);
  assert(secondEntry);
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      offeringVariantId: firstEntry.offeringVariantId,
      legacyProductId: second.productId,
      legacyVariantId: second.variantId,
    }),
    null,
  );
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      productControlVariantId: firstEntry.productControl.variantId,
      legacyProductSku: second.productSku,
      legacyVariantSku: second.variantSku,
    }),
    null,
  );
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      offeringVariantId: firstEntry.offeringVariantId,
      productControlVariantId: secondEntry.productControl.variantId,
    }),
    null,
  );
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      productControlProductId: secondEntry.productControl.productId,
      productControlVariantId: firstEntry.productControl.variantId,
    }),
    null,
  );
  assert.equal(
    resolveCrosswalkManifestKey(identityCrosswalk, {
      legacyProductSku: first.productSku,
      legacyVariantSku: second.variantSku,
    }),
    null,
  );

  const mutated = structuredClone(identityCrosswalk);
  [mutated.entries[0].manifestKey, mutated.entries[1].manifestKey] = [
    mutated.entries[1].manifestKey,
    mutated.entries[0].manifestKey,
  ];
  assert.throws(() =>
    assertIdentityCrosswalkConsistency(mutated, coverageLedger),
  );

  const presentationMutated = structuredClone(identityCrosswalk);
  presentationMutated.entries[0].resolvedCandidate.width += 1;
  assert.throws(() =>
    assertIdentityCrosswalkConsistency(presentationMutated, coverageLedger),
  );
});

test("keeps unknown forms neutral, sensitive packaging generic, and held distinct", () => {
  const { coverageLedger } = buildArtifacts();
  const unknown = coverageLedger.rows.filter(
    (row) => row.sourceForm === "Form not stated",
  );
  assert.equal(unknown.length, 29);
  const reviewedOverrides = unknown.filter(
    (row) => row.visualFormEvidence !== null,
  );
  assert.equal(reviewedOverrides.length, 2);
  assert.deepEqual(
    reviewedOverrides
      .map((row) => row.visualFormEvidence.canonicalSourceRow)
      .sort(),
    ["GRP-0425", "GRP-0426"],
  );
  assert(
    reviewedOverrides.every(
      (row) =>
        row.resolvedVisualForm === "Lyophilized Vial" &&
        row.formTaxonomy === "pending" &&
        row.fallback.taxonomyKey === "pending",
    ),
  );
  assert(
    unknown
      .filter((row) => row.visualFormEvidence === null)
      .every(
      (row) =>
        row.formTaxonomy === "pending" &&
        !["vial", "bottle", "spray", "topical", "liquid", "accessory"].includes(
          row.fallback.taxonomyKey,
        ),
      ),
  );

  const lyophilized = coverageLedger.rows.filter(
    (row) => row.resolvedVisualForm === "Lyophilized Vial",
  );
  assert(lyophilized.length > 0);
  assert(
    lyophilized.every(
      (row) =>
        row.formTaxonomy === "pending" &&
        row.fallback.taxonomyKey !== "vial",
    ),
  );

  const containerAmbiguousLiquids = coverageLedger.rows.filter((row) =>
    ["Liquid", "Solution"].includes(row.resolvedVisualForm),
  );
  assert(containerAmbiguousLiquids.length > 0);
  assert(
    containerAmbiguousLiquids.every(
      (row) =>
        row.formTaxonomy === "pending" &&
        row.fallback.taxonomyKey !== "liquid",
    ),
  );
  assert(
    coverageLedger.rows.every(
      (row) =>
        row.fallback.recommendedAltText.startsWith(`${row.displayName}: `) &&
        !row.fallback.recommendedAltText.startsWith("This catalog item:"),
    ),
  );

  const packagingSensitive = coverageLedger.rows.filter((row) =>
    row.visualRestriction.includes("no_brand_logo_or_fabricated_packaging"),
  );
  assert(packagingSensitive.length > 0);
  assert(
    packagingSensitive.every(
      (row) => row.fallback.identityScope !== "exact_variant",
    ),
  );

  const cjcWithDac = coverageLedger.rows.find(
    (row) => row.displayName === "CJC-1295 With DAC",
  );
  assert.equal(cjcWithDac.journeyClass, "held");
  assert.equal(cjcWithDac.fallback.taxonomyKey, "pending");
  assert(!cjcWithDac.variantLabel.includes("+"));

  const syringes = coverageLedger.rows.find(
    (row) => row.displayName === "Syringes & Alcohol Swabs",
  );
  assert.equal(syringes.journeyClass, "held");
  assert.notEqual(syringes.journeyClass, "coming");
  assert.equal(syringes.fallback.taxonomyKey, "pending");
});

test("imagery rows contain no price, workflow, action, or cart authority", () => {
  const { coverageLedger } = buildArtifacts();
  const forbiddenAuthorityFields = [
    "price",
    "priceCents",
    "workflowMode",
    "action",
    "cartEligible",
    "sellable",
    "inventory",
  ];
  for (const row of coverageLedger.rows) {
    for (const field of forbiddenAuthorityFields) {
      assert.equal(Object.hasOwn(row, field), false, `${row.coverageKey} owns ${field}`);
    }
    assert.equal(row.purchaseImplication, "none");
  }
});

test("checked-in v3 manifests, bytes, alt text, and queue are deterministic", () => {
  assert.equal(verifyRepository().ok, true);
});
