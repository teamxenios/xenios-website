// Run only on the owned Actions allocation:
// node --import tsx --test scripts/evidence/owned-runner-browser-qa.node-test.mjs
// This filename deliberately avoids the application's Vitest discovery.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRequest, validateSourceBinding, validateIsolation, validateFontCalibration,
  assertInventorySafe, safeNetworkUrl, validateProfileReceipts, CONFIGURATIONS } from "./owned-runner-browser-qa.mjs";
import { startOwnedPreview, UNAVAILABLE_FIXTURE } from "./owned-runner-preview.ts";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assets = new Map([["assets/app.js", {}], ["index.html", {}], ["offline.html", {}], ["PREVIEW-SOURCE.json", {}]]);

test("raw fixed routes and inventoried assets are admitted without generic SPA or metadata bypass", () => {
  assert.equal(classifyRequest("GET", "/", assets).kind, "document");
  assert.equal(classifyRequest("HEAD", "/r/SAMPLE-CODE", assets).kind, "document");
  assert.deepEqual(classifyRequest("GET", "/assets/app.js", assets), { kind: "asset", path: "assets/app.js" });
  assert.deepEqual(classifyRequest("GET", "/offline.html", assets), { kind: "asset", path: "offline.html" });
  for (const target of ["/r/OTHER", "/r/SAMPLE-CODE/", "/r/SAMPLE-CODE/x", "/r/%53AMPLE-CODE", "/R/SAMPLE-CODE",
    "/r/SAMPLE-CODE?ref=x", "/r/SAMPLE-CODE#x", "/r/SAMPLE CODE", "/r\\SAMPLE-CODE", "/assets/../index.html",
    "//example.com/", "/index.html", "/PREVIEW-SOURCE.json", "/unlisted.js"]) {
    assert.equal(classifyRequest("GET", target, assets).kind, "refused", target);
  }
});

test("only the synthetic local resolve POST is in contract; no capture, assent, claim or other write", () => {
  assert.equal(classifyRequest("POST", "/api/research/referral/resolve", assets).kind, "resolve_fixture");
  for (const target of ["/", "/r/SAMPLE-CODE", "/api/research/referral/bootstrap", "/api/research/referral/capture",
    "/api/research/account-identity/history-claims/confirm", "/api/research/referral/resolve?code=other"]) {
    assert.equal(classifyRequest("POST", target, assets).kind, "refused");
  }
  for (const method of ["PATCH", "PUT", "DELETE", "OPTIONS", "CONNECT"]) assert.equal(classifyRequest(method, "/", assets).kind, "refused");
});

const source = "a".repeat(40), runner = "b".repeat(40), tree = "c".repeat(40);
const binding = () => ({ sourceHead: source, sourceTree: tree, runnerHead: runner, runnerTree: tree,
  preview: { sourceHead: source, executedCommit: runner, executedTree: tree, node: "v20.19.0" } });
test("runner merge identity remains distinct but requires exact source tree and preview bytes binding", () => {
  assert.equal(validateSourceBinding(binding()).sourceAndRunnerTreeEqual, true);
  assert.throws(() => validateSourceBinding({ ...binding(), runnerTree: "d".repeat(40) }), /TREE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), sourceHead: "HEAD" }), /IDENTITY_INVALID/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedCommit: source } }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, node: "v22.0.0" } }), /PREVIEW_SOURCE_MISMATCH/);
});

const isolated = () => ({ uid: 1001, netNamespace: "net:[12]", parentNetNamespace: "net:[11]", interfaces: ["lo"],
  routes: [], effectiveCaps: "0000000000000000", noNewPrivs: "1" });
test("host network, privileged UID/capabilities, external interface or route and missing NNP fail closed", () => {
  assert.equal(validateIsolation(isolated()).uid, 1001);
  for (const change of [{ uid: 0 }, { netNamespace: "net:[11]" }, { parentNetNamespace: undefined }, { interfaces: ["lo", "eth0"] },
    { routes: [{ dst: "default" }] }, { effectiveCaps: "0000000000000001" }, { noNewPrivs: "0" }]) {
    assert.throws(() => validateIsolation({ ...isolated(), ...change }));
  }
});

test("font proof requires actual root/rem and flipped em media, never DPR or half viewport", () => {
  const sample = { width: 375, dpr: 1, scale: 1, root: 32, rem: 32, emMedia: false };
  assert.equal(validateFontCalibration(sample, { width: 375, font: 32 }).root, 32);
  for (const change of [{ root: 16 }, { rem: 16 }, { emMedia: true }, { dpr: 2 }, { scale: 2 }, { width: 187 }]) {
    assert.throws(() => validateFontCalibration({ ...sample, ...change }, { width: 375, font: 32 }), /FONT_CAPABILITY_NOT_EXECUTED/);
  }
});

test("network telemetry drops URL query/fragment/credentials and rejects malformed values", () => {
  assert.equal(safeNetworkUrl("/r/SAMPLE-CODE?token=hidden#hidden"), "/r/SAMPLE-CODE");
  assert.equal(safeNetworkUrl("https://name:secret@example.invalid/api?token=hidden"), "https://example.invalid/api");
});

