const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const base = "19d10e0495aed917b3d1fcf2844109e5e1cc6915";
const firstCopy = "4009ab97e74178449fdb0bdb4c9076287176accc";
const release = "4dce1ed3ad210eb41eb3e118931e3df7604d8920";
const head = "cd7ee9fe1120b3ef002e1936ce66ca2439179554";
const tree = "0b5d6b07d43f6a25fee8643f20c2ba245c8d3043";
const manifestHash = "990a2558bc07827d93f06759421caf83af4298aee402ff5bd00c462f4782e9d8";
const datasetHash = "76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5";
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
assert.equal(git("rev-parse", head + "^{tree}").toString().trim(), tree);
assert.equal(git("rev-parse", head + "^1").toString().trim(), firstCopy);
assert.equal(git("rev-parse", head + "^2").toString().trim(), release);
assert.equal(git("rev-parse", firstCopy + "^").toString().trim(), base);
assert.equal(git("diff", "--name-only", base, firstCopy).toString().trim(), copy);
assert.equal(git("diff", "--name-only", release, head).toString().trim(), copy);
assert.equal(git("rev-parse", head + ":" + copy).toString().trim(),
  git("rev-parse", firstCopy + ":" + copy).toString().trim());
const cache = new Map();
function read(file) {
  if (!cache.has(file)) cache.set(file, git("show", head + ":" + file));
  return cache.get(file);
}
const baseline = JSON.parse(git("show", base + ":" + copy)).records;
const manifest = read(copy);
const dataset = read(datasetPath);
assert.equal(hash(manifest), manifestHash);
assert.equal(hash(dataset), datasetHash);
const current = JSON.parse(manifest).records;
assert.equal(baseline.length, 10);
assert.equal(current.length, 27);
assert.deepEqual(current.slice(0, baseline.length), baseline);
const additions = current.slice(baseline.length);
const bindings = new Map(JSON.parse(read(data + "master-offering-bindings.generated.json")).bindings
  .map(binding => [binding.offeringVariantId, binding]));
const control = [...bindings.values()].find(binding => binding.productControlSku === "GEN-GRP-0256");
assert.equal(control.offeringVariantId, "mov_9262033fe69a14a50f1c");
assert(!current.some(record => record.sourceVariantId === control.offeringVariantId));

