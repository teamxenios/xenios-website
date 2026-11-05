const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");


const base = "9b2fc9b33e1873d77c264e5a57df61a96fa970d9";
const priorPullRequestHead = "b53e3da72556a89d52bba5aa0067d03a968974c7";
const tree = "2a20520395acdbe1de1ca3ab7444e0c035f38cc3";
const data = "server/research/master-offerings/data/";
const copy = data + "reviewed-public-content.json";
const datasetPath = data + "member-safe-master-offerings.generated.json";
const catalogPrefix = "/api/research/catalog-display/v2";
const memberRoutePrefix = "/research/member/catalog";
const guestRoute = "/research/early-access/order-request";
const guestApi = "/api/research/early-access/request-intents/catalog";
const dep = Module.createRequire(path.join(process.cwd(), "package.json"));
const esbuild = dep("esbuild");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { maxBuffer: 30000000 });
const cache = new Map();
function read(file) {
  if (!cache.has(file)) cache.set(file, git("show", tree + ":" + file));
  return cache.get(file);
}

const mediaPath = data + "reviewed-public-media.json";
const dataset = read(datasetPath);
assert.equal(hash(dataset), "76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5");
assert.equal(git("rev-parse", tree + ":" + copy).toString().trim(), "84d4104806803a60b3e376a7c5206b432716775e");
assert.deepEqual(read(copy), git("show", base + ":" + copy));
const liveCopy = new Map(JSON.parse(read(copy)).records.map(row => [row.sourceVariantId, row]));
assert.equal(liveCopy.size, 27);
const media = read(mediaPath);
assert.equal(hash(media), "852fef644b7ae73da242354fe7392d69d78e0016e026de0584f5d661e6ad3af1");
const baseline = JSON.parse(git("show", base + ":" + mediaPath)).records;
const current = JSON.parse(media).records;
assert.equal(baseline.length, 29);
assert.equal(current.length, 35);
assert.deepEqual(current.slice(0, baseline.length), baseline);
const added = current.slice(baseline.length);
const expected = [
  ["0243", "mo_c600e7eb1c9f5fd03c80", "mov_2183aa9edb06f34ef3af", "new", true],
  ["0245", "mo_7ba89975fb62ceb33b7b", "mov_753d3f94385adf791d1e", "new", true],
  ["0248", "mo_4668304296fb55b51280", "mov_a2d32f69681dca2b17fb", "new", true],
  ["0249", "mo_b2ebb969d48a20f9e680", "mov_fe292b5f03527ec13e5e", "new", true],
  ["0263", "mo_9a755fa72de0409cd937", "mov_257330ea83ecbfc45fae", "new", false],
  ["0264", "mo_e4de11c77d16c4c3b83d", "mov_09db3e866424b64994d3", "new", false],
  ["0307", "mo_ffeecca340b02f400868", "mov_a4b4118c4d23b1546c8b", "generic", false],
  ["0256", "mo_afb0add32da0de7426f5", "mov_9262033fe69a14a50f1c", "generic", false],
  ["0262", "mo_af289f611c02b3fcef01", "mov_ca3e45ae9712aee91430", "retained", false],
];
assert.deepEqual(added.map(row => [row.offeringId, row.sourceVariantId]).sort(), expected.slice(0, 6).map(row => row.slice(1, 3)).sort());
const bindings = new Map(JSON.parse(read(data + "master-offering-bindings.generated.json")).bindings
  .map(binding => [binding.offeringVariantId, binding]));
const entry = [
  'export { GeneratedMasterOfferingCatalogReader } from "server/research/master-offerings/dataset-reader";',
  'export { projectMasterOfferingCard, projectMasterOfferingDetail } from "server/research/master-offerings/customer-projection";',
  'export { createRequestIntentCatalog } from "server/research/assisted-order/request-intent/catalog";',
  'export { DEFAULT_MASTER_OFFERING_SORT, EMPTY_MASTER_OFFERING_FACETS } from "shared/research/master-offerings/contract";',
].join("\n");
const files = new Set(git("ls-tree", "-r", "--name-only", tree, "--", "server", "shared", "client/src")
  .toString().trim().split(/\r?\n/));
