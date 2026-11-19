// Run only on the owned Actions allocation:
// node --import tsx --test scripts/evidence/owned-runner-browser-qa.node-test.mjs
// This filename deliberately avoids the application's Vitest discovery.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRequest, validateSourceBinding, validateIsolation, validateFontCalibration,
  assertInventorySafe, safeNetworkUrl, validateProfileReceipts, CONFIGURATIONS, ownedStartupBudget } from "./owned-runner-browser-qa.mjs";
import { startOwnedPreview, UNAVAILABLE_FIXTURE } from "./owned-runner-preview.ts";
import { launchChromium, chromeLaunchDiagnosticCodes, chromeStartupExcerpt, waitForDevToolsPort } from "./lib/chrome.mjs";

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

const source = "a".repeat(40), runner = "b".repeat(40), tree = "c".repeat(40), base = "d".repeat(40);
const binding = () => ({ sourceHead: source, sourceTree: tree, runnerHead: runner, runnerTree: tree,
  runnerParents: [base, source], preview: { sourceHead: source, sourceTree: tree, baseHead: base,
    executedCommit: runner, executedTree: tree, executedParents: [base, source], node: "v20.19.0" } });
test("equal-tree merge preserves distinct source/runner identities and exact marker binding", () => {
  assert.equal(validateSourceBinding(binding()).sourceAndRunnerTreeEqual, true);
  assert.throws(() => validateSourceBinding({ ...binding(), runnerTree: "e".repeat(40) }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), sourceHead: "HEAD" }), /IDENTITY_INVALID/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedCommit: source } }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, node: "v22.0.0" } }), /PREVIEW_SOURCE_MISMATCH/);
});

test("valid unequal-tree merge qualifies only the actual executed composition", () => {
  const input = binding(), composedTree = "e".repeat(40);
  input.runnerTree = composedTree; input.preview.executedTree = composedTree;
  const receipt = validateSourceBinding(input);
  assert.equal(receipt.sourceAndRunnerTreeEqual, false);
  assert.equal(receipt.evidenceScope, "EXECUTED_COMPOSITION_ONLY");
  assert.equal(receipt.evidenceCommit, runner);
  assert.equal(receipt.evidenceTree, composedTree);
  assert.equal(receipt.sourceTree, tree);
});

test("forged, missing or misordered actual/marker merge parents and wrong base fail closed", () => {
  for (const parents of [[source, base], [base], [base, source, "e".repeat(40)]]) {
    const input = binding(); input.runnerParents = parents; input.preview.executedParents = parents;
    assert.throws(() => validateSourceBinding(input), /RUNNER_GRAPH_MISMATCH/);
  }
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedParents: [source, base] } }), /PARENT_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, executedParents: undefined } }), /PARENT_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, baseHead: "e".repeat(40) } }), /RUNNER_GRAPH_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...binding(), preview: { ...binding().preview, baseHead: null } }), /BASE_IDENTITY_INVALID/);
});

test("direct checkout requires exact source commit/tree and its real parents", () => {
  const direct = { ...binding(), runnerHead: source, runnerParents: [base], preview: { ...binding().preview,
    executedCommit: source, executedParents: [base] } };
  assert.equal(validateSourceBinding(direct).checkoutKind, "DIRECT_SOURCE_CHECKOUT");
  assert.equal(validateSourceBinding({ ...direct, preview: { ...direct.preview, baseHead: null } }).baseHead, null);
  assert.throws(() => validateSourceBinding({ ...direct, preview: { ...direct.preview, baseHead: undefined } }), /BASE_IDENTITY_INVALID/);
  assert.throws(() => validateSourceBinding({ ...direct, runnerTree: "e".repeat(40),
    preview: { ...direct.preview, executedTree: "e".repeat(40) } }), /RUNNER_GRAPH_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...direct, preview: { ...direct.preview, executedCommit: runner } }), /PREVIEW_SOURCE_MISMATCH/);
  assert.throws(() => validateSourceBinding({ ...direct, preview: { ...direct.preview, executedParents: [source] } }), /PARENT_MISMATCH/);
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

test("launch diagnostics emit fixed observed codes without raw stderr, URLs or synthetic secrets", () => {
  const codes = chromeLaunchDiagnosticCodes("FATAL: No usable sandbox! token=synthetic-secret https://name:secret@example.invalid/private\nFailed to connect to the bus");
  assert.deepEqual(codes, ["SANDBOX_REJECTION_REPORTED", "DBUS_DIAGNOSTIC_PRESENT"]);
  assert.doesNotMatch(JSON.stringify(codes), /synthetic-secret|example\.invalid|name:secret/);
});