const entry = [
  'export { GeneratedMasterOfferingCatalogReader } from "server/research/master-offerings/dataset-reader";',
  'export { projectMasterOfferingCard, projectMasterOfferingDetail } from "server/research/master-offerings/customer-projection";',
  'export { createRequestIntentCatalog } from "server/research/assisted-order/request-intent/catalog";',
  'export { DEFAULT_MASTER_OFFERING_SORT, EMPTY_MASTER_OFFERING_FACETS } from "shared/research/master-offerings/contract";',
].join("\n");
const files = new Set(git("ls-tree", "-r", "--name-only", head, "--", "server", "shared", "client/src")
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
  const local = new Module(path.join(process.cwd(), "__pr391_memory_only.cjs"), module);
  local.filename = path.join(process.cwd(), "__pr391_memory_only.cjs");
  local.paths = module.paths;
  local._compile(built.outputFiles[0].text, local.filename);
  const {
    GeneratedMasterOfferingCatalogReader, projectMasterOfferingCard, projectMasterOfferingDetail,
    createRequestIntentCatalog, DEFAULT_MASTER_OFFERING_SORT, EMPTY_MASTER_OFFERING_FACETS,
  } = local.exports;
  const all = new GeneratedMasterOfferingCatalogReader("pr391-synthetic", {
    statMtimeMs: () => 1, readText: () => dataset.toString(),
  }).readCatalog();
  assert.equal(all.length, 420);
  const expected = [...additions, { offeringId: control.offeringId, sourceVariantId: control.offeringVariantId }];
  const selected = expected.map(row => {
    const offering = all.find(item => item.id === row.offeringId);
    assert(offering);
    assert.equal(offering.displayState, "request_access");
    assert.equal(offering.variants.length, 1);
    assert.equal(offering.variants[0].id, row.sourceVariantId);
    assert.equal(offering.variants[0].displayState, "request_access");
    assert.equal(bindings.get(row.sourceVariantId).offeringId, row.offeringId);
    return offering;
  });
  const guest = createRequestIntentCatalog({
    serviceFor: () => ({
      select: async query => ({
        offerings: selected, prices: new Map(),
        page: { page: query.page, pageSize: query.pageSize, total: selected.length },
      }),
    }),
    bindingFor: id => bindings.get(id), offeringVariantFor: () => null, catalogVersion: "pr391-synthetic",
  });
  const actor = {
    actorType: "early_access_session", earlyAccessSessionHash: "pr391-fixture-only",
    memberId: null, authUserId: null, normalizedEmail: null, capabilities: new Set(),
  };
  const page = await guest.list(actor, { page: 1, pageSize: 24 });
  assert.equal(page.total, 18);
  assert.equal(page.items.length, 18);
  const wrong = await guest.resolveMany(actor, [{ productId: page.items[0].productId, variantId: "unmapped.synthetic" }]);
  assert.deepEqual(wrong, [null]);
  const envelope = { ok: true, audience: "member", launchScope: "founder_admin" };
  const identities = [];
  const cards = [];
  const memberDetails = {};
  const guestItems = [];
  for (const [i, row] of expected.entries()) {
    const offering = selected[i];
    const variant = offering.variants[0];
    const item = page.items.find(item => item.sourceSelection.variantId === variant.id);
    assert(item);
    const card = projectMasterOfferingCard(offering);
    const detail = projectMasterOfferingDetail(offering);
    for (const view of [card, detail]) {
      assert.equal(view.id, row.offeringId);
      assert.equal(view.displayState, "request_access");
      assert.equal(view.variants[0].id, row.sourceVariantId);
      assert.deepEqual(view.variants[0].reviewedContent, row.content);
    }
    assert.equal(item.sourceDisplayState, "request_access");
    assert.equal(item.selectableForReview, true);
    assert.deepEqual(item.reviewedContent, row.content);
    const memberSuffix = "/" + offering.family + "/" + offering.slug;
    const detailApi = catalogPrefix + "/products" + memberSuffix;
    assert(!Object.hasOwn(memberDetails, detailApi));
    memberDetails[detailApi] = { ...envelope, product: detail };
    cards.push(card);
    guestItems.push({
      ...item, productId: "qa-pr391-product-" + offering.id, variantId: "qa-pr391-variant-" + variant.id,
    });
    identities.push({
      sku: bindings.get(variant.id).productControlSku, offeringId: offering.id, sourceVariantId: variant.id,
      productName: item.productName, specification: item.specification,
      memberRoute: memberRoutePrefix + memberSuffix, memberDetailApi: detailApi, reviewedCopy: Boolean(row.content),
    });
  }
  assert.equal(identities.filter(row => row.reviewedCopy).length, 17);
  assert.equal(identities.at(-1).sku, "GEN-GRP-0256");
  assert.equal(new Set(identities.map(row => JSON.stringify([row.productName, row.specification]))).size, 18);
  const result = {
    schemaVersion: 1, purpose: "Synthetic routed copy fixture only", base, head, tree, manifestSha256: manifestHash,
    datasetSha256: datasetHash, guestRoute, identities,
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
  const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n");
  const output = process.argv[2];
  if (output) writeFileSync(output, bytes, { flag: "wx" });
  console.log(JSON.stringify({
    head, identities: identities.length, positiveCopy: 17, omissionControl: "GEN-GRP-0256",
    responsePaths: Object.keys(result.responses).length, bytes: bytes.length, sha256: hash(bytes),
  }));
}

makeFixture().catch(error => { console.error(error.stack); process.exitCode = 1; });