const exactSource = { name: "exact-git-source", setup(build) {
  build.onResolve({ filter: /.*/ }, args => {
    let source = args.path;
    if (source.startsWith("@shared/")) source = "shared/" + source.slice(8);
    else if (source.startsWith("@/")) source = "client/src/" + source.slice(2);
    else if (source.startsWith(".")) source = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), source));
    else if (!/^(server|shared|client)\//.test(source)) return { path: source, external: true };
    const resolved = [source, source + ".ts", source + ".tsx", source + ".json", source + "/index.ts"].find(name => files.has(name));
    assert(resolved, "Unresolved pinned file " + args.path + " from " + args.importer);
    return { path: resolved, namespace: "pinned" };
  });
  build.onLoad({ filter: /.*/, namespace: "pinned" }, ({ path: file }) => ({
    contents: read(file), loader: path.extname(file).slice(1),
  }));
} };

async function makeFixture() {
  const built = await esbuild.build({
    stdin: { contents: entry, loader: "ts", resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [exactSource],
  });
  const local = new Module(path.join(process.cwd(), "__pr393_memory_only.cjs"), module);
  local.filename = path.join(process.cwd(), "__pr393_memory_only.cjs");
  local.paths = module.paths;
  local._compile(built.outputFiles[0].text, local.filename);
  const {
    GeneratedMasterOfferingCatalogReader, projectMasterOfferingCard, projectMasterOfferingDetail,
    createRequestIntentCatalog, DEFAULT_MASTER_OFFERING_SORT, EMPTY_MASTER_OFFERING_FACETS,
  } = local.exports;
  const all = new GeneratedMasterOfferingCatalogReader("pr393-synthetic", {
    statMtimeMs: () => 1, readText: () => dataset.toString(),
  }).readCatalog();
  assert.equal(all.length, 420);

  const selected = expected.map(([sku, offeringId, variantId]) => {
    const offering = all.find(item => item.id === offeringId);
    assert(offering);
    assert.equal(offering.displayState, "request_access");
    assert.equal(offering.variants.length, 1);
    assert.equal(offering.variants[0].id, variantId);
    assert.equal(offering.variants[0].displayState, "request_access");
    assert.equal(bindings.get(variantId).offeringId, offeringId);
    assert.equal(bindings.get(variantId).productControlSku, "GEN-GRP-" + sku);
    return offering;
  });
  const guest = createRequestIntentCatalog({
    serviceFor: () => ({
      select: async query => ({
        offerings: selected, prices: new Map(),
        page: { page: query.page, pageSize: query.pageSize, total: selected.length },
      }),
    }),
    bindingFor: id => bindings.get(id), offeringVariantFor: () => null, catalogVersion: "pr393-synthetic",
  });
  const actor = {
    actorType: "early_access_session", earlyAccessSessionHash: "pr393-fixture-only",
    memberId: null, authUserId: null, normalizedEmail: null, capabilities: new Set(),
  };
  const page = await guest.list(actor, { page: 1, pageSize: 24 });
  assert.equal(page.items.length, 9);
  assert.equal(page.total, 9);
  const wrong = await guest.resolveMany(actor, [{ productId: page.items[0].productId, variantId: "unmapped.synthetic" }]);
  assert.deepEqual(wrong, [null]);
  const envelope = { ok: true, audience: "member", launchScope: "founder_admin" };
  const identities = [];
  const cards = [];
  const memberDetails = {};
  const guestItems = [];
  for (const [i, [sku, offeringId, variantId, art, capsule]] of expected.entries()) {
    const offering = selected[i];
    const item = page.items.find(item => item.sourceSelection.variantId === variantId);
    assert(item);
    const card = projectMasterOfferingCard(offering);
    const detail = projectMasterOfferingDetail(offering);
    const copyRow = liveCopy.get(variantId);
    const mediaRow = current.find(row => row.sourceVariantId === variantId);
    if (art === "generic") assert.equal(mediaRow, undefined);
    else {
      assert.equal(mediaRow.offeringId, offeringId);
      assert.equal(mediaRow.media.packagingDesign, true);
      if (art === "retained") assert.deepEqual(mediaRow, baseline.find(row => row.sourceVariantId === variantId));
      for (const [key, expectedHash] of [["primary", mediaRow.primarySha256], ["labelPreview", mediaRow.labelPreviewSha256]]) {
        const href = mediaRow.media[key].href;
        assert.match(href, new RegExp("^/research/product-media/[a-z0-9-]+[.]webp$"));
        const bytes = read("client/public" + href);
        assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
        assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
        assert.equal(hash(bytes), expectedHash);
      }
    }
    if (art === "new") assert.equal(copyRow.offeringId, offeringId);
    for (const view of [card, detail]) {
      assert.equal(view.id, offeringId);
      assert.equal(view.displayState, "request_access");
      assert.equal(view.variants[0].id, variantId);
      assert.deepEqual(view.variants[0].reviewedContent, copyRow?.content);
      assert.deepEqual(view.variants[0].reviewedMedia, mediaRow?.media);
    }
    assert.equal(item.sourceDisplayState, "request_access");
    assert.equal(item.selectableForReview, true);
    assert.deepEqual(item.reviewedContent, copyRow?.content);
    assert.deepEqual(item.reviewedMedia, mediaRow?.media);
    if (capsule) assert.equal(item.researchUseOnly, true);
    const memberSuffix = "/" + offering.family + "/" + offering.slug;
    const detailApi = catalogPrefix + "/products" + memberSuffix;
    assert(!Object.hasOwn(memberDetails, detailApi));
    memberDetails[detailApi] = { ...envelope, product: detail };
    cards.push(card);
    guestItems.push({
      ...item, productId: "qa-pr393-product-" + offeringId, variantId: "qa-pr393-variant-" + variantId,
    });
    identities.push({
      sku: "GEN-GRP-" + sku, offeringId, sourceVariantId: variantId, art,
      productName: item.productName, specification: item.specification,
      memberRoute: memberRoutePrefix + memberSuffix, memberDetailApi: detailApi,
      reviewedCopy: Boolean(copyRow), researchUseOnly: item.researchUseOnly,
      assetHashes: mediaRow ? { primary: mediaRow.primarySha256, labelPreview: mediaRow.labelPreviewSha256 } : undefined,
    });
  }
  assert.equal(new Set(identities.map(row => JSON.stringify([row.productName, row.specification]))).size, 9);
  const result = {
    schemaVersion: 1, purpose: "Local synthetic fixture for a prospective combined PR 393 tree",
    base, priorPullRequestHead, candidateCommit: null, tree, mediaSha256: hash(media),
    copySha256: hash(read(copy)), datasetSha256: hash(dataset), guestRoute, identities,
    responses: {
      [guestApi]: { ...page, items: guestItems },
      [catalogPrefix + "/catalog"]: {
        ...envelope, catalog: {
          ok: true, page: 1, pageSize: 24, total: cards.length, totalPages: 1,
          sort: DEFAULT_MASTER_OFFERING_SORT, products: cards, facets: EMPTY_MASTER_OFFERING_FACETS,
        },
      },
      ...memberDetails,
    },
  };
  assert.equal(Object.keys(result.responses).length, 11);
  const bytes = Buffer.from(JSON.stringify(result, null, 2) + String.fromCharCode(10));
  writeFileSync(process.argv[2], bytes, { flag: "wx" });
  console.log(JSON.stringify({ tree, checks: identities.length * 2, responses: Object.keys(result.responses).length, bytes: bytes.length, sha256: hash(bytes), identities }));
}
makeFixture().catch(error => { console.error(error.stack); process.exitCode = 1; });