test("configuration proof rejects shared profiles/processes, overlapping lifetimes and missing real close receipts", () => {
  // Pure negative controls only; these objects are NOT real browser evidence.
  const complete = () => CONFIGURATIONS.map((config, i) => ({ configuration: config.name, profile: `/owned/profile-${i}`,
    browserPid: 20 + i, browserStartTicks: String(100 + i), startedMs: i * 100 + 1, closedMs: i * 100 + 90,
    cleanup: { page: true, cdp: true, browserExit: true, profileRemoved: true } }));
  assert.equal(validateProfileReceipts(complete()), true);
  const reused = complete(); reused[1].profile = reused[0].profile;
  assert.throws(() => validateProfileReceipts(reused), /IDENTITY_REUSED_OR_MISSING/);
  const sameProcess = complete(); sameProcess[1].browserPid = sameProcess[0].browserPid; sameProcess[1].browserStartTicks = sameProcess[0].browserStartTicks;
  assert.throws(() => validateProfileReceipts(sameProcess), /IDENTITY_REUSED_OR_MISSING/);
  const overlap = complete(); overlap[1].startedMs = overlap[0].closedMs - 1;
  assert.throws(() => validateProfileReceipts(overlap), /LIFETIME_OVERLAP/);
  const unclosed = complete(); unclosed[2].cleanup.profileRemoved = false;
  assert.throws(() => validateProfileReceipts(unclosed), /CLEANUP_UNCONFIRMED/);
  assert.throws(() => validateProfileReceipts(complete().slice(0, 3)), /CONFIGURATION_INCOMPLETE/);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "owned-preview-node-test-"));
  const html = '<!doctype html><html><head><title>Fixture template</title><meta property="og:title" content="stale"><link rel="canonical" href="https://xeniostechnology.com/"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><div id="root"></div></body></html>';
  const script = "globalThis.__ownedStaticAsset=true;";
  writeFileSync(join(root, "index.html"), html);
  writeFileSync(join(root, "test.js"), script);
  const inventory = [{ path: "index.html", bytes: Buffer.byteLength(html), sha256: hash(html) },
    { path: "test.js", bytes: Buffer.byteLength(script), sha256: hash(script) }];
  return { root, inventory, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test("actual loopback HTTP host serves neutral private recipient and an honest404 fixture without cookie or authority code", async () => {
  const f = fixture(), ledger = [];
  const host = await startOwnedPreview({ ...f, ledger });
  try {
    const recipient = await fetch(host.origin + "/r/SAMPLE-CODE");
    assert.equal(recipient.status, 200);
    assert.match(recipient.headers.get("x-robots-tag"), /noindex/);
    assert.equal(recipient.headers.get("referrer-policy"), "no-referrer");
    const html = await recipient.text();
    assert.doesNotMatch(html, /rel="canonical"|property="og:title"|application\/ld\+json/);
    const denied = await fetch(host.origin + "/api/research/referral/resolve", { method: "POST", headers: {
      Origin: host.origin, "Content-Type": "application/json",
    }, body: JSON.stringify({ code: "SAMPLE-CODE" }) });
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get("set-cookie"), null);
    assert.deepEqual(await denied.json(), UNAVAILABLE_FIXTURE);
    assert.equal(host.counters.resolve404, 1);
    for (const path of ["/r/SAMPLE-CODE/extra", "/api/research/referral/capture"]) {
      const response = await fetch(host.origin + path, { method: "POST" });
      assert.equal(response.status, 404);
    }
    assert.equal(host.counters.resolve404, 1);
    assert.equal(ledger.filter((r) => r.kind === "STATIC_404_UNAVAILABLE_FIXTURE").length, 1);
  } finally { await host.close(); f.dispose(); }
});

test("credential-bearing/wrong-origin/foreign-selector requests are refused and cannot become referral success", async () => {
  const f = fixture(), host = await startOwnedPreview({ ...f, ledger: [] });
  try {
    assert.equal((await fetch(host.origin + "/", { headers: { Cookie: "synthetic=1" } })).status, 403);
    const send = (code, origin) => fetch(host.origin + "/api/research/referral/resolve", { method: "POST", headers: {
      Origin: origin, "Content-Type": "application/json",
    }, body: JSON.stringify({ code }) });
    assert.equal((await send("SAMPLE-CODE", "https://example.invalid")).status, 403);
    assert.equal((await send("NOT-A-REAL-CODE", host.origin)).status, 400);
    assert.equal(host.counters.resolve404, 0);
  } finally { await host.close(); f.dispose(); }
});

test("changed asset bytes fail integrity rather than being served under old provenance", async () => {
  const f = fixture(), host = await startOwnedPreview({ ...f, ledger: [] });
  try {
    assert.equal((await fetch(host.origin + "/test.js")).status, 200);
    writeFileSync(join(f.root, "test.js"), "changed");
    assert.equal((await fetch(host.origin + "/test.js")).status, 500);
    assert.equal(host.counters.unexpected, 1);
  } finally { await host.close(); f.dispose(); }
});

test("snapshot source refuses symlinks before inventory traversal", () => {
  const f = fixture();
  try {
    assertInventorySafe(f.root);
    symlinkSync(join(f.root, "test.js"), join(f.root, "link.js"));
    assert.throws(() => assertInventorySafe(f.root), /SYMLINK_REFUSED/);
  } finally { f.dispose(); }
});