test("startup uses at most45seconds of the same remaining global budget and preserves cleanup reserve", () => {
  assert.equal(ownedStartupBudget(300000, 1000), 45000);
  assert.equal(ownedStartupBudget(70000, 30000), 13500);
  assert.equal(ownedStartupBudget(70000, 44000), 0);
  assert.equal(ownedStartupBudget(70000, 70000), 0);
});

test("private diagnostic excerpts redact URLs, debug/credential values, process metadata and cap content", () => {
  const input = [
    "Failure at https://name:password@example.invalid/private?token=hidden ws://127.0.0.1:123/devtools/browser/opaque-id",
    "debug_token=hidden-small sessionKey='hidden-session' Authorization: Bearer hidden-access user@example.invalid",
    "MY_PRIVATE_VALUE=hidden-env raw environment dump",
    "argv --user-data-dir /home/runner/private-directory hidden-argument",
    "debug /devtools/browser/another-debug-id data:secret-payload file:///home/secret-token",
    "Long " + "q".repeat(4000),
    "seventh line is outside the diagnostic cap",
  ].join("\n");
  const excerpt = chromeStartupExcerpt(input);
  assert.equal(excerpt.length, 6);
  assert.ok(excerpt.every((line) => line.length <= 160 && /^[\x20-\x7e]*$/.test(line)));
  assert.ok(Buffer.byteLength(JSON.stringify(excerpt)) < 2048);
  assert.doesNotMatch(JSON.stringify(excerpt), /example\.invalid|hidden-|hidden-small|opaque-id|another-debug-id|secret-payload|hidden-env|hidden-argument|private-directory|seventh/);
});

test("signal exit ends readiness immediately while an absent optional signal field preserves old callers", async () => {
  let waited = 0;
  const signaled = await waitForDevToolsPort({ child: { exitCode: null, signalCode: "SIGTRAP" }, portFile: "unused",
    timeoutMs: 100, now: () => 0, wait: async () => { waited++; },
    fileExists: () => { throw new Error("READ_AFTER_OBSERVED_SIGNAL_EXIT"); } });
  assert.equal(signaled, null);
  assert.equal(waited, 0);
  const oldShape = await waitForDevToolsPort({ child: { exitCode: null }, portFile: "unused",
    timeoutMs: 100, now: () => 0, wait: async () => {}, fileExists: () => true, readText: () => "12345\n/devtools/browser/synthetic" });
  assert.equal(oldShape, 12345);
});

test("real failed child is handed off before readiness rejects, with bounded diagnostics and owned cleanup", async () => {
  // Deliberate fake executable, NOT Chromium or a browser-capability result.
  const root = mkdtempSync(join(tmpdir(), "owned-launch-control-"));
  const fake = join(root, "fake-browser");
  const payload = "FATAL: No usable sandbox! synthetic-secret https://name:secret@example.invalid/private " + "x".repeat(10000);
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' '${payload}' >&2\nexit 42\n`, { mode: 0o700 });
  let owned;
  const pending = launchChromium({ chromePath: fake, timeoutMs: 2500, onSpawned(handle) { owned = handle; } });
  try {
    assert.ok(owned?.process.pid, "synchronous lifecycle custody exists before awaiting readiness");
    assert.ok(existsSync(owned.userDataDir));
    await assert.rejects(pending, /CHROME_EXIT_BEFORE_DEVTOOLS/);
    const diagnostic = owned.diagnostics();
    assert.equal(diagnostic.exitCode, 42);
    assert.equal(diagnostic.portPublished, false);
    assert.equal(diagnostic.stderrBytes, Buffer.byteLength(payload + "\n"));
    assert.equal(diagnostic.capturedStderrBytes, 8192);
    assert.equal(diagnostic.stderrTruncated, true);
    assert.equal(diagnostic.stderrSha256, hash(payload + "\n"));
    assert.ok(diagnostic.observedDiagnosticCodes.includes("SANDBOX_REJECTION_REPORTED"));
    assert.doesNotMatch(JSON.stringify(diagnostic), /synthetic-secret|example\.invalid|name:secret/);
  } finally {
    void pending.catch(() => {});
    if (owned) { await owned.close(); assert.equal(existsSync(owned.userDataDir), false); }
    rmSync(root, { recursive: true, force: true });
  }
});

