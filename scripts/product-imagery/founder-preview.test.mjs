import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  CORE_SOURCE_SHA,
  CORE_SOURCE_TREE,
  EXPECTED_CANONICAL_ROWS,
  EXPECTED_CUSTOMER_ROWS,
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
  assert.equal(data.sources.imageryReviewTarget.exactPerAssetDecisionReceived, false);
  assert.equal(data.sources.mediaCommerceCandidate.acceptedForIntegration, false);
  assert.ok(!data.rows.some((row) => row.canonicalId === SHIPPING_GROUP_ID));
  assert.equal(new Set(data.rows.map((row) => row.manifestKey)).size, 423);
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

test("keeps the preview static, local, noindex, and free of live forms", () => {
  for (const file of ["index.html", "wireframe.html", "catalog-review.html", "product-detail.html"]) {
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