test("one actual synthetic process may publish delayed readiness without a relaunch and exposes bounded proc state", async () => {
  // This process is an HTTP fixture, NOT Chromium or actual browser evidence.
  const root = mkdtempSync(join(tmpdir(), "owned-delayed-control-"));
  const fake = join(root, "fake-browser");
  writeFileSync(fake, `#!${process.execPath}
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const profile = process.argv.find(x => x.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const server = http.createServer((req, res) => res.end(JSON.stringify({ Browser:'HeadlessChrome/synthetic',
  'Protocol-Version':'1.3', webSocketDebuggerUrl:'ws://127.0.0.1:'+server.address().port+'/devtools/browser/synthetic' })));
server.listen(0,'127.0.0.1',()=>setTimeout(()=>fs.writeFileSync(path.join(profile,'DevToolsActivePort'),
  server.address().port+'\\n/devtools/browser/synthetic\\n'),250));
`, { mode: 0o700 });
  let owned, spawned = 0;
  try {
    const ready = await launchChromium({ chromePath: fake, timeoutMs: 2500, onSpawned(handle) { owned = handle; spawned++; } });
    assert.equal(spawned, 1);
    assert.equal(ready.process.pid, owned.process.pid);
    const diagnostic = ready.diagnostics();
    assert.equal(diagnostic.outcome, "READY");
    assert.ok(diagnostic.elapsedMs >= 250);
    assert.ok(diagnostic.startupObservations.length > 0 && diagnostic.startupObservations.length <= 8);
    assert.ok(diagnostic.startupObservations.some((o) => o.available && /^\d+$/.test(o.startTicks)));
    assert.ok(diagnostic.startupObservations.some((o) => o.label === "readiness_result_before_cleanup" && o.exitCode === null && o.signalCode === null));
  } finally {
    if (owned) { await owned.close(); assert.equal(existsSync(owned.userDataDir), false); }
    rmSync(root, { recursive: true, force: true });
  }
});

function outerEvidenceControl(observed) {
  const root = mkdtempSync(join(tmpdir(), "owned-outer-control-"));
  const artifact = join(root, "xenios-owned-browser.control");
  mkdirSync(join(artifact, "home"), { recursive: true });
  mkdirSync(join(artifact, "tmp"));
  writeFileSync(join(artifact, "tmp", "synthetic-cache"), "synthetic");
  const shell = fileURLToPath(new URL("./owned-runner-browser-qa.sh", import.meta.url));
  const code = `source "$1"
set -Eeuo pipefail
trap 'printf ERR_TRAP_FIRED >&2; exit 99' ERR
runner_temp="$2"
artifact_dir="$runner_temp/xenios-owned-browser.control"
started_ms=$(date +%s%3N)
parent_net=$(readlink /proc/self/ns/net)
isolated_started=true; isolated_command_exited=false; controller_status=null
trap 'finish_owned_evidence "$?"' EXIT
${observed ? "capture_isolated_exit /bin/sh -c 'exit 17'\nisolated_command_exited=true\nexit 0" : "exit 1"}
`;
  const child = spawnSync("/bin/bash", ["-c", code, "owned-outer-test", shell, root], {
    encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin" },
  });
  return { root, artifact, child, receipt: JSON.parse(readFileSync(join(artifact, "namespace-result.json"), "utf8")) };
}

test("actual wrapper conditional survives nonzero with ERR enabled and writes observed removal/status", () => {
  const control = outerEvidenceControl(true);
  try {
    assert.equal(control.child.status, 1);
    assert.doesNotMatch(control.child.stderr, /ERR_TRAP_FIRED/);
    assert.equal(control.receipt.exitCode, 17);
    assert.equal(control.receipt.isolatedCommandExited, true);
    assert.equal(control.receipt.temporaryDirsRemovalAttempted, true);
    assert.equal(control.receipt.temporaryDirsRemoved, true);
    assert.equal(existsSync(join(control.artifact, "tmp")), false);
    assert.equal(existsSync(join(control.artifact, "home")), false);
  } finally { rmSync(control.root, { recursive: true, force: true }); }
});

test("wrapper never deletes or claims cleanup when launched command exit was not observed", () => {
  const control = outerEvidenceControl(false);
  try {
    assert.equal(control.child.status, 1);
    assert.equal(control.receipt.exitCode, null);
    assert.equal(control.receipt.isolatedCommandExited, false);
    assert.equal(control.receipt.temporaryDirsRemovalAttempted, false);
    assert.equal(control.receipt.temporaryDirsRemoved, false);
    assert.equal(existsSync(join(control.artifact, "tmp", "synthetic-cache")), true);
  } finally { rmSync(control.root, { recursive: true, force: true }); }
});
